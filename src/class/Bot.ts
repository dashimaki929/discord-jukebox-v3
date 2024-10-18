import { existsSync } from "fs";

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
import ytdl from "@distube/ytdl-core";

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

const ffmpegPath = ffmpegStatic as unknown as string;
ffmpeg.setFfmpegPath(ffmpegPath);

import { BANLIST } from "../typedef.js";
import { DEFAULT_VOLUME, INTERLUDES, URLS } from "../common/constants.js";
import { formatTime, getVersionInfo, readFile, removeCache, shuffle, updateMessageFromKey, updatePlayerButton, writeFile } from "../common/util.js";

export class Bot {
    static BANNED_HASH_LIST: BANLIST = JSON.parse(readFile('./config/banlist.json'));

    messages: Map<string, Message | InteractionResponse>;
    timeouts: Map<string, NodeJS.Timeout>

    guildId: string;
    voiceChannelId: string;
    playlist: string[];
    playlistTitle: string;
    playlistUrl: string;
    musicQueue: string[];
    currentMusic: string;
    audioResource: AudioResource | null;
    pausedTime: number;
    volume: number;
    isPlaying: boolean;
    isShuffle: boolean;
    isLoop: boolean;
    isAutoPause: boolean;
    isTimeSignal: boolean;

    audioPlayer: AudioPlayer;

    constructor(guildId: string) {
        this.messages = new Map();
        this.timeouts = new Map();

        this.guildId = guildId;
        this.voiceChannelId = '';
        this.playlist = [];
        this.playlistTitle = '';
        this.playlistUrl = '';
        this.musicQueue = [];
        this.currentMusic = '';
        this.audioResource = null;
        this.pausedTime = 0;
        this.volume = DEFAULT_VOLUME;
        this.isPlaying = false;
        this.isShuffle = false;
        this.isLoop = false;
        this.isAutoPause = true;
        this.isTimeSignal = false;

        this.initMusicQueue(true);

        this.audioPlayer = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            }
        });
        this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
            this.isPlaying = true;
            if (!this.isTimeSignal) {
                this.timeouts.set('timesignal', this.#setTimeSignal());
            }
        });
        this.audioPlayer.on(AudioPlayerStatus.Paused, () => {
            this.isPlaying = false;
            clearTimeout(this.timeouts.get('timesignal'));
        });
        this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
            this.play();

            if (this.isTimeSignal) {
                this.isTimeSignal = false;
            } else {
                this.pausedTime = 0;
            }

            clearTimeout(this.timeouts.get('timesignal'));
        });
        this.audioPlayer.on('error', (e) => {
            console.log(
                '[WARN]',
                `${e.message} with resource ${e.resource.metadata}`
            );
            this.play();
        });
    }

    async play(filepath?: string): Promise<void> {
        const con = getVoiceConnections().get(this.guildId);
        if (!con) return;

        con.subscribe(this.audioPlayer);

        if (!filepath) {
            const hash = this.isLoop ? this.currentMusic : this.#getNextMusicHash();
            this.currentMusic = hash;

            filepath = await this.download(hash);
        }

        this.audioResource = createAudioResource(filepath, { inputType: StreamType.WebmOpus, inlineVolume: true });
        this.audioResource.volume?.setVolume(this.volume);

        await this.#updatePlayerInfo(this.currentMusic);

        this.audioPlayer.play(this.audioResource);
        if (this.isAutoPause) this.audioPlayer.pause();

        updatePlayerButton(this);

        // pre-download next music.
        while (Object.keys(Bot.BANNED_HASH_LIST).includes(this.musicQueue[0])) {
            const hash = this.#getNextMusicHash();
            console.info('[INFO]', 'BANされている楽曲のためスキップします:', `${URLS.YOUTUBE}?v=${hash}`);
            console.info('[INFO]', '理由:', Bot.BANNED_HASH_LIST[hash].reason);
        }
        this.download(this.musicQueue[0], this.pausedTime);
    }

    async download(hash: string, startTime: number = 0): Promise<string> {
        if (this.isTimeSignal && startTime) {
            await removeCache();
        } else if (!this.isLoop) {
            await removeCache(this.currentMusic);
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
                    .setStartTime(this.isTimeSignal ? startTime : 0)
                    .audioFilter(['dynaudnorm', 'bass=g=5']) // loudnorm vs dynaudnorm ...?
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
        const [authorImage, title, url, artist, keywords, thumbnail, lengthSeconds] = [
            info.videoDetails.author.thumbnails?.pop()?.url! as string,
            info.videoDetails.title,
            info.videoDetails.video_url,
            info.videoDetails.author.name,
            info.videoDetails.keywords?.slice(0, 10) || [],
            info.videoDetails.thumbnails.pop()?.url! as string,
            Number(info.videoDetails.lengthSeconds)
        ];

        updateMessageFromKey(this, 'player', {
            embeds: [
                new EmbedBuilder()
                    .setAuthor({ name: getVersionInfo(), iconURL: URLS.ICON, url: 'https://github.com/dashimaki929/discord-jukebox-v3' })
                    .setThumbnail(authorImage)
                    .addFields({
                        name: 'プレイリスト',
                        value: `***[${this.playlistTitle}](${this.playlistUrl})***`
                    })
                    .addFields({ name: 'タイトル', value: `***[${title}](${url})***` })
                    .addFields({ name: 'アーティスト', value: `__***${artist}***__` })
                    .addFields({ name: '関連キーワード', value: `${keywords.length ? `\`${keywords.join('` , `')}\`` : 'なし'}` })
                    .setImage(thumbnail)
                    .setFooter({ text: formatTime(lengthSeconds) })
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

    #setTimeSignal(): NodeJS.Timeout {
        const nextTimeSignalDate = new Date();
        nextTimeSignalDate.setHours(nextTimeSignalDate.getHours() + 1);
        nextTimeSignalDate.setMinutes(0);
        nextTimeSignalDate.setSeconds(-4);
        nextTimeSignalDate.setMilliseconds(0);

        return setTimeout(async () => {
            this.audioPlayer.pause();
            this.musicQueue.unshift(this.currentMusic);
            this.pausedTime += ((this.audioResource?.playbackDuration || 0) / 1000);
            this.isTimeSignal = true;
            this.play('./mp3/timesignal.mp3');
        }, Number(nextTimeSignalDate) - Number(new Date()));
    }
}