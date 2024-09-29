import internal from "stream";
import { createReadStream, existsSync } from "fs";

import { InteractionResponse, Message } from "discord.js";
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

import { DEFAULT_VOLUME, INTERLUDES, URLS } from "../common/constants.js";
import { readFile, removeCache, writeFile } from "../common/util.js";

export class Bot {
    static DEFAULT_PLAYLIST: string[] = readFile('./config/playlist.txt').split(/\r?\n/);
    static BANLIST: string[] = readFile('./config/banlist.txt').split(/\r?\n/);

    guildId: string;
    playlist: string[];
    musicQueue: string[];
    currentMusic: string;
    audioResource: AudioResource | null;
    volume: number;
    isPlaying: boolean;
    isShuffle: boolean;
    messages: Map<string, Message | InteractionResponse>;

    spotifyApi: SpotifyWebApi;
    player: AudioPlayer;

    constructor(guildId: string) {
        this.guildId = guildId;
        this.playlist = Bot.DEFAULT_PLAYLIST.filter(Boolean);
        this.musicQueue = [];
        this.currentMusic = '';
        this.audioResource = null;
        this.volume = DEFAULT_VOLUME;
        this.isPlaying = false;
        this.isShuffle = false;
        this.messages = new Map();

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
        this.player.on(AudioPlayerStatus.Playing, () => { this.isPlaying = true });
        this.player.on(AudioPlayerStatus.Paused, () => { this.isPlaying = false });
        this.player.on(AudioPlayerStatus.Idle, () => {
            this.play();
            removeCache(this.currentMusic);
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

        this.player.play(this.audioResource);

        // pre-download next music.
        while (Bot.BANLIST.includes(this.musicQueue[0])) {
            const hash = this.#getNextMusicHash();
            console.log('[INFO]', 'Skip for song that are banned:', `${URLS.YOUTUBE}?v=${hash}`);
        }
        this.#download(this.musicQueue[0]);
    }

    async #stream(): Promise<internal.Readable | undefined> {
        const hash = this.#getNextMusicHash();
        if (!hash) return;

        this.currentMusic = hash;

        try {
            const filepath = await this.#download(hash);
            return createReadStream(filepath);
        } catch (e) {
            console.log('[WARN]', e);
            return this.#stream();
        }
    }

    #download(hash: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = `${URLS.YOUTUBE}?v=${hash}`;

            const filepath = `./mp3/cache/${hash}.mp3`;
            if (!existsSync(filepath)) {
                console.log('[INFO]', 'Download:', url);

                const stream = ytdl(url, { filter: 'audioonly' }).on('error', error => {
                    if (error.message.includes('only available to Music Premium members')) {
                        console.warn('[WARN]', `${hash}: Youtubeプレミアム限定のコンテンツです。`);
                    } else if (error.message.includes('confirm your age')) {
                        console.warn('[WARN]', `${hash}: 年齢確認の必要なコンテンツです。`);
                    } else {
                        console.error('[ERROR]', `${hash}: 利用できないコンテンツです。`);
                    }

                    this.addBanlist(hash);
                    this.#getNextMusicHash() // skip next music.

                    return this.#download(this.musicQueue[0]);
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

    addBanlist(hash: string): void {
        Bot.BANLIST.push(hash);
        writeFile('./config/banlist.txt', Bot.BANLIST.filter(Boolean).join('\n'));

        console.log('[INFO]', 'Added to ban list:', `${URLS.YOUTUBE}?v=${hash}`);
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
            this.musicQueue = this.#shuffle(this.playlist);
        } else {
            this.musicQueue = this.playlist
        }
    }

    #shuffle([...array]): string[] {
        for (let i = array.length - 1; i >= 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    };
}