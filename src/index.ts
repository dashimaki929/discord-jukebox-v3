import * as dotenv from 'dotenv'
dotenv.config();

import { Client, GatewayIntentBits } from 'discord.js';

import { commands } from './commands.js';
import { Bots, BotSetting } from './typedef.js';
import { Bot } from './class/Bot.js';
import { readFile, registSlashCommands } from './common/util.js';

const settings: BotSetting = { id: process.env.DISCORD_BOT_ID || '', token: process.env.DISCORD_BOT_TOKEN || '' };
const bots: Bots = {};

const DEFAULT_PLAYLIST = readFile('./config/playlist.txt').split(/\r?\n/);

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates]
});

client.once('ready', async () => {
    await registSlashCommands(commands, settings);

    console.log('Bot "discord-jukebox-v3" has successfully started!');
});

client.on('interactionCreate', interaction => {
    if (!interaction.guildId) return;

    if (interaction.isCommand() || interaction.isButton() || interaction.isModalSubmit()) {
        const name = interaction.isCommand() ? interaction.commandName : interaction.customId;

        let bot = bots[interaction.guildId];
        if (!bot && name === 'connect') {
            bot = new Bot(interaction.guildId, DEFAULT_PLAYLIST);
        }

        bots[interaction.guildId] ??= bot;
        commands[name].execute(interaction, bot);

        if (name === 'disconnect') delete bots[interaction.guildId];
    }
});

client.on('error', error => {
    console.error('エラーが発生: ', error);
});

client.login(settings.token);

process.on('unhandledRejection', error => {
    console.error('unhandledRejection: ', error)
});
