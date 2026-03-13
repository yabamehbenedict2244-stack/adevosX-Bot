'use strict';
const { getSetting, updateSetting } = require('./database');
const { getBotName, createFakeContact } = require('./messageConfig');

const typingIntervals = new Map();

function stopAllTypingIntervals() {
  for (const [chatId, interval] of typingIntervals) {
    clearInterval(interval);
    typingIntervals.delete(chatId);
  }
}

function isAutorecordingApplicableForChat(chatId) {
  try { return require('./autorecording').isAutorecordingApplicableForChat(chatId); } catch { return false; }
}

function isAutotypingEnabled() {
  const cfg = getSetting('autotyping', null);
  if (!cfg || typeof cfg !== 'object') return false;
  return cfg.enabled === true;
}

function isAutotypingApplicableForChat(chatId) {
  const cfg = getSetting('autotyping', null);
  if (!cfg?.enabled) return false;
  const isGroup = chatId.endsWith('@g.us');
  if (isGroup && !cfg.group) return false;
  if (!isGroup && !cfg.pm) return false;
  return true;
}

async function handleAutotypingForMessage(sock, chatId) {
  try {
    if (!isAutotypingApplicableForChat(chatId)) return;
    if (isAutorecordingApplicableForChat(chatId)) return;

    if (typingIntervals.has(chatId)) return;

    try { await sock.presenceSubscribe(chatId); } catch {}
    await sock.sendPresenceUpdate('composing', chatId);

    const interval = setInterval(async () => {
      try { await sock.sendPresenceUpdate('composing', chatId); } catch { clearInterval(interval); typingIntervals.delete(chatId); }
    }, 4000);
    typingIntervals.set(chatId, interval);

    setTimeout(async () => {
      clearInterval(typingIntervals.get(chatId));
      typingIntervals.delete(chatId);
      try { await sock.sendPresenceUpdate('paused', chatId); } catch {}
    }, 25000);
  } catch {}
}

async function autotypingCommand(sock, chatId, message, args) {
  const senderId = message.key.participant || message.key.remoteJid;
  const botName = getBotName();
  const fake = createFakeContact(senderId);
  const { isSudo } = require('./database');
  const isOwner = message.key.fromMe || isSudo(senderId);
  if (!isOwner) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });

  const cfg = getSetting('autotyping', { enabled: false, pm: false, group: false });
  const sub = (args[0] || '').toLowerCase();
  const sub2 = (args[1] || '').toLowerCase();

  if (!sub) {
    return sock.sendMessage(chatId, {
      text: `┌─ *${botName}* ─┐\n│\n│ *Auto Typing*\n│ Status: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n│ PM: ${cfg.pm ? '✅ ON' : '❌ OFF'} | Group: ${cfg.group ? '✅ ON' : '❌ OFF'}\n│\n│ .autotyping on       — all chats\n│ .autotyping off      — disable\n│ .autotyping both     — pm + group\n│ .autotyping pm on/off\n│ .autotyping group on/off\n│\n└─────────────────┘`
    }, { quoted: fake });
  }

  if (sub === 'on') {
    updateSetting('autotyping', { ...cfg, enabled: true, pm: true, group: true });
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing ✅ ON\n│ PM + Group\n│\n└─────────────────┘` }, { quoted: fake });
  }
  if (sub === 'off') {
    stopAllTypingIntervals();
    updateSetting('autotyping', { ...cfg, enabled: false, pm: false, group: false });
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing ❌ OFF\n│\n└─────────────────┘` }, { quoted: fake });
  }
  if (sub === 'both') {
    updateSetting('autotyping', { ...cfg, enabled: true, pm: true, group: true });
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing ✅ BOTH\n│ PM + Group enabled\n│\n└─────────────────┘` }, { quoted: fake });
  }
  if (sub === 'pm') {
    if (sub2 === 'on') {
      const n = { ...cfg, enabled: true, pm: true };
      updateSetting('autotyping', n);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing PM ✅ ON\n│\n└─────────────────┘` }, { quoted: fake });
    }
    if (sub2 === 'off') {
      const n = { ...cfg, pm: false };
      if (!n.group) n.enabled = false;
      updateSetting('autotyping', n);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing PM ❌ OFF\n│\n└─────────────────┘` }, { quoted: fake });
    }
    const n = { ...cfg, enabled: true, pm: !cfg.pm };
    updateSetting('autotyping', n);
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing PM: ${n.pm ? '✅ ON' : '❌ OFF'}\n│\n└─────────────────┘` }, { quoted: fake });
  }
  if (sub === 'group') {
    if (sub2 === 'on') {
      const n = { ...cfg, enabled: true, group: true };
      updateSetting('autotyping', n);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing Group ✅ ON\n│\n└─────────────────┘` }, { quoted: fake });
    }
    if (sub2 === 'off') {
      const n = { ...cfg, group: false };
      if (!n.pm) n.enabled = false;
      updateSetting('autotyping', n);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing Group ❌ OFF\n│\n└─────────────────┘` }, { quoted: fake });
    }
    const n = { ...cfg, enabled: true, group: !cfg.group };
    updateSetting('autotyping', n);
    return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Auto Typing Group: ${n.group ? '✅ ON' : '❌ OFF'}\n│\n└─────────────────┘` }, { quoted: fake });
  }

  return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: .autotyping on/off/both\n│      .autotyping pm on/off\n│      .autotyping group on/off\n│\n└─────────────────┘` }, { quoted: fake });
}

module.exports = { autotypingCommand, isAutotypingEnabled, handleAutotypingForMessage, isAutotypingApplicableForChat, stopAllTypingIntervals };
