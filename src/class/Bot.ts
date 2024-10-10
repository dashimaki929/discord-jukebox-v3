import internal from "stream";
import { createReadStream, existsSync } from "fs";

import { EmbedBuilder, InteractionResponse, Message } from "discord.js";
import {
    AudioPlayer,
    AudioPlayerStatus,
    AudioResource,
    createAudioPlayer,
    createAudioResource,
    getVoiceConnections,
    NoSubscriberBehavior,
    StreamType
} from "@discordjs/voice";
import SpotifyWebApi from "spotify-web-api-node";
import ytdl from "@distube/ytdl-core";

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

const ffmpegPath = ffmpegStatic as unknown as string;
ffmpeg.setFfmpegPath(ffmpegPath);

import { BANLIST } from "../typedef.js";
import { DEFAULT_VOLUME, INTERLUDES, URLS } from "../common/constants.js";
import { formatTime, getVersionInfo, readFile, removeCache, setElapsedTime, shuffle, updateMessageFromKey, updatePlayerButton, writeFile } from "../common/util.js";

export class Bot {
    static BANNED_HASH_LIST: BANLIST = JSON.parse(readFile('./config/banlist.json'));

    messages: Map<string, Message | InteractionResponse>;
    intervals: Map<string, NodeJS.Timeout>

    guildId: string;
    voiceChannelId: string;
    playlist: string[];
    currentPlaylistTitle: string;
    currentPlaylistUrl: string;
    musicQueue: string[];
    currentMusic: string;
    audioResource: AudioResource | null;
    lengthSeconds: number;
    volume: number;
    isPlaying: boolean;
    isShuffle: boolean;
    isLoop: boolean;
    isAutoPause: boolean;

    spotifyApi: SpotifyWebApi;
    player: AudioPlayer;

