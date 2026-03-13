const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');
const { getSetting, updateSetting } = require('../lib/database');
const os = require('os');

/**
 * Extract the view-once media payload from a quoted message reply.
 * Handles all known Baileys v7 view-once wrapper formats:
 *   viewOnceMessage, viewOnceMessageV2, viewOnceMessageV2Extension
 * Also searches contextInfo across all common message types so that
 * typing just ".vv" (conversation type) is handled correctly.
 */
function extractViewOnce(message) {
  const msg = message.message || {};
  // Try every container that can carry contextInfo
  const contextInfo =
    msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.videoMessage?.contextInfo ||
    msg.audioMessage?.contextInfo ||
    msg.documentMessage?.contextInfo ||
    msg.stickerMessage?.contextInfo ||
    msg.buttonsResponseMessage?.contextInfo ||
    msg.templateButtonReplyMessage?.contextInfo ||
    msg.listResponseMessage?.contextInfo;

  const q = contextInfo?.quotedMessage;
  if (!q) return null;

  return (
    q.viewOnceMessage?.message ||
    q.viewOnceMessageV2?.message ||
    q.viewOnceMessageV2Extension?.message ||
    null
  );
}

/**
 * Download a view-once media payload and return { buffer, mediaType }.
 * Returns null when the payload has no recognised media key.
 */
async function downloadViewOnce(viewOnce) {
  const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
  const mediaType = Object.keys(viewOnce).find(k =>
    ['imageMessage', 'videoMessage', 'audioMessage'].includes(k)
  );
  if (!mediaType) return null;
  const stream = await downloadContentFromMessage(viewOnce[mediaType], mediaType.replace('Message', ''));
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return { buffer, mediaType, meta: viewOnce[mediaType] };
}

module.exports = [
  // ============================
  // ALIVE
  // ============================
  {
    name: 'alive',
    aliases: ['botinfo', 'bot'],
    category: 'utility',
    description: 'Check if bot is alive',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const totalSeconds = process.uptime();
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      const usedMem = ((process.memoryUsage().rss) / 1024 / 1024).toFixed(1);
      const prefix = global.prefix || getSetting('prefix', '.');
      const totalCmds = global.commands?.size || 0;
      const aliveText = `┌─ *${botName}* ─┐
│
│ ✦ Status: *ACTIVE* ✅
│ ✦ Uptime: *${uptimeStr}*
│ ✦ Version: *${global.version || '3.0.0'}*
│ ✦ Prefix: *${prefix}*
│ ✦ Commands: *${totalCmds}*
│ ✦ RAM: *${usedMem} MB*
│ ✦ Node: *${process.version}*
│ ✦ Platform: *${os.platform()}/${os.arch()}*
│
└─────────────────┘`;
      await sock.sendMessage(chatId, { text: aliveText }, { quoted: fake });
    }
  },

  // ============================
  // UPTIME
  // ============================
  {
    name: 'uptime',
    aliases: ['runtime', 'stats'],
    category: 'utility',
    description: 'Show detailed bot uptime and system stats',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const totalSeconds = process.uptime();
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      const mem = process.memoryUsage();
      const usedRss = (mem.rss / 1024 / 1024).toFixed(1);
      const usedHeap = (mem.heapUsed / 1024 / 1024).toFixed(1);
      const totalHeap = (mem.heapTotal / 1024 / 1024).toFixed(1);
      const cpuLoad = os.loadavg()[0].toFixed(2);
      const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
      const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
      const prefix = global.prefix || getSetting('prefix', '.');
      const mode = getSetting('mode', 'public');
      const totalCmds = global.commands?.size || 0;

      const text = `┌─ *${botName} — STATS* ─┐
│
│ ⏱  Uptime: *${uptimeStr}*
│ 🤖 Version: *${global.version || '3.0.0'}*
│ ⌨️  Prefix: *${prefix}*
│ 🌐 Mode: *${String(mode).toUpperCase()}*
│ 📋 Commands: *${totalCmds}*
│
│ 💾 RAM (RSS): *${usedRss} MB*
│ 💾 Heap: *${usedHeap}/${totalHeap} MB*
│ 🖥  Sys RAM: *${freeMem}/${totalMem} MB free*
│ ⚙️  CPU Load: *${cpuLoad}%*
│ 🐢 Node: *${process.version}*
│ 🖥  Platform: *${os.platform()}/${os.arch()}*
│
└─────────────────┘`;

      await sock.sendMessage(chatId, { text }, { quoted: fake });
    }
  },

  // ============================
  // MEMORY
  // ============================
  {
    name: 'memory',
    aliases: ['ram', 'mem'],
    category: 'utility',
    description: 'Show memory usage',
    execute: async (sock, message, args, context) => {
      const { reply } = context;
      let totalSeconds = process.uptime();
      let days = Math.floor(totalSeconds / (3600 * 24));
      let hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
      let minutes = Math.floor((totalSeconds % 3600) / 60);
      let seconds = Math.floor(totalSeconds % 60);
      let uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
      const cpuLoad = os.loadavg()[0].toFixed(2);
      const cpuCount = os.cpus().length;
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const usedMemMB = (usedMem / (1024 * 1024)).toFixed(2);
      const totalMemMB = (totalMem / (1024 * 1024)).toFixed(2);
      const memoryPercent = ((usedMem / totalMem) * 100).toFixed(1);
      const sysInfo = `ADEVOS-X BOT System Status\n\nUptime: ${uptimeStr}\nCPU: ${cpuLoad}% (${cpuCount} cores)\nMemory: ${usedMemMB} MB / ${totalMemMB} MB (${memoryPercent}%)\nPlatform: ${os.platform()} ${os.arch()}\nNode: ${process.version}`;
      await reply(sysInfo, { quoted: global.mmr });
    }
  },

  // ============================
  // PING
  // ============================
  {
    name: 'ping',
    aliases: ['p'],
    category: 'utility',
    description: 'Check bot speed',
    execute: async (sock, message, args, context) => {
      const { chatId } = context;
      const botName = getBotName();
      const fake = createFakeContact(message);
      try {
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
        const start = Date.now();
        const sentMsg = await sock.sendMessage(chatId, {
          text: `✦ *${botName}* | checking speed...`
        }, { quoted: fake });
        const ping = Date.now() - start;
        const micro = ((ping % 1000) / 1000 * 0.999).toFixed(3).slice(1);
        const precisePing = `${ping}${micro}`;
        await sock.sendMessage(chatId, {
          text: `✦ *${botName}* | ${precisePing}ms`,
          edit: sentMsg.key
        });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, {
          text: `✦ *${botName}* | Failed to measure speed.`
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
      }
    }
  },

  // ============================
  // OWNER
  // ============================
  {
    name: 'owner',
    category: 'utility',
    description: 'Show bot owner info',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const { getOwnerName } = require('../lib/messageConfig');
      const ownerName = getOwnerName();
      const fake = createFakeContact(senderId);
      const ownerNum = getSetting('ownerNumber', '');
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ Owner: ${ownerName}\n│ Number: ${ownerNum || 'Not set'}\n│\n└─────────────────┘`,
        ...channelInfo
      }, { quoted: fake });
    }
  },

  // ============================
  // STICKER
  // ============================
  {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    category: 'converter',
    description: 'Convert image/video to sticker',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const mediaMsg = message.message?.imageMessage || message.message?.videoMessage ||
                       quotedMsg?.imageMessage || quotedMsg?.videoMessage;

      if (!mediaMsg) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Send an image/video with .sticker\n│ OR reply to one with .sticker\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      try {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const msgType = message.message?.imageMessage ? 'imageMessage' : 
                        message.message?.videoMessage ? 'videoMessage' :
                        quotedMsg?.imageMessage ? 'imageMessage' : 'videoMessage';

        const srcMsg = message.message?.[msgType] || quotedMsg?.[msgType];
        if (!srcMsg) throw new Error('Could not get media');

        const stream = await downloadContentFromMessage(srcMsg, msgType.replace('Message', ''));
        let buffer = Buffer.alloc(0);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }

        const packname = getSetting('packname', 'ADEVOS-X BOT');
        const author = getSetting('botOwner', 'DAVEX');

        const { Sticker, StickerTypes } = require('wa-sticker-formatter');
        const sticker = new Sticker(buffer, {
          pack: packname,
          author: author,
          type: msgType === 'videoMessage' ? StickerTypes.ANIMATED : StickerTypes.FULL,
          quality: 50,
        });
        const stickerBuffer = await sticker.toBuffer();
        await sock.sendMessage(chatId, { sticker: stickerBuffer }, { quoted: fake });
      } catch (err) {
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Sticker creation failed:\n│ ${err.message}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }
    }
  },

  // ============================
  // SETFONT
  // ============================
  {
    name: 'setfont',
    aliases: ['font'],
    category: 'owner',
    description: 'Set text font style for all bot replies',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const { getStyleList } = require('../lib/fontStyles');

      if (!args[0]) {
        const styles = getStyleList();
        let list = `┌─ *${botName} FONT STYLES* ─┐\n│\n`;
        styles.forEach(s => {
          list += `│ ✦ ${s.key}\n│   ${s.name} — ${s.preview}\n│\n`;
        });
        list += `│ Usage: .setfont <name>\n│ Example: .setfont bold_script\n│ Reset: .setfont none\n│\n└─────────────────────────┘`;
        return sock.sendMessage(chatId, { text: list }, { quoted: fake });
      }

      const style = args[0].toLowerCase().trim();
      const styles = getStyleList();
      const valid = styles.map(s => s.key);
      if (!valid.includes(style)) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Invalid style: ${style}\n│ Use .setfont to see all styles\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      updateSetting('fontstyle', style);
      const info = styles.find(s => s.key === style);
      return sock.sendMessage(chatId, {
        text: `┌─ *${botName} SETFONT* ─┐\n│\n│ ✦ Style set: *${info.name}*\n│ ✦ Preview: ${info.preview}\n│\n└─────────────────┘`
      }, { quoted: fake });
    }
  },

  // ============================
  // ENCRYPT / OBFUSCATE
  // ============================
  {
    name: 'encrypt',
    aliases: ['obfuscate', 'enc'],
    category: 'utility',
    description: 'Obfuscate/encrypt JavaScript code',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      let Obfuscator = null;
      try { Obfuscator = require('javascript-obfuscator'); } catch {}

      const quotedText = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
        || message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
      const directText = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').replace(/^[.!#/]?(encrypt|obfuscate|enc)\s*/i, '').trim();
      const code = directText || quotedText || '';

      if (!code) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} ENCRYPT* ─┐\n│\n│ Obfuscate JavaScript code\n│\n│ Usage:\n│ .encrypt <js code>\n│ .encrypt (reply to code msg)\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (!Obfuscator) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Obfuscator module not available.\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      try {
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
        const result = Obfuscator.obfuscate(code, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          numbersToExpressions: true,
          simplify: true,
          stringArrayShuffle: true,
          splitStrings: true,
          stringArrayThreshold: 0.75
        });
        const encrypted = result.getObfuscatedCode();
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

        if (encrypted.length > 4000) {
          await sock.sendMessage(chatId, {
            document: Buffer.from(encrypted, 'utf-8'),
            fileName: 'obfuscated.js',
            mimetype: 'application/javascript',
            caption: `*${botName} ENCRYPT*\nObfuscated (${encrypted.length} chars)`
          }, { quoted: fake });
        } else {
          await sock.sendMessage(chatId, { text: encrypted }, { quoted: fake });
        }
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${err.message}\n│ Make sure it is valid JavaScript.\n│\n└─────────────────┘`
        }, { quoted: fake });
      }
    }
  },

  // ============================
  // SETTIMEZONE
  // ============================
  {
    name: 'settimezone',
    aliases: ['stz', 'timezone'],
    category: 'owner',
    description: 'Set bot timezone',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      if (!args[0]) {
        const cur = getSetting('timezone', 'Africa/Nairobi');
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Current: ${cur}\n│ Example: .settimezone Africa/Lagos\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      updateSetting('timezone', args[0]);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Timezone: ${args[0]}\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // VIEWONCE
  // ============================
  {
    name: 'vv',
    aliases: ['viewonce'],
    category: 'utility',
    description: 'Reveal view-once message and send to your private chat silently',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const viewOnce = extractViewOnce(message);
      if (!viewOnce) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Reply to a view-once message!\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      try {
        const dl = await downloadViewOnce(viewOnce);
        if (!dl) return;
        const { buffer, mediaType, meta } = dl;
        const sendObj = mediaType === 'imageMessage'
          ? { image: buffer }
          : mediaType === 'videoMessage'
            ? { video: buffer, mimetype: 'video/mp4' }
            : { audio: buffer, mimetype: 'audio/mpeg', ptt: meta?.ptt || false };

        const ownerNum = getSetting('ownerNumber', '');
        const privateJid = ownerNum ? `${ownerNum.replace(/[^0-9]/g, '')}@s.whatsapp.net` : senderId;
        // Send silently to private — no announcement in the group
        await sock.sendMessage(privateJid, sendObj);
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  {
    name: 'vv2',
    aliases: ['viewonce2', 'rv'],
    category: 'utility',
    description: 'Reveal view-once message in current chat',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const viewOnce = extractViewOnce(message);
      if (!viewOnce) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Reply to a view-once message!\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      try {
        const dl = await downloadViewOnce(viewOnce);
        if (!dl) return;
        const { buffer, mediaType, meta } = dl;
        const sendObj = mediaType === 'imageMessage'
          ? { image: buffer }
          : mediaType === 'videoMessage'
            ? { video: buffer, mimetype: 'video/mp4' }
            : { audio: buffer, mimetype: 'audio/mpeg', ptt: meta?.ptt || false };

        await sock.sendMessage(chatId, { ...sendObj, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  }
];

// Export helpers for use by main.js emoji reaction trigger
module.exports.extractViewOnce = extractViewOnce;
module.exports.downloadViewOnce = downloadViewOnce;
