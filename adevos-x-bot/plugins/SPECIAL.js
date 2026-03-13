const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getSetting } = require('../lib/database');
const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');
const moment = require('moment-timezone');

const DATA_PATH = path.join(__dirname, '../data/messageCount.json');

function loadMessageCounts() {
  if (fs.existsSync(DATA_PATH)) {
    try { return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')); } catch (e) {}
  }
  return { messageCount: {} };
}

function saveMessageCounts(data) {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function incrementMessageCount(groupId, userId) {
  const data = loadMessageCounts();
  if (!data.messageCount) data.messageCount = {};
  if (!data.messageCount[groupId]) data.messageCount[groupId] = {};
  if (!data.messageCount[groupId][userId]) data.messageCount[groupId][userId] = 0;
  data.messageCount[groupId][userId] += 1;
  saveMessageCounts(data);
}

function syncMode() {
  try {
    const data = loadMessageCounts();
    saveMessageCounts(data);
  } catch (e) {}
}

function resetUserCount(groupId, userId) {
  try {
    const data = loadMessageCounts();
    if (data.messageCount?.[groupId]) {
      delete data.messageCount[groupId][userId];
      saveMessageCounts(data);
    }
  } catch (e) {}
}

module.exports = [
  {
    name: 'topmembers',
    aliases: ['top', 'leaderboard'],
    category: 'group',
    description: 'Show top members by message count',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      try {
        const data = loadMessageCounts();
        const groupCounts = (data.messageCount || {})[chatId] || {};
        const sorted = Object.entries(groupCounts).sort(([, a], [, b]) => b - a).slice(0, 10);

        if (!sorted.length) {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ No message activity yet!\n│\n└─────────────────┘` }, { quoted: fake });
        }

        const medals = ['1st', '2nd', '3rd'];
        const lines = sorted.map(([uid, count], i) => `│ ${medals[i] || `${i + 1}th`}. @${uid.split('@')[0]} - ${count} msgs`);
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ *Top Members*\n│\n${lines.join('\n')}\n│\n└─────────────────┘`,
          mentions: sorted.map(([uid]) => uid),
          ...channelInfo
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },
  {
    name: 'github',
    aliases: ['repo', 'script'],
    category: 'utility',
    description: 'Get ADEVOS-X BOT repository info',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      try {
        const res = await axios.get('https://api.github.com/repos/gifteddevsmd/DAVE-MD2', {
          headers: { 'User-Agent': 'ADEVOS-X BOT' }, timeout: 10000
        });
        const repo = res.data;
        const text = `┌─ *${botName}* ─┐\n│\n│ *Repository Info*\n│ Name: ${repo.name}\n│ Stars: ${repo.stargazers_count}\n│ Forks: ${repo.forks_count}\n│ URL: ${repo.html_url}\n│\n└─────────────────┘`;
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed to fetch repo\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },
  {
    name: 'time',
    aliases: ['clock'],
    category: 'utility',
    description: 'Get current time',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const tz = getSetting('timezone', 'Africa/Nairobi');
      const now = moment().tz(tz);
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ Time: ${now.format('HH:mm:ss')}\n│ Date: ${now.format('dddd, Do MMMM YYYY')}\n│ Zone: ${tz}\n│\n└─────────────────┘`,
        ...channelInfo
      }, { quoted: fake });
    }
  }
];

module.exports.incrementMessageCount = incrementMessageCount;
module.exports.syncMode = syncMode;
module.exports.resetUserCount = resetUserCount;
