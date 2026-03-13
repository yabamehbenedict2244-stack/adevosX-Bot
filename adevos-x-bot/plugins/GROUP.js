const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');
const { getSetting, getChatData, updateChatData } = require('../lib/database');
const isAdmin = require('../lib/isAdmin');
const { setWelcome, removeWelcome, setGoodbye, removeGoodbye } = require('../lib/database');

module.exports = [
  // ============================
  // KICK
  // ============================
  {
    name: 'kick',
    aliases: ['remove'],
    category: 'group',
    description: 'Kick a member from the group',
    usage: '.kick @user',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isBotAdmin) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ I need admin to kick!\n│\n└─────────────────┘` }, { quoted: fake });
      }
      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });
      }

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const quoted = message.message?.extendedTextMessage?.contextInfo?.participant;
      const targets = mentions.length ? mentions : (quoted ? [quoted] : []);

      if (!targets.length) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone to kick!\n│\n└─────────────────┘` }, { quoted: fake });
      }

      try {
        await sock.groupParticipantsUpdate(chatId, targets, 'remove');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Kicked ${targets.map(t => `@${t.split('@')[0]}`).join(', ')}\n│\n└─────────────────┘`,
          mentions: targets, ...channelInfo
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Kick failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // ADD
  // ============================
  {
    name: 'add',
    category: 'group',
    description: 'Add a member to the group',
    usage: '.add <number>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ I need admin to add!\n│\n└─────────────────┘` }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });

      const number = args[0]?.replace(/[^0-9]/g, '');
      if (!number) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a number!\n│ .add 254712345678\n│\n└─────────────────┘` }, { quoted: fake });

      const jid = number + '@s.whatsapp.net';
      try {
        await sock.groupParticipantsUpdate(chatId, [jid], 'add');
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Added @${number}\n│\n└─────────────────┘`, mentions: [jid], ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Add failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // PROMOTE
  // ============================
  {
    name: 'promote',
    aliases: ['admin'],
    category: 'group',
    description: 'Promote a member to admin',
    usage: '.promote @user',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ I need admin!\n│\n└─────────────────┘` }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentions.length) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone!\n│\n└─────────────────┘` }, { quoted: fake });

      try {
        await sock.groupParticipantsUpdate(chatId, mentions, 'promote');
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Promoted ${mentions.map(m => `@${m.split('@')[0]}`).join(', ')} to admin!\n│\n└─────────────────┘`, mentions, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Promote failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // DEMOTE
  // ============================
  {
    name: 'demote',
    aliases: ['unadmin'],
    category: 'group',
    description: 'Demote an admin to member',
    usage: '.demote @user',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ I need admin!\n│\n└─────────────────┘` }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentions.length) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone!\n│\n└─────────────────┘` }, { quoted: fake });

      try {
        await sock.groupParticipantsUpdate(chatId, mentions, 'demote');
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Demoted ${mentions.map(m => `@${m.split('@')[0]}`).join(', ')}\n│\n└─────────────────┘`, mentions, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Demote failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // MUTE / UNMUTE GROUP
  // ============================
  {
    name: 'mute',
    aliases: ['lock'],
    category: 'group',
    description: 'Mute the group (admins only)',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ I need admin!\n│\n└─────────────────┘` }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });

      try {
        await sock.groupSettingUpdate(chatId, 'announcement');
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Group muted!\n│ Only admins can send messages.\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  {
    name: 'unmute',
    aliases: ['unlock'],
    category: 'group',
    description: 'Unmute the group',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ I need admin!\n│\n└─────────────────┘` }, { quoted: fake });
      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });

      try {
        await sock.groupSettingUpdate(chatId, 'not_announcement');
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Group unmuted!\n│ Everyone can send messages.\n│\n└─────────────────┘`, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // GROUPINFO
  // ============================
  {
    name: 'groupinfo',
    aliases: ['ginfo', 'gcinfo'],
    category: 'group',
    description: 'Get group information',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      try {
        const meta = await sock.groupMetadata(chatId);
        const adminList = meta.participants.filter(p => p.admin);
        const text = `┌─ *${botName}* ─┐\n│\n│ *Group Info*\n│ Name: ${meta.subject}\n│ Members: ${meta.participants.length}\n│ Admins: ${adminList.length}\n│ ID: ${meta.id.split('@')[0]}\n│ Created: ${new Date(meta.creation * 1000).toLocaleDateString()}\n│\n└─────────────────┘`;
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed to get info\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // TAGALL
  // ============================
  {
    name: 'tagall',
    aliases: ['mentionall', 'everyone'],
    category: 'group',
    description: 'Mention all group members',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });
      }

      try {
        const meta = await sock.groupMetadata(chatId);
        // Filter to phone JIDs only — skip @lid JIDs which can't be properly mentioned
        const members = meta.participants
          .map(p => p.id)
          .filter(id => id.endsWith('@s.whatsapp.net'));
        const customMsg = args.join(' ') || '📢 Attention everyone!';
        const tagList = members.map(m => `@${m.split('@')[0]}`).join(' ');
        await sock.sendMessage(chatId, {
          text: `╔══════════════════════╗\n║  📣 *${botName} TAG ALL*  ║\n╚══════════════════════╝\n\n${customMsg}\n\n${tagList}`,
          mentions: members,
          ...channelInfo
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // WARN
  // ============================
  {
    name: 'warn',
    category: 'group',
    description: 'Warn a user',
    usage: '.warn @user [reason]',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentions.length) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone!\n│\n└─────────────────┘` }, { quoted: fake });

      const { loadDatabase, saveDatabase } = require('../lib/database');
      const db = loadDatabase();
      if (!db.commandData.warnings) db.commandData.warnings = {};
      const key = `${chatId}:${mentions[0]}`;
      db.commandData.warnings[key] = (db.commandData.warnings[key] || 0) + 1;
      const count = db.commandData.warnings[key];
      const warnLimit = db.settings.warnLimit || 3;
      saveDatabase(db);

      const reason = args.slice(1).join(' ') || 'No reason given';
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ Warned @${mentions[0].split('@')[0]}\n│ Reason: ${reason}\n│ Warnings: ${count}/${warnLimit}\n│\n└─────────────────┘`,
        mentions, ...channelInfo
      }, { quoted: fake });

      if (count >= warnLimit) {
        await sock.groupParticipantsUpdate(chatId, [mentions[0]], 'remove').catch(() => {});
        delete db.commandData.warnings[key];
        saveDatabase(db);
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ @${mentions[0].split('@')[0]}\n│ Kicked after ${warnLimit} warnings!\n│\n└─────────────────┘`,
          mentions, ...channelInfo
        }, { quoted: fake });
      }
    }
  },

  // ============================
  // ANTILINK (toggle)
  // ============================
  {
    name: 'antilink',
    category: 'group',
    description: 'Toggle antilink protection',
    usage: '.antilink <on|off|status>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });

      if (sub === 'on') {
        updateChatData(chatId, 'antilink', true);
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Link ENABLED\n│\n└─────────────────┘` }, { quoted: fake });
      }
      if (sub === 'off') {
        updateChatData(chatId, 'antilink', false);
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Link DISABLED\n│\n└─────────────────┘` }, { quoted: fake });
      }
      const status = getChatData(chatId, 'antilink', false);
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Link: ${status ? 'ON' : 'OFF'}\n│\n└─────────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // WELCOME
  // ============================
  {
    name: 'welcome',
    category: 'group',
    description: 'Set/toggle welcome message',
    usage: '.welcome <on|off|set <message>>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });

      if (sub === 'off') {
        removeWelcome(chatId);
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Welcome DISABLED\n│\n└─────────────────┘` }, { quoted: fake });
      }
      if (sub === 'set' || sub === 'on') {
        const customMsg = args.slice(1).join(' ') || `Welcome @user to the group!`;
        setWelcome(chatId, customMsg);
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Welcome ENABLED\n│ Message: ${customMsg.substring(0, 50)}...\n│\n└─────────────────┘` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Usage:\n│ .welcome on\n│ .welcome off\n│ .welcome set <message>\n│\n└─────────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // CHATBOT (group)
  // ============================
  {
    name: 'chatbot',
    aliases: ['ai', 'bot'],
    category: 'group',
    description: 'Toggle AI chatbot for this group or PM replies',
    usage: '.chatbot <on|off|status>  |  in PM: .chatbot pm <on|off>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isGroup, isPrivate } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();

      // In group — admin or sudo can toggle
      if (isGroup) {
        if (!isSenderAdmin && !senderIsSudo) {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────────┘` }, { quoted: fake });
        }
        if (sub === 'on') {
          updateChatData(chatId, 'chatbot', true);
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ 🤖 Chatbot ENABLED\n│ Replying to all messages.\n│\n└─────────────────┘` }, { quoted: fake });
        }
        if (sub === 'off') {
          updateChatData(chatId, 'chatbot', false);
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ 🤖 Chatbot DISABLED\n│\n└─────────────────┘` }, { quoted: fake });
        }
        const status = getChatData(chatId, 'chatbot', false);
        const isOn = status === true || status === 'true';
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ 🤖 Group Chatbot: ${isOn ? '✅ ON' : '❌ OFF'}\n│\n│ Usage:\n│ .chatbot on  — enable\n│ .chatbot off — disable\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      // In PM — only sudo/owner can toggle global DM chatbot
      if (isPrivate) {
        if (!senderIsSudo) {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Owner only!\n│\n└─────────────────┘` }, { quoted: fake });
        }
        if (sub === 'on') {
          const { updateSetting } = require('../lib/database');
          updateSetting('chatbotpm', true);
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ 🤖 PM Chatbot ENABLED\n│ I'll reply to DMs now!\n│\n└─────────────────┘` }, { quoted: fake });
        }
        if (sub === 'off') {
          const { updateSetting } = require('../lib/database');
          updateSetting('chatbotpm', false);
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ 🤖 PM Chatbot DISABLED\n│\n└─────────────────┘` }, { quoted: fake });
        }
        const { getSetting: _gs } = require('../lib/database');
        const pmStatus = _gs('chatbotpm', false);
        const isPMOn = pmStatus === true || pmStatus === 'true';
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ 🤖 PM Chatbot: ${isPMOn ? '✅ ON' : '❌ OFF'}\n│\n│ Usage:\n│ .chatbot on  — enable DM replies\n│ .chatbot off — disable\n│\n└─────────────────┘`
        }, { quoted: fake });
      }
    }
  },

  // ============================
  // ANTIBADWORD
  // ============================
  {
    name: 'antibadword',
    aliases: ['antibad', 'abw'],
    category: 'group',
    description: 'Filter bad words in groups',
    usage: '.antibadword on/off/add/remove/list/action/warn/kick/delete',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();
      const prefix = getSetting('prefix', '.');

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admins only!\n│\n└─────────────┘` }, { quoted: fake });
      }

      const cfg = getChatData(chatId, 'antibadword', {
        enabled: false, action: 'delete', maxWarnings: 3, words: []
      });

      if (!sub || sub === 'help') {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Anti-Badword\n│ Status: ${cfg.enabled ? '✅ ON' : '❌ OFF'}\n│ Action: ${cfg.action || 'delete'}\n│ Max Warns: ${cfg.maxWarnings || 3}\n│ Custom: ${(cfg.words || []).length} word(s)\n│\n│ ${prefix}antibadword on/off\n│ ${prefix}antibadword delete/warn/kick\n│ ${prefix}antibadword add <word>\n│ ${prefix}antibadword remove <word>\n│ ${prefix}antibadword list\n│ ${prefix}antibadword setwarn <n>\n│\n└─────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'on') {
        updateChatData(chatId, 'antibadword', { ...cfg, enabled: true });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Badword ✅ ON\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'off') {
        updateChatData(chatId, 'antibadword', { ...cfg, enabled: false });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Badword ❌ OFF\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'delete' || sub === 'del') {
        updateChatData(chatId, 'antibadword', { ...cfg, enabled: true, action: 'delete' });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Action: DELETE\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'warn' || sub === 'warning') {
        updateChatData(chatId, 'antibadword', { ...cfg, enabled: true, action: 'warn' });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Action: WARN\n│ Max: ${cfg.maxWarnings || 3}\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'kick' || sub === 'remove') {
        updateChatData(chatId, 'antibadword', { ...cfg, enabled: true, action: 'kick' });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Action: KICK\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'add') {
        const word = args.slice(1).join(' ').toLowerCase().trim();
        if (!word) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a word!\n│\n└─────────────┘` }, { quoted: fake });
        const words = [...new Set([...(cfg.words || []), word])];
        updateChatData(chatId, 'antibadword', { ...cfg, words });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Word added: "${word}"\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'remove' || sub === 'del') {
        const word = args.slice(1).join(' ').toLowerCase().trim();
        const words = (cfg.words || []).filter(w => w !== word);
        updateChatData(chatId, 'antibadword', { ...cfg, words });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Word removed: "${word}"\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'list') {
        const DEFAULT_BAD_WORDS = ['fuck', 'shit', 'damn', 'bitch', 'asshole', 'bastard', 'dick', 'cock', 'pussy', 'slut', 'whore', 'cunt', 'nigga', 'motherfucker', 'prick', 'wanker'];
        const all = [...new Set([...DEFAULT_BAD_WORDS, ...(cfg.words || [])])];
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Badword List (${all.length})\n│\n│ ${all.join(', ')}\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (sub === 'setwarn') {
        const n = parseInt(args[1]);
        if (!n || n < 1) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a number!\n│\n└─────────────┘` }, { quoted: fake });
        updateChatData(chatId, 'antibadword', { ...cfg, maxWarnings: n });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Max warnings: ${n}\n│\n└─────────────┘` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: .antibadword help\n│\n└─────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // ANTI-IMAGE
  // ============================
  {
    name: 'antiimage',
    aliases: ['noimage'],
    category: 'group',
    description: 'Prevent images in group',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin } = context;
      const { getChatData, updateChatData, isSudo } = require('../lib/database');
      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${getBotName()}* ─┐\n│\n│ Admin only!\n│\n└─────────────┘` }, { quoted: createFakeContact(message) });
      }
      const action = (args[0] || '').toLowerCase();
      const fake = createFakeContact(message);
      const botName = getBotName();
      if (!action) {
        const cfg = getChatData(chatId, 'antiimage', null);
        const mode = cfg?.enabled ? (cfg.action || 'delete') : 'off';
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Image: ${mode.toUpperCase()}\n│\n│ .antiimage off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (action === 'off') {
        updateChatData(chatId, 'antiimage', { enabled: false });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Image ❌ OFF\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (['delete', 'warn', 'kick'].includes(action)) {
        updateChatData(chatId, 'antiimage', { enabled: true, action });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Image: ${action.toUpperCase()} ✅\n│\n└─────────────┘` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // ANTI-STICKER
  // ============================
  {
    name: 'antisticker',
    aliases: ['nosticker'],
    category: 'group',
    description: 'Prevent stickers in group',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderIsSudo, isSenderAdmin } = context;
      const { getChatData, updateChatData } = require('../lib/database');
      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${getBotName()}* ─┐\n│\n│ Admin only!\n│\n└─────────────┘` }, { quoted: createFakeContact(message) });
      }
      const action = (args[0] || '').toLowerCase();
      const fake = createFakeContact(message);
      const botName = getBotName();
      if (!action) {
        const cfg = getChatData(chatId, 'antisticker', null);
        const mode = cfg?.enabled ? (cfg.action || 'delete') : 'off';
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Sticker: ${mode.toUpperCase()}\n│\n│ .antisticker off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (action === 'off') {
        updateChatData(chatId, 'antisticker', { enabled: false });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Sticker ❌ OFF\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (['delete', 'warn', 'kick'].includes(action)) {
        updateChatData(chatId, 'antisticker', { enabled: true, action });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Sticker: ${action.toUpperCase()} ✅\n│\n└─────────────┘` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // ANTI-VIDEO
  // ============================
  {
    name: 'antivideo',
    aliases: ['novideo'],
    category: 'group',
    description: 'Prevent videos in group',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderIsSudo, isSenderAdmin } = context;
      const { getChatData, updateChatData } = require('../lib/database');
      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${getBotName()}* ─┐\n│\n│ Admin only!\n│\n└─────────────┘` }, { quoted: createFakeContact(message) });
      }
      const action = (args[0] || '').toLowerCase();
      const fake = createFakeContact(message);
      const botName = getBotName();
      if (!action) {
        const cfg = getChatData(chatId, 'antivideo', null);
        const mode = cfg?.enabled ? (cfg.action || 'delete') : 'off';
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Video: ${mode.toUpperCase()}\n│\n│ .antivideo off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (action === 'off') {
        updateChatData(chatId, 'antivideo', { enabled: false });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Video ❌ OFF\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (['delete', 'warn', 'kick'].includes(action)) {
        updateChatData(chatId, 'antivideo', { enabled: true, action });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Video: ${action.toUpperCase()} ✅\n│\n└─────────────┘` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // ANTI-AUDIO
  // ============================
  {
    name: 'antiaudio',
    aliases: ['noaudio', 'novoice'],
    category: 'group',
    description: 'Prevent audio/voice in group',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderIsSudo, isSenderAdmin } = context;
      const { getChatData, updateChatData } = require('../lib/database');
      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${getBotName()}* ─┐\n│\n│ Admin only!\n│\n└─────────────┘` }, { quoted: createFakeContact(message) });
      }
      const action = (args[0] || '').toLowerCase();
      const fake = createFakeContact(message);
      const botName = getBotName();
      if (!action) {
        const cfg = getChatData(chatId, 'antiaudio', null);
        const mode = cfg?.enabled ? (cfg.action || 'delete') : 'off';
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Audio: ${mode.toUpperCase()}\n│\n│ .antiaudio off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (action === 'off') {
        updateChatData(chatId, 'antiaudio', { enabled: false });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Audio ❌ OFF\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (['delete', 'warn', 'kick'].includes(action)) {
        updateChatData(chatId, 'antiaudio', { enabled: true, action });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Audio: ${action.toUpperCase()} ✅\n│\n└─────────────┘` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // ANTI-DOCUMENT
  // ============================
  {
    name: 'antidocument',
    aliases: ['nodoc', 'nodocument'],
    category: 'group',
    description: 'Prevent documents in group',
    groupOnly: true,
    adminOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderIsSudo, isSenderAdmin } = context;
      const { getChatData, updateChatData } = require('../lib/database');
      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, { text: `┌─ *${getBotName()}* ─┐\n│\n│ Admin only!\n│\n└─────────────┘` }, { quoted: createFakeContact(message) });
      }
      const action = (args[0] || '').toLowerCase();
      const fake = createFakeContact(message);
      const botName = getBotName();
      if (!action) {
        const cfg = getChatData(chatId, 'antidocument', null);
        const mode = cfg?.enabled ? (cfg.action || 'delete') : 'off';
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Document: ${mode.toUpperCase()}\n│\n│ .antidocument off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (action === 'off') {
        updateChatData(chatId, 'antidocument', { enabled: false });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Document ❌ OFF\n│\n└─────────────┘` }, { quoted: fake });
      }
      if (['delete', 'warn', 'kick'].includes(action)) {
        updateChatData(chatId, 'antidocument', { enabled: true, action });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Anti-Document: ${action.toUpperCase()} ✅\n│\n└─────────────┘` }, { quoted: fake });
      }
      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Use: off/delete/warn/kick\n│\n└─────────────┘` }, { quoted: fake });
    }
  },
  {
    name: 'antidemote',
    aliases: ['antidm'],
    category: 'group',
    description: 'Prevent unauthorized admin demotion',
    usage: '.antidemote on/off/revert/kick/status',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      await antidemoteCommand(sock, message.key.remoteJid, message, args, context);
    }
  }
  ,
  // ============================
  // HIDETAG
  // ============================
  {
    name: 'hidetag',
    aliases: ['htag', 'h.tag'],
    category: 'group',
    description: 'Tag all members silently (no visible numbers)',
    usage: '.hidetag <message>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Admin only!\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      const text = args.join(' ').trim() || '📢 Announcement!';
      try {
        const meta = await sock.groupMetadata(chatId);
        const members = meta.participants
          .map(p => p.id)
          .filter(id => id.endsWith('@s.whatsapp.net'));
        await sock.sendMessage(chatId, {
          text,
          mentions: members
        });
      } catch (e) {
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }
    }
  },

  // ============================
  // OPEN / CLOSE GROUP
  // ============================
  {
    name: 'open',
    aliases: ['opengroup', 'unlock'],
    category: 'group',
    description: 'Allow all members to send messages',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admin only!\n│\n└─────────────────┘` }, { quoted: fake });
      if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Bot needs admin!\n│\n└─────────────────┘` }, { quoted: fake });

      try {
        await sock.groupSettingUpdate(chatId, 'not_announcement');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ ✅ Group is now *OPEN*\n│ All members can send messages.\n│\n└─────────────────┘`
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },
  {
    name: 'close',
    aliases: ['closegroup', 'lock'],
    category: 'group',
    description: 'Restrict group to admins only',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admin only!\n│\n└─────────────────┘` }, { quoted: fake });
      if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Bot needs admin!\n│\n└─────────────────┘` }, { quoted: fake });

      try {
        await sock.groupSettingUpdate(chatId, 'announcement');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ 🔒 Group is now *CLOSED*\n│ Only admins can send messages.\n│\n└─────────────────┘`
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // GROUP JOIN APPROVAL
  // ============================
  {
    name: 'approval',
    aliases: ['joinapproval', 'joinmode'],
    category: 'group',
    description: 'Toggle group join approval requirement',
    usage: '.approval on/off',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, isBotAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admin only!\n│\n└─────────────────┘` }, { quoted: fake });
      if (!isBotAdmin) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Bot needs admin!\n│\n└─────────────────┘` }, { quoted: fake });

      const sub = (args[0] || '').toLowerCase();
      if (!sub || !['on', 'off'].includes(sub)) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ *Group Join Approval*\n│\n│ .approval on  - Require admin approval\n│ .approval off - Allow anyone to join\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      try {
        await sock.groupMemberAddMode(chatId, sub === 'on' ? 'approval' : 'all_member_add');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Join approval ${sub === 'on' ? '✅ ENABLED' : '❌ DISABLED'}\n│\n└─────────────────┘`
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },
  {
    name: 'approve',
    aliases: ['acceptjoin'],
    category: 'group',
    description: 'Approve a pending group join request',
    usage: '.approve @user',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admin only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const targets = mentions.length ? mentions : args.map(a => `${a.replace(/[^0-9]/g, '')}@s.whatsapp.net`).filter(a => a.length > 15);

      if (!targets.length) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone to approve!\n│\n└─────────────────┘` }, { quoted: fake });
      }

      try {
        await sock.groupRequestParticipantsUpdate(chatId, targets, 'approve');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ ✅ Approved: ${targets.map(t => `@${t.split('@')[0]}`).join(', ')}\n│\n└─────────────────┘`,
          mentions: targets
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },
  {
    name: 'reject',
    aliases: ['rejectjoin', 'denyrequest'],
    category: 'group',
    description: 'Reject a pending group join request',
    usage: '.reject @user',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, isSenderAdmin, senderIsSudo } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      if (!isSenderAdmin && !senderIsSudo) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Admin only!\n│\n└─────────────────┘` }, { quoted: fake });

      const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const targets = mentions.length ? mentions : args.map(a => `${a.replace(/[^0-9]/g, '')}@s.whatsapp.net`).filter(a => a.length > 15);

      if (!targets.length) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Mention someone to reject!\n│\n└─────────────────┘` }, { quoted: fake });
      }

      try {
        await sock.groupRequestParticipantsUpdate(chatId, targets, 'reject');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ ❌ Rejected: ${targets.map(t => `@${t.split('@')[0]}`).join(', ')}\n│\n└─────────────────┘`,
          mentions: targets
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  {
    name: 'antigroupmention',
    aliases: ['antgm', 'antigm'],
    category: 'group',
    description: 'Prevent group mention/status sharing',
    usage: '.antigroupmention <on|off|delete|kick|status>',
    groupOnly: true,
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderIsSudo, isSenderAdmin, isBotAdmin } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();
      const prefix = getSetting('prefix', '.');

      if (!sub || sub === 'help') {
        const config = getChatData(chatId, 'antigroupmention', null) || { enabled: false };
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Anti-Group Mention\n│ Status: ${config.enabled ? 'ON' : 'OFF'}\n│\n│ Commands:\n│ ${prefix}antigroupmention on\n│ ${prefix}antigroupmention off\n│ ${prefix}antigroupmention delete\n│ ${prefix}antigroupmention kick\n│ ${prefix}antigroupmention status\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'status') {
        const config = getChatData(chatId, 'antigroupmention', null) || { enabled: false };
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Anti-Group Mention:\n│ ${config.enabled ? 'ACTIVE' : 'INACTIVE'}\n│ ${config.enabled ? 'Mode: ' + (config.action || 'delete').toUpperCase() : ''}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (!isBotAdmin) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Bot needs admin!\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (!isSenderAdmin && !senderIsSudo) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Admin only command!\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'off') {
        updateChatData(chatId, 'antigroupmention', { enabled: false });
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Anti-Group Mention DISABLED\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      const validActions = ['on', 'delete', 'kick', 'remove'];
      if (!validActions.includes(sub)) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Invalid option!\n│ Use: on, off, delete, kick\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      const action = sub === 'on' ? 'delete' : sub;
      updateChatData(chatId, 'antigroupmention', { enabled: true, action });
      return sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ Anti-Group Mention ENABLED\n│ Mode: ${action.toUpperCase()}\n│\n└─────────────────┘`
      }, { quoted: fake });
    }
  }
];

