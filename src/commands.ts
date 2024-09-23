import {
    CommandInteraction,
    SlashCommandChannelOption,
    ChannelType,
} from 'discord.js';

import { Commands } from './typedef';
import { Bot } from './class/Bot';
import { notificationReply } from './common/util';
import { getVoiceConnections, joinVoiceChannel } from '@discordjs/voice';

export const commands: Commands = {
    debug: {
        description: '🔧 デバッグ',
        options: [],
        execute: async (interaction: CommandInteraction, bot: Bot) => {
            await interaction.reply({
                content: [
                    '```JSON',
                    JSON.stringify(bot, null, '\t'),
                    '```',
                ].join('\n'),
                ephemeral: true,
            });
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
}
