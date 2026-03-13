const settings = require('../settings.js');
const isAdmin = require('./isAdmin');
const { getSetting, applyFontStyle } = require('./database');
const { channelInfo, createFakeContact, getBotName } = require('./messageConfig');

function buildContext(sock, message, extra = {}) {
  const chatId = message.key.remoteJid;

  const sender = message.key.fromMe
    ? sock.user.id
    : (message.key.participant || message.key.remoteJid);

  let cleanSender = sender;
  if (sender && sender.includes(':')) {
    cleanSender = sender.split(':')[0] + '@s.whatsapp.net';
  }

  const isGroup = chatId ? chatId.endsWith('@g.us') : false;
  const isChannel = chatId ? chatId.endsWith('@newsletter') : false;
  const isPrivate = !isGroup && !isChannel;

  let senderNumber = cleanSender
    ? cleanSender.replace('@s.whatsapp.net', '').replace('@lid', '')
    : '';

  const { isSudo } = require('./database');
  const senderIsSudo = !!(
    message.key.fromMe ||
    senderNumber === settings.ownerNumber ||
    isSudo(cleanSender)
  );

  const rawText = (
    message.message?.conversation ||
    message.message?.extendedTextMessage?.text ||
    message.message?.imageMessage?.caption ||
    message.message?.videoMessage?.caption ||
    message.message?.documentMessage?.caption ||
    ''
  ).trim();

  const userMessage = rawText.toLowerCase().trim();
  const messageId = message.key.id;
  const timestamp = message.messageTimestamp;
  const isFromOwner = message.key.fromMe;

  const messageType = Object.keys(message.message || {})[0] || '';
  const hasMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(messageType);
  const hasQuotedMessage = !!(message.message?.extendedTextMessage?.contextInfo?.quotedMessage);

  let isSenderAdmin = false;
  let isBotAdmin = false;
  if ((isGroup || isChannel) && extra.isAdminCheck) {
    const adminStatus = extra.adminStatus || {};
    isSenderAdmin = adminStatus.isSenderAdmin || false;
    isBotAdmin = adminStatus.isBotAdmin || false;
  }

  const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const isBotMentioned = mentions.includes(sock.user?.id);

  const senderId = cleanSender;

  const fake = createFakeContact(senderId);

  const reply = async (content, options = {}) => {
    try {
      const quotedMessage = options.quoted !== undefined ? options.quoted : fake;
      delete options.quoted;

      let messageOptions = { ...channelInfo };

      if (typeof content === 'string') {
        messageOptions.text = applyFontStyle(content);
      } else if (typeof content === 'object' && content !== null) {
        Object.assign(messageOptions, content);
        if (content.text && typeof content.text === 'string') {
          messageOptions.text = applyFontStyle(content.text);
        }
        if (content.caption && typeof content.caption === 'string') {
          messageOptions.caption = applyFontStyle(content.caption);
        }
      }

      Object.assign(messageOptions, options);

      return await sock.sendMessage(chatId, messageOptions, { quoted: quotedMessage });
    } catch (error) {
      console.error('Error in reply:', error.message);
      if (typeof content === 'string') {
        return await sock.sendMessage(chatId, { text: content }, { quoted: fake });
      }
    }
  };

  const replyPlain = async (content, options = {}) => {
    try {
      const quotedMessage = options.quoted !== undefined ? options.quoted : fake;
      delete options.quoted;

      let messageOptions = {};
      if (typeof content === 'string') {
        messageOptions.text = content;
      } else if (typeof content === 'object') {
        Object.assign(messageOptions, content);
      }
      Object.assign(messageOptions, options);
      return await sock.sendMessage(chatId, messageOptions, { quoted: quotedMessage });
    } catch (error) {
      console.error('Error in replyPlain:', error.message);
    }
  };

  const react = async (emoji) => {
    try {
      return await sock.sendMessage(chatId, {
        react: { text: emoji, key: message.key }
      });
    } catch (e) {}
  };

  return {
    chatId,
    sender,
    cleanSender,
    senderId,
    senderNumber,
    isGroup,
    isChannel,
    isPrivate,
    senderIsSudo,
    rawText,
    userMessage,
    messageId,
    timestamp,
    isFromOwner,
    messageType,
    hasMedia,
    hasQuotedMessage,
    isSenderAdmin,
    isBotAdmin,
    mentions,
    isBotMentioned,
    reply,
    replyPlain,
    react,
    channelInfo,
    fake,
  };
}

module.exports = buildContext;
