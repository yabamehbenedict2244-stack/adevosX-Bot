'use strict';

const crypto = require('crypto');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function getBotName() { return global.botName || 'ADEVOS-X BOT'; }
function getPrefix() { return global.prefix || '.'; }

function getHelpText(botName) {
  return `┌─ *${botName} TOSGROUP* ─┐
│
│ Send content to group status
│
│ Usage:
│ .tosgroup <text>
│ .tosgroup (reply to image/video/sticker)
│
│ Aliases: togroupstatus, groupstatus
│
└─────────────────┘`;
}

async function downloadBuffer(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  let buf = Buffer.from([]);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

async function buildPayload(quotedMessage, captionText) {
  if (!quotedMessage) return captionText ? { text: captionText } : null;

  if (quotedMessage.imageMessage) {
    const buf = await downloadBuffer(quotedMessage.imageMessage, 'image');
    return { image: buf, caption: captionText || quotedMessage.imageMessage.caption || '' };
  }
  if (quotedMessage.videoMessage) {
    const buf = await downloadBuffer(quotedMessage.videoMessage, 'video');
    return { video: buf, caption: captionText || quotedMessage.videoMessage.caption || '' };
  }
  if (quotedMessage.audioMessage) {
    const buf = await downloadBuffer(quotedMessage.audioMessage, 'audio');
    return { audio: buf, mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg' };
  }
  if (quotedMessage.stickerMessage) {
    const buf = await downloadBuffer(quotedMessage.stickerMessage, 'sticker');
    return { sticker: buf };
  }

  const textContent = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text;
  const finalText = captionText || textContent || '';
  return finalText ? { text: finalText } : null;
}

async function sendGroupStatus(sock, jid, content) {
  const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
  const inside = await generateWAMessageContent(content, { upload: sock.waUploadToServer });
  const messageSecret = crypto.randomBytes(32);
  const m = generateWAMessageFromContent(jid, {
    messageContextInfo: { messageSecret },
    groupStatusMessageV2: { message: { ...inside, messageContextInfo: { messageSecret } } }
  }, {});
  await sock.relayMessage(jid, m.message, { messageId: m.key.id });
  return m;
}

async function tosGroupCommand(sock, chatId, message) {
  const senderId = message.key.participant || message.key.remoteJid;
  const fake = { key: { remoteJid: senderId || '0@s.whatsapp.net', fromMe: false, id: 'TOSGROUP_' + Date.now() }, message: { conversation: '' } };
  const botName = getBotName();
  const prefix = getPrefix();

  if (!chatId.endsWith('@g.us')) {
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ ✦ This command only works in groups!\n│\n└─────────────┘` }, { quoted: fake });
  }

  let isAdmin = false;
  try {
    const meta = await sock.groupMetadata(chatId);
    const p = meta.participants.find(p => p.id === senderId || p.id?.split(':')[0] === senderId?.split(':')[0]);
    isAdmin = !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
  } catch {}

  if (!isAdmin && !message.key.fromMe) {
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ ✦ Only admins can use this!\n│\n└─────────────┘` }, { quoted: fake });
  }

  const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
  const textAfterCommand = rawText.replace(/^[.!#/]?(tosgroup|togroupstatus|groupstatus)\s*/i, '').trim();
  const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

  if (!quotedMessage && !textAfterCommand) {
    return sock.sendMessage(chatId, { text: getHelpText(botName) }, { quoted: fake });
  }

  try {
    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
    const payload = await buildPayload(quotedMessage, textAfterCommand);
    if (!payload) {
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ ✦ Could not build status content.\n│\n└─────────────┘` }, { quoted: fake });
    }
    await sendGroupStatus(sock, chatId, payload);
    await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    await sock.sendMessage(chatId, {
      text: `┌─ *${botName} TOSGROUP* ─┐\n│\n│ ✦ Status broadcasted!\n│\n└─────────────────┘`
    }, { quoted: fake });
  } catch (err) {
    console.error('[TOSGROUP] Error:', err.message);
    await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ ✦ Failed: ${err.message}\n│\n└─────────────┘` }, { quoted: fake });
  }
}

module.exports = [
  {
    name: 'tosgroup',
    aliases: ['togroupstatus', 'groupstatus'],
    category: 'group',
    description: 'Send text/media to group status',
    usage: '.tosgroup <text or reply to media>',
    execute: async (sock, message, args, context) => {
      return tosGroupCommand(sock, context.chatId, message);
    }
  }
];
