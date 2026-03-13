const { getSetting } = require('./database');

const CHANNEL_NEWSLETTER_JID = '@newsletter';

const channelInfo = {
  contextInfo: {
    forwardingScore: 999,
    isForwarded: false,
    forwardedNewsletterMessageInfo: {
      newsletterJid: CHANNEL_NEWSLETTER_JID,
      newsletterName: 'ADEVOS-X BOT',
      serverMessageId: -1,
    }
  }
};

function getBotName() {
  return global.botName || getSetting('botName', 'ADEVOS-X BOT');
}

function getOwnerName() {
  return global.botOwner || getSetting('botOwner', 'DAVEX');
}

function getMenuImage() {
  return getSetting('menuimage', '');
}

function createFakeContact(msgOrId) {
  const botName = getBotName();
  let participantId;
  if (msgOrId && typeof msgOrId === 'object' && msgOrId.key) {
    participantId = msgOrId.key.participant || msgOrId.key.remoteJid || '0';
  } else {
    participantId = msgOrId;
  }
  const cleanId = String(participantId || '0').split(':')[0].split('@')[0] || '0';
  return {
    key: {
      participants: '0@s.whatsapp.net',
      remoteJid: '0@s.whatsapp.net',
      fromMe: false,
      id: 'DAVEX' + Math.random().toString(36).substring(2, 12).toUpperCase()
    },
    message: {
      contactMessage: {
        displayName: botName,
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:ULTRA;DAVEX;;;\nFN:${botName}\nitem1.TEL;waid=${cleanId}:${cleanId}\nitem1.X-ABLabel:Phone\nEND:VCARD`
      }
    },
    participant: '0@s.whatsapp.net'
  };
}

function buildReplyBox(title, lines = []) {
  let out = `┌─ *${title}* ─┐\n│\n`;
  for (const line of lines) out += `│ ${line}\n`;
  out += `│\n└─────────────────┘`;
  return out;
}

async function sendWithContact(sock, chatId, text, message) {
  const senderId = message?.key?.participant || message?.key?.remoteJid || '0';
  const fake = createFakeContact(senderId);
  return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
}

module.exports = {
  channelInfo,
  getBotName,
  getOwnerName,
  getMenuImage,
  createFakeContact,
  buildReplyBox,
  sendWithContact,
};
