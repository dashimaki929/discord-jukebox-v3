import { readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CommandInteraction, ModalSubmitInteraction, REST, Routes } from 'discord.js';

import { Commands, Command, BotSetting } from '../typedef.js';
import { Bot } from '../class/Bot.js';
import { MESSAGE_DELETE_TIMEOUT_MS } from './constants.js';

/**
 * Shuffle the array
 * 
 * @param array
 * @returns 
 */
export function shuffle([...array]): string[] {
    for (let i = array.length - 1; i >= 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

/**
 * Read file as text
 *
 * @param filepath
 * @returns data
 */
export function readFile(filepath: string): string {
    let data = '';

    try {
        data = readFileSync(filepath, 'utf-8');
    } catch (error) {
        console.error('ファイルの読み込みに失敗しました:', error);
    }

    return data;
}

/**
 * Update file from string.
 * 
 * @param filepath 
 * @param content 
 */
export function writeFile(filepath: string, content: string): void {
    try {
        writeFileSync(filepath, content);
    } catch (error) {
        console.error('ファイルの書き込みに失敗しました:', error)
    }
}

/**
 * Remove cache files other than those with the specified name
 * 
 * @param ignoreFileName 
 */
export function removeCache(ignoreFileName: string): void {
    const cacheDir = './mp3/cache';

    const files = readdirSync(cacheDir);
    const muscis = files.filter(f => f.endsWith('.mp3'));
    muscis.filter(m => m.split('.')[0] !== ignoreFileName).forEach(m => {
        const filepath = `${cacheDir}/${m}`;
        try {
            unlinkSync(filepath);
        } catch (error) {
            console.error('ファイルの削除に失敗しました:', filepath, error);
        }
    });
}

/**
 * Register slash-commands
 * 
 * @param commands 
 * @param setting 
 */
export async function registSlashCommands(commands: Commands, setting: BotSetting): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(setting.token);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(Routes.applicationCommands(setting.id), {
            body: Object.keys(commands)
                .filter((name) => commands[name].description)
                .map((name) => {
                    const command: Command = commands[name];
                    return {
                        name,
                        description: command.description,
                        options: command.options
                    };
                })
        });

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.log('[ERROR]', error);
    }
}

/**
 * Delete previous replies from MessageKey
 * 
 * @param bot 
 * @param key 
 */
export async function deleteMessageFromKey(bot: Bot, key: string): Promise<void> {
    const message = bot.messages.get(key);
    if (message) await message.delete().then(() => bot.messages.delete(key));
}

/**
 * Send reply to be deleted after few seconds
 * 
 * @param interaction 
 * @param content 
 */
export async function notificationReply(interaction: CommandInteraction | ButtonInteraction | ModalSubmitInteraction, content: string, deleteTimeoutMS: number = MESSAGE_DELETE_TIMEOUT_MS): Promise<void> {
    console.log('[INFO]', content);

    await interaction.reply({ content, ephemeral: true }).then(msg => {
        setTimeout(() => {
            msg.delete();
        }, deleteTimeoutMS);
    })
}

/**
 * Update player button
 * 
 * @param bot 
 * @returns 
 */
export async function updatePlayerButton(bot: Bot): Promise<void> {
    const message = bot.messages.get('player');
    if (!message) return;

    message.edit({
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId('loop').setEmoji('1293585939490279424').setStyle(bot.isLoop ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('shuffle').setEmoji('1293585943621537893').setStyle(bot.isShuffle ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('pause').setEmoji(bot.isPlaying ? '1293585941067337751' : '1293585946633306304').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('skip').setEmoji('1293585945093738496').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('disconnect').setEmoji('1293585937833656453').setStyle(ButtonStyle.Danger),
            )
        ]
    });
}