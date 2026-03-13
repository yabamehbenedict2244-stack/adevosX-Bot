const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, getOwnerName, createFakeContact, channelInfo } = require('../lib/messageConfig');
const {
  getSetting, updateSetting,
  addSudo, removeSudo, getSudo,
  isSudo, loadDatabase, saveDatabase,
  getChatData, updateChatData
} = require('../lib/database');
const { addBan, removeBan, isBanned } = require('../lib/isBanned');
const { formatDuration } = require('../lib/myfunc');
const { autoStatusCommand } = require('../lib/autostatus');
const { autotypingCommand } = require('../lib/autotyping');
const { autorecordingCommand } = require('../lib/autorecording');

// ============================================================
// ANTIDELETE — merged from ANTIDELETE.js
// ============================================================
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp/antidelete');
const MESSAGE_STORE = new Map();
const MAX_PER_CHAT = 100;

function _ensureTempDir() {
  if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

function _getEffectiveConfig(chatId) {
  if (chatId && chatId.endsWith('@g.us')) {
    const groupVal = getChatData(chatId, 'antidelete', null);
    if (groupVal !== null) return { enabled: !!groupVal, mode: groupVal === true ? 'group' : 'off' };
    const ownerVal = getSetting('antidelete', 'off');
    if (ownerVal === 'off' || ownerVal === false) return { enabled: false };
    return { enabled: true, mode: ownerVal || 'group' };
  } else {
    const val = getSetting('antidelete', 'off');
    if (val === 'off' || val === false) return { enabled: false };
    return { enabled: true, mode: val || 'private' };
  }
}

function storeMessage(chatId, message) {
  if (!chatId || !message?.key?.id) return;
  if (chatId === 'status@broadcast') return;
  const msg = message.message;
  if (!msg) return;
  if (msg.protocolMessage || msg.senderKeyDistributionMessage) return;

  _ensureTempDir();
  if (!MESSAGE_STORE.has(chatId)) MESSAGE_STORE.set(chatId, new Map());
  const chat = MESSAGE_STORE.get(chatId);

  const sender = message.key.participant || message.key.remoteJid;
  const pushName = message.pushName || (sender || '').split('@')[0] || 'Unknown';

  let content = '';
  let mediaType = null;
  if (msg.conversation) content = msg.conversation;
  else if (msg.extendedTextMessage?.text) content = msg.extendedTextMessage.text;
  else if (msg.imageMessage) { mediaType = 'image'; content = msg.imageMessage.caption || ''; }
  else if (msg.videoMessage) { mediaType = 'video'; content = msg.videoMessage.caption || ''; }
  else if (msg.stickerMessage) mediaType = 'sticker';
  else if (msg.audioMessage) mediaType = 'audio';
  else if (msg.documentMessage) { mediaType = 'document'; content = msg.documentMessage.fileName || 'Document'; }

  chat.set(message.key.id, { message, sender, pushName, content, mediaType, chatId, timestamp: Date.now() });

  if (chat.size > MAX_PER_CHAT) {
    const oldest = [...chat.keys()].slice(0, chat.size - MAX_PER_CHAT);
    for (const k of oldest) chat.delete(k);
  }
}

async function handleMessageRevocation(sock, revokeMessage) {
  try {
    const chatId = revokeMessage.key?.remoteJid;
    if (!chatId) return;
    const config = _getEffectiveConfig(chatId);
    if (!config.enabled) return;

    const messageId = revokeMessage.message?.protocolMessage?.key?.id;
    if (!messageId) return;

    const deletedBy = revokeMessage.key?.participant || revokeMessage.key?.remoteJid || '';
    const botNum = (sock.user.id || '').split(':')[0];
    if (deletedBy.includes(botNum)) return;

    const chatStore = MESSAGE_STORE.get(chatId);
    if (!chatStore) return;
    const stored = chatStore.get(messageId);
    if (!stored) return;

    await _sendDeletionNotification(sock, stored, deletedBy, chatId, config);
    chatStore.delete(messageId);
  } catch (err) {
    console.error('[AntiDelete] Revocation error:', err.message);
  }
}

async function handleMessagesDelete(sock, event) {
  try {
    const keys = event?.keys || [];
    for (const key of keys) {
      const chatId = key.remoteJid;
      if (!chatId) continue;
      const config = _getEffectiveConfig(chatId);
      if (!config.enabled) continue;
      const chatStore = MESSAGE_STORE.get(chatId);
      if (!chatStore) continue;
      const stored = chatStore.get(key.id);
      if (!stored) continue;
      await _sendDeletionNotification(sock, stored, key.participant || chatId, chatId, config);
      chatStore.delete(key.id);
    }
  } catch (err) {
    console.error('[AntiDelete] messages.delete error:', err.message);
  }
}

async function _sendDeletionNotification(sock, stored, deletedBy, chatId, config) {
  try {
    const botName = getBotName();
    const { message, sender, pushName, content, mediaType, timestamp } = stored;
    const senderNum = (sender || '').split('@')[0];
    const deleterNum = (deletedBy || '').split('@')[0];
    const fake = createFakeContact(sender || deletedBy);

    let groupName = '';
    if (chatId.endsWith('@g.us')) {
      try { const meta = await sock.groupMetadata(chatId); groupName = meta.subject || ''; } catch {}
    }

    const time = new Date(timestamp).toLocaleString('en-US', {
      hour12: true, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });

    let text = `┌─ *${botName}* ─┐\n│\n│ MESSAGE DELETED\n│\n│ Deleted by: @${deleterNum}\n│ Sender: @${senderNum}\n│ Name: ${pushName}\n│ Time: ${time}`;
    if (groupName) text += `\n│ Group: ${groupName}`;
    if (content) text += `\n│\n│ *DELETED MESSAGE:*\n│ ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`;
    text += `\n│\n└─────────────┘`;

    const target = config.mode === 'private'
      ? (sock.user.id.split(':')[0] + '@s.whatsapp.net')
      : chatId;

    await sock.sendMessage(target, {
      text,
      mentions: [sender, deletedBy].filter(Boolean),
      ...channelInfo
    }, { quoted: fake });

    if (mediaType && message.message) {
      await _sendMediaBack(sock, message, mediaType, target, fake, botName, senderNum);
    }
  } catch (err) {
    console.error('[AntiDelete] Notification error:', err.message);
  }
}

async function _sendMediaBack(sock, message, mediaType, target, fake, botName, senderNum) {
  try {
    const msg = message.message;
    const typeMap = { image: 'imageMessage', video: 'videoMessage', audio: 'audioMessage', sticker: 'stickerMessage', document: 'documentMessage' };
    const msgKey = typeMap[mediaType];
    if (!msgKey || !msg[msgKey]) return;

    const dlType = mediaType === 'document' ? 'document' : mediaType === 'sticker' ? 'sticker' : mediaType;
    const stream = await downloadContentFromMessage(msg[msgKey], dlType);
    let buf = Buffer.alloc(0);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);

    const caption = `┌─ *${botName}* ─┐\n│\n│ DELETED ${mediaType.toUpperCase()}\n│ From: @${senderNum}\n│\n└─────────────┘`;

    if (mediaType === 'image') await sock.sendMessage(target, { image: buf, caption }, { quoted: fake });
    else if (mediaType === 'video') await sock.sendMessage(target, { video: buf, caption, mimetype: 'video/mp4' }, { quoted: fake });
    else if (mediaType === 'audio') await sock.sendMessage(target, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: fake });
    else if (mediaType === 'sticker') await sock.sendMessage(target, { sticker: buf }, { quoted: fake });
    else if (mediaType === 'document') await sock.sendMessage(target, { document: buf, fileName: msg.documentMessage?.fileName || 'file', mimetype: msg.documentMessage?.mimetype || 'application/octet-stream', caption }, { quoted: fake });
  } catch (err) {
    console.error('[AntiDelete] Media resend error:', err.message);
  }
}

module.exports = [
  // ============================
  // SETBOTNAME
  // ============================
  {
    name: 'setbotname',
    aliases: ['botname'],
    category: 'owner',
    description: 'Change the bot name',
    usage: '.setbotname <name>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const fake = createFakeContact(senderId);
      const botName = getBotName();

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const newName = args.join(' ').trim();
      if (!newName) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a name!\n│ .setbotname <name>\n│\n└─────────────────┘` }, { quoted: fake });

      updateSetting('botName', newName);
      global.botName = newName;
      await sock.sendMessage(chatId, { text: `┌─ *${newName}* ─┐\n│\n│ Bot name changed to:\n│ ${newName}\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // SETOWNERNAME
  // ============================
  {
    name: 'setownername',
    aliases: ['ownername'],
    category: 'owner',
    description: 'Change the owner name',
    usage: '.setownername <name>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const newName = args.join(' ').trim();
      if (!newName) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a name!\n│ .setownername <name>\n│\n└─────────────────┘` }, { quoted: fake });

      updateSetting('botOwner', newName);
      global.botOwner = newName;
      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner name changed to:\n│ ${newName}\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // SETMENUIMAGE
  // ============================
  {
    name: 'setmenuimage',
    aliases: ['menuimage'],
    category: 'owner',
    description: 'Set the menu banner image URL',
    usage: '.setmenuimage <url>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const url = args[0]?.trim();
      const hasQuotedImage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

      if (!url && !hasQuotedImage) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide an image URL or reply to image!\n│ .setmenuimage <url>\n│\n└─────────────────┘` }, { quoted: fake });
      }

      const imageUrl = url || hasQuotedImage?.url || '';
      updateSetting('menuimage', imageUrl);
      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Menu image updated!\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // SETPREFIX
  // ============================
  {
    name: 'setprefix',
    category: 'owner',
    description: 'Change the bot prefix',
    usage: '.setprefix <prefix>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const newPrefix = args[0];
      if (!newPrefix || newPrefix.length > 3) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a valid prefix (1-3 chars)!\n│\n└─────────────────┘` }, { quoted: fake });

      updateSetting('prefix', newPrefix);
      global.prefix = newPrefix;
      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Prefix changed to: ${newPrefix}\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // MODE
  // ============================
  {
    name: 'mode',
    category: 'owner',
    description: 'Set bot mode (public/private)',
    usage: '.mode <public|private>',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const newMode = (args[0] || '').toLowerCase();
      if (!['public', 'private'].includes(newMode)) {
        const cur = getSetting('mode', 'public');
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Current mode: ${cur.toUpperCase()}\n│ Use: .mode public/private\n│\n└─────────────────┘` }, { quoted: fake });
      }

      updateSetting('mode', newMode);
      global.mode = newMode;
      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mode: ${newMode.toUpperCase()}\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // ADDSUDO
  // ============================
  {
    name: 'addsudo',
    aliases: ['sudo'],
    category: 'owner',
    description: 'Add a sudo user',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentions.length) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone!\n│\n└─────────────────┘` }, { quoted: fake });

      for (const m of mentions) addSudo(m);
      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Added sudo:\n│ ${mentions.map(m => `@${m.split('@')[0]}`).join(', ')}\n│\n└─────────────────┘`, mentions, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // REMOVESUDO
  // ============================
  {
    name: 'removesudo',
    aliases: ['unsudo'],
    category: 'owner',
    description: 'Remove a sudo user',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentions.length) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone!\n│\n└─────────────────┘` }, { quoted: fake });

      for (const m of mentions) removeSudo(m);
      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Removed sudo:\n│ ${mentions.map(m => `@${m.split('@')[0]}`).join(', ')}\n│\n└─────────────────┘`, mentions, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // BAN
  // ============================
  {
    name: 'ban',
    category: 'owner',
    description: 'Ban a user from using the bot',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentions.length) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone!\n│\n└─────────────────┘` }, { quoted: fake });

      for (const m of mentions) addBan(m);
      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Banned:\n│ ${mentions.map(m => `@${m.split('@')[0]}`).join(', ')}\n│\n└─────────────────┘`, mentions, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // UNBAN
  // ============================
  {
    name: 'unban',
    category: 'owner',
    description: 'Unban a user',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentions.length) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone!\n│\n└─────────────────┘` }, { quoted: fake });

      for (const m of mentions) removeBan(m);
      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Unbanned:\n│ ${mentions.map(m => `@${m.split('@')[0]}`).join(', ')}\n│\n└─────────────────┘`, mentions, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // RESTART
  // ============================
  {
    name: 'restart',
    category: 'owner',
    description: 'Restart the bot',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Restarting...\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
      setTimeout(() => process.exit(0), 1000);
    }
  },

  // ============================
  // STATUS
  // ============================
  {
    name: 'status',
    aliases: ['botstatus', 'ping'],
    category: 'owner',
    description: 'Show bot status',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const ownerName = getOwnerName();
      const fake = createFakeContact(senderId);

      const { loadDatabase } = require('../lib/database');
      const db = loadDatabase();
      const uptime = formatDuration(Date.now() - (db.stats?.startTime || Date.now()));
      const prefix = getSetting('prefix', '.');
      const mode = getSetting('mode', 'public');
      const cmds = global.commands?.size || 0;

      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ Owner: ${ownerName}\n│ Prefix: ${prefix}\n│ Mode: ${mode.toUpperCase()}\n│ Commands: ${cmds}\n│ Uptime: ${uptime}\n│ Version: 1.0.0\n│\n└─────────────────┘`,
        ...channelInfo
      }, { quoted: fake });
    }
  },

  // ============================
  // ALWAYSONLINE
  // ============================
  {
    name: 'alwaysonline',
    aliases: ['online'],
    category: 'owner',
    description: 'Toggle always-online presence',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const sub = (args[0] || '').toLowerCase();
      const current = getSetting('alwaysonline', false);

      if (!sub) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Always Online: ${current ? 'ON' : 'OFF'}\n│ Use: .alwaysonline on/off\n│\n└─────────────────┘` }, { quoted: fake });
      }

      if (sub === 'on') {
        updateSetting('alwaysonline', true);
        await sock.sendPresenceUpdate('available').catch(() => {});
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Always Online ENABLED\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
      }
      if (sub === 'off') {
        updateSetting('alwaysonline', false);
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Always Online DISABLED\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
      }
    }
  },

  // ============================
  // AUTOREAD
  // ============================
  {
    name: 'autoread',
    category: 'owner',
    description: 'Toggle auto-read messages',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

      const sub = (args[0] || '').toLowerCase();
      if (sub === 'on') { updateSetting('autoread', true); return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto-Read ENABLED\n│\n└─────────────────┘` }, { quoted: fake }); }
      if (sub === 'off') { updateSetting('autoread', false); return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto-Read DISABLED\n│\n└─────────────────┘` }, { quoted: fake }); }
      const cur = getSetting('autoread', false);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto-Read: ${cur ? 'ON' : 'OFF'}\n│\n└─────────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // AUTOSTATUS
  // ============================
  {
    name: 'autostatus',
    aliases: ['autoview', 'autoviewstatus'],
    category: 'owner',
    description: 'Auto view/react/reply to WhatsApp statuses',
    usage: '.autostatus [on|off|view|react|reply|reset]',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      await autoStatusCommand(sock, context.chatId, message, args);
    }
  },

  // ============================
  // ANTICALL
  // ============================
  {
    name: 'anticall',
    aliases: ['blockcall'],
    category: 'owner',
    description: 'Block/decline incoming calls',
    usage: '.anticall on/off/block/decline/both/status',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────┘` }, { quoted: fake });
      }

      const sub = (args[0] || '').toLowerCase();
      const cfg = getSetting('anticall', { enabled: false, mode: 'decline', message: 'Calls are not allowed!' });

      if (!sub || sub === 'status') {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Anti-Call: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n│ Mode: ${(cfg.mode || 'decline').toUpperCase()}\n│ Msg: ${cfg.message || 'Calls not allowed!'}\n│\n│ .anticall on/off\n│ .anticall block\n│ .anticall decline\n│ .anticall both\n│ .anticall msg <text>\n│\n└─────────────┘`
        }, { quoted: fake });
      }

      const updated = { ...cfg };
      let reply = '';

      if (sub === 'on') { updated.enabled = true; reply = `✅ Anti-Call ENABLED\nMode: ${updated.mode || 'decline'}`; }
      else if (sub === 'off') { updated.enabled = false; reply = `❌ Anti-Call DISABLED`; }
      else if (sub === 'block') { updated.enabled = true; updated.mode = 'block'; reply = `✅ Mode: BLOCK\nCallers will be blocked`; }
      else if (sub === 'decline') { updated.enabled = true; updated.mode = 'decline'; reply = `✅ Mode: DECLINE\nCalls will be declined`; }
      else if (sub === 'both') { updated.enabled = true; updated.mode = 'both'; reply = `✅ Mode: BOTH\nDeclined + blocked`; }
      else if (sub === 'msg' || sub === 'message') {
        const txt = args.slice(1).join(' ').trim();
        if (!txt) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a message!\n│\n└─────────────┘` }, { quoted: fake });
        updated.message = txt; reply = `✅ Call message set:\n"${txt}"`;
      }
      else { return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Unknown option\n│ Use: on/off/block/decline/both\n│\n└─────────────┘` }, { quoted: fake }); }

      updateSetting('anticall', updated);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ ${reply}\n│\n└─────────────┘` }, { quoted: fake });
    }
  }
  ,
  {
    name: 'autotyping',
    aliases: ['autotyoing', 'typing'],
    category: 'owner',
    description: 'Show typing indicator when receiving messages',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      await autotypingCommand(sock, message.key.remoteJid, message, args);
    }
  }
  ,
  {
    name: 'autorecording',
    aliases: ['autorecord', 'recording'],
    category: 'owner',
    description: 'Show recording indicator when receiving messages',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      await autorecordingCommand(sock, message.key.remoteJid, message, args);
    }
  },

  // ============================
  // ANTIDELETE
  // ============================
  {
    name: 'antidelete',
    aliases: ['antidel'],
    category: 'owner',
    description: 'Recover deleted messages',
    usage: '.antidelete on/off/group/private/status',
    ownerOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderIsSudo, senderId, isGroup } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();

      if (!senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────┘` }, { quoted: fake });
      }

      if (!sub || sub === 'status') {
        const cur = getSetting('antidelete', 'off');
        const status = (!cur || cur === 'off') ? 'DISABLED' : `ENABLED — ${String(cur).toUpperCase()}`;
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Delete: ${status}\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'on' || sub === 'private') {
        updateSetting('antidelete', 'private');
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Delete ✅ ON\n│ Mode: PRIVATE\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'group' || sub === 'gc') {
        updateSetting('antidelete', 'group');
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Delete ✅ ON\n│ Mode: GROUP\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'off') {
        updateSetting('antidelete', 'off');
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Delete ❌ OFF\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (isGroup && sub === 'enable') {
        updateChatData(chatId, 'antidelete', true);
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Delete ✅ ON\n│ For this group\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (isGroup && sub === 'disable') {
        updateChatData(chatId, 'antidelete', false);
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Delete ❌ OFF\n│ For this group\n│\n└─────────────┘` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Usage:\n│ .antidelete on\n│ .antidelete off\n│ .antidelete group\n│ .antidelete private\n│ .antidelete status\n│\n└─────────────┘` }, { quoted: fake });
    }
  }
];

module.exports.storeMessage = storeMessage;
module.exports.handleMessageRevocation = handleMessageRevocation;
module.exports.handleMessagesDelete = handleMessagesDelete;
