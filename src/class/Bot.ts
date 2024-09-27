import { InteractionResponse, Message } from "discord.js";
import { AudioPlayer, AudioResource, createAudioPlayer, NoSubscriberBehavior } from "@discordjs/voice";
import { DEFAULT_VOLUME } from "../common/constants.js";
import SpotifyWebApi from "spotify-web-api-node";

export class Bot {
    static connectedGuildCount: number = 0;

    spotifyApi: SpotifyWebApi;
    
    player: AudioPlayer;
    playlist: string[];
    musicQueue: string[];
    volume: number;
    audioResource: AudioResource | null;
    isPlaying: boolean;
    isShuffle: boolean;
    
    messages: Map<string, Message | InteractionResponse>;
    
    constructor(playlist: string[] = []) {
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
        
        this.playlist = playlist.filter(Boolean);
        this.musicQueue = [];
        this.volume = DEFAULT_VOLUME;
        this.audioResource = null;
        this.isPlaying = false;
        this.isShuffle = false;
        
        this.messages = new Map();

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