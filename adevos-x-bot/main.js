const chalk = require('chalk');
const path = require('path');
const { getSetting, getCommandData, updateSetting } = require('./lib/database');
const { channelInfo, getBotName, createFakeContact } = require('./lib/messageConfig');

const _glitch = (t) => chalk.hex('#00ffff').bold(t) + chalk.hex('#ff00ff')('_');

function _logMsg(label, entries) {
  console.log(chalk.bgHex('#0a0a0a').hex('#00ff00')(`┌───────────────── ${label} ─────────────────┐`));
  console.log(chalk.bgHex('#0a0a0a').hex('#ff00ff')(`   ⚡ ${_glitch(label === 'MESSAGE' ? 'INCOMING TRANSMISSION' : 'COMMAND EXECUTED')}`));
  console.log(chalk.bgHex('#0a0a0a').hex('#00ffff')('├─────────────────────────────────────────────┤'));
  for (const [icon, lbl, val] of entries) {
    console.log(
      chalk.bgHex('#0a0a0a').hex('#ffff00')(`   ${icon} `) +
      chalk.bgHex('#0a0a0a').hex('#00ff00')(`${lbl}:`) +
      chalk.bgHex('#0a0a0a').hex('#ffffff')(` ${val}`)
    );
  }
  console.log(chalk.bgHex('#0a0a0a').hex('#00ff00')('└─────────────────────────────────────────────┘\n'));
}
const { isBanned } = require('./lib/isBanned');
const isAdmin = require('./lib/isAdmin');
const buildContext = require('./lib/context');
const {
  handleAntilink,
  handleAutoEmoji,
  handleWelcome,
  handleAutoReact,
  handleAlwaysOnline,
  handleAutoRead,
  handleChatbot,
  handleAntibadword,
} = require('./lib/case');
const { handleAutotypingForMessage } = require('./lib/autotyping');
const { handleAutorecordingForMessage } = require('./lib/autorecording');

const _processedIds = new Set();
// Track banned users already notified this session (no repeated ban messages)
const _banNotifiedSet = new Set();

