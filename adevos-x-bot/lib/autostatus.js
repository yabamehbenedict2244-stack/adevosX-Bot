// lib/autostatus.js — Adapted from Dave X autostatus.js
const { getSetting, updateSetting, isSudo } = require('./database');
const { getBotName, createFakeContact } = require('./messageConfig');

const EMOJIS = ['❤️', '💛', '👍', '💜', '😮', '🤍', '💙'];
function randomEmoji() { return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]; }

const DEFAULT_CONFIG = {
  viewOn:          true,
  reactOn:         false,
  replyOn:         false,
  replyText:       '👀 Seen your status!',
  reactionEmoji:   '❤️',
  randomReactions: true,
};

function readConfig() {
  try {
    const raw = getSetting('autostatusConfig', null);
    if (raw && typeof raw === 'object') return { ...DEFAULT_CONFIG, ...raw };
    // legacy individual settings
    return {
      viewOn:          getSetting('autoviewstatus', true),
      reactOn:         getSetting('autostatusreact', false),
      replyOn:         getSetting('autostatusreply', false),
      replyText:       getSetting('autostatusreplytext', DEFAULT_CONFIG.replyText),
      reactionEmoji:   getSetting('autostatusemoji', '❤️'),
      randomReactions: getSetting('autostatusrandom', true),
    };
  } catch { return { ...DEFAULT_CONFIG }; }
}

function writeConfig(cfg) {
  try { updateSetting('autostatusConfig', cfg); return true; }
  catch { return false; }
}

function isLid(jid) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

async function resolveLidToPhone(lid, sock) {
  try {
    if (sock?.signalRepository?.lidMapping) {
      const pn = await sock.signalRepository.lidMapping.getPNForLID(lid);
      if (pn) return pn;
    }
  } catch {}
  return null;
}

async function handleStatusUpdate(sock, statusUpdate) {
  try {
    let mek = statusUpdate?.messages?.[0];
    if (!mek || !mek.message) return;

    if (Object.keys(mek.message)[0] === 'ephemeralMessage') {
      mek.message = mek.message.ephemeralMessage.message;
    }

    if (mek.key?.remoteJid !== 'status@broadcast') return;

    // Never process own status posts
    if (mek.key.fromMe) return;

    const cfg = readConfig();

    const rawJid = mek.key.participant || 'unknown';
    let phoneJid = null;
    if (isLid(rawJid)) {
      phoneJid = await resolveLidToPhone(rawJid, sock);
    } else {
      phoneJid = rawJid;
    }

    // AUTO VIEW
    if (cfg.viewOn) {
      try {
        const readKey = phoneJid && !isLid(phoneJid)
          ? { ...mek.key, participant: phoneJid }
          : mek.key;
        await sock.readMessages([readKey]);
      } catch {}
    }

    // AUTO REACT
    if (cfg.reactOn && phoneJid && !isLid(phoneJid)) {
      try {
        const emoji = cfg.randomReactions ? randomEmoji() : cfg.reactionEmoji;
        const reactKey = { ...mek.key, participant: phoneJid };
        await sock.sendMessage('status@broadcast', { react: { text: emoji, key: reactKey } }, { statusJidList: [phoneJid] });
      } catch {}
    }

    // AUTO REPLY
    if (cfg.replyOn && !mek.key.fromMe && phoneJid && !isLid(phoneJid)) {
      try {
        await sock.sendMessage(phoneJid, { text: cfg.replyText || DEFAULT_CONFIG.replyText }, { quoted: mek });
      } catch {}
    }

  } catch (err) {
    console.error('[AutoStatus] Error:', err.message);
  }
}

async function autoStatusCommand(sock, chatId, msg, args) {
  try {
    const senderId = msg.key.participant || msg.key.remoteJid;
    const isOwner = msg.key.fromMe || isSudo(senderId);
    const botName = getBotName();
    const fake = createFakeContact(senderId);

    if (!isOwner) {
      return sock.sendMessage(chatId, { text: `✦ Owner only command` }, { quoted: fake });
    }

    const cfg = readConfig();

    if (!args?.length) {
      return sock.sendMessage(chatId, {
        text:
          `✦ *${botName}* | Auto Status\n\n` +
          `👁️ View:    ${cfg.viewOn   ? '✅ ON' : '❌ OFF'}\n` +
          `❤️ React:   ${cfg.reactOn  ? '✅ ON' : '❌ OFF'}\n` +
          `💬 Reply:   ${cfg.replyOn  ? '✅ ON' : '❌ OFF'}\n` +
          `😀 Emoji:   ${cfg.reactionEmoji}\n` +
          `🎲 Random:  ${cfg.randomReactions ? '✅ ON' : '❌ OFF'}\n` +
          `📝 Msg:     ${cfg.replyText}\n\n` +
          `*Commands:*\n` +
          `› .autostatus on\n` +
          `› .autostatus off\n` +
          `› .autostatus view on/off\n` +
          `› .autostatus react on/off\n` +
          `› .autostatus react emoji <emoji>\n` +
          `› .autostatus react random on/off\n` +
          `› .autostatus reply on/off\n` +
          `› .autostatus reply setmsg <text>\n` +
          `› .autostatus reset`
      }, { quoted: fake });
    }

    const cmd = (args[0] || '').toLowerCase();
    const sub = (args[1] || '').toLowerCase();

    if (cmd === 'on') {
      cfg.viewOn = true; writeConfig(cfg);
      return sock.sendMessage(chatId, { text: `✦ *${botName}* | Auto View ✅ ON` }, { quoted: fake });
    }
    if (cmd === 'off') {
      cfg.viewOn = false; writeConfig(cfg);
      return sock.sendMessage(chatId, { text: `✦ *${botName}* | Auto View ❌ OFF` }, { quoted: fake });
    }
    if (cmd === 'view') {
      cfg.viewOn = sub === 'on'; writeConfig(cfg);
      return sock.sendMessage(chatId, { text: `✦ *${botName}* | Auto View ${cfg.viewOn ? '✅ ON' : '❌ OFF'}` }, { quoted: fake });
    }
    if (cmd === 'react') {
      if (sub === 'on' || sub === 'off') {
        cfg.reactOn = sub === 'on'; writeConfig(cfg);
        return sock.sendMessage(chatId, { text: `✦ *${botName}* | Auto React ${cfg.reactOn ? '✅ ON' : '❌ OFF'}` }, { quoted: fake });
      }
      if (sub === 'emoji') {
        cfg.reactionEmoji = args[2] || '❤️'; writeConfig(cfg);
        return sock.sendMessage(chatId, { text: `✦ *${botName}* | Emoji → ${cfg.reactionEmoji}` }, { quoted: fake });
      }
      if (sub === 'random') {
        cfg.randomReactions = (args[2] || '') === 'on'; writeConfig(cfg);
        return sock.sendMessage(chatId, { text: `✦ *${botName}* | Random ${cfg.randomReactions ? '✅ ON' : '❌ OFF'}` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `✦ react on/off | react emoji <e> | react random on/off` }, { quoted: fake });
    }
    if (cmd === 'reply') {
      if (sub === 'on' || sub === 'off') {
        cfg.replyOn = sub === 'on'; writeConfig(cfg);
        return sock.sendMessage(chatId, { text: `✦ *${botName}* | Auto Reply ${cfg.replyOn ? '✅ ON' : '❌ OFF'}` }, { quoted: fake });
      }
      if (sub === 'setmsg') {
        cfg.replyText = args.slice(2).join(' ').trim() || cfg.replyText; writeConfig(cfg);
        return sock.sendMessage(chatId, { text: `✦ *${botName}* | Reply msg:\n_${cfg.replyText}_` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `✦ reply on/off | reply setmsg <text>` }, { quoted: fake });
    }
    if (cmd === 'reset') {
      writeConfig({ ...DEFAULT_CONFIG });
      return sock.sendMessage(chatId, { text: `✦ *${botName}* | Reset to defaults ✅` }, { quoted: fake });
    }

    return sock.sendMessage(chatId, { text: `✦ Unknown. Send *.autostatus* to see help.` }, { quoted: fake });

  } catch (err) {
    console.error('[AutoStatus cmd]', err.message);
  }
}

module.exports = { autoStatusCommand, handleStatusUpdate };
