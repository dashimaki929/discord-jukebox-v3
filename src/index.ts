import * as dotenv from 'dotenv'
dotenv.config();

import { Client, GatewayIntentBits } from 'discord.js';

import { commands } from './commands';
import { Bots, BotSetting } from './typedef';
import { Bot } from './class/Bot';
import { registSlashCommands } from './common/util';

const settings: BotSetting = { id: process.env.DISCORD_BOT_ID || '', token: process.env.DISCORD_BOT_TOKEN || '' };
const bots: Bots = {};

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
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
            bot = new Bot([]);
        }

        bots[interaction.guildId] ??= bot;
        commands[name].execute(interaction, bot);

        if (name === 'disconnect') delete bots[interaction.guildId];
    }
});

client.login(settings.token);
