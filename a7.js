import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import express from 'express';

// Load environment variables
const BOT_TOKEN = process.env.BOT_TOKEN; // Bot token from .env
const CHANNEL_ID = process.env.CHANNEL_ID; // Channel ID from .env
const PORT = process.env.PORT || 3000; // Port for the Express server

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

// Global variable to store the last sent messages and server statuses
const lastMessages = {}; // Key: server ID, Value: Message object
const statusCache = {}; // Key: server ID, Value: Status object

// Function to fetch server status and name with retry logic
async function fetchServerStatus(serverId, retries = 3, delay = 1000) {
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
    if (error.response && error.response.status === 429 && retries > 0) {
      console.warn(`Rate limited while fetching status for server ${serverId}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying
      return fetchServerStatus(serverId, retries - 1, delay * 2); // Retry with exponential backoff
    } else {
      console.error(`Error fetching status for server ${serverId}:`, error.message);
      return null;
    }
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
    description: `**Players:**\n\n**${status.playerCount} / ${status.maxPlayers}**`,
    color: embedColor,
    thumbnail: {
      url: 'https://i.ibb.co/sp9fyrSv/A7.png', // Replace with your game's logo URL
    },
    timestamp: new Date(), // Timestamp for when the embed was created
    footer: {
      text: 'Powered by A7madShooter',
      icon_url: 'https://i.ibb.co/dwMssPvt/IMG-4011.jpg', // Replace with BattleMetrics logo URL
    },
  };

  return embed;
}

// Fetch server statuses every 3 seconds and cache them
async function fetchAndCacheStatuses() {
  console.log(`Fetching statuses at ${new Date().toISOString()}...`);
  for (const serverId of SERVER_IDS) {
    const status = await fetchServerStatus(serverId);
    if (status) {
      statusCache[serverId] = status; // Cache the fetched status
      console.log(`Fetched status for server ${serverId}:`, status);
    } else {
      console.error(`Failed to fetch status for server ${serverId}`);
    }
  }
}

// Update the Discord channel every second
async function updateChannel() {
  const channel = client.channels.cache.get(CHANNEL_ID);

  if (!channel) {
    console.error('Channel not found!');
    return;
  }

  for (const serverId of SERVER_IDS) {
    const status = statusCache[serverId]; // Use cached data for faster updates

    if (status) {
      const embed = formatEmbed(status.serverName, status);

      try {
        if (lastMessages[serverId]) {
          // Edit the existing message
          const message = await channel.messages.fetch(lastMessages[serverId].id); // Fetch the message from Discord
          await message.edit({ embeds: [embed] });
          console.log(`Edited message for ${status.serverName}`);
        } else {
          // Send a new message if none exists
          const sentMessage = await channel.send({ embeds: [embed] });
          lastMessages[serverId] = sentMessage; // Store the sent message
          console.log(`Sent new message for ${status.serverName}`);
        }
      } catch (error) {
        console.error(`Failed to update message for ${status.serverName}:`, error.message);
      }
    } else {
      console.warn(`No cached status found for server ${serverId}`);
    }
  }
}

// Bot login event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Start fetching server statuses every 3 seconds
  setInterval(fetchAndCacheStatuses, 3000);

  // Start updating the Discord channel every second
  setInterval(updateChannel, 1000);
});

// Log in to Discord
client.login(BOT_TOKEN);

// -------------------------
// Express Server Setup
// -------------------------

const app = express();

// Middleware to parse JSON
app.use(express.json());

// Root route to display server statuses
app.get('/', (req, res) => {
  const statuses = Object.entries(statusCache).map(([serverId, status]) => {
    let statusText = '';
    if (!status.isOnline) {
      statusText = 'Offline';
    } else if (status.playerCount < 55) {
      statusText = 'Seeding';
    } else {
      statusText = 'Online';
    }

    return {
      serverName: status.serverName,
      status: statusText,
      players: `${status.playerCount}/${status.maxPlayers}`,
    };
  });

  res.json({
    message: 'Server Statuses',
    statuses,
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`Express server is running on http://localhost:${PORT}`);
});

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'Reason:', reason);
});
