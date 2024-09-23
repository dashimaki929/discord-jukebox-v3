import { AudioPlayer, AudioResource, createAudioPlayer, NoSubscriberBehavior } from "@discordjs/voice";
import { DEFAULT_VOLUME } from "../common/constants";
import { InteractionResponse, Message } from "discord.js";

export class Bot {
    static connectedGuildCount: number = 0;

    messages: Map<string, Message | InteractionResponse>;

    player: AudioPlayer;
    playlist: string[];
    musicQueue: string[];
    volume: number;
    audioResource: AudioResource | null;
    isPlaying: boolean;
    isShuffle: boolean;

    constructor(playlist: string[] = []) {
        this.messages = new Map();

        this.player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause,
            }
        });

        this.playlist = playlist.filter(Boolean);
        this.musicQueue = [];
        this.volume = DEFAULT_VOLUME;
        this.audioResource = null;
        this.isPlaying = false;
        this.isShuffle = false;

        this.initMusicQueue();

        Bot.connectedGuildCount++;
    }

    getNextMusicHash(): string | undefined {
        if (!this.musicQueue.length) {
            this.initMusicQueue();
        }
        
        return this.musicQueue.shift();
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