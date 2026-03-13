const axios = require('axios');

// Instant replies for common phrases — no API round-trip needed
const QUICK_REPLIES = {
  'hi': 'Hey! 👋 What\'s up?',
  'hello': 'Hello there! 😊 How can I help?',
  'hey': 'Hey! 😄 What\'s good?',
  'how are you': 'I\'m doing great, thanks for asking! 🤖✨',
  'what is your name': 'I\'m ADEVOS-X BOT, your personal WhatsApp assistant! 🚀',
  'who are you': 'I\'m ADEVOS-X BOT Bot — your AI-powered WhatsApp assistant! 🤖',
  'what can you do': 'I can chat, answer questions, help with info, play games and more! 🎯',
  'thanks': 'You\'re welcome! 😊',
  'thank you': 'Anytime! Happy to help! 😄',
  'bye': 'Goodbye! 👋 Take care!',
  'good morning': 'Good morning! ☀️ Hope you have a wonderful day!',
  'good night': 'Good night! 🌙 Sleep well!',
  'good afternoon': 'Good afternoon! 🌤️ How\'s your day going?',
  'good evening': 'Good evening! 🌆 How was your day?',
};

async function tryKeithGPT(text) {
  const res = await axios.get(
    `https://apiskeith.top/ai/gpt?q=${encodeURIComponent(text)}`,
    { timeout: 12000 }
  );
  if (res.data?.result && typeof res.data.result === 'string') return res.data.result.trim();
  return null;
}

async function tryKeithGemini(text) {
  const res = await axios.get(
    `https://apiskeith.top/ai/gemini?q=${encodeURIComponent(text)}`,
    { timeout: 12000 }
  );
  if (res.data?.result && typeof res.data.result === 'string') return res.data.result.trim();
  return null;
}

async function getReply(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // 1. Instant static replies
  for (const [key, val] of Object.entries(QUICK_REPLIES)) {
    if (lower === key || lower.startsWith(key + ' ') || lower.endsWith(' ' + key)) {
      return val;
    }
  }

  // 2. Keith GPT (primary)
  try {
    const reply = await tryKeithGPT(text);
    if (reply) return reply;
  } catch (_) {}

  // 3. Keith Gemini (secondary/fallback)
  try {
    const reply = await tryKeithGemini(text);
    if (reply) return reply;
  } catch (_) {}

  // 4. Content-aware final fallback
  if (lower.includes('weather')) return '☁️ I can\'t check live weather right now, try weather.com!';
  if (lower.includes('joke')) return 'Why don\'t scientists trust atoms? Because they make up everything! 😂';
  if (lower.includes('help')) return 'I\'m here! Try asking me anything or use the menu command. 🤖';
  if (lower.includes('love')) return '❤️ Love is beautiful!';

  return '🤖 Sorry, I couldn\'t connect to AI right now. Try again in a moment!';
}

module.exports = { getReply };