async function handleMessage(sock, { messages, type }) {
  console.log(chalk.magenta(`[DEBUG handleMessage] type=${type} count=${messages.length}`));

  // 'notify' = real new message; 'append' = store sync (history)
  // After reconnect, WhatsApp sometimes delivers truly NEW messages as 'append'.
  // Accept 'append' only if the messages are very recent (last 120 s) to
  // avoid replying to old history without dropping legitimate post-reconnect msgs.
  if (type !== 'notify') {
    if (type !== 'append') {
      console.log(chalk.gray(`[DEBUG handleMessage] skipped — type is '${type}'`));
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const hasRecent = messages.some(m => {
      const ts = m.messageTimestamp;
      const t = ts && typeof ts === 'object' ? (ts.low ?? ts.toNumber?.() ?? 0) : (ts || 0);
      return (now - t) < 120;
    });
    if (!hasRecent) {
      console.log(chalk.gray('[DEBUG handleMessage] skipped — append batch has no recent messages'));
      return;
    }
  }

  for (const message of messages) {
    try {
      if (!message.message) {
        console.log(chalk.gray('[DEBUG msg] skip — message.message is null/undefined (possibly protocol or failed decrypt)'));
        continue;
      }
      // For append-type batches, skip individual stale messages in the same batch
      if (type === 'append') {
        const ts = message.messageTimestamp;
        const t = ts && typeof ts === 'object' ? (ts.low ?? ts.toNumber?.() ?? 0) : (ts || 0);
        if ((Math.floor(Date.now() / 1000) - t) > 120) {
          console.log(chalk.gray('[DEBUG msg] skip — append message is stale'));
          continue;
        }
      }
      if (message.key?.id && _processedIds.has(message.key.id)) {
        console.log(chalk.gray('[DEBUG msg] skip — duplicate id'));
        continue;
      }
      if (message.key?.id) {
        _processedIds.add(message.key.id);
        setTimeout(() => _processedIds.delete(message.key.id), 60000);
      }

      const chatId = message.key?.remoteJid;
      if (!chatId) {
        console.log(chalk.gray('[DEBUG msg] skip — no chatId'));
        continue;
      }

      const isGroup = chatId.endsWith('@g.us');
      const isChannel = chatId.endsWith('@newsletter');
      const isFromMe = message.key.fromMe;

      const sender = isFromMe
        ? sock.user?.id
        : (message.key.participant || message.key.remoteJid);

      if (!sender) {
        console.log(chalk.gray('[DEBUG msg] skip — no sender (sock.user may not be set yet)'));
        continue;
      }

      // ── Ban check: silent treatment + one-time notification ──
      if (isBanned(sender)) {
        const banKey = sender.split('@')[0].split(':')[0];
        if (!_banNotifiedSet.has(banKey)) {
          _banNotifiedSet.add(banKey);
          const { createFakeContact } = require('./lib/messageConfig');
          const fake = createFakeContact(sender);
          await sock.sendMessage(chatId, {
            text: `You are *banned* from using this bot. Contact the owner to appeal.`
          }, { quoted: fake }).catch(() => {});
        }
        continue;
      }

      const mode = getSetting('mode', 'public');
      const { isSudo } = require('./lib/database');
      const senderIsSudo = isFromMe || isSudo(sender);

      if (mode === 'private' && !senderIsSudo && !isFromMe) {
        console.log(chalk.gray('[DEBUG msg] skip — private mode, sender not sudo'));
        continue;
      }

      // Build admin status for groups
      let adminStatus = { isSenderAdmin: false, isBotAdmin: false };
      if (isGroup) {
        try {
          adminStatus = await isAdmin(sock, chatId, sender);
        } catch (e) {}
      }

      const context = buildContext(sock, message, {
        isAdminCheck: true,
        adminStatus,
      });

      // Always-online presence
      handleAlwaysOnline(sock).catch(() => {});

      // Auto-read messages
      if (!isFromMe) {
        handleAutoRead(sock, message, context).catch(() => {});
      }

      // --- Anti-delete / anti-group-mention are handled as event listeners in index.js ---

      // Reactions are handled below — skip all auto-features for them
      const isReaction = !!message.message?.reactionMessage;

      // Run auto-features for non-bot, non-reaction messages
      if (!isFromMe && !isReaction) {
        handleAutoEmoji(sock, message, context).catch(() => {});
        handleAutotypingForMessage(sock, chatId).catch(() => {});
        handleAutorecordingForMessage(sock, chatId).catch(() => {});
        handleAutoReact(sock, message, context).catch(() => {});
        if (isGroup) {
          handleAntilink(sock, message, context).catch(() => {});
          handleAntibadword(sock, message, context).catch(() => {});
          const { handleAntiStatusMention } = require('./plugins/GROUP');
          handleAntiStatusMention(sock, message).catch(() => {});
        }
        handleChatbot(sock, message, context).catch(() => {});
      }

      // --- Command Routing ---
      const rawText = (
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        message.message?.documentMessage?.caption ||
        ''
      ).trim();

      // Log all incoming messages — Dave X glitch frame
      // Resolve real phone number: prefer @s.whatsapp.net JID, fall back to LID raw number
      const isLidJid = sender.endsWith('@lid');
      const rawSenderNum = sender.split('@')[0].split(':')[0];
      // If it's a LID JID, try to use the participant field from message which may have phone JID
      let senderNum = rawSenderNum;
      if (isLidJid) {
        const phoneFromParticipant = (message.key?.participant || '').split('@')[0];
        if (phoneFromParticipant && !message.key?.participant?.endsWith('@lid')) {
          senderNum = phoneFromParticipant;
        }
      }
      const pushName = message.pushName || (global.pushNameCache?.[rawSenderNum]) || senderNum;
      const mtype = Object.keys(message.message || {})[0] || 'unknown';
      const preview = rawText || `[${mtype.replace('Message', '')}]`;
      const chatLabel = isGroup ? `GROUP` : `DM`;

      _logMsg('MESSAGE', [
        ['🕐', 'TIME', new Date().toLocaleTimeString()],
        ['📡', 'CONTENT', preview.substring(0, 50) + (preview.length > 50 ? '...' : '')],
        ['👤', 'USER', pushName],
        ['🔢', 'NUMBER', `+${senderNum}`],
        ...(isGroup ? [['💬', 'CHAT', 'GROUP']] : [['💬', 'CHAT', 'PRIVATE']]),
        ['📱', 'TYPE', mtype.replace('Message', '')],
      ]);

      // Group anti-media handlers
      if (isGroup && !isFromMe) {
        const { handleImageDetection, handleStickerDetection, handleVideoDetection, handleAudioDetection, handleDocumentDetection } = require('./plugins/GROUP');
        if (mtype === 'imageMessage' && handleImageDetection) handleImageDetection(sock, chatId, message, sender).catch(() => {});
        else if (mtype === 'stickerMessage' && handleStickerDetection) handleStickerDetection(sock, chatId, message, sender).catch(() => {});
        else if (mtype === 'videoMessage' && handleVideoDetection) handleVideoDetection(sock, chatId, message, sender).catch(() => {});
        else if (mtype === 'audioMessage' && handleAudioDetection) handleAudioDetection(sock, chatId, message, sender).catch(() => {});
        else if (mtype === 'documentMessage' && handleDocumentDetection) handleDocumentDetection(sock, chatId, message, sender).catch(() => {});
      }

      // ── Emoji reaction → auto-steal view-once silently ──
      const VV_REACTION_EMOJIS = new Set(['😘', '😂', '😶‍🌫️', '😚', '♥️', '❤️', '✅', '🫦', '🥵', '👀']);
      const reactionMsg = message.message?.reactionMessage;
      if (reactionMsg && !isFromMe) {
        const reactEmoji = reactionMsg.text || '';
        if (VV_REACTION_EMOJIS.has(reactEmoji)) {
          const originalId = reactionMsg.key?.id;
          const originalChat = reactionMsg.key?.remoteJid || chatId;
          try {
            const originalMsg = await global.store?.loadMessage(originalChat, originalId);
            if (originalMsg?.message) {
              const origKeys = Object.keys(originalMsg.message);
              const isViewOnce = origKeys.some(k =>
                ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'].includes(k)
              );
              if (isViewOnce) {
                const { downloadViewOnce } = require('./plugins/OTHERS');
                const vvPayload =
                  originalMsg.message.viewOnceMessage?.message ||
                  originalMsg.message.viewOnceMessageV2?.message ||
                  originalMsg.message.viewOnceMessageV2Extension?.message;
                if (vvPayload) {
                  const dl = await downloadViewOnce(vvPayload);
                  if (dl) {
                    const { buffer, mediaType, meta } = dl;
                    const sendObj = mediaType === 'imageMessage'
                      ? { image: buffer }
                      : mediaType === 'videoMessage'
                        ? { video: buffer, mimetype: 'video/mp4' }
                        : { audio: buffer, mimetype: 'audio/mpeg', ptt: meta?.ptt || false };
                    const ownerNum = getSetting('ownerNumber', '');
                    const privateJid = ownerNum
                      ? `${ownerNum.replace(/[^0-9]/g, '')}@s.whatsapp.net`
                      : sender;
                    await sock.sendMessage(privateJid, sendObj).catch(() => {});
                  }
                }
              }
            }
          } catch (_) {}
        }
        continue; // Reactions are never commands — stop processing here
      }

      const prefix = global.prefix || getSetting('prefix', '.');
      if (!rawText.startsWith(prefix)) continue;

      const body = rawText.slice(prefix.length).trim();
      if (!body) continue;

      const parts = body.split(/\s+/);
      const commandName = parts[0].toLowerCase();
      const args = parts.slice(1);

      _logMsg('COMMAND', [
        ['⚡', 'CMD', commandName],
        ['📝', 'ARGS', args.join(' ') || '(none)'],
        ['👤', 'FROM', pushName],
        ['🔢', 'NUMBER', `+${senderNum}`],
        ['💬', 'CHAT', chatLabel],
      ]);

      let command = global.commands?.get(commandName) || global.aliases?.get(commandName);
      if (!command) continue;

      if (!isFromMe && !senderIsSudo && command.noprefix) continue;

      // Check if command is owner-only
      if (command.ownerOnly && !senderIsSudo) {
        const botName = getBotName();
        const fake = createFakeContact(sender);
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Owner only command!\n│\n└───────────────┘`
        }, { quoted: fake });
        continue;
      }

      // Check if group-only command
      if (command.groupOnly && !isGroup) {
        const botName = getBotName();
        const fake = createFakeContact(sender);
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Group only command!\n│\n└───────────────┘`
        }, { quoted: fake });
        continue;
      }

      try {
        await command.execute(sock, message, args, context);
      } catch (err) {
        console.error(chalk.red(`[CMD ERROR] ${commandName}: ${err.message}`));
        const fake = createFakeContact(sender);
        await sock.sendMessage(chatId, {
          text: `Error running command: ${err.message}`
        }, { quoted: fake }).catch(() => {});
      }

    } catch (error) {
      console.error(chalk.red('[MAIN ERROR]:'), error.message);
    }
  }
}

async function handleGroupUpdate(sock, update) {
  try {
    const { id, participants, action } = update;
    if (!id || !participants || !action) return;
    const { handleWelcome } = require('./lib/case');
    await handleWelcome(sock, id, participants, action);
  } catch (error) {
    console.error('Group update error:', error.message);
  }
}

module.exports = { handleMessage, handleGroupUpdate };