// ============================================================
// GROUP ANTI-MEDIA HANDLER FUNCTIONS (called from main.cjs)
// ============================================================
const { isSudo } = require('../lib/database');

async function _antiMediaAction(sock, chatId, message, senderId, type, cfg) {
  const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
  if (!isBotAdmin || isSenderAdmin || isSudo(senderId)) return;
  const botName = getBotName();
  const userTag = `@${senderId.split('@')[0]}`;

  // Delete the message
  try {
    await sock.sendMessage(chatId, {
      delete: { remoteJid: chatId, fromMe: false, id: message.key.id, participant: senderId }
    });
  } catch (e) { return; }

  if (cfg.action === 'kick') {
    await sock.sendMessage(chatId, {
      text: `┌─ *${botName}* ─┐\n│\n│ ${userTag} kicked!\n│ Reason: ${type} not allowed here.\n│\n└─────────────┘`,
      mentions: [senderId]
    });
    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
  } else if (cfg.action === 'warn') {
    // Track warn count
    const warnKey = `anti_${type}_warn_${senderId.split('@')[0]}`;
    const max = cfg.maxWarnings || 3;
    const count = (getChatData(chatId, warnKey, 0) || 0) + 1;
    updateChatData(chatId, warnKey, count);
    if (count >= max) {
      updateChatData(chatId, warnKey, 0);
      await sock.groupParticipantsUpdate(chatId, [senderId], 'remove').catch(() => {});
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ ${userTag} kicked!\n│ Max warnings reached (${max}).\n│ Reason: ${type} not allowed.\n│\n└─────────────┘`,
        mentions: [senderId]
      });
    } else {
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ ⚠️ Warning ${count}/${max}\n│ ${userTag}\n│ No ${type} allowed here!\n│\n└─────────────┘`,
        mentions: [senderId]
      });
    }
  } else {
    // Default: delete — quietly notify
    await sock.sendMessage(chatId, {
      text: `┌─ *${botName}* ─┐\n│\n│ ${userTag}\n│ ${type}s are not allowed here!\n│\n└─────────────┘`,
      mentions: [senderId]
    });
  }
}

