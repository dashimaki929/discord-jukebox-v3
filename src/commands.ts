import crypto from 'crypto';

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
} from 'discord.js';

import { Commands } from './typedef.js';
import { Bot } from './class/Bot.js';
import { deleteMessageFromKey, notificationReply } from './common/util.js';
import { getVoiceConnections, joinVoiceChannel } from '@discordjs/voice';
import { COLORS, ICONS, IMPORTANT_MESSAGE_DELETE_TIMEOUT_MS } from './common/constants.js';

export const commands: Commands = {
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
                notificationReply(interaction, ':warning: このコマンドを実行する権限がありません。')
                return;
            }

            try {
                const command = interaction.options.get('code')?.value! as string;
                interaction.reply({
                    content: ['```json', eval(command), '```'].join('\n'),
                    ephemeral: true,
                });
            } catch (err) {
                notificationReply(interaction, ['```', err, '```'].join('\n'));
            }
        }
    },
    connect: {
        description: '🟢 ボイスチャンネルへ接続',
        options: [
            new SlashCommandChannelOption()
                .setName('channel')
                .setDescription('接続先ボイスチャンネルを選択')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildVoice)
        ],
        execute: async (interaction: CommandInteraction) => {
            const channelId = interaction.options.get('channel')?.value! as string;
            const voiceChannel = interaction.guild?.channels.cache.get(channelId);

            if (voiceChannel) {
                if (!interaction.guild || !interaction.guildId) {
                    notificationReply(interaction, ':warning: 予期せぬエラーが発生しました。')
                    return;
                }

                joinVoiceChannel({
                    channelId,
                    guildId: interaction.guildId,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                notificationReply(interaction, `:green_circle: ボイスチャンネル（\`${voiceChannel.name}\`）に接続しました。`)
            } else {
                notificationReply(interaction, ':warning: 指定されたボイスチャンネルが存在しません。');
            }
        }
    },
    disconnect: {
        description: '🔴 ボイスチャンネルから切断',
        options: [],
        execute: async (interaction: CommandInteraction) => {
            if (!interaction.guildId) {
                notificationReply(interaction, ':warning: 予期せぬエラーが発生しました。')
                return;
            }

            const voiceConnection = getVoiceConnections().get(interaction.guildId);
            if (voiceConnection) {
                voiceConnection.destroy();
                notificationReply(interaction, ':red_circle: ボイスチャンネルから切断しました。');
            } else {
                notificationReply(interaction, ':warning: 接続中のボイスチャンネルが存在しません。');
            }
        }
    },
    spotify: {
        description: '🌏 Spotifyと連携',
        options: [],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            if (!bot) {
                notificationReply(interaction, ':warning: ボイスチャンネルに接続してから実行してください。')
                return;
            }

            const scopes = ['playlist-read-private', 'user-library-read'];
            const state = crypto.randomUUID();
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
    spotify_auth: {
        description: '',
        options: [],
        execute: async (interaction: ModalSubmitInteraction, bot: Bot) => {
            if (!bot) {
                notificationReply(interaction, ':warning: ボイスチャンネルに接続してから実行してください。')
                return;
            }

            const code = interaction.fields.getTextInputValue('code');
            await bot.spotifyApi.authorizationCodeGrant(code).then(data => {
                bot.spotifyApi.setAccessToken(data.body.access_token);
                bot.spotifyApi.setRefreshToken(data.body.refresh_token);
            }).catch(err => {
                interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(COLORS.ERROR)
                            .setAuthor({ name: 'Spotify連携', iconURL: ICONS.SPOTIFY })
                            .setTitle('Spotify連携失敗')
                            .setDescription([
                                'Spotifyアカウントの連携に失敗しました。',
                                '```', err, '```'
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
            }).catch(err => {
                console.error('APIの実行に失敗しました: ', err);
            });
        }
    },
}
