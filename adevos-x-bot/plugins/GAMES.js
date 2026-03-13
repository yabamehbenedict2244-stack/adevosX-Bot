'use strict';
const { getBotName, createFakeContact, channelInfo } = require('../lib/messageConfig');

// ============================================================
// WORD CHAIN GAME
// ============================================================
class WordChainGame {
  constructor(chatId) {
    this.chatId = chatId;
    this.players = new Map();
    this.usedWords = new Set();
    this.lastWord = '';
    this.currentPlayer = null;
    this.turnOrder = [];
    this.turnIndex = 0;
    this.active = false;
    this.scores = new Map();
    this.aiMode = false;
    this.turnTimer = null;
    this.TURN_TIMEOUT = 60000;
  }

  addPlayer(jid, name) {
    if (this.players.has(jid)) return false;
    this.players.set(jid, name);
    this.scores.set(jid, 0);
    return true;
  }

  start(startWord, aiMode = false) {
    if (this.players.size < (aiMode ? 1 : 2)) return false;
    this.active = true;
    this.aiMode = aiMode;
    this.usedWords.clear();
    this.lastWord = startWord.toLowerCase();
    this.usedWords.add(this.lastWord);
    this.turnOrder = [...this.players.keys()];
    if (aiMode && !this.turnOrder.includes('__AI__')) this.turnOrder.push('__AI__');
    this.turnIndex = 0;
    this.currentPlayer = this.turnOrder[0];
    return true;
  }

  submitWord(jid, word) {
    word = word.toLowerCase().trim();
    if (!this.active) return { ok: false, reason: 'not_started' };
    if (this.currentPlayer !== jid) return { ok: false, reason: 'not_your_turn' };
    if (word[0] !== this.lastWord[this.lastWord.length - 1]) return { ok: false, reason: 'wrong_start', expected: this.lastWord[this.lastWord.length - 1] };
    if (this.usedWords.has(word)) return { ok: false, reason: 'already_used' };
    if (word.length < 2) return { ok: false, reason: 'too_short' };
    if (!/^[a-z]+$/.test(word)) return { ok: false, reason: 'invalid_chars' };

    this.usedWords.add(word);
    this.lastWord = word;
    const pts = word.length;
    this.scores.set(jid, (this.scores.get(jid) || 0) + pts);
    this.nextTurn();
    return { ok: true, pts };
  }

  nextTurn() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
    this.currentPlayer = this.turnOrder[this.turnIndex];
  }

  getAiWord() {
    const lastChar = this.lastWord[this.lastWord.length - 1];
    const candidates = AI_WORD_LIST.filter(w =>
      w[0] === lastChar && !this.usedWords.has(w) && w.length >= 3
    );
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  getScores() {
    const lines = [];
    for (const [jid, name] of this.players) {
      if (jid === '__AI__') continue;
      lines.push(`${name}: ${this.scores.get(jid) || 0} pts`);
    }
    return lines.join('\n');
  }

  end() {
    this.active = false;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    let winner = null;
    let max = -1;
    for (const [jid, score] of this.scores) {
      if (jid === '__AI__') continue;
      if (score > max) { max = score; winner = this.players.get(jid); }
    }
    return { winner, scores: this.getScores() };
  }
}

const AI_WORD_LIST = [
  'apple','elephant','tiger','rain','nature','egg','great','table','engine','every',
  'year','ring','gate','eagle','light','top','pen','night','tree','easy','year',
  'road','dance','ear','rose','edge','game','enter','red','door','right','tall',
  'link','king','god','diamond','moon','name','earth','home','end','dog','grow',
  'water','real','leaf','fan','nest','time','early','yarn','need','dream','magic',
  'ice','cave','evening','girl','list','trunk','kin','night','grace','edge',
  'lamp','pear','river','run','north','hat','type','eat','art','ten','net','time',
  'iron','ocean','node','empty','yawn','wall','low','well','late','elder','ring',
  'giant','tiger','error','race','calm','money','yarn','nine','example','yard'
];

const wordChainGames = new Map();

function getWordChainGame(chatId) {
  if (!wordChainGames.has(chatId)) wordChainGames.set(chatId, new WordChainGame(chatId));
  return wordChainGames.get(chatId);
}

// ============================================================
// HANGMAN GAME
// ============================================================
const HANGMAN_WORDS = [
  'javascript','python','elephant','mountain','butterfly','keyboard','monitor',
  'programming','variable','function','database','algorithm','network','security',
  'chocolate','adventure','universe','diamond','language','software','hardware',
  'internet','password','keyboard','whatsapp','telegram','android','message',
  'community','festival','lightning','education','treasure','paradise','harmony'
];

