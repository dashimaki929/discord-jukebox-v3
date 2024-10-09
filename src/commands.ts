import { randomUUID } from 'crypto';

import {
    ButtonInteraction,
    CommandInteraction,
    ModalSubmitInteraction,
    SlashCommandStringOption,
    SlashCommandChannelOption,
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    ChannelType,
    ButtonStyle,
    TextInputStyle,
    AttachmentBuilder,
} from 'discord.js';
import { getVoiceConnections, joinVoiceChannel } from '@discordjs/voice';
import yts from 'yt-search';

import { Commands } from './typedef.js';
import { Bot } from './class/Bot.js';
import { deleteMessageFromKey, notificationReply, shuffle, updatePlayerButton } from './common/util.js';
import { COLORS, ICONS, IMPORTANT_MESSAGE_DELETE_TIMEOUT_MS, PLAYLISTS, URLS } from './common/constants.js';

export const commands: Commands = {
    /**
     * debug Command
     *      Used for debugging with a running bot.
     */
    debug: {
        description: '🧰 デバッグ',
        options: [
            new SlashCommandStringOption()
                .setName('code')
                .setDescription('実行するコードを入力')
                .setRequired(true)
        ],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            if (interaction.user.id !== process.env.DISCORD_HOST_USER_ID) {
                notificationReply(interaction, '⛔ このコマンドを実行する権限がありません。')
                return;
            }

            try {
                const code = interaction.options.get('code')?.value! as string;
                const result = new Function(`"use strict"; return (async () => { ${code} })()`)();
                interaction.reply({
                    content: ['```json', JSON.stringify(result).substring(0, 1900), '```'].join('\n'),
                    ephemeral: true,
                });
            } catch (error) {
                notificationReply(interaction, ['```', error, '```'].join('\n'));
            }
        }
    },

    /**
     * connect Command
     *      Used for connect a bot to a voice channel.
     */
    connect: {
        description: '🟢 ボイスチャンネルへ接続',
        options: [
            new SlashCommandChannelOption()
                .setName('channel')
                .setDescription('接続先ボイスチャンネルを選択')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildVoice)
        ],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            const channelId = interaction.options.get('channel')?.value! as string;
            const voiceChannel = interaction.guild?.channels.cache.get(channelId);

            if (voiceChannel) {
                if (!interaction.guild || !interaction.guildId) {
                    notificationReply(interaction, '❌ 予期せぬエラーが発生しました。')
                    return;
                }

                joinVoiceChannel({
                    channelId,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                const playlist = await yts({ listId: PLAYLISTS[0].hash });
                bot.playlist = playlist.videos.map(v => v.videoId);
                bot.currentPlaylistTitle = playlist.title;
                bot.currentPlaylistUrl = playlist.url;
                bot.initMusicQueue();

                bot.play();

                const channel = await interaction.guild.channels.fetch(interaction.channelId ?? '');
                if (channel?.isTextBased()) {
                    channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setAuthor({ name: 'Jukebox v3.0.0', iconURL: 'attachment://icon.webp', url: 'https://github.com/dashimaki929/discord-jukebox-v3' })
                                .setTitle('音楽をロード中...')
                                .setThumbnail('attachment://download.gif')
                                .addFields({
                                    name: 'プレイリスト',
                                    value: bot.currentPlaylistUrl
                                        ? `[${bot.currentPlaylistTitle}](${bot.currentPlaylistUrl})`
                                        : `\`${bot.currentPlaylistTitle}\``
                                })
                                .setImage('attachment://loading.gif')
                        ],
                        files: [
                            new AttachmentBuilder('./img/icon.webp').setName('icon.webp'),
                            new AttachmentBuilder('./img/download.gif').setName('download.gif'),
                            new AttachmentBuilder('./img/loading.gif').setName('loading.gif'),
                        ],
                        components: [
                            new ActionRowBuilder<ButtonBuilder>().addComponents(
                                new ButtonBuilder().setCustomId('loop').setEmoji('1293585939490279424').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('shuffle').setEmoji('1293585943621537893').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('pause').setEmoji('1293585941067337751').setStyle(ButtonStyle.Primary),
                                new ButtonBuilder().setCustomId('skip').setEmoji('1293585945093738496').setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder().setCustomId('disconnect').setEmoji('1293585937833656453').setStyle(ButtonStyle.Danger),
                            )
                        ],
                    }).then(msg => bot.messages.set('player', msg));
                }

                notificationReply(interaction, `🟢 ボイスチャンネル（\`${voiceChannel.name}\`）に接続しました。`)
            } else {
                notificationReply(interaction, '❌ 指定されたボイスチャンネルが存在しません。');
            }
        }
    },

    /**
     * disconnect Command
     *      Used for disconnect the bot from the voice channel.
     */
    disconnect: {
        description: '🔴 ボイスチャンネルから切断',
        options: [],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            if (!interaction.guildId) {
                notificationReply(interaction, '❌ 予期せぬエラーが発生しました。')
                return;
            }

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (voiceConnection) {
                voiceConnection.destroy();
                await deleteMessageFromKey(bot, 'player');

                notificationReply(interaction, '🔴 ボイスチャンネルから切断しました。');
            } else {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
            }
        }
    },

    /**
     * play Command
     *      Used for add music to the queue.
     */
    play: {
        description: '🎵 Youtube から動画を指定して音楽を再生',
        options: [
            new SlashCommandStringOption()
                .setName('play')
                .setDescription('動画のURLを入力')
                .setRequired(true)
        ],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            if (!interaction.guildId) return;

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (!voiceConnection) {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
                return;
            }

            const url = interaction.options.get('play')?.value! as string;
            const hash = url.match(/[\w-]{11}/);
            if (!hash) {
                notificationReply(interaction, '❌ 動画のURLが正しくありません。');
                return;
            }

            bot.musicQueue.unshift(hash[0]);
            bot.download(bot.musicQueue[0]);

            notificationReply(interaction, ['🎵 楽曲をキューに追加しました。', `${URLS.YOUTUBE}?v=${hash}`].join('\n'));
        }
    },

    /**
     * playlist Command
     *      Used for set up playlists from YouTube.
     */
    playlist: {
        description: '🎶 Youtube からプレイリストを設定',
        options: [
            new SlashCommandStringOption()
                .setName('playlist')
                .setDescription('プレイリストのURLを入力')
                .setRequired(true)
                .addChoices(...PLAYLISTS.map(playlist => { return { name: playlist.title, value: playlist.hash } }))
        ],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            if (!interaction.guildId) return;

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (!voiceConnection) {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
                return;
            }

            const url = interaction.options.get('playlist')?.value! as string;
            const hash = url.match(/PL[\w-]{32}/);
            if (!hash) {
                notificationReply(interaction, '❌ プレイリストのURLが正しくありません。');
                return;
            }

            const playlist = await yts({ listId: hash[0] });
            if (!playlist.videos.length) {
                notificationReply(interaction, '❌ プレイリストが空か、再生可能な曲がありません。');
                return;
            }

            bot.playlist = playlist.videos.map(v => v.videoId);
            bot.currentPlaylistTitle = playlist.title;
            bot.currentPlaylistUrl = playlist.url;
            bot.initMusicQueue();
            bot.download(bot.musicQueue[0]);

            notificationReply(interaction, ['🎶 プレイリストを設定しました。', playlist.url].join('\n'));
        }
    },

    /**
     * search Command
     *      Used for search for musics from Youtube and add them to the queue.
     */
    search: {
        description: '🔍 YouTube から動画を検索',
        options: [
            new SlashCommandStringOption()
                .setName('search')
                .setDescription('検索ワードを入力')
                .setRequired(true)
        ],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            if (!interaction.guildId) return;

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (!voiceConnection) {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
                return;
            }

            const word = interaction.options.get('search')?.value! as string;
            const result = await yts(word);
            const video = result.videos[0]
            bot.musicQueue.unshift(video.videoId);
            bot.download(bot.musicQueue[0]);

            notificationReply(interaction, ['🎵 楽曲をキューに追加しました。', video.url].join('\n'));
        }
    },

    /**
     * loop Command
     *     Used for toggles between looping.
     */
    loop: {
        description: '🔁 ループ再生モードの切り替え',
        options: [],
        execute: async (interaction: CommandInteraction | ButtonInteraction, bot: Bot) => {
            if (!interaction.guildId) return;

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (!voiceConnection) {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
                return;
            }

            bot.isLoop = !bot.isLoop;
            updatePlayerButton(bot);

            if (interaction.isButton()) {
                interaction.deferUpdate();
                return;
            }

            notificationReply(interaction, `🔁 ループ再生が ${bot.isLoop ? 'ON' : 'OFF'} になりました。`);
        }
    },

    /**
     * shuffle Command
     *      Used for toggles between shuffling.
     */
    shuffle: {
        description: '🔀 シャッフル再生モードの切り替え',
        options: [],
        execute: async (interaction: CommandInteraction | ButtonInteraction, bot: Bot) => {
            if (!interaction.guildId) return;

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (!voiceConnection) {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
                return;
            }

            bot.isShuffle = !bot.isShuffle;
            if (bot.isShuffle) {
                bot.musicQueue = shuffle(bot.musicQueue);
                bot.download(bot.musicQueue[0]);
            }

            updatePlayerButton(bot);

            if (interaction.isButton()) {
                interaction.deferUpdate();
                return;
            }

            notificationReply(interaction, `🔀 シャッフル再生が ${bot.isShuffle ? 'ON' : 'OFF'} になりました。`);
        }
    },

    /**
     * pause Command
     *      Used for toggles between pausing.
     */
    pause: {
        description: '⏯ 再生中の曲を一時停止 / 一時停止中の曲を再開',
        options: [],
        execute: async (interaction: CommandInteraction | ButtonInteraction, bot: Bot) => {
            if (!interaction.guildId) return;

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (!voiceConnection) {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
                return;
            }

            let content = '';
            if (bot.isPlaying) {
                bot.player.pause();
                content = '⏯ 再生中の楽曲を一時停止しました。';
            } else {
                bot.player.unpause();
                content = '⏯ 一時停止中の楽曲を再開しました。';
            }

            updatePlayerButton(bot);

            if (interaction.isButton()) {
                interaction.deferUpdate();
                return;
            }

            notificationReply(interaction, content);
        }
    },

    /**
     * skip Command
     *      Used for skip the current music.
     */
    skip: {
        description: '⏭️ 現在の曲をスキップ',
        options: [],
        execute: async (interaction: CommandInteraction | ButtonInteraction, bot: Bot) => {
            if (!interaction.guildId) return;

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (!voiceConnection) {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
                return;
            }

            bot.player.stop();
            updatePlayerButton(bot);

            if (interaction.isButton()) {
                interaction.deferUpdate();
                return;
            }

            notificationReply(interaction, '⏭️ 再生中の楽曲をスキップしました。');
        }
    },

    ban: {
        description: '🚫 現在の曲をBAN',
        options: [],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            if (!interaction.guildId) return;

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (!voiceConnection) {
                notificationReply(interaction, '❌ 接続中のボイスチャンネルが存在しません。');
                return;
            }

            if (!bot.currentMusic) {
                notificationReply(interaction, '❌ 再生中の音楽がありません。');
                return;
            }

            const user = interaction.user;
            bot.addBanlist(bot.currentMusic, `${user.displayName}(${user.tag})<${user.id}> によりBANされました。`);

            commands.skip.execute(interaction, bot);
        }
    },

    /**
     * spotify Command
     *      Used for integration with spotify.
     */
    spotify: {
        description: '🌏 Spotifyと連携',
        options: [],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            if (!bot) {
                notificationReply(interaction, '❌ ボイスチャンネルに接続してから実行してください。')
                return;
            }

            const scopes = ['playlist-read-private', 'user-library-read'];
            const state = randomUUID();
            interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(COLORS.SPOTIFY)
                        .setAuthor({ name: 'Spotify連携', iconURL: ICONS.SPOTIFY })
                        .setTitle('Spotifyとの連携方法')
                        .setDescription('リンクを押下して Spotify にログイン後、画面に表示されるコードを入力してください。')
                ],
                components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setLabel('コードを入力').setCustomId('spotify_code').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setLabel('Spotifyにログインしてコードを取得').setURL(bot.spotifyApi.createAuthorizeURL(scopes, state)).setStyle(ButtonStyle.Link)
                    )
                ],
                ephemeral: true
            }).then(msg => bot.messages.set('spotify', msg));
        }
    },

    /**
     * spotify-code Command
     *      Used for enter Spotifty's authentication code.
     */
    spotify_code: {
        description: '',
        options: [],
        execute: async (interaction: ButtonInteraction) => {
            await interaction.showModal(new ModalBuilder()
                .setCustomId('spotify_auth')
                .setTitle('Spotify連携')
                .addComponents(new ActionRowBuilder<TextInputBuilder>()
                    .addComponents(new TextInputBuilder()
                        .setCustomId('code')
                        .setLabel('コードを入力してください。')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                    )
                )
            );
        }
    },

    /**
     * spotify-auth Command
     *      Used for authentication with Spotify.
     */
    spotify_auth: {
        description: '',
        options: [],
        execute: async (interaction: ModalSubmitInteraction, bot: Bot) => {
            if (!bot) {
                notificationReply(interaction, '❌ ボイスチャンネルに接続してから実行してください。')
                return;
            }

            const code = interaction.fields.getTextInputValue('code');
            await bot.spotifyApi.authorizationCodeGrant(code).then(data => {
                bot.spotifyApi.setAccessToken(data.body.access_token);
                bot.spotifyApi.setRefreshToken(data.body.refresh_token);
            }).catch(error => {
                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.ERROR)
                            .setAuthor({ name: 'Spotify連携', iconURL: ICONS.SPOTIFY })
                            .setTitle('Spotify連携失敗')
                            .setDescription([
                                'Spotifyアカウントの連携に失敗しました。',
                                '```', error, '```'
                            ].join('\n'))
                    ],
                    ephemeral: true
                }).then(msg => setTimeout(() => { msg.delete() }, IMPORTANT_MESSAGE_DELETE_TIMEOUT_MS));
            });

            if (!bot.spotifyApi.getAccessToken() || !bot.spotifyApi.getRefreshToken()) return

            await bot.spotifyApi.getMe().then(data => {
                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.SPOTIFY)
                            .setAuthor({ name: 'Spotify連携', iconURL: ICONS.SPOTIFY })
                            .setTitle('Spotify連携成功')
                            .setDescription([
                                'Spotifyアカウントの連携に成功しました。',
                                '```json',
                                JSON.stringify(data, null, '\t'),
                                '```',
                                '',
                                '以下コマンドがご利用いただけます。'
                            ].join('\n'))
                    ],
                    ephemeral: true
                }).then(msg => setTimeout(() => {
                    deleteMessageFromKey(bot, 'spotify');
                    msg.delete();
                }, IMPORTANT_MESSAGE_DELETE_TIMEOUT_MS));
            }).catch(error => {
                console.error('APIの実行に失敗しました:', error);
            });
        }
    },
}
