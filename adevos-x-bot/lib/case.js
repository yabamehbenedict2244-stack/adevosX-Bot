const { getSetting, updateSetting, getChatData, updateChatData, getCommandData } = require('./database');
const { channelInfo, getBotName, createFakeContact } = require('./messageConfig');
const isAdmin = require('./isAdmin');
const fs = require('fs');
const path = require('path');

const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp/antidelete');

// ============================
// AUTOLINK HANDLER
// ============================
const handleAntilink = async (sock, message, context) => {
  try {
    const { chatId, userMessage, isGroup, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
    if (!isGroup) return;

    const antilinkEnabled = getChatData(chatId, 'antilink', false);
    if (!antilinkEnabled) return;

    const settings = getCommandData('antilink', chatId, {
      action: 'delete',
      customMessage: 'Link detected and deleted!',
      allowedLinks: []
    });

    if (isSenderAdmin || senderIsSudo) return;
    if (!isBotAdmin) return;

    const urlRegex = /(?:https?:\/\/|ftp:\/\/)[^\s<>"{}|\\^\x60\[\]]+|(?:www\.|(?:discord\.gg|t\.me|telegram\.me|bit\.ly|goo\.gl|tinyurl\.com|ow\.ly|rb\.gy|cutt\.ly|short\.io|lnkd\.in|buff\.ly|youtu\.be|youtube\.com|fb\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|chat\.whatsapp\.com|whatsapp\.com|wa\.me|linktr\.ee|vm\.tiktok\.com|pastebin\.com|github\.com|gitlab\.com|t\.co|snap\.com)\/)[^\s<>"{}|\\^\x60\[\]]+/gi;

    if (!urlRegex.test(String(userMessage || ''))) return;

    const allowed = (settings.allowedLinks || []).some(a =>
      userMessage.toLowerCase().includes(a.toLowerCase())
    );
    if (allowed) return;

    await sock.sendMessage(chatId, { delete: message.key });
    const botName = getBotName();
    const fake = createFakeContact(context.senderId);
    await sock.sendMessage(chatId, {
      text: `┌─ *${botName}* ─┐\n│\n│ Link deleted.\n│\n└───────────────┘`,
      mentions: [context.sender]
    }, { quoted: fake });
  } catch (error) {
    console.error('AntiLink error:', error.message);
  }
};

// ============================
// AUTOEMOJI HANDLER
// ============================
const handleAutoEmoji = async (sock, message, context) => {
  try {
    const autoemojiMode = getSetting('autoemoji', 'off');
    if (autoemojiMode === 'off') return;

    const { chatId, isGroup, isFromOwner, senderIsSudo } = context;
    if (isFromOwner || senderIsSudo) return;
    if (autoemojiMode === 'dm' && isGroup) return;
    if (autoemojiMode === 'group' && !isGroup) return;

    let emojis = getSetting('autoemojiList', []);
    if (!Array.isArray(emojis) || emojis.length === 0) {
      emojis = ['🔥', '❤', '💯', '🤖', '✨', '🙏'];
    }

    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    await sock.sendMessage(chatId, {
      react: { text: emoji, key: message.key }
    });
  } catch (error) {
    console.error('AutoEmoji error:', error.message);
  }
};

// ============================
// WELCOME / GOODBYE HANDLERS (Dave X style with externalAdReply)
// ============================
const handleWelcome = async (sock, chatId, participants, action) => {
  try {
    const { isWelcomeEnabled, getWelcome, isGoodbyeEnabled, getGoodbye } = require('./database');
    const botName = getBotName();

    let groupName = 'the group';
    let groupPhoto = null;
    let memberCount = 0;

    try {
      const meta = await sock.groupMetadata(chatId);
      groupName = meta.subject || 'the group';
      memberCount = meta.participants?.length || 0;
    } catch {}

    try { groupPhoto = await sock.profilePictureUrl(chatId, 'image'); } catch {}

    for (let participant of participants) {
      if (typeof participant !== 'string') participant = participant?.id || participant?.jid || String(participant);

      // Skip LID JIDs — they can't be properly mentioned or resolved here
      if (participant.endsWith('@lid')) continue;

      const pNum = participant.split('@')[0].split(':')[0];
      const phoneJid = `${pNum}@s.whatsapp.net`;

      let avatarUrl = groupPhoto;
      try { avatarUrl = await sock.profilePictureUrl(phoneJid, 'image') || groupPhoto; } catch {}

      if (action === 'add') {
        if (!isWelcomeEnabled(chatId)) continue;
        const welcomeData = getWelcome(chatId);
        let welcomeMsg = welcomeData?.message;
        if (welcomeMsg) {
          // Support both {user} and @user as placeholders
          welcomeMsg = welcomeMsg
            .replace(/@user/g, `@${pNum}`)
            .replace(/{user}/g, `@${pNum}`)
            .replace(/{group}/g, groupName)
            .replace(/{members}/g, String(memberCount))
            .replace(/{bot}/g, botName);
        } else {
          welcomeMsg = `╔══════════════════╗\n║   🎉 *WELCOME*   ║\n╚══════════════════╝\n\n👤 @${pNum}\n🏠 *${groupName}*\n👥 Members: ${memberCount}\n\n🤖 _Powered by ${botName}_`;
        }
        await sock.sendMessage(chatId, {
          text: welcomeMsg,
          mentions: [phoneJid],
          contextInfo: {
            externalAdReply: {
              title: `Welcome to ${groupName}!`,
              body: `${memberCount} members`,
              thumbnailUrl: avatarUrl || 'https://i.ibb.co/Z2Fyf4t/default-avatar.png',
              sourceUrl: 'https://whatsapp.com',
              mediaType: 1,
              renderLargerThumbnail: true
            }
          }
        });
      } else if (action === 'remove') {
        if (!isGoodbyeEnabled(chatId)) continue;
        let byeMsg = getGoodbye(chatId);
        if (byeMsg) {
          byeMsg = byeMsg
            .replace(/@user/g, `@${pNum}`)
            .replace(/{user}/g, `@${pNum}`)
            .replace(/{group}/g, groupName)
            .replace(/{members}/g, String(memberCount));
        } else {
          byeMsg = `╔══════════════════╗\n║   👋 *GOODBYE*   ║\n╚══════════════════╝\n\n👤 @${pNum} has left.\n🏠 *${groupName}*\n👥 Members: ${memberCount}\n\n🤖 _Powered by ${botName}_`;
        }
        await sock.sendMessage(chatId, {
          text: byeMsg,
          mentions: [phoneJid],
          contextInfo: {
            externalAdReply: {
              title: `${pNum} left the group`,
              body: `${memberCount} members remaining`,
              thumbnailUrl: groupPhoto || 'https://i.ibb.co/Z2Fyf4t/default-avatar.png',
              sourceUrl: 'https://whatsapp.com',
              mediaType: 1,
              renderLargerThumbnail: false
            }
          }
        });
      }
    }
  } catch (error) {
    console.error('Welcome/Goodbye error:', error.message);
  }
};

// ============================
// AUTOREACT HANDLER
// ============================
const handleAutoReact = async (sock, message, context) => {
  try {
    const mode = getSetting('autoreact', 'off');
    if (mode === 'off') return;
    const { chatId, isGroup, isFromOwner } = context;
    if (isFromOwner) return;
    if (mode === 'dm' && isGroup) return;
    if (mode === 'group' && !isGroup) return;

    const emojis = getSetting('reactionEmojis', ['✅', '❤', '👍', '🔥', '💯', '🌟']);
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    await sock.sendMessage(chatId, { react: { text: emoji, key: message.key } });
  } catch (error) {}
};

// ============================
// ALWAYSONLINE HANDLER
// ============================
const handleAlwaysOnline = async (sock) => {
  try {
    const enabled = getSetting('alwaysonline', false);
    if (enabled) {
      await sock.sendPresenceUpdate('available');
    }
  } catch (error) {}
};

// ============================
// AUTOREAD HANDLER
// ============================
const handleAutoRead = async (sock, message, context) => {
  try {
    const enabled = getSetting('autoread', false);
    if (!enabled) return;
    const { chatId } = context;
    await sock.readMessages([message.key]);
  } catch (error) {}
};

// ============================
// CHATBOT HANDLER (uses lib/chatbot.js)
// Modes stored in DB:
//   Per-group:  getChatData(chatId, 'chatbot', false)  → true/false
//   Global DM:  getSetting('chatbotpm', false)          → true/false
// Group chatbot replies to ALL messages when enabled (no @mention required).
// ============================
const handleChatbot = async (sock, message, context) => {
  try {
    const { chatId, isGroup, isPrivate, senderIsSudo, senderId } = context;
    if (senderIsSudo) return;

    // Determine if chatbot is enabled for this chat
    let chatbotEnabled = false;
    if (isGroup) {
      const raw = getChatData(chatId, 'chatbot', false);
      // Handle both boolean true and string 'true'
      chatbotEnabled = raw === true || raw === 'true' || raw === 1;
    } else if (isPrivate) {
      const raw = getSetting('chatbotpm', false);
      chatbotEnabled = raw === true || raw === 'true' || raw === 1;
    }
    if (!chatbotEnabled) return;

    const rawText = context.rawText;
    if (!rawText || rawText.trim().length < 1) return;

    // Don't respond to bot commands (messages starting with the prefix)
    const prefix = getSetting('prefix', '.');
    if (rawText.startsWith(prefix)) return;

    // Strip any @mentions from the text before sending to AI
    const cleanText = rawText.replace(/@\d+/g, '').trim();
    if (!cleanText) return;

    // Show typing indicator while AI responds
    await sock.presenceSubscribe(chatId).catch(() => {});
    await sock.sendPresenceUpdate('composing', chatId).catch(() => {});

    const chatbot = require('./chatbot');
    const response = await chatbot.getReply(cleanText);

    await sock.sendPresenceUpdate('paused', chatId).catch(() => {});

    if (!response) return;

    const fake = createFakeContact(senderId);
    await sock.sendMessage(chatId, { text: response }, { quoted: fake });
  } catch (error) {}
};

// ============================
// ANTIBADWORD HANDLER
// ============================
const DEFAULT_BAD_WORDS = [
  'fuck', 'shit', 'damn', 'bitch', 'asshole', 'bastard', 'dick', 'cock',
  'pussy', 'slut', 'whore', 'cunt', 'nigga', 'motherfucker', 'prick',
  'wanker', 'gandu', 'madarchod', 'bhosdike', 'bsdk', 'fucker', 'bhosda',
  'lauda', 'laude', 'betichod', 'chutiya', 'behenchod', 'randi', 'idiot',
  'chut', 'harami', 'kameena', 'haramzada',
];

const handleAntibadword = async (sock, message, context) => {
  try {
    const { chatId, isGroup, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
    if (!isGroup) return;

    const cfg = getChatData(chatId, 'antibadword', { enabled: false, action: 'delete', maxWarnings: 3, words: [] });
    if (!cfg.enabled) return;
    if (isSenderAdmin || senderIsSudo) return;
    if (!isBotAdmin) return;

    const msg = message.message;
    const text = (
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.imageMessage?.caption ||
      msg?.videoMessage?.caption ||
      msg?.documentMessage?.caption || ''
    ).toLowerCase();

    if (!text) return;

    const allWords = [...new Set([...DEFAULT_BAD_WORDS, ...(cfg.words || [])])];
    const found = allWords.find(w => text.includes(w.toLowerCase()));
    if (!found) return;

    const sender = message.key.participant || message.key.remoteJid;
    const senderNum = (sender || '').split('@')[0];
    const botName = getBotName();
    const fake = createFakeContact(sender);
    const action = cfg.action || 'delete';

    await sock.sendMessage(chatId, { delete: message.key }).catch(() => {});

    if (action === 'kick') {
      await sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch(() => {});
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ @${senderNum} kicked\n│ for bad word!\n│\n└─────────────┘`,
        mentions: [sender]
      }, { quoted: fake });
    } else if (action === 'warn') {
      const warnKey = 'bwarn_' + sender.split('@')[0];
      const count = (getChatData(chatId, warnKey, 0) || 0) + 1;
      const max = cfg.maxWarnings || 3;
      updateChatData(chatId, warnKey, count);

      if (count >= max) {
        updateChatData(chatId, warnKey, 0);
        await sock.groupParticipantsUpdate(chatId, [sender], 'remove').catch(() => {});
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ @${senderNum} kicked!\n│ Max warnings (${max}) reached\n│\n└─────────────┘`,
          mentions: [sender]
        }, { quoted: fake });
      } else {
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Warning ${count}/${max}\n│ @${senderNum}\n│ No bad words!\n│\n└─────────────┘`,
          mentions: [sender]
        }, { quoted: fake });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ Message deleted\n│ @${senderNum}\n│ No bad words!\n│\n└─────────────┘`,
        mentions: [sender]
      }, { quoted: fake });
    }
  } catch (err) {
    console.error('AntiBadword error:', err.message);
  }
};

module.exports = {
  handleAntilink,
  handleAutoEmoji,
  handleWelcome,
  handleAutoReact,
  handleAlwaysOnline,
  handleAutoRead,
  handleChatbot,
  handleAntibadword,
};
