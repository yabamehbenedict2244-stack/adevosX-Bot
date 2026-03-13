'use strict';

const axios = require('axios');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');
const { getSetting } = require('../lib/database');

async function dlBuffer(msgObj, type) {
  const stream = await downloadContentFromMessage(msgObj, type);
  let buf = Buffer.alloc(0);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

async function uploadToCatbox(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buffer, { filename, contentType: mimetype });
  const res = await axios.post('https://catbox.moe/user.php', form, {
    headers: form.getHeaders(),
    timeout: 60000
  });
  const url = (res.data || '').trim();
  if (!url.startsWith('http')) throw new Error('Catbox upload failed: ' + url);
  return url;
}

function getQuotedMedia(message) {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return null;
  const types = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
  for (const t of types) {
    if (quoted[t]) return { type: t, msg: quoted[t] };
  }
  return null;
}

module.exports = [
  // ============================
  // TOURL
  // ============================
  {
    name: 'tourl',
    aliases: ['upload', 'getlink', 'fileurl'],
    category: 'tools',
    description: 'Upload any media/file and get a direct URL',
    usage: '.tourl (reply to any media)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const media = getQuotedMedia(message);
      if (!media) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Reply to any media!\n│ .tourl (reply to image/video/audio/sticker)\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const typeMap = {
          imageMessage: { ext: 'jpg', mime: 'image/jpeg', dl: 'image' },
          videoMessage: { ext: 'mp4', mime: 'video/mp4', dl: 'video' },
          audioMessage: { ext: 'mp3', mime: 'audio/mpeg', dl: 'audio' },
          stickerMessage: { ext: 'webp', mime: 'image/webp', dl: 'sticker' },
          documentMessage: { ext: media.msg.fileName?.split('.').pop() || 'bin', mime: media.msg.mimetype || 'application/octet-stream', dl: 'document' }
        };
        const info = typeMap[media.type] || { ext: 'bin', mime: 'application/octet-stream', dl: media.type.replace('Message', '') };
        const buf = await dlBuffer(media.msg, info.dl);
        const url = await uploadToCatbox(buf, `davex_${Date.now()}.${info.ext}`, info.mime);

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ ✅ Uploaded!\n│\n│ *URL:*\n│ ${url}\n│\n│ Size: ${(buf.length / 1024).toFixed(1)} KB\n│\n└─────────────────┘`,
          ...channelInfo
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // COPY (forward without forward tag)
  // ============================
  {
    name: 'copy',
    aliases: ['forward', 'fwd'],
    category: 'tools',
    description: 'Copy/forward a message without the forwarded label',
    usage: '.copy (reply to any message)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const ctx = message.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      if (!quoted) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Reply to a message to copy it!\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      try {
        const msgTypes = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
        const foundType = msgTypes.find(t => quoted[t]);
        if (!foundType) {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Can't copy this message type.\n│\n└─────────────────┘` }, { quoted: fake });
        }

        if (foundType === 'conversation' || foundType === 'extendedTextMessage') {
          const text = quoted.conversation || quoted.extendedTextMessage?.text || '';
          await sock.sendMessage(chatId, { text }, { quoted: fake });
        } else {
          const mediaMap = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };
          const dlType = mediaMap[foundType];
          const buf = await dlBuffer(quoted[foundType], dlType);
          const sendObj = { [dlType]: buf };
          if (quoted[foundType]?.caption) sendObj.caption = quoted[foundType].caption;
          if (quoted[foundType]?.mimetype) sendObj.mimetype = quoted[foundType].mimetype;
          if (foundType === 'documentMessage') sendObj.fileName = quoted[foundType].fileName || 'file';
          if (foundType === 'audioMessage' && quoted[foundType].ptt) sendObj.ptt = true;
          await sock.sendMessage(chatId, sendObj, { quoted: fake });
        }
      } catch (e) {
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // TOIMAGE (sticker/gif → image)
  // ============================
  {
    name: 'toimage',
    aliases: ['stickertoimage', 'webptoimage', 'togif'],
    category: 'tools',
    description: 'Convert sticker to image (PNG)',
    usage: '.toimage (reply to sticker)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const mediaMsg = quoted?.stickerMessage || quoted?.imageMessage;
      if (!mediaMsg) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Reply to a sticker!\n│ .toimage (reply to sticker)\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const dlType = quoted.stickerMessage ? 'sticker' : 'image';
        const buf = await dlBuffer(mediaMsg, dlType);

        await sock.sendMessage(chatId, {
          image: buf,
          caption: `┌─ *${botName}* ─┐\n│ Converted to Image\n└─────────────────┘`,
          ...channelInfo
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // TOVIDEO (animated sticker/gif → video)
  // ============================
  {
    name: 'tovideo',
    aliases: ['stickertovideo', 'gifvideo', 'webptovideo'],
    category: 'tools',
    description: 'Convert animated sticker to video',
    usage: '.tovideo (reply to animated sticker)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const mediaMsg = quoted?.stickerMessage || quoted?.videoMessage;
      if (!mediaMsg) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Reply to an animated sticker!\n│ .tovideo (reply to sticker)\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const dlType = quoted.stickerMessage ? 'sticker' : 'video';
        const buf = await dlBuffer(mediaMsg, dlType);

        await sock.sendMessage(chatId, {
          video: buf,
          mimetype: 'video/mp4',
          caption: `┌─ *${botName}* ─┐\n│ Converted to Video\n└─────────────────┘`,
          ...channelInfo
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // SAVE STATUS
  // ============================
  {
    name: 'save',
    aliases: ['savestatus', 'dl', 'download'],
    category: 'tools',
    description: 'Save a status/message and send to your private chat',
    usage: '.save (reply to any status or media)',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const media = getQuotedMedia(message);
      const quotedText = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const textContent = quotedText?.conversation || quotedText?.extendedTextMessage?.text;

      if (!media && !textContent) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Reply to a status or message to save it!\n│ .save (reply to media or text)\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const ownerNum = getSetting('ownerNumber', '');
        const privateJid = ownerNum ? `${ownerNum.replace(/[^0-9]/g, '')}@s.whatsapp.net` : senderId;

        if (textContent && !media) {
          await sock.sendMessage(privateJid, {
            text: `┌─ *${botName}* ─┐\n│ Saved Status\n│\n│ ${textContent}\n│\n└─────────────────┘`
          });
        } else {
          const typeMap = {
            imageMessage: { ext: 'jpg', mime: 'image/jpeg', dl: 'image' },
            videoMessage: { ext: 'mp4', mime: 'video/mp4', dl: 'video' },
            audioMessage: { ext: 'mp3', mime: 'audio/mpeg', dl: 'audio' },
            stickerMessage: { ext: 'webp', mime: 'image/webp', dl: 'sticker' },
            documentMessage: { ext: 'bin', mime: media.msg.mimetype || 'application/octet-stream', dl: 'document' }
          };
          const info = typeMap[media.type] || { ext: 'bin', mime: 'application/octet-stream', dl: media.type.replace('Message', '') };
          const buf = await dlBuffer(media.msg, info.dl);
          const caption = `┌─ *${botName}* ─┐\n│ Saved from status\n└─────────────────┘`;

          const sendObj = media.type === 'imageMessage'
            ? { image: buf, caption }
            : media.type === 'videoMessage'
              ? { video: buf, mimetype: 'video/mp4', caption }
              : media.type === 'audioMessage'
                ? { audio: buf, mimetype: info.mime, ptt: media.msg.ptt || false }
                : media.type === 'stickerMessage'
                  ? { sticker: buf }
                  : { document: buf, mimetype: info.mime, fileName: media.msg.fileName || `saved.${info.ext}`, caption };

          await sock.sendMessage(privateJid, sendObj);
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ ✅ Saved to your private chat!\n│\n└─────────────────┘`
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // SHORTURL
  // ============================
  {
    name: 'shorturl',
    aliases: ['shorten', 'tinyurl'],
    category: 'tools',
    description: 'Shorten a long URL',
    usage: '.shorturl <url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const url = args.join(' ').trim();
      if (!url || !url.startsWith('http')) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a valid URL!\n│ .shorturl <url>\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const apis = [
          async () => {
            const r = await axios.get(`https://apiskeith.top/shortener/tinyurl?url=${encodeURIComponent(url)}`, { timeout: 10000 });
            return r.data?.result || r.data?.url || r.data?.shortUrl || null;
          },
          async () => {
            const r = await axios.get(`https://api.dreaded.site/api/tinyurl?url=${encodeURIComponent(url)}`, { timeout: 10000 });
            return r.data?.result || r.data?.url || null;
          },
          async () => {
            const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout: 10000 });
            return typeof r.data === 'string' && r.data.startsWith('http') ? r.data : null;
          }
        ];
        let short = null;
        for (const api of apis) {
          try { short = await api(); if (short) break; } catch (e) {}
        }
        if (!short) throw new Error('All shorteners failed');

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ *Shortened URL*\n│\n│ Original: ${url.substring(0, 60)}...\n│ Short: ${short}\n│\n└─────────────────┘`,
          ...channelInfo
        }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // SCREENSHOT
  // ============================
  {
    name: 'screenshot',
    aliases: ['ss', 'webss', 'scrop'],
    category: 'tools',
    description: 'Take a screenshot of any website',
    usage: '.screenshot <url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const url = args.join(' ').trim();
      if (!url || !url.startsWith('http')) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a valid URL!\n│ .screenshot https://example.com\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const apis = [
          async () => {
            const r = await axios.get(`https://apiskeith.top/tool/screenshot?url=${encodeURIComponent(url)}`, { timeout: 30000, responseType: 'arraybuffer' });
            if (r.data && r.data.byteLength > 5000) return Buffer.from(r.data);
            const j = JSON.parse(Buffer.from(r.data).toString());
            const imgUrl = j?.result?.url || j?.url || j?.result;
            if (imgUrl) {
              const img = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
              return Buffer.from(img.data);
            }
            return null;
          },
          async () => {
            const r = await axios.get(`https://api.dreaded.site/api/screenshot?url=${encodeURIComponent(url)}`, { timeout: 30000, responseType: 'arraybuffer' });
            return Buffer.from(r.data);
          }
        ];

        let imgBuf = null;
        for (const api of apis) {
          try { imgBuf = await api(); if (imgBuf && imgBuf.length > 1000) break; } catch (e) {}
        }
        if (!imgBuf || imgBuf.length < 1000) throw new Error('Screenshot APIs failed');

        await sock.sendMessage(chatId, {
          image: imgBuf,
          caption: `┌─ *${botName}* ─┐\n│ Screenshot: ${url.substring(0, 50)}\n└─────────────────┘`,
          ...channelInfo
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  }
];