async function handleImageDetection(sock, chatId, message, senderId) {
  try {
    const cfg = getChatData(chatId, 'antiimage', null);
    if (!cfg?.enabled) return;
    await _antiMediaAction(sock, chatId, message, senderId, 'image', cfg);
  } catch (e) {}
}

async function handleStickerDetection(sock, chatId, message, senderId) {
  try {
    const cfg = getChatData(chatId, 'antisticker', null);
    if (!cfg?.enabled) return;
    await _antiMediaAction(sock, chatId, message, senderId, 'sticker', cfg);
  } catch (e) {}
}

async function handleVideoDetection(sock, chatId, message, senderId) {
  try {
    const cfg = getChatData(chatId, 'antivideo', null);
    if (!cfg?.enabled) return;
    await _antiMediaAction(sock, chatId, message, senderId, 'video', cfg);
  } catch (e) {}
}

async function handleAudioDetection(sock, chatId, message, senderId) {
  try {
    const cfg = getChatData(chatId, 'antiaudio', null);
    if (!cfg?.enabled) return;
    await _antiMediaAction(sock, chatId, message, senderId, 'audio', cfg);
  } catch (e) {}
}

async function handleDocumentDetection(sock, chatId, message, senderId) {
  try {
    const cfg = getChatData(chatId, 'antidocument', null);
    if (!cfg?.enabled) return;
    await _antiMediaAction(sock, chatId, message, senderId, 'document', cfg);
  } catch (e) {}
}


