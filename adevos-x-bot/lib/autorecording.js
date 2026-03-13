'use strict';
const { getSetting, updateSetting } = require('./database');
const { getBotName, createFakeContact } = require('./messageConfig');

const recordingIntervals = new Map();

function stopAllRecordingIntervals() {
  for (const [chatId, interval] of recordingIntervals) {
    clearInterval(interval);
    recordingIntervals.delete(chatId);
  }
}

function isAutorecordingEnabled() {
  const cfg = getSetting('autorecording', null);
  if (!cfg || typeof cfg !== 'object') return false;
  return cfg.enabled === true;
}

function isAutorecordingApplicableForChat(chatId) {
  const cfg = getSetting('autorecording', null);
  if (!cfg?.enabled) return false;
  const isGroup = chatId.endsWith('@g.us');
  if (isGroup && !cfg.group) return false;
  if (!isGroup && !cfg.pm) return false;
  return true;
}

async function handleAutorecordingForMessage(sock, chatId) {
  try {
    if (!isAutorecordingApplicableForChat(chatId)) return;

    if (recordingIntervals.has(chatId)) return;

    try { await sock.presenceSubscribe(chatId); } catch {}
    await sock.sendPresenceUpdate('recording', chatId);

    const interval = setInterval(async () => {
      try { await sock.sendPresenceUpdate('recording', chatId); } catch { clearInterval(interval); recordingIntervals.delete(chatId); }
    }, 4000);
    recordingIntervals.set(chatId, interval);

    setTimeout(async () => {
      clearInterval(recordingIntervals.get(chatId));
      recordingIntervals.delete(chatId);
      try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
    }, 25000);
  } catch {}
}

async function autorecordingCommand(sock, chatId, message, args) {
  const senderId = message.key.participant || message.key.remoteJid;
  const botName = getBotName();
  const fake = createFakeContact(senderId);
  const { isSudo } = require('./database');
  const isOwner = message.key.fromMe || isSudo(senderId);
  if (!isOwner) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

  const cfg = getSetting('autorecording', { enabled: false, pm: false, group: false });
  const sub = (args[0] || '').toLowerCase();
  const sub2 = (args[1] || '').toLowerCase();

  if (!sub) {
    return sock.sendMessage(chatId, {
      text: `┌─ *${botName}* ─┐\n│\n│ *Auto Recording*\n│ Status: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n│ PM: ${cfg.pm ? '✅ ON' : '❌ OFF'} | Group: ${cfg.group ? '✅ ON' : '❌ OFF'}\n│\n│ .autorecording on       — all chats\n│ .autorecording off      — disable\n│ .autorecording both     — pm + group\n│ .autorecording pm on/off\n│ .autorecording group on/off\n│\n└─────────────────┘`
    }, { quoted: fake });
  }

  if (sub === 'on') {
    updateSetting('autorecording', { ...cfg, enabled: true, pm: true, group: true });
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording ✅ ON\n│ PM + Group\n│\n└─────────────────┘` }, { quoted: fake });
  }
  if (sub === 'off') {
    stopAllRecordingIntervals();
    updateSetting('autorecording', { ...cfg, enabled: false, pm: false, group: false });
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording ❌ OFF\n│\n└─────────────────┘` }, { quoted: fake });
  }
  if (sub === 'both') {
    updateSetting('autorecording', { ...cfg, enabled: true, pm: true, group: true });
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording ✅ BOTH\n│ PM + Group enabled\n│\n└─────────────────┘` }, { quoted: fake });
  }
  if (sub === 'pm') {
    if (sub2 === 'on') {
      const n = { ...cfg, enabled: true, pm: true };
      updateSetting('autorecording', n);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording PM ✅ ON\n│\n└─────────────────┘` }, { quoted: fake });
    }
    if (sub2 === 'off') {
      const n = { ...cfg, pm: false };
      if (!n.group) n.enabled = false;
      updateSetting('autorecording', n);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording PM ❌ OFF\n│\n└─────────────────┘` }, { quoted: fake });
    }
    const n = { ...cfg, enabled: true, pm: !cfg.pm };
    updateSetting('autorecording', n);
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording PM: ${n.pm ? '✅ ON' : '❌ OFF'}\n│\n└─────────────────┘` }, { quoted: fake });
  }
  if (sub === 'group') {
    if (sub2 === 'on') {
      const n = { ...cfg, enabled: true, group: true };
      updateSetting('autorecording', n);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording Group ✅ ON\n│\n└─────────────────┘` }, { quoted: fake });
    }
    if (sub2 === 'off') {
      const n = { ...cfg, group: false };
      if (!n.pm) n.enabled = false;
      updateSetting('autorecording', n);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording Group ❌ OFF\n│\n└─────────────────┘` }, { quoted: fake });
    }
    const n = { ...cfg, enabled: true, group: !cfg.group };
    updateSetting('autorecording', n);
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Recording Group: ${n.group ? '✅ ON' : '❌ OFF'}\n│\n└─────────────────┘` }, { quoted: fake });
  }

  return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: .autorecording on/off/both\n│      .autorecording pm on/off\n│      .autorecording group on/off\n│\n└─────────────────┘` }, { quoted: fake });
}

module.exports = { autorecordingCommand, isAutorecordingEnabled, handleAutorecordingForMessage, isAutorecordingApplicableForChat, stopAllRecordingIntervals };
