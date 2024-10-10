import * as dotenv from 'dotenv'
dotenv.config();

import { ActivityType, Client, GatewayIntentBits } from 'discord.js';

import { commands } from './commands.js';
import { Bots, BotSetting } from './typedef.js';
import { Bot } from './class/Bot.js';
import { registSlashCommands, updatePlayerButton } from './common/util.js';

const settings: BotSetting = { id: process.env.DISCORD_BOT_ID || '', token: process.env.DISCORD_BOT_TOKEN || '' };
const bots: Bots = {};

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates]
});

client.once('ready', async () => {
    await registSlashCommands(commands, settings);

    client.user?.setActivity('/connect で音楽', { type: ActivityType.Listening });
    console.log('Bot "discord-jukebox-v3" has successfully started!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.guildId) return;

    if (interaction.isCommand() || interaction.isButton() || interaction.isModalSubmit()) {
        const name = interaction.isCommand() ? interaction.commandName : interaction.customId;

        const [guild, user] = [interaction.guild, interaction.user];
        console.info('[INFO]', `<guild name="${guild?.name}" id="${guild?.id}">`, `<user name="${user.displayName}" id="${user.id}">`, `<command name="${name}" type="${interaction.type}">`);

        let bot = bots[interaction.guildId];
        if (!bot && name === 'connect') {
            bot = new Bot(interaction.guildId);
        }

        bots[interaction.guildId] ??= bot;
        await commands[name].execute(interaction, bot);

        if (name === 'disconnect') delete bots[interaction.guildId];
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.channel) {
        // someone left the voice channel.
        const botJoiningVoiceChannel = oldState.guild.members.me?.voice.channel;
        if (botJoiningVoiceChannel && botJoiningVoiceChannel.id === oldState.channel.id) {
            const bot = bots[oldState.channel.guild.id];
            const memberCount = oldState.channel.members.filter(m => !m.user.bot).size;
            if (bot.isPlaying && memberCount === 0) {
                bot.audioPlayer.pause();
                bot.isAutoPause = true;
                console.info('[INFO]', '⏯ 接続中のボイスチャンネル内にユーザーがいないため自動停止します。');
            }
            updatePlayerButton(bot);
        }
    }
    if (newState.channel) {
        // someone joined the voice channel.
        const botJoiningVoiceChannel = newState.guild.members.me?.voice.channel;
        if (botJoiningVoiceChannel && botJoiningVoiceChannel.id === newState.channel.id) {
            const bot = bots[newState.channel.guild.id];
            const memberCount = newState.channel.members.filter(m => !m.user.bot).size;
            if (memberCount > 0) {
                bot.audioPlayer.unpause();
                bot.isAutoPause = false;
                updatePlayerButton(bot);
                console.info('[INFO]', '⏯ ユーザーがボイスチャンネルに接続したため再生を開始します。');
            }
        }
    }
});

client.on('error', error => {
    console.error('エラーが発生:', error);
});

client.login(settings.token);

process.on('unhandledRejection', error => {
    console.error('unhandledRejection:', error)
});
