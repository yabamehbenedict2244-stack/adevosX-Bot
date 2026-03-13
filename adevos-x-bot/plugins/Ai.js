const axios = require('axios');
const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');

module.exports = [
  // ============================
  // CHATGPT / AI
  // ============================
  {
    name: 'ai',
    aliases: ['chatgpt', 'gpt', 'ask'],
    category: 'ai',
    description: 'Ask the AI a question',
    usage: '.ai <question>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const question = args.join(' ').trim();

      if (!question) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Ask me anything!\n│ .ai <question>\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      const apis = [
        async () => {
          const res = await axios.get(
            `https://apiskeith.top/ai/gpt4?text=${encodeURIComponent(question)}`,
            { timeout: 20000 }
          );
          return res.data?.result || res.data?.message || res.data?.response || null;
        },
        async () => {
          const res = await axios.get(
            `https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(question)}`,
            { timeout: 20000 }
          );
          return res.data?.result || res.data?.message || null;
        },
        async () => {
          const res = await axios.get(
            `https://bk9.fun/ai/chatgpt?text=${encodeURIComponent(question)}`,
            { timeout: 15000 }
          );
          return res.data?.BK9 || null;
        }
      ];

      let answer = null;
      for (const api of apis) {
        try {
          answer = await api();
          if (answer && typeof answer === 'string' && answer.trim()) break;
        } catch (e) {}
      }

      if (!answer) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ AI failed. Try again later.\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      await sock.sendMessage(chatId, {
        text: `┌─ *${botName}* AI ─┐\n│\n│ Q: ${question.substring(0, 50)}\n│\n${answer}\n│\n└─────────────────┘`,
        ...channelInfo
      }, { quoted: fake });
    }
  },

  // ============================
  // IMAGINE (image generation)
  // ============================
  {
    name: 'imagine',
    aliases: ['dalle', 'dream', 'genimage'],
    category: 'ai',
    description: 'Generate AI image',
    usage: '.imagine <prompt>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const prompt = args.join(' ').trim();

      if (!prompt) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Provide a prompt!\n│ .imagine <prompt>\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

      try {
        const apis = [
          `https://apiskeith.top/ai/dalle?prompt=${encodeURIComponent(prompt)}`,
          `https://apiskeith.top/ai/flux?q=${encodeURIComponent(prompt)}`,
        ];

        let imageUrl = null;
        for (const apiUrl of apis) {
          try {
            const res = await axios.get(apiUrl, { timeout: 30000 });
            imageUrl = res.data?.result?.url || res.data?.url || res.data?.image || null;
            if (imageUrl) break;
          } catch (e) {}
        }

        if (!imageUrl) throw new Error('All image APIs failed');

        await sock.sendMessage(chatId, {
          image: { url: imageUrl },
          caption: `*${botName}* AI Image\n${prompt}`,
          ...channelInfo
        }, { quoted: fake });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      } catch (error) {
        await sock.sendMessage(chatId, { react: { text: '', key: message.key } });
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Image generation failed.\n│ ${error.message}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }
    }
  }
];
