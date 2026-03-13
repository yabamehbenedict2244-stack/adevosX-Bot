'use strict';
const { getChatData, updateChatData, isSudo } = require('./database');
const { getBotName, createFakeContact, channelInfo } = require('./messageConfig');
const isAdmin = require('./isAdmin');

function normalizeJid(jid) {
  if (!jid) return '';
  return jid.split('@')[0].split(':')[0] + '@s.whatsapp.net';
}

async function handleAntidemote(sock, update) {
  try {
    if (update.action !== 'demote') return;
    const chatId = update.id;
    const config = getChatData(chatId, 'antidemote', null);
    if (!config?.enabled) return;

    const author = update.author;
    const participants = update.participants || [];
    const botName = getBotName();
    const fake = createFakeContact(null);

    const botJid = normalizeJid(sock.user?.id);
    const botNum = sock.user?.id?.split(':')[0]?.split('@')[0];
    const authorNum = author?.split('@')[0]?.split(':')[0];
    if (authorNum === botNum) return;

    let meta;
    try { meta = await sock.groupMetadata(chatId); } catch { return; }

    const ownerJid = normalizeJid(meta.owner);
    const normalizedAuthor = normalizeJid(author);
    if (normalizedAuthor === ownerJid) return;
    if (isSudo(author) || isSudo(normalizedAuthor)) return;

    const mode = config.mode || 'revert';

    // Check if bot itself was demoted
    const isBotDemoted = participants.some(p => {
      const norm = normalizeJid(p);
      return norm === botJid || p.split('@')[0].split(':')[0] === botNum;
    });

    if (isBotDemoted) {
      try { await sock.groupParticipantsUpdate(chatId, [botJid], 'promote'); } catch {}
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ Someone tried to demote me!\n│ I re-promoted myself.\n│\n└─────────────────┘`,
        ...channelInfo
      });
      return;
    }

    const adminStatus = await isAdmin(sock, chatId, author);
    const isBotAdmin = adminStatus.isBotAdmin;
    if (!isBotAdmin) return;

    if (mode === 'revert') {
      try {
        await sock.groupParticipantsUpdate(chatId, participants, 'promote');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Demotion reversed!\n│ @${normalizedAuthor.split('@')[0]} tried to demote admins\n│\n└─────────────────┘`,
          mentions: [normalizedAuthor],
          ...channelInfo
        });
      } catch {}
    } else if (mode === 'kick') {
      try {
        await sock.groupParticipantsUpdate(chatId, [normalizedAuthor], 'remove');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ @${normalizedAuthor.split('@')[0]} kicked\n│ for unauthorized demotion!\n│\n└─────────────────┘`,
          mentions: [normalizedAuthor],
          ...channelInfo
        });
      } catch {}
    } else {
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ @${normalizedAuthor.split('@')[0]} demoted admins!\n│ Action not allowed.\n│\n└─────────────────┘`,
        mentions: [normalizedAuthor],
        ...channelInfo
      });
    }
  } catch (err) {
    console.error('[Antidemote]', err.message);
  }
}

async function antidemoteCommand(sock, chatId, message, args, context) {
  const { senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
  const botName = getBotName();
  const fake = createFakeContact(senderId);
  const prefix = require('./database').getSetting('prefix', '.');

  if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ I need admin!\n│\n└─────────────────┘` }, { quoted: fake });
  if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admin only!\n│\n└─────────────────┘` }, { quoted: fake });

  const cfg = getChatData(chatId, 'antidemote', { enabled: false, mode: 'revert' });
  const sub = (args[0] || '').toLowerCase();

  if (!sub || sub === 'status') {
    return sock.sendMessage(chatId, {
      text: `┌─ *${botName}* ─┐\n│\n│ *Anti-Demote*\n│ Status: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n│ Mode: ${(cfg.mode || 'revert').toUpperCase()}\n│\n│ ${prefix}antidemote on\n│ ${prefix}antidemote off\n│ ${prefix}antidemote revert\n│ ${prefix}antidemote kick\n│\n└─────────────────┘`
    }, { quoted: fake });
  }
  if (sub === 'on') { updateChatData(chatId, 'antidemote', { ...cfg, enabled: true }); return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Demote ✅ ENABLED\n│ Mode: ${(cfg.mode||'revert').toUpperCase()}\n│\n└─────────────────┘` }, { quoted: fake }); }
  if (sub === 'off') { updateChatData(chatId, 'antidemote', { ...cfg, enabled: false }); return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Demote ❌ DISABLED\n│\n└─────────────────┘` }, { quoted: fake }); }
  if (['revert', 'kick', 'warn'].includes(sub)) { updateChatData(chatId, 'antidemote', { ...cfg, enabled: true, mode: sub }); return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Demote ENABLED\n│ Mode: ${sub.toUpperCase()}\n│\n└─────────────────┘` }, { quoted: fake }); }
  return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: on/off/revert/kick/status\n│\n└─────────────────┘` }, { quoted: fake });
}

module.exports = { handleAntidemote, antidemoteCommand };