    constructor(guildId: string) {
        this.messages = new Map();
        this.intervals = new Map();

        this.guildId = guildId;
        this.voiceChannelId = '';
        this.playlist = [];
        this.currentPlaylistTitle = '';
        this.currentPlaylistUrl = '';
        this.musicQueue = [];
        this.currentMusic = '';
        this.audioResource = null;
        this.lengthSeconds = 0;
        this.volume = DEFAULT_VOLUME;
        this.isPlaying = false;
        this.isShuffle = false;
        this.isLoop = false;
        this.isAutoPause = true;

        this.initMusicQueue(true);

        this.spotifyApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            redirectUri: process.env.SPOTIFY_REDIRECT_URL
        });

        this.player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            }
        });
        this.player.on(AudioPlayerStatus.Playing, () => { 
            this.isPlaying = true;
            this.intervals.set('player', setElapsedTime(this));
        });
        this.player.on(AudioPlayerStatus.Paused, () => { 
            this.isPlaying = false;
            clearInterval(this.intervals.get('player')!);
        });
        this.player.on(AudioPlayerStatus.Idle, () => {
            this.play();
            clearInterval(this.intervals.get('player')!);
        });
        this.player.on('error', (e) => {
            console.log(
                '[WARN]',
                `${e.message} with resource ${e.resource.metadata}`
            );
            this.play();
        });
    }

    async play(): Promise<void> {
        const con = getVoiceConnections().get(this.guildId);
        if (!con) return;

        con.subscribe(this.player);

        const stream = await this.#stream();
        if (!stream) return;

        this.audioResource = createAudioResource(stream, {
            inputType: StreamType.WebmOpus,
            inlineVolume: true,
        });
        this.audioResource.volume?.setVolume(this.volume);

        await this.#updatePlayerInfo(this.currentMusic);

        this.player.play(this.audioResource);
        if (this.isAutoPause) this.player.pause();

        updatePlayerButton(this);

        // pre-download next music.
        while (Object.keys(Bot.BANNED_HASH_LIST).includes(this.musicQueue[0])) {
            const hash = this.#getNextMusicHash();
            console.info('[INFO]', 'BANされている楽曲のためスキップします:', `${URLS.YOUTUBE}?v=${hash}`);
            console.info('[INFO]', '理由:', Bot.BANNED_HASH_LIST[hash].reason);
        }
        this.download(this.musicQueue[0]);
    }

    async #stream(): Promise<internal.Readable | undefined> {
        const hash = this.isLoop ? this.currentMusic : this.#getNextMusicHash();
        if (!hash) return;

        this.currentMusic = hash;

        try {
            const filepath = await this.download(hash);
            return createReadStream(filepath);
        } catch (e) {
            console.log('[WARN]', e);
            return this.#stream();
        }
    }

    download(hash: string): Promise<string> {
        if (!this.isLoop) {
            removeCache(this.currentMusic);
        }

        return new Promise((resolve, reject) => {
            if (!hash) {
                hash = this.#getNextMusicHash();
            }

            const url = `${URLS.YOUTUBE}?v=${hash}`;
            const filepath = `./mp3/cache/${hash}.mp3`;
            if (!existsSync(filepath)) {
                console.debug('[DEBUG]', 'download:', url);

                const stream = ytdl(url, { filter: 'audioonly' }).on('error', error => {
                    if (error.message.includes('Premium members')) {
                        this.addBanlist(hash, 'Youtubeプレミアム限定のコンテンツです。');
                    } else if (error.message.includes('confirm your age')) {
                        this.addBanlist(hash, '年齢確認の必要なコンテンツです。');
                    } else if (error.message.includes('Premieres in')) {
                        console.info('[INFO]', 'プレミア公開待ちのコンテンツです。', url);
                    } else {
                        this.addBanlist(hash, '利用できないコンテンツです。');
                    }

                    this.#getNextMusicHash() // skip next music.

                    return this.download(this.musicQueue[0]);
                });

                ffmpeg(stream).audioBitrate(128)
                    .format('mp3')
                    .audioFilter('dynaudnorm') // loudnorm vs dynaudnorm ...?
                    .on('end', () => {
                        resolve(filepath);
                    })
                    .on('error', (error) => {
                        reject(error.message);
                    })
                    .save(filepath);
            } else {
                resolve(filepath);
            }
        });
    }

    async #updatePlayerInfo(hash: string): Promise<void> {
        const info = await ytdl.getBasicInfo(`${URLS.YOUTUBE}?v=${hash}`);
        const [authorImage, title, url, artist, keywords, thumbnail] = [
            info.videoDetails.author.thumbnails?.pop()?.url! as string,
            info.videoDetails.title,
            info.videoDetails.video_url,
            info.videoDetails.author.name,
            info.videoDetails.keywords?.slice(0, 10) || [],
            info.videoDetails.thumbnails.pop()?.url! as string,
        ];

        this.lengthSeconds = Number(info.videoDetails.lengthSeconds);
        await updateMessageFromKey(this, 'player', {
            embeds: [
                new EmbedBuilder()
                    .setAuthor({ name: getVersionInfo(), iconURL: URLS.ICON, url: 'https://github.com/dashimaki929/discord-jukebox-v3' })
                    .setThumbnail(authorImage)
                    .addFields({
                        name: 'プレイリスト',
                        value: `***[${this.currentPlaylistTitle}](${this.currentPlaylistUrl})***`
                    })
                    .addFields({ name: 'タイトル', value: `***[${title}](${url})***` })
                    .addFields({ name: 'アーティスト', value: `__***${artist}***__` })
                    .addFields({ name: '関連キーワード', value: `${keywords.length ? `\`${keywords.join('` , `')}\`` : 'なし'}` })
                    .setImage(thumbnail)
                    .setFooter({ text: `${formatTime(0)} / ${formatTime(this.lengthSeconds)}` })
            ],
            files: []
        });
    }

    addBanlist(hash: string, reason: string): void {
        console.warn('[WARN]', `${hash}:`, reason);

        Bot.BANNED_HASH_LIST[hash] = { reason, bannedAt: new Date };
        writeFile('./config/banlist.json', JSON.stringify(Bot.BANNED_HASH_LIST, null, '\t'));

        console.info('[INFO]', 'BANリストに追加しました:', `${URLS.YOUTUBE}?v=${hash}`);
        console.info('[INFO]', '理由:', reason);
    }

    #getNextMusicHash(): string {
        if (!this.musicQueue.length) {
            this.initMusicQueue();
        }

        let hash = this.musicQueue.shift();
        if (!hash) {
            hash = INTERLUDES[Math.floor(Math.random() * INTERLUDES.length)];
        }

        return hash;
    }

    initMusicQueue(doShuffle: boolean = this.isShuffle): void {
        if (doShuffle) {
            this.musicQueue = shuffle(this.playlist);
        } else {
            this.musicQueue = [...this.playlist];
        }
    }
}