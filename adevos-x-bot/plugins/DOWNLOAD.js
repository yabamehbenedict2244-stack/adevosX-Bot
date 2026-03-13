const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');
const { getSetting } = require('../lib/database');

const AXIOS_OPTS = {
  timeout: 60000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
  }
};

async function tryRequest(fn, attempts = 2) {
  let err;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) { err = e; if (i < attempts - 1) await new Promise(r => setTimeout(r, 1500)); }
  }
  throw err;
}

async function downloadBuffer(url) {
  const res = await axios({ url, method: 'GET', responseType: 'arraybuffer', timeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 5,
    validateStatus: s => s >= 200 && s < 400 });
  const buf = Buffer.from(res.data);
  if (buf.length < 5000) throw new Error('File too small');
  const header = buf.slice(0, 50).toString().toLowerCase();
  if (header.includes('<!doctype') || header.includes('<html')) throw new Error('HTML response');
  return buf;
}

function getTempDir(sub = 'davex') {
  const dir = path.join(os.tmpdir(), 'adevos-x bot-' + sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ============================
// TIKTOK
// ============================
async function fetchTikTok(url) {
  const apis = [
    {
      name: 'iamtkm',
      url: `https://iamtkm.vercel.app/downloaders/tiktokdl?apikey=tkm&url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.no_watermark || d?.result?.watermark, title: d?.result?.title || 'TikTok' }),
      check: d => d?.status && d?.result
    },
    {
      name: 'Keith',
      url: `https://apiskeith.top/download/tiktok?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.no_watermark || d?.result?.video || d?.result?.url, title: d?.result?.title || 'TikTok' }),
      check: d => d?.status && d?.result
    },
    {
      name: 'BK9',
      url: `https://bk9.fun/download/tiktok?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.BK9?.no_watermark || d?.BK9?.video || d?.BK9?.url, title: d?.BK9?.title || 'TikTok' }),
      check: d => d?.BK9
    },
    {
      name: 'Dreaded',
      url: `https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.no_watermark || d?.result?.video || d?.result?.url, title: d?.result?.title || 'TikTok' }),
      check: d => d?.result
    },
    {
      name: 'Siputzx',
      url: `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.data?.no_watermark || d?.data?.video || d?.data?.url, title: d?.data?.title || 'TikTok' }),
      check: d => d?.data
    }
  ];
  for (const api of apis) {
    try {
      const res = await axios.get(api.url, { timeout: 15000 });
      if (api.check(res.data)) {
        const parsed = api.parse(res.data);
        if (parsed.video && typeof parsed.video === 'string' && parsed.video.startsWith('http')) return parsed;
      }
    } catch (e) {}
  }
  return null;
}

// ============================
// FACEBOOK
// ============================
async function fetchFacebook(url) {
  const apis = [
    {
      name: 'Keith',
      url: `https://apiskeith.top/download/facebook?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.hd || d?.result?.sd || d?.result?.url, title: d?.result?.title || 'Facebook' }),
      check: d => d?.status && d?.result
    },
    {
      name: 'Dreaded',
      url: `https://api.dreaded.site/api/facebook?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.hd || d?.result?.sd, title: d?.result?.title || 'Facebook' }),
      check: d => d?.result?.hd || d?.result?.sd
    },
    {
      name: 'Siputzx',
      url: `https://api.siputzx.my.id/api/d/fb?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.data?.hd || d?.data?.sd || d?.data?.url, title: 'Facebook' }),
      check: d => d?.data
    }
  ];
  for (const api of apis) {
    try {
      const res = await axios.get(api.url, { timeout: 15000 });
      if (api.check(res.data)) {
        const parsed = api.parse(res.data);
        if (parsed.video && typeof parsed.video === 'string' && parsed.video.startsWith('http')) return parsed;
      }
    } catch (e) {}
  }
  return null;
}

// ============================
// INSTAGRAM
// ============================
async function fetchInstagram(url) {
  const apis = [
    {
      name: 'Keith',
      url: `https://apiskeith.top/download/instagram?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.result?.video || d?.result?.url, image: d?.result?.image, title: 'Instagram' }),
      check: d => d?.status && d?.result
    },
    {
      name: 'Dreaded',
      url: `https://api.dreaded.site/api/igdl?url=${encodeURIComponent(url)}`,
      parse: d => {
        const items = d?.result?.data || d?.result || [];
        const item = Array.isArray(items) ? items[0] : items;
        return { video: item?.url, title: 'Instagram' };
      },
      check: d => d?.result
    },
    {
      name: 'Siputzx',
      url: `https://api.siputzx.my.id/api/d/ig?url=${encodeURIComponent(url)}`,
      parse: d => ({ video: d?.data?.url || d?.data?.video, title: 'Instagram' }),
      check: d => d?.data
    }
  ];
  for (const api of apis) {
    try {
      const res = await axios.get(api.url, { timeout: 15000 });
      if (api.check(res.data)) {
        const parsed = api.parse(res.data);
        if (parsed.video && typeof parsed.video === 'string' && parsed.video.startsWith('http')) return parsed;
        if (parsed.image && typeof parsed.image === 'string' && parsed.image.startsWith('http')) return parsed;
      }
    } catch (e) {}
  }
  return null;
}

// ============================
// YOUTUBE AUDIO
// ============================
async function fetchYtAudio(youtubeUrl) {
  const apis = [
    `https://api.giftedtech.co.ke/api/download/yta?apikey=gifted&url=${encodeURIComponent(youtubeUrl)}`,
    `https://apiskeith.top/download/audio?url=${encodeURIComponent(youtubeUrl)}`,
    `https://apiskeith.top/download/ytmp3?url=${encodeURIComponent(youtubeUrl)}`,
  ];
  for (const apiUrl of apis) {
    try {
      const res = await tryRequest(() => axios.get(apiUrl, AXIOS_OPTS));
      if (!res?.data) continue;
      const data = res.data;
      const result = data.result || data;
      let url = null;
      if (typeof result === 'string' && result.startsWith('http')) url = result;
      else url = result?.download_url || result?.download || result?.url || result?.downloadUrl || result?.link || null;
      if (url) return { download: url, title: result?.title || data?.title || 'YouTube Audio' };
    } catch (e) {}
  }
  throw new Error('All audio APIs failed');
}

// ============================
// YOUTUBE VIDEO
// ============================
async function fetchYtVideo(youtubeUrl) {
  const apis = [
    `https://apiskeith.top/download/ytmp4?url=${encodeURIComponent(youtubeUrl)}`,
    `https://api.giftedtech.co.ke/api/download/ytv?apikey=gifted&url=${encodeURIComponent(youtubeUrl)}`,
  ];
  for (const apiUrl of apis) {
    try {
      const res = await tryRequest(() => axios.get(apiUrl, AXIOS_OPTS));
      if (!res?.data) continue;
      const data = res.data;
      const result = data.result || data;
      let url = null;
      if (typeof result === 'string' && result.startsWith('http')) url = result;
      else url = result?.download_url || result?.download || result?.url || result?.downloadUrl || result?.link || null;
      if (url) return { download: url, title: result?.title || data?.title || 'YouTube Video' };
    } catch (e) {}
  }
  throw new Error('All video APIs failed');
}

module.exports = [
  // ============================
  // TIKTOK COMMAND
  // ============================
  {
    name: 'tiktok',
    aliases: ['tt', 'tk'],
    category: 'download',
    description: 'Download TikTok videos without watermark',
    usage: '.tiktok <url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const url = args.join(' ').trim();

      if (!url) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a TikTok link!\n│ .tiktok <url>\n│\n└─────────────────┘` }, { quoted: fake });
      }

      const tiktokPattern = /tiktok\.com\/|vm\.tiktok\.com\/|vt\.tiktok\.com\//;
      if (!tiktokPattern.test(url)) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Invalid TikTok link!\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const result = await fetchTikTok(url);
      if (!result?.video) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Download failed!\n│ Try again later.\n│\n└─────────────────┘` }, { quoted: fake });
      }

      try {
        await sock.sendMessage(chatId, {
          video: { url: result.video },
          mimetype: 'video/mp4',
          caption: `*${botName}*`,
          ...channelInfo
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (e) {
        try {
          const buf = await downloadBuffer(result.video);
          await sock.sendMessage(chatId, { video: buf, mimetype: 'video/mp4', caption: `*${botName}*`, ...channelInfo }, { quoted: fake });
          await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } catch (e2) {
          await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
          await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed to send video.\n│\n└─────────────────┘` }, { quoted: fake });
        }
      }
    }
  },

  // ============================
  // FACEBOOK COMMAND
  // ============================
  {
    name: 'facebook',
    aliases: ['fb'],
    category: 'download',
    description: 'Download Facebook videos',
    usage: '.facebook <url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const url = args.join(' ').trim();

      if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch'))) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a Facebook link!\n│ .facebook <url>\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      const result = await fetchFacebook(url);

      if (!result?.video) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Download failed!\n│\n└─────────────────┘` }, { quoted: fake });
      }

      try {
        await sock.sendMessage(chatId, { video: { url: result.video }, mimetype: 'video/mp4', caption: `*${botName}*`, ...channelInfo }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed to send video.\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // INSTAGRAM COMMAND
  // ============================
  {
    name: 'instagram',
    aliases: ['ig', 'insta'],
    category: 'download',
    description: 'Download Instagram photos/videos',
    usage: '.instagram <url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const url = args.join(' ').trim();

      if (!url || !url.includes('instagram.com')) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide an Instagram link!\n│ .instagram <url>\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      const result = await fetchInstagram(url);

      if (!result?.video && !result?.image) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Download failed!\n│\n└─────────────────┘` }, { quoted: fake });
      }

      try {
        if (result.video) {
          await sock.sendMessage(chatId, { video: { url: result.video }, mimetype: 'video/mp4', caption: `*${botName}*`, ...channelInfo }, { quoted: fake });
        } else if (result.image) {
          await sock.sendMessage(chatId, { image: { url: result.image }, caption: `*${botName}*`, ...channelInfo }, { quoted: fake });
        }
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed to send media.\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // PLAY COMMAND (YouTube audio)
  // ============================
  {
    name: 'play',
    aliases: ['song', 'music'],
    category: 'download',
    description: 'Download and send YouTube audio',
    usage: '.play <song name or url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const query = args.join(' ').trim();

      if (!query) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a song name!\n│ .play <song name>\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      let filePath = null;
      try {
        let ytUrl = query;
        if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
          const yts = require('yt-search');
          let search = await yts(`${query} official audio`);
          let video = search.videos[0];
          if (!video) { search = await yts(query); video = search.videos[0]; }
          if (!video) throw new Error('Song not found');
          ytUrl = video.url;
        }

        const audio = await fetchYtAudio(ytUrl);
        const tempDir = getTempDir('audio');
        const safeTitle = (audio.title || 'audio').replace(/[^\w\s-]/g, '').trim().substring(0, 50);
        filePath = path.join(tempDir, `audio_${Date.now()}_${safeTitle}.mp3`);

        const audioStream = await axios({ method: 'get', url: audio.download, responseType: 'stream', timeout: 120000 });
        const writer = fs.createWriteStream(filePath);
        audioStream.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) throw new Error('Download failed');

        const cleanTitle = (audio.title || 'audio').replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);

        await sock.sendMessage(chatId, {
          document: fs.readFileSync(filePath),
          mimetype: 'audio/mpeg',
          fileName: `${cleanTitle}.mp3`,
          ...channelInfo
        }, { quoted: fake });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (error) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${error.message}\n│\n└─────────────────┘` }, { quoted: fake });
      } finally {
        if (filePath && fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (e) {} }
      }
    }
  },

  // ============================
  // YTMP4 COMMAND (YouTube video)
  // ============================
  {
    name: 'ytmp4',
    aliases: ['ytvideo', 'yt'],
    category: 'download',
    description: 'Download YouTube video',
    usage: '.ytmp4 <url>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const url = args.join(' ').trim();

      if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Provide a YouTube link!\n│ .ytmp4 <url>\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      let filePath = null;
      try {
        const result = await fetchYtVideo(url);
        const tempDir = getTempDir('video');
        const safeTitle = (result.title || 'video').replace(/[^\w\s-]/g, '').trim().substring(0, 50);
        filePath = path.join(tempDir, `video_${Date.now()}_${safeTitle}.mp4`);

        const videoStream = await axios({ method: 'get', url: result.download, responseType: 'stream', timeout: 120000 });
        const writer = fs.createWriteStream(filePath);
        videoStream.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });

        if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) throw new Error('Download failed');

        const cleanTitle = (result.title || 'video').replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);

        await sock.sendMessage(chatId, {
          document: fs.readFileSync(filePath),
          mimetype: 'video/mp4',
          fileName: `${cleanTitle}.mp4`,
          caption: `*${botName}*\n${cleanTitle}`,
          ...channelInfo
        }, { quoted: fake });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (error) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${error.message}\n│\n└─────────────────┘` }, { quoted: fake });
      } finally {
        if (filePath && fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (e) {} }
      }
    }
  },

  // ============================
  // MEDIAFIRE
  // ============================
  {
    name: 'mediafire',
    aliases: ['mf'],
    category: 'download',
    description: 'Download file from MediaFire link',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const url = args.join(' ').trim();
      if (!url) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} MEDIAFIRE* ─┐\n│\n│ Download from MediaFire\n│\n│ Usage: .mediafire <link>\n│ Example:\n│ .mediafire https://www.mediafire.com/file/...\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (!url.includes('mediafire.com')) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ That doesn't look like a MediaFire link.\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const cheerio = require('cheerio');
        const res = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        const dlBtn = $('a#downloadButton');
        const dlLink = dlBtn.attr('href');
        const sizeText = dlBtn.text().replace('Download', '').replace(/[()]/g, '').trim();
        const parts = (dlLink || '').split('/');
        const fileName = parts[5] || `file_${Date.now()}`;
        const ext = fileName.split('.').pop().toLowerCase();

        const MIME_MAP = {
          zip: 'application/zip', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed',
          pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          mp3: 'audio/mpeg', mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', apk: 'application/vnd.android.package-archive'
        };
        const mimetype = MIME_MAP[ext] || 'application/octet-stream';

        if (!dlLink) throw new Error('Could not extract download link. File may be removed or private.');

        await sock.sendMessage(chatId, {
          document: { url: dlLink },
          fileName: fileName,
          mimetype: mimetype,
          caption: `┌─ *${botName} MEDIAFIRE* ─┐\n│\n│ ✦ File: ${fileName}\n│ ✦ Size: ${sizeText || 'Unknown'}\n│ ✦ Type: ${ext.toUpperCase()}\n│\n└─────────────────┘`
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${err.message}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }
    }
  }
];
