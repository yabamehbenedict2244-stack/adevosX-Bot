'use strict';

const axios = require('axios');
const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');

const BASE = 'https://apiskeith.top';
const OPTS = { timeout: 20000, headers: { 'User-Agent': 'ADEVOS-X BOT/3.0' } };

function fmt(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && v !== undefined && v !== '') lines.push(`│ ${k}: ${v}`);
  }
  return lines.join('\n');
}

async function keithGet(path) {
  const res = await axios.get(`${BASE}${path}`, OPTS);
  return res.data;
}

const LEAGUES = {
  epl: 'EPL', laliga: 'La Liga', bundesliga: 'Bundesliga',
  seriea: 'Serie A', ligue1: 'Ligue 1', ucl: 'UCL', euros: 'Euros',
  fifa: 'FIFA'
};

function formatMatchList(matches, botName, leagueName, type) {
  if (!matches || !matches.length) return `┌─ *${botName}* ─┐\n│\n│ No ${type} found.\n│\n└─────────────────┘`;
  const lines = matches.slice(0, 15).map(m => {
    if (type === 'standings' || m.position) {
      return `│ ${m.position || m.pos || '-'}. ${m.team || m.name} — P${m.played || m.gp || '?'} W${m.won || m.w || '?'} D${m.drawn || m.d || '?'} L${m.lost || m.l || '?'} Pts:${m.points || m.pts || '?'}`;
    }
    if (type === 'scorers') {
      return `│ ${m.position || m.rank || '-'}. ${m.player || m.name} (${m.team || ''}) — ${m.goals || m.score || '?'} goals`;
    }
    const score = m.score || m.result || (m.homeScore !== undefined ? `${m.homeScore}-${m.awayScore}` : '?-?');
    return `│ ${m.home || m.homeTeam || m.p1 || '?'} ${score} ${m.away || m.awayTeam || m.p2 || '?'} [${m.date || m.matchDate || m.dt || '?'}]`;
  });
  return `┌─ *${botName}* ─┐\n│\n│ *${leagueName} ${type.toUpperCase()}*\n│\n${lines.join('\n')}\n│\n└─────────────────┘`;
}

function formatLiveScores(data, botName) {
  const games = data?.result?.games;
  if (!games || !Object.keys(games).length) return `┌─ *${botName}* ─┐\n│\n│ No live matches right now.\n│\n└─────────────────┘`;

  const lines = Object.values(games).slice(0, 12).map(g => {
    const status = g.R?.st || '?';
    const score  = `${g.R?.r1 ?? '?'}-${g.R?.r2 ?? '?'}`;
    return `│ ${g.p1} *${score}* ${g.p2} [${status}]`;
  });
  return `┌─ *${botName}* ─┐\n│\n│ ⚽ *LIVE SCORES*\n│\n${lines.join('\n')}\n│\n└─────────────────┘`;
}

module.exports = [
  // ============================
  // SPORTS MENU
  // ============================
  {
    name: 'sportsmenu',
    aliases: ['sportshelp', 'footballmenu'],
    category: 'sports',
    description: 'Show sports commands menu',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const prefix = global.prefix || '.';
      const text = `┌─ *${botName} SPORTS* ─┐
│
│ ⚽ *Live & Scores*
│ ${prefix}livescore — Live football scores
│
│ 🏆 *League Commands*
│ Use with: epl, laliga, bundesliga
│             seriea, ligue1, ucl
│
│ ${prefix}standings <league>
│ ${prefix}fixtures <league>
│ ${prefix}scorers <league>
│ ${prefix}upcoming <league>
│
│ 🔍 *Search*
│ ${prefix}playersearch <name>
│ ${prefix}teamsearch <name>
│
│ 📋 Examples:
│ ${prefix}standings epl
│ ${prefix}scorers laliga
│ ${prefix}fixtures bundesliga
│
└─────────────────┘`;
      await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
    }
  },

  // ============================
  // LIVE SCORE
  // ============================
  {
    name: 'livescore',
    aliases: ['livescores', 'live', 'scores'],
    category: 'sports',
    description: 'Get current football live scores',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const data = await keithGet('/livescore');
        const text = formatLiveScores(data, botName);
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // STANDINGS
  // ============================
  {
    name: 'standings',
    aliases: ['table', 'leaguetable'],
    category: 'sports',
    description: 'Get league standings (epl, laliga, bundesliga, seriea, ligue1, ucl)',
    usage: '.standings <league>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const league = (args[0] || '').toLowerCase().trim();
      if (!league || !LEAGUES[league]) {
        const leagueList = Object.keys(LEAGUES).join(', ');
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Usage: .standings <league>\n│\n│ Leagues: ${leagueList}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const data = await keithGet(`/${league}/standings`);
        const raw = data?.result || data?.data || data?.standings || data;
        const matches = Array.isArray(raw) ? raw : Object.values(raw || {});
        const text = formatMatchList(matches, botName, LEAGUES[league], 'standings');
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // FIXTURES / MATCHES
  // ============================
  {
    name: 'fixtures',
    aliases: ['matches', 'results'],
    category: 'sports',
    description: 'Get league match fixtures/results (epl, laliga, bundesliga, seriea, ligue1)',
    usage: '.fixtures <league>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const league = (args[0] || '').toLowerCase().trim();
      if (!league || !LEAGUES[league]) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Usage: .fixtures <league>\n│ Leagues: ${Object.keys(LEAGUES).join(', ')}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const data = await keithGet(`/${league}/matches`);
        const raw = data?.result || data?.data || data?.matches || data;
        const matches = Array.isArray(raw) ? raw : Object.values(raw || {});
        const text = formatMatchList(matches, botName, LEAGUES[league], 'matches');
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // UPCOMING MATCHES
  // ============================
  {
    name: 'upcoming',
    aliases: ['nextgames', 'schedule'],
    category: 'sports',
    description: 'Get upcoming league matches',
    usage: '.upcoming <league>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const league = (args[0] || '').toLowerCase().trim();
      if (!league || !LEAGUES[league]) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Usage: .upcoming <league>\n│ Leagues: ${Object.keys(LEAGUES).join(', ')}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const data = await keithGet(`/${league}/upcomingmatches`);
        const raw = data?.result || data?.data || data?.matches || data;
        const matches = Array.isArray(raw) ? raw : Object.values(raw || {});
        const text = formatMatchList(matches, botName, LEAGUES[league], 'upcoming');
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // TOP SCORERS
  // ============================
  {
    name: 'scorers',
    aliases: ['topscorers', 'goals'],
    category: 'sports',
    description: 'Get top goal scorers (epl, laliga, bundesliga, seriea, ligue1)',
    usage: '.scorers <league>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const league = (args[0] || '').toLowerCase().trim();
      if (!league || !LEAGUES[league]) {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName}* ─┐\n│\n│ Usage: .scorers <league>\n│ Leagues: ${Object.keys(LEAGUES).join(', ')}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const data = await keithGet(`/${league}/scorers`);
        const raw = data?.result || data?.data || data?.scorers || data;
        const matches = Array.isArray(raw) ? raw : Object.values(raw || {});
        const text = formatMatchList(matches, botName, LEAGUES[league], 'scorers');
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // PLAYER SEARCH
  // ============================
  {
    name: 'playersearch',
    aliases: ['player', 'footballer'],
    category: 'sports',
    description: 'Search for a football player',
    usage: '.playersearch <name>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const query = args.join(' ').trim();
      if (!query) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Usage: .playersearch <name>\n│ Example: .playersearch Bukayo Saka\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const data = await keithGet(`/sport/playersearch?q=${encodeURIComponent(query)}`);
        const p = data?.result || data?.data || data?.player || data;
        const info = Array.isArray(p) ? p[0] : p;
        if (!info) throw new Error('Player not found');

        const text = `┌─ *${botName}* ─┐
│
│ *Player Info*
│ Name: ${info.name || info.strPlayer || query}
│ Team: ${info.team || info.strTeam || '?'}
│ Nationality: ${info.nationality || info.strNationality || '?'}
│ Position: ${info.position || info.strPosition || '?'}
│ Age: ${info.age || info.intBorn || '?'}
│ Shirt: ${info.shirt || info.intSoccerXMLTeamID || '?'}
│
└─────────────────┘`;
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  },

  // ============================
  // TEAM SEARCH
  // ============================
  {
    name: 'teamsearch',
    aliases: ['team', 'clubsearch'],
    category: 'sports',
    description: 'Search for a football team/club',
    usage: '.teamsearch <name>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);

      const query = args.join(' ').trim();
      if (!query) {
        return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Usage: .teamsearch <name>\n│ Example: .teamsearch Arsenal\n│\n└─────────────────┘` }, { quoted: fake });
      }

      await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
      try {
        const data = await keithGet(`/sport/teamsearch?q=${encodeURIComponent(query)}`);
        const t = data?.result || data?.data || data?.team || data;
        const info = Array.isArray(t) ? t[0] : t;
        if (!info) throw new Error('Team not found');

        const text = `┌─ *${botName}* ─┐
│
│ *Team Info*
│ Name: ${info.name || info.strTeam || query}
│ Country: ${info.country || info.strCountry || '?'}
│ League: ${info.league || info.strLeague || '?'}
│ Stadium: ${info.stadium || info.strStadium || '?'}
│ Founded: ${info.founded || info.intFormedYear || '?'}
│ Manager: ${info.manager || info.strManager || '?'}
│
└─────────────────┘`;
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: fake });
      } catch (e) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│\n│ Failed: ${e.message}\n│\n└─────────────────┘` }, { quoted: fake });
      }
    }
  }
];
