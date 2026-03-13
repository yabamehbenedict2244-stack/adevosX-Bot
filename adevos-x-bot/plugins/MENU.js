const { getSetting, updateSetting } = require('../lib/database');
const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');
const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const os = require('os');
const fs = require('fs');

const more = String.fromCharCode(8206);
const readmore = more.repeat(4001);

const MENU_STYLES = {
  '1': 'Document (large thumbnail)',
  '2': 'Plain Text',
  '3': 'Text + Ad Reply',
  '4': 'Image + Caption',
};

function formatUptime() {
  let s = Math.floor(process.uptime());
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600);  s %= 3600;
  const m = Math.floor(s / 60);    s %= 60;
  let t = '';
  if (d) t += `${d}d `;
  if (h) t += `${h}h `;
  if (m) t += `${m}m `;
  t += `${s}s`;
  return t.trim();
}

function progressBar(used, total, size = 10) {
  const pct = Math.round((used / total) * size);
  return '█'.repeat(pct) + '░'.repeat(size - pct) + ` ${Math.round((used / total) * 100)}%`;
}

function generateMenuText(pushname, ping) {
  const prefix   = getSetting('prefix', '.');
  const botName  = getBotName();
  const owner    = getSetting('ownerName', 'DAVEX');
  const version  = global.version || '3.0.0';
  const mode     = global.mode || getSetting('mode', 'public');
  const uptime   = formatUptime();
  const totalMem = os.totalmem();
  const usedMem  = totalMem - os.freemem();
  const ram      = progressBar(usedMem, totalMem);

  const hour = new Date().getHours();
  let greeting = 'Hello';
  if (hour >= 5  && hour < 12) greeting = 'Good Morning';
  else if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
  else if (hour >= 17 && hour < 21) greeting = 'Good Evening';
  else greeting = 'Good Night';

  let menu = `${greeting}, ${pushname || 'User'} 👋\n`;
  menu += `━━━━━━━━━━━━━━\n\n`;
  menu += `┏▣ ◈ *${botName}* ◈\n`;
  menu += `┃ *Owner*   : ${owner}\n`;
  menu += `┃ *Prefix*  : [ ${prefix} ]\n`;
  menu += `┃ *Mode*    : ${mode}\n`;
  menu += `┃ *Version* : v${version}\n`;
  menu += `┃ *Speed*   : ${ping} ms\n`;
  menu += `┃ *Uptime*  : ${uptime}\n`;
  menu += `┃ *RAM*     : ${ram}\n`;
  menu += `┗▣\n`;
  menu += readmore + '\n';

  const categories = global.fileCategories || {};
  const catKeys = Object.keys(categories);
  const sorted = [
    ...(['owner'].filter(c => catKeys.includes(c))),
    ...catKeys.filter(c => c !== 'owner' && c !== 'menu').sort(),
    ...(['menu'].filter(c => catKeys.includes(c))),
  ];

  for (const cat of sorted) {
    const cmds = (categories[cat] || []).sort();
    if (!cmds.length) continue;
    menu += `┏▣ ◈ *${cat.toUpperCase()}* ◈\n`;
    for (const cmd of cmds) menu += `│› ${prefix}${cmd}\n`;
    menu += `┗▣\n`;
    menu += readmore + '\n';
  }

  return menu;
}

async function loadThumbnail() {
  try {
    const menuImage = getSetting('menuimage', '');
    if (menuImage && menuImage.startsWith('http')) {
      const https = require('https');
      const http  = require('http');
      const lib   = menuImage.startsWith('https') ? https : http;
      return await new Promise((resolve, reject) => {
        lib.get(menuImage, res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      });
    }
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
  } catch {
    return Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
  }
}

async function sendMenu(sock, chatId, message, menuText, style, thumbnail, pushname) {
  const fakeContact = createFakeContact(message);
  const botName = getBotName();
  const sourceUrl = 'https://github.com/gifteddevsmd';

  if (style === '1') {
    await sock.sendMessage(chatId, {
      document: { url: 'https://i.ibb.co/2W0H9Jq/avatar-contact.png' },
      caption: menuText,
      mimetype: 'application/zip',
      fileName: botName,
      fileLength: '9999999',
      contextInfo: {
        externalAdReply: {
          showAdAttribution: false,
          title: botName,
          body: pushname || '',
          thumbnail,
          sourceUrl,
          mediaType: 1,
          renderLargerThumbnail: true,
        },
      },
    }, { quoted: fakeContact });

  } else if (style === '2') {
    await sock.sendMessage(chatId, { text: menuText }, { quoted: fakeContact });

  } else if (style === '3') {
    await sock.sendMessage(chatId, {
      text: menuText,
      contextInfo: {
        externalAdReply: {
          showAdAttribution: false,
          title: botName,
          body: pushname || '',
          thumbnail,
          sourceUrl,
          mediaType: 1,
          renderLargerThumbnail: true,
        },
      },
    }, { quoted: fakeContact });

  } else if (style === '4') {
    await sock.sendMessage(chatId, {
      image: thumbnail,
      caption: menuText,
    }, { quoted: fakeContact });

  } else {
    await sock.sendMessage(chatId, { text: menuText }, { quoted: fakeContact });
  }
}

module.exports = [
  {
    name: 'menu',
    aliases: ['commands', 'help', 'list', 'm'],
    category: 'menu',
    description: 'Show all bot commands',
    execute: async (sock, message, args, context) => {
      try {
        const { chatId } = context;
        const pushname  = message.pushName || context?.pushName || '';
        const style     = getSetting('menustyle', '2');

        const pingStart = Date.now();
        await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
        const ping = Date.now() - pingStart;

        const menuText  = generateMenuText(pushname, ping);
        const thumbnail = await loadThumbnail();

        await sendMenu(sock, chatId, message, menuText, style, thumbnail, pushname);
      } catch (err) {
        console.error('[ADEVOS-X BOT] Menu error:', err.message);
        await context.reply('Error generating menu. Please try again.').catch(() => {});
      }
    }
  },

  {
    name: 'setmenu',
    aliases: ['menustyle'],
    category: 'settings',
    description: 'Set menu style (1-4)',
    execute: async (sock, message, args, context) => {
      if (!context.senderIsSudo) return context.reply('Owner only.');
      const s = args[0];
      if (!s || !['1','2','3','4'].includes(s))
        return context.reply(`Invalid style. Use 1-4:\n1 - Document\n2 - Plain Text\n3 - Ad Reply\n4 - Image`);
      updateSetting('menustyle', s);
      await context.reply(`✅ Menu style set to *${s}* — ${MENU_STYLES[s]}`);
    }
  },

  {
    name: 'setmenuimg',
    aliases: ['menuimage', 'setmenuimage'],
    category: 'settings',
    description: 'Set custom menu thumbnail URL',
    execute: async (sock, message, args, context) => {
      if (!context.senderIsSudo) return context.reply('Owner only.');
      const url = args.join(' ').trim();
      if (!url) return context.reply('Provide an image URL or "off" to reset.');
      if (url.toLowerCase() === 'off') {
        updateSetting('menuimage', '');
        return context.reply('✅ Menu image reset to default.');
      }
      if (!url.startsWith('http')) return context.reply('Provide a valid URL starting with http/https.');
      updateSetting('menuimage', url);
      await context.reply(`✅ Menu image set.`);
    }
  },

  {
    name: 'menuinfo',
    aliases: ['menudetails'],
    category: 'settings',
    description: 'Show current menu settings',
    execute: async (sock, message, args, context) => {
      const style = getSetting('menustyle', '1');
      const img   = getSetting('menuimage', '') || 'Default';
      const cats  = global.fileCategories || {};
      const total = Object.values(cats).reduce((t, c) => t + c.length, 0);
      await context.reply(
        `*Menu Settings*\n\nStyle: ${style} — ${MENU_STYLES[style] || '?'}\nImage: ${img}\nTotal Commands: ${total}\n\n*Styles:*\n1 - Document\n2 - Plain Text\n3 - Ad Reply\n4 - Image`
      );
    }
  }
];