async function handleAntiStatusMention(sock, m) {
  try {
    if (!m?.message) return;
    if (m.key.fromMe) return;

    const chatId = m.key.remoteJid;
    if (!chatId?.endsWith('@g.us')) return;

    const config = getChatData(chatId, 'antigroupmention', null);
    if (!config || !config.enabled) return;
    const mode = config.action || 'delete';
    if (mode === 'off') return;

    const sender = m.key.participant || m.key.remoteJid;

    const botPhone = (sock.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const senderPhone = (sender || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    if (botPhone && senderPhone && botPhone === senderPhone) return;
    if (isRateLimited(chatId, sender)) return;

    const allKeys = Object.keys(m.message || {})
      .filter(k => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage');
    const primaryType = allKeys[0];
    const isGroupStatusMention = primaryType === 'groupStatusMentionMessage';

    if (!isGroupStatusMention) {
      const ctxInfo = m.message?.extendedTextMessage?.contextInfo ||
                      m.message?.imageMessage?.contextInfo ||
                      m.message?.videoMessage?.contextInfo;
      const isForwarded = ctxInfo?.isForwarded;
      const forwardingScore = ctxInfo?.forwardingScore || 0;
      if (!isForwarded && forwardingScore === 0) return;
      const text = m.message?.extendedTextMessage?.text || m.message?.conversation || '';
      const groupIdPart = chatId.split('@')[0];
      if (!text.includes(groupIdPart)) return;
    }

    const botName = getBotName();
    const { isSudo } = require('../lib/database');
    const adminStatus = await isAdmin(sock, chatId, sender);
    const isSenderAdmin = adminStatus.isSenderAdmin;
    const isBotAdmin = adminStatus.isBotAdmin;

    if (isSenderAdmin || isSudo(sender)) return;

    if (!isBotAdmin) {
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ Cannot delete - I need admin!\n│\n└─────────────────┘`,
        ...channelInfo
      });
      return;
    }

    try {
      await sock.sendMessage(chatId, { delete: m.key });
    } catch (e) {
      return;
    }

    const userTag = `@${sender.split('@')[0]}`;

    if (mode === 'kick' || mode === 'remove') {
      try {
        await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ ${userTag}\n│ Kicked for group mention!\n│\n└─────────────────┘`,
          mentions: [sender],
          ...channelInfo
        });
      } catch (e) {
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ ${userTag}\n│ Message deleted.\n│ (Could not kick)\n│\n└─────────────────┘`,
          mentions: [sender],
          ...channelInfo
        });
      }
    } else {
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* ─┐\n│\n│ ${userTag}\n│ Message deleted!\n│ Don't mention this group\n│\n└─────────────────┘`,
        mentions: [sender],
        ...channelInfo
      });
    }
  } catch (err) {
    console.error('AntiGroupMention error:', err.message);
  }
}


module.exports.handleImageDetection = handleImageDetection;
module.exports.handleStickerDetection = handleStickerDetection;
module.exports.handleVideoDetection = handleVideoDetection;
module.exports.handleAudioDetection = handleAudioDetection;
module.exports.handleDocumentDetection = handleDocumentDetection;
module.exports.handleAntiStatusMention = handleAntiStatusMention;
