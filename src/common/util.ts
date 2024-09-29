import { readdirSync, readFileSync, unlinkSync } from 'fs';
import { ButtonInteraction, CommandInteraction, ModalSubmitInteraction, REST, Routes } from 'discord.js';

import { Commands, Command, BotSetting } from '../typedef.js';
import { Bot } from '../class/Bot.js';
import { MESSAGE_DELETE_TIMEOUT_MS } from './constants.js';

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
    } catch (e) {
        console.error(e);
    }

    return data;
}

/**
 * Remove cache files other than those with the specified name
 * 
 * @param ignoreFileName 
 */
export function removeCache(ignoreFileName: string): void {
    const cacheDir = './mp3/cache';
    
    const files = readdirSync(cacheDir);
    files.filter(f => f.split('.')[0] !== ignoreFileName).forEach(f => {
        const filepath = `${cacheDir}/${f}`;
        try {
            unlinkSync(filepath);
        } catch (error) {
            console.error('ファイルの削除に失敗しました: ', filepath, error);
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
    await interaction.reply({ content, ephemeral: true }).then(msg => {
        setTimeout(() => {
            msg.delete();
        }, deleteTimeoutMS);
    })
}
