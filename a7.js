import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';

// Load environment variables
const BOT_TOKEN = process.env.BOT_TOKEN; // Bot token from .env
const CHANNEL_ID = process.env.CHANNEL_ID; // Channel ID from .env

// Initialize the Discord bot
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

// Dynamically load server IDs from .env
const SERVER_IDS = [];
for (let i = 1; ; i++) {
  const id = process.env[`SERVER_${i}_ID`];
  if (!id) break; // Stop when no more servers are found
  SERVER_IDS.push(id);
}

// Global variable to store the last sent messages
const lastMessages = {}; // Key: server ID, Value: Message object

// Function to fetch server status and name
async function fetchServerStatus(serverId) {
  try {
    const response = await axios.get(`https://api.battlemetrics.com/servers/${serverId}`);
    const serverData = response.data.data;

    const isOnline = serverData.attributes.status === 'online';
    const playerCount = serverData.attributes.players;
    const maxPlayers = serverData.attributes.maxPlayers;
    const serverName = serverData.attributes.name; // Fetch the server name from BattleMetrics

    return {
      isOnline,
      playerCount,
      maxPlayers,
      serverName,
    };
  } catch (error) {
    console.error(`Error fetching status for server ${serverId}:`, error.message);
    return null;
  }
}

// Function to format the embed based on server status
function formatEmbed(serverName, status) {
  let circleEmoji = '';
  let statusText = '';
  let embedColor = 0xff0000; // Default to red (offline)

  if (!status.isOnline) {
    circleEmoji = '🔴'; // Red circle for offline
    statusText = 'Offline';
    embedColor = 0xff0000; // Red
  } else if (status.playerCount < 55) {
    circleEmoji = '🟣'; // Purple circle for seeding
    statusText = 'Seeding';
    embedColor = 0x800080; // Purple
  } else {
    circleEmoji = '🟢'; // Green circle for online
    statusText = 'Online';
    embedColor = 0x00ff00; // Green
  }

  const embed = {
    title: `${circleEmoji} ${statusText} | ${serverName}`,
    description: `**Players:** ${status.playerCount}/${status.maxPlayers}`,
    color: embedColor,
    thumbnail: {
      url: 'https://i.ibb.co/sp9fyrSv/A7.png', // Replace with your game's logo URL
    },
    timestamp: new Date(), // Timestamp for when the embed was created
    footer: {
      text: 'Powered by A7madShooter',
      icon_url: 'https://cdn.discordapp.com/attachments/1131905799296393237/1291111644042362921/IMG_4011.jpg?ex=679f172b&is=679dc5ab&hm=7fc02ea313d032ae25b1432aa6df49673090234e701bb2040812d04aadf35d23&', // Replace with BattleMetrics logo URL
    },
  };

  return embed;
}

// Update the Discord channel every 5 seconds
async function updateChannel() {
  const channel = client.channels.cache.get(CHANNEL_ID);

  if (!channel) {
    console.error('Channel not found!');
    return;
  }

  for (const serverId of SERVER_IDS) {
    const status = await fetchServerStatus(serverId);

    if (status) {
      const embed = formatEmbed(status.serverName, status);

      try {
        if (lastMessages[serverId]) {
          // Edit the existing message
          await lastMessages[serverId].edit({ embeds: [embed] });
        } else {
          // Send a new message if none exists
          lastMessages[serverId] = await channel.send({ embeds: [embed] });
        }
        console.log(`Updated embed for ${status.serverName}`);
      } catch (error) {
        console.error(`Failed to update embed for ${status.serverName}:`, error.message);
      }
    }
  }
}

// Bot login event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Start updating the channel every 5 seconds
  setInterval(updateChannel, 5000);
});

// Log in to Discord
client.login(BOT_TOKEN);