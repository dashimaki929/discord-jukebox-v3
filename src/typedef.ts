import { CommandInteraction, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { Bot } from './class/Bot.js';

export type Bots = {
    [key: string]: Bot;
}

export type BotSetting = {
    id: string;
    token: string;
}

export type Commands = {
    [key: string]: Command;
}

export type Command = {
    description: string;
    options: CommandOption[];
    execute(interaction: CommandInteraction | ButtonInteraction | ModalSubmitInteraction, bot: Bot): Promise<void>;
}

export type CommandOption = {
    type: number;
    name: string;
    description: string;
    required: boolean;
}

export interface BANLIST {
    [key: string]: {
        reason: string,
        bannedAt: Date,
    }
}