const HANGMAN_STAGES = [
  `
  +---+
  |   |
      |
      |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
      |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
  |   |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|   |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
      |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
 /    |
      |
=========`,
  `
  +---+
  |   |
  O   |
 /|\\  |
 / \\  |
      |
=========`
];

class HangmanGame {
  constructor(chatId, word, starter) {
    this.chatId = chatId;
    this.word = word.toLowerCase();
    this.guessed = new Set();
    this.wrong = 0;
    this.maxWrong = 6;
    this.active = true;
    this.starter = starter;
  }

  guess(letter) {
    letter = letter.toLowerCase();
    if (!this.active) return { result: 'not_active' };
    if (this.guessed.has(letter)) return { result: 'already_guessed' };
    if (!/^[a-z]$/.test(letter)) return { result: 'invalid' };

    this.guessed.add(letter);
    if (this.word.includes(letter)) {
      const won = this.word.split('').every(c => this.guessed.has(c));
      if (won) { this.active = false; return { result: 'won' }; }
      return { result: 'correct' };
    } else {
      this.wrong++;
      if (this.wrong >= this.maxWrong) { this.active = false; return { result: 'lost' }; }
      return { result: 'wrong', wrong: this.wrong };
    }
  }

  display() {
    const wordDisplay = this.word.split('').map(c => this.guessed.has(c) ? c : '_').join(' ');
    const stage = HANGMAN_STAGES[this.wrong] || HANGMAN_STAGES[HANGMAN_STAGES.length - 1];
    const wrongLetters = [...this.guessed].filter(l => !this.word.includes(l)).join(', ');
    return { stage, wordDisplay, wrongLetters, wrong: this.wrong, max: this.maxWrong };
  }
}

const hangmanGames = new Map();

// ============================================================
// COMMANDS
// ============================================================
module.exports = [
  // ============================
  // WORDCHAIN
  // ============================
  {
    name: 'wordchain',
    aliases: ['wc', 'wcg'],
    category: 'games',
    description: 'Play word chain game',
    usage: '.wordchain start <word> | join | play <word> | scores | end',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderNumber, isGroup } = context;
      const botName = getBotName();
      const name = message.pushName || senderNumber || 'Player';
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();
      const game = getWordChainGame(chatId);

      if (!sub || sub === 'help') {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} WORD CHAIN* ─┐\n│\n│ 🔤 How to play:\n│ Each word must start with\n│ the last letter of the prev word!\n│\n│ .wordchain join — join game\n│ .wordchain start <word> — begin\n│ .wordchain play <word> — your turn\n│ .wordchain scores — see scores\n│ .wordchain end — end game\n│\n│ 🤖 AI Mode:\n│ .wcgai start <word>\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'join') {
        if (game.active) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Game already running!\n└─────────────────┘` }, { quoted: fake });
        const added = game.addPlayer(senderId, name);
        if (!added) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ You already joined!\n└─────────────────┘` }, { quoted: fake });
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} WORD CHAIN* ─┐\n│\n│ ✅ ${name} joined!\n│ Players: ${game.players.size}\n│\n│ Need 2+ players then:\n│ .wordchain start <word>\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'start') {
        if (game.active) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Game already running!\n└─────────────────┘` }, { quoted: fake });
        const startWord = (args[1] || '').toLowerCase();
        if (!startWord || !/^[a-z]+$/.test(startWord) || startWord.length < 2) {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Provide a valid start word!\n│ .wordchain start apple\n└─────────────────┘` }, { quoted: fake });
        }
        if (!game.players.has(senderId)) game.addPlayer(senderId, name);
        if (game.players.size < 2) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Need at least 2 players!\n│ Others: .wordchain join\n└─────────────────┘` }, { quoted: fake });
        game.start(startWord, false);
        const curName = game.players.get(game.currentPlayer) || 'Unknown';
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} WORD CHAIN* ─┐\n│\n│ 🎮 Game started!\n│ Start word: *${startWord}*\n│\n│ 🎯 Turn: *${curName}*\n│ Next word must start with: *${startWord[startWord.length - 1].toUpperCase()}*\n│\n│ Type: .wordchain play <word>\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'play' || sub === 'w') {
        if (!game.active) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ No game running. Start one!\n│ .wordchain join\n└─────────────────┘` }, { quoted: fake });
        const word = (args[1] || '').toLowerCase();
        if (!word) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Provide a word!\n│ .wordchain play <word>\n└─────────────────┘` }, { quoted: fake });

        const res = game.submitWord(senderId, word);
        if (!res.ok) {
          const reasons = {
            not_your_turn: `❌ Not your turn!\nWaiting for: *${game.players.get(game.currentPlayer) || 'AI'}*`,
            wrong_start: `❌ Word must start with: *${res.expected?.toUpperCase()}*`,
            already_used: `❌ "${word}" already used!`,
            too_short: `❌ Word too short (min 2 letters)`,
            invalid_chars: `❌ Letters only!`,
            not_started: `❌ Game not started`
          };
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ ${reasons[res.reason] || '❌ Invalid'}\n└─────────────────┘` }, { quoted: fake });
        }

        let reply = `┌─ *${botName} WORD CHAIN* ─┐\n│\n│ ✅ ${name}: *${word}* (+${res.pts}pts)\n│`;

        if (game.aiMode && game.currentPlayer === '__AI__') {
          const aiWord = game.getAiWord();
          if (!aiWord) {
            const result = game.end();
            reply += `\n│ 🤖 AI can't continue!\n│\n│ 🏆 Winner: *${result.winner || 'None'}*\n│\n│ Scores:\n│ ${result.scores.replace(/\n/g, '\n│ ')}\n│\n└─────────────────┘`;
            wordChainGames.delete(chatId);
          } else {
            game.usedWords.add(aiWord);
            game.scores.set('__AI__', (game.scores.get('__AI__') || 0) + aiWord.length);
            game.lastWord = aiWord;
            game.nextTurn();
            const curName = game.players.get(game.currentPlayer) || 'Player';
            reply += `\n│ 🤖 AI: *${aiWord}*\n│\n│ 🎯 Turn: *${curName}*\n│ Next starts with: *${aiWord[aiWord.length - 1].toUpperCase()}*\n│\n└─────────────────┘`;
          }
        } else {
          const curName = game.currentPlayer === '__AI__' ? '🤖 AI' : (game.players.get(game.currentPlayer) || 'Unknown');
          reply += `\n│ 🎯 Turn: *${curName}*\n│ Next starts with: *${word[word.length - 1].toUpperCase()}*\n│\n└─────────────────┘`;
        }

        return sock.sendMessage(chatId, { text: reply }, { quoted: fake });
      }

      if (sub === 'scores') {
        if (!game.active && game.players.size === 0) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ No active game!\n└─────────────────┘` }, { quoted: fake });
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} SCORES* ─┐\n│\n│ ${game.getScores().replace(/\n/g, '\n│ ')}\n│\n│ Last word: *${game.lastWord}*\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'end') {
        if (!game.active) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ No game running!\n└─────────────────┘` }, { quoted: fake });
        const result = game.end();
        wordChainGames.delete(chatId);
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} WORD CHAIN* ─┐\n│\n│ 🏁 Game ended!\n│\n│ 🏆 Winner: *${result.winner || 'None'}*\n│\n│ Final Scores:\n│ ${result.scores.replace(/\n/g, '\n│ ')}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Unknown sub-command!\n│ .wordchain help\n└─────────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // WORDCHAIN AI MODE
  // ============================
  {
    name: 'wcgai',
    aliases: ['wordchainai', 'wcai'],
    category: 'games',
    description: 'Play word chain against the AI',
    usage: '.wcgai start <word>',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId, senderNumber } = context;
      const botName = getBotName();
      const name = message.pushName || senderNumber || 'Player';
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();
      const game = getWordChainGame(chatId);

      if (!sub || sub === 'help') {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} WORD CHAIN AI* ─┐\n│\n│ 🤖 Play vs the AI!\n│\n│ .wcgai start <word> — begin\n│ .wordchain play <word> — your turn\n│ .wordchain end — stop\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'start') {
        if (game.active) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Game already running!\n└─────────────────┘` }, { quoted: fake });
        const startWord = (args[1] || '').toLowerCase();
        if (!startWord || !/^[a-z]+$/.test(startWord) || startWord.length < 2) {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Provide a valid start word!\n│ .wcgai start apple\n└─────────────────┘` }, { quoted: fake });
        }
        if (!game.players.has(senderId)) game.addPlayer(senderId, name);
        game.players.set('__AI__', '🤖 BOT');
        game.scores.set('__AI__', 0);
        game.start(startWord, true);
        const curName = game.currentPlayer === '__AI__' ? '🤖 AI' : (game.players.get(game.currentPlayer) || name);
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} WORD CHAIN AI* ─┐\n│\n│ 🎮 Game vs AI started!\n│ Start word: *${startWord}*\n│\n│ 🎯 Turn: *${curName}*\n│ Next starts with: *${startWord[startWord.length - 1].toUpperCase()}*\n│\n│ Type: .wordchain play <word>\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Use: .wcgai start <word>\n└─────────────────┘` }, { quoted: fake });
    }
  },

  // ============================
  // HANGMAN
  // ============================
  {
    name: 'hangman',
    aliases: ['hm', 'hang'],
    category: 'games',
    description: 'Play hangman word guessing game',
    usage: '.hangman start | guess <letter> | hint | end',
    execute: async (sock, message, args, context) => {
      const { chatId, senderId } = context;
      const botName = getBotName();
      const fake = createFakeContact(senderId);
      const sub = (args[0] || '').toLowerCase();

      if (!sub || sub === 'help') {
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} HANGMAN* ─┐\n│\n│ 🎯 Guess the hidden word!\n│\n│ .hangman start — new game\n│ .hangman guess <letter> — guess\n│ .hangman hint — get a hint\n│ .hangman end — stop game\n│\n│ You have 6 wrong guesses!\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'start') {
        if (hangmanGames.has(chatId)) {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Game already running!\n│ .hangman end — to stop\n└─────────────────┘` }, { quoted: fake });
        }
        const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
        const game = new HangmanGame(chatId, word, senderId);
        hangmanGames.set(chatId, game);
        const d = game.display();
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} HANGMAN* ─┐\n│\n│ 🎮 New game started!\n│ Guess the *${word.length}-letter* word!\n│\`\`\`${d.stage}\`\`\`\n│ Word: *${d.wordDisplay}*\n│ Wrong: 0/${d.max}\n│\n│ .hangman guess <letter>\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'guess' || sub === 'g') {
        const game = hangmanGames.get(chatId);
        if (!game || !game.active) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ No active game!\n│ .hangman start\n└─────────────────┘` }, { quoted: fake });

        const letter = (args[1] || '').toLowerCase().trim();
        if (!letter || letter.length !== 1) {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Guess one letter!\n│ .hangman guess a\n└─────────────────┘` }, { quoted: fake });
        }

        const res = game.guess(letter);
        const d = game.display();

        if (res.result === 'already_guessed') {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Already guessed *${letter}*!\n└─────────────────┘` }, { quoted: fake });
        }
        if (res.result === 'invalid') {
          return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Invalid character!\n└─────────────────┘` }, { quoted: fake });
        }
        if (res.result === 'won') {
          hangmanGames.delete(chatId);
          return sock.sendMessage(chatId, {
            text: `┌─ *${botName} HANGMAN* ─┐\n│\n│ 🎉 *YOU WIN!*\n│ The word was: *${game.word}*\n│\`\`\`${d.stage}\`\`\`\n│ Word: *${d.wordDisplay}*\n│\n└─────────────────┘`
          }, { quoted: fake });
        }
        if (res.result === 'lost') {
          hangmanGames.delete(chatId);
          return sock.sendMessage(chatId, {
            text: `┌─ *${botName} HANGMAN* ─┐\n│\n│ 💀 *GAME OVER!*\n│ The word was: *${game.word}*\n│\`\`\`${d.stage}\`\`\`\n│\n└─────────────────┘`
          }, { quoted: fake });
        }

        const icon = res.result === 'correct' ? '✅' : '❌';
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} HANGMAN* ─┐\n│\n│ ${icon} Letter: *${letter.toUpperCase()}*\n│\`\`\`${d.stage}\`\`\`\n│ Word: *${d.wordDisplay}*\n│ Wrong: ${d.wrong}/${d.max}\n│ Bad: ${d.wrongLetters || 'none'}\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      if (sub === 'hint') {
        const game = hangmanGames.get(chatId);
        if (!game || !game.active) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ No active game!\n└─────────────────┘` }, { quoted: fake });
        const unguessed = game.word.split('').filter(c => !game.guessed.has(c));
        if (!unguessed.length) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ All letters guessed!\n└─────────────────┘` }, { quoted: fake });
        const hint = unguessed[Math.floor(Math.random() * unguessed.length)];
        return sock.sendMessage(chatId, { text: `┌─ *${botName} HANGMAN* ─┐\n│\n│ 💡 Hint: the word contains *${hint.toUpperCase()}*\n│\n└─────────────────┘` }, { quoted: fake });
      }

      if (sub === 'end') {
        const game = hangmanGames.get(chatId);
        if (!game) return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ No game to end!\n└─────────────────┘` }, { quoted: fake });
        hangmanGames.delete(chatId);
        return sock.sendMessage(chatId, {
          text: `┌─ *${botName} HANGMAN* ─┐\n│\n│ 🏁 Game ended!\n│ The word was: *${game.word}*\n│\n└─────────────────┘`
        }, { quoted: fake });
      }

      return sock.sendMessage(chatId, { text: `┌─ *${botName}* ─┐\n│ Unknown option!\n│ .hangman help\n└─────────────────┘` }, { quoted: fake });
    }
  }
];
