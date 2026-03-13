// ═══════════════════════════════════════════════════
// BAILEYS NOISE FILTER — must be first, before requires
// ═══════════════════════════════════════════════════
(function installNoiseFilter() {
  const noisyPatterns = [
    'Failed to decrypt', 'Bad MAC', 'decryptWithSessions',
    'doDecryptWhisperMessage', 'session_cipher',
    'Closing stale open', 'Decryption failed', 'SignalProtocolStore',
    'PreKeyWhisperMessage', 'closing session',
    'Closing session: SessionEntry', 'SessionEntry {',
    'recv ', 'handling frame', 'query:', 'prekey',
    'session record', 'identity key', 'sender key', 'ciphertext',
    'got notification', 'msg:ack', 'writing data', 'got ack',
    'processing message', 'updating prekeys', 'next pre key',
    'ws open', 'opened ws', 'frame buffered',
    'pairing configured', 'handshake',
    'unreadCount', 'presence',
    'Invalid mex newsletter', 'Invalid buffer', 'lid-mapping',
    'no pre key', 'No session found', 'NodeNotFoundError',
    'not found in store', 'socket error', 'stream error',
    'waiting for message', 'retry request', 'Error decoding',
    'failed to decrypt', 'bad mac', 'boom error',
    'retry count', 'reuploadRequest', 'patchMessage',
    'Connection Closed', 'Connection closed', 'connection closed',
    'ECONNRESET', 'ETIMEDOUT',
  ];

  function isNoisy(...args) {
    const str = args.map(a => {
      if (!a) return '';
      if (a instanceof Error) return a.message || '';
      return typeof a === 'string' ? a : (typeof a === 'object' ? '' : String(a));
    }).join(' ');
    return noisyPatterns.some(p => str.includes(p));
  }

  const _log = console.log.bind(console);
  const _err = console.error.bind(console);
  const _warn = console.warn.bind(console);
  console.log   = (...a) => { if (!isNoisy(...a)) _log(...a); };
  console.error = (...a) => { if (!isNoisy(...a)) _err(...a); };
  console.warn  = (...a) => { if (!isNoisy(...a)) _warn(...a); };

  // Filter raw stdout (SessionEntry dump from Baileys internals)
  const stdoutNoisePatterns = [
    'Closing session: SessionEntry', 'SessionEntry {', '_chains:',
    'chainKey:', 'registrationId:', 'currentRatchet:', 'ephemeralKeyPair:',
    'lastRemoteEphemeralKey:', 'previousCounter:', 'rootKey:', 'indexInfo:',
    'baseKey:', 'baseKeyType:', 'remoteIdentityKey:', 'pendingPreKey:',
    'signedKeyId:', 'preKeyId:', '<Buffer', 'closed: -1',
    'chainType:', 'messageKeys:',
  ];
  const _stdoutWrite = process.stdout.write.bind(process.stdout);
  const _stderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = function(chunk, enc, cb) {
    const s = (Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk || ''));
    if (stdoutNoisePatterns.some(p => s.includes(p))) {
      if (typeof enc === 'function') enc(); else if (typeof cb === 'function') cb();
      return true;
    }
    return _stdoutWrite(chunk, enc, cb);
  };
  process.stderr.write = function(chunk, enc, cb) {
    const s = (Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk || ''));
    if (s.includes('Closing session: SessionEntry') || s.includes('SessionEntry {')) {
      if (typeof enc === 'function') enc(); else if (typeof cb === 'function') cb();
      return true;
    }
    return _stderrWrite(chunk, enc, cb);
  };
})();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  delay,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const chalk = require('chalk');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');
const NodeCache = require('node-cache');

const { loadCommands } = require('./lib/executor');
const { handleMessage, handleGroupUpdate } = require('./main.js');
const store = require('./lib/lightweight');
global.store = store; // needed by main.js reaction handler (loadMessage)
const { getSetting, initDb } = require('./lib/database');
const settings = require('./settings.js');
const { channelInfo, getBotName, createFakeContact } = require('./lib/messageConfig');
const { loadEnvSession, parseAndSaveSession, clearSession } = require('./lib/session');
const { storeMessage, handleMessageRevocation, handleMessagesDelete } = require('./plugins/OWNER');
const { handleStatusUpdate } = require('./lib/autostatus');
const { handleAntidemote } = require('./lib/antidemote');
const { getCurrentTime, getCurrentTimezone } = require('./lib/myfunc');

require('dotenv').config();

const SESSION_DIR = path.join(__dirname, 'data/session/auth.db');
const DATA_DIR    = path.join(__dirname, 'data');
const envPath     = path.resolve(process.cwd(), '.env');

// ═══════════════════════════════════════════════════
// DIRS
// ═══════════════════════════════════════════════════
function ensureDirs() {
  for (const d of [DATA_DIR, SESSION_DIR, path.join(__dirname, 'tmp'), path.join(__dirname, 'tmp/antidelete')]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

// ═══════════════════════════════════════════════════
// HOST DETECTION
// ═══════════════════════════════════════════════════
function detectHost() {
  const env = process.env;
  if (env.RENDER || env.RENDER_EXTERNAL_URL) return 'Render';
  if (env.DYNO || env.HEROKU_APP_DIR || env.HEROKU_SLUG_COMMIT) return 'Heroku';
  if (env.PORTS || env.CYPHERX_HOST_ID) return 'CypherXHost';
  if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) return 'Vercel';
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID) return 'Railway';
  if (env.REPL_ID || env.REPL_SLUG) return 'Replit';
  const hostname = os.hostname().toLowerCase();
  if (!env.CLOUD_PROVIDER && !env.DYNO && !env.VERCEL && !env.RENDER) {
    if (hostname.includes('vps') || hostname.includes('server')) return 'VPS';
    return 'Panel';
  }
  return 'Unknown Host';
}

// ═══════════════════════════════════════════════════
// ONE-TIME INIT
// ═══════════════════════════════════════════════════
let _initialized = false;
function init() {
  if (_initialized) return;
  _initialized = true;
  ensureDirs();
  loadCommands();
  store.readFromFile();
  setInterval(() => store.writeToFile(), 10_000);
}

// ═══════════════════════════════════════════════════
// GLOBALS FROM DATABASE
// ═══════════════════════════════════════════════════
function setGlobals() {
  global.server          = detectHost();
  global.prefix          = getSetting('prefix', settings.prefix);
  global.mode            = getSetting('mode', settings.mode);
  global.packname        = getSetting('packname', settings.packname);
  global.botName         = getSetting('botName', settings.botName);
  global.botOwner        = getSetting('botOwner', settings.botOwner);
  global.version         = getSetting('version', settings.version);
  global.author          = 'DAVEX';
  global.channelLink     = 'https://whatsapp.com/channel/0029VbApvFQ2Jl84lhONkc3k';
  global.dev             = '254104260236';
  global.devgit          = 'https://github.com/gifteddevsmd/DAVE-MD2';
  global.getCurrentTime  = getCurrentTime;
  global.getCurrentTimezone = getCurrentTimezone;
  global.startTime       = Date.now();
}

// ═══════════════════════════════════════════════════
// DELETE SESSION FOLDER
// ═══════════════════════════════════════════════════
function deleteSessionFolder() {
  if (fs.existsSync(SESSION_DIR)) {
    try {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      console.log(chalk.green('[ADEVOS-X BOT] ✅ Session folder deleted successfully.'));
    } catch (err) {
      console.error(chalk.red('❌ Error deleting session folder:'), err);
    }
  } else {
    console.log(chalk.yellow('⚠️ No session folder found to delete.'));
  }
}

// ═══════════════════════════════════════════════════
// READLINE
// ═══════════════════════════════════════════════════
let rl = null;
function getRL() {
  if (!rl && process.stdin.isTTY) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('close', () => { rl = null; });
  }
  return rl;
}
const question = (text) =>
  new Promise((resolve) => {
    const iface = getRL();
    if (iface) return iface.question(text, resolve);
    const num = (getSetting('ownerNumber', '') || '').replace(/[^0-9]/g, '');
    console.log(chalk.cyan('[ADEVOS-X BOT] Non-interactive — ownerNumber: ' + num));
    resolve(num);
  });

function closeRL() {
  if (rl) { try { rl.close(); } catch (e) {} rl = null; }
}

// ═══════════════════════════════════════════════════
// WATCH .env
// ═══════════════════════════════════════════════════
function checkEnvStatus() {
  try {
    console.log(chalk.green('╔═══════════════════════════════════════╗'));
    console.log(chalk.green('║       .env file watcher active.       ║'));
    console.log(chalk.green('╚═══════════════════════════════════════╝'));
    if (fs.existsSync(envPath)) {
      fs.watch(envPath, { persistent: false }, (ev) => {
        if (ev === 'change') {
          console.log(chalk.bgRed.black('================================================='));
          console.log(chalk.white.bgRed('[ADEVOS-X BOT] 🚨 .env file change detected!'));
          console.log(chalk.white.bgRed('Restart bot to apply new configuration (e.g., SESSION_ID).'));
          console.log(chalk.red.bgBlack('================================================='));
        }
      });
    }
  } catch (err) {
    console.log(chalk.red(`❌ Failed to setup .env watcher: ${err.message}`));
  }
}

// ═══════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════
let sock = null;
let reconnectAttempts = 0;
let isPairing = false;
let _startupMsgSent = false;
const MAX_RECONNECT = 5;

// ═══════════════════════════════════════════════════
// PAIRING MENU
// ═══════════════════════════════════════════════════
async function showPairingMenu() {
  if (!process.stdin.isTTY) {
    const num = (getSetting('ownerNumber', '') || '').replace(/[^0-9]/g, '');
    console.log(chalk.cyan('[ADEVOS-X BOT] Non-interactive — ownerNumber: ' + num));
    return num;
  }

  console.log(chalk.grey('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
  console.log(chalk.cyan('┃') + chalk.white.bold('           CONNECTION OPTIONS              ') + chalk.cyan('┃'));
  console.log(chalk.grey('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
  console.log('');
  console.log(chalk.bold.blue('1. Enter phone number for new pairing'));
  console.log(chalk.bold.blue('2. Use SESSION_ID from Secrets / .env'));
  console.log(chalk.bold.blue('3. Paste any kind of session'));
  console.log('');

  const option = (await question(chalk.bgBlack(chalk.green('Choose between option: 1--2--3\n')))).trim();

  if (option === '2') {
    console.log(chalk.cyan('\n[ADEVOS-X BOT] 🔍 Checking .env for SESSION_ID...'));
    const loaded = loadEnvSession();
    if (loaded) {
      console.log(chalk.green('[ADEVOS-X BOT] ✅ Session loaded from .env successfully!'));
      console.log(chalk.cyan('[ADEVOS-X BOT] 🔄 Connecting with .env session...'));
      closeRL();
      return null;
    }
    console.log(chalk.red('❌ No valid SESSION_ID found in .env'));
    console.log(chalk.yellow('💡 Tip: Add SESSION_ID to your .env file'));
    console.log(chalk.yellow('   Format: SESSION_ID=ADEVOS-X BOT:your_base64_session_here'));
    console.log('');
    console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
    console.log('');

  } else if (option === '3') {
    console.log(chalk.cyan('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
    console.log(chalk.cyan('┃') + chalk.green('          📋 PASTE YOUR SESSION') + chalk.cyan('         ┃'));
    console.log(chalk.cyan('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
    console.log('');
    console.log(chalk.yellow('✅ Supported formats:'));
    console.log(chalk.white('   • Base64 with prefix: ADEVOS-X BOT:eyJub2..'));
    console.log(chalk.white('   • Base64 without prefix: eyJub2lzy....'));
    console.log(chalk.white('   • Raw JSON: {"noiseKey":{"private":...'));
    console.log('');
    console.log(chalk.cyan('Paste your session below (press Enter when done):'));
    console.log('');

    const pasted = (await question(chalk.bgBlack(chalk.green('> ')))).trim();

    if (!pasted || pasted.trim().length < 50) {
      console.log(chalk.red('❌ Session too short or empty!'));
      console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
      console.log('');
    } else {
      console.log(chalk.cyan('[ADEVOS-X BOT] 🔍 Analyzing session format...'));
      const result = parseAndSaveSession(pasted);
      if (result.success) {
        console.log(chalk.green('[ADEVOS-X BOT] ✅ Session saved successfully!'));
        console.log(chalk.cyan('[ADEVOS-X BOT] 🔄 Connecting with pasted session...'));
        closeRL();
        return null;
      }
      console.log(chalk.red('[ADEVOS-X BOT] ❌ Failed to parse session!'));
      console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
      console.log('');
    }
  }

  const raw = (await question(chalk.bgBlack(chalk.green(
    'Please type your WhatsApp number\nFormat: 254104260236 (without + or spaces) : '
  )))).trim();

  return raw.replace(/[^0-9]/g, '');
}

// ═══════════════════════════════════════════════════
// CONNECT / RECONNECT
// ═══════════════════════════════════════════════════
async function connect() {
  if (sock) {
    try { sock.ev.removeAllListeners(); sock.end(null); } catch (e) {}
    sock = null;
  }

  // Refresh globals from DB on each connect
  setGlobals();
  loadEnvSession();

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(chalk.cyan(`[ADEVOS-X BOT] 📦 Baileys ${version.join('.')} | latest: ${isLatest}`));

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const msgRetryCounterCache = new NodeCache();

  const alreadyRegistered = !!state.creds.registered;

  let phoneNumber = '';
  if (!alreadyRegistered) {
    const num = await showPairingMenu();

    if (num === null) {
      return connect();
    }

    phoneNumber = num;
    if (!phoneNumber || phoneNumber.length < 7) {
      console.log(chalk.red('[ADEVOS-X BOT] Invalid phone number. Exiting.'));
      process.exit(1);
    }
    isPairing = true;
  }

  sock = makeWASocket({
    version,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'fatal' }).child({ level: 'fatal' })
      ),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    keepAliveIntervalMs: 10_000,
    connectTimeoutMs: 60_000,
    getMessage: async (key) => {
      const jid = jidNormalizedUser(key.remoteJid);
      const msg = await store.loadMessage(jid, key.id);
      return msg?.message || '';
    },
    msgRetryCounterCache,
    defaultQueryTimeoutMs: undefined,
  });

  store.bind(sock.ev);
  global.sock = sock;

  // ── Raw WS diagnostic: confirm if ANY data arrives from WhatsApp server ──
  if (sock.ws) {
    sock.ws.on('message', () => {
      if (!sock.ws._dbgLogged) {
        sock.ws._dbgLogged = true;
        console.log(chalk.bgGreen.black('[DEBUG WS] ✅ Raw WebSocket data received from WhatsApp server'));
      }
    });
    sock.ws.on('error', (err) => {
      console.log(chalk.bgRed.white('[DEBUG WS] ❌ WebSocket error:'), err.message);
    });
  }

  console.log(chalk.cyan('[ADEVOS-X BOT] 🧹 Initializing session cleanup system...'));
  console.log(chalk.green('[ADEVOS-X BOT] ✅ Session cleanup system enabled'));


  // ── Pairing code ──
  if (!alreadyRegistered && phoneNumber) {
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log('');
        console.log(chalk.green('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
        console.log(chalk.green('┃') + chalk.white.bold('              PAIRING CODE               ') + chalk.green('┃'));
        console.log(chalk.green('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
        console.log('');
        console.log(chalk.cyan.bold(`    ${code}    `));
        console.log('');
        console.log(chalk.yellow('📱 How to link your WhatsApp:'));
        console.log(chalk.white('1. Open WhatsApp on your phone'));
        console.log(chalk.white('2. Go to Settings > Linked Devices'));
        console.log(chalk.white('3. Tap "Link a Device"'));
        console.log(chalk.white('4. Enter the code: ') + chalk.green.bold(code));
        console.log('');
        console.log(chalk.cyan.bold('⏱️  Code expires in 1 minute'));
        console.log('');
      } catch (err) {
        console.log(chalk.red('[ADEVOS-X BOT] Pairing code error:'), err.message);
      }
    }, 3000);
  }

  // ── Connection events ──
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      isPairing = false;
      reconnectAttempts = 0;
      closeRL();

      // Refresh globals after connect
      setGlobals();
      global.sock = sock;

      // Mark bot as online (fixes "last active at" presence)
      sock.sendPresenceUpdate('available').catch(() => {});

      const botName = getBotName();
      const userId  = sock.user?.id || '';

      // Capture LID
      if (sock.user?.lid) {
        global.ownerLid = sock.user.lid.split(':')[0];
        console.log(chalk.cyan(`[ADEVOS-X BOT] 🆔 User LID captured: ${global.ownerLid}`));
      }

      console.log('');
      console.log(chalk.green('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
      console.log(chalk.green('┃') + chalk.white.bold('        ✅ CONNECTION SUCCESSFUL!     ') + chalk.green('  ┃'));
      console.log(chalk.green('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
      console.log(chalk.cyan(`[ADEVOS-X BOT] 🤖 Bot:      ${botName}`));
      console.log(chalk.cyan(`[ADEVOS-X BOT] 📱 Number:   ${userId}`));
      console.log(chalk.cyan(`[ADEVOS-X BOT] 📦 Commands: ${global.commands?.size || 0}`));
      console.log('');

      // ── WhatsApp welcome message → bot's own number (only ONCE per process) ──
      if (!_startupMsgSent) {
        _startupMsgSent = true;
        const botNumber = userId.split(':')[0] + '@s.whatsapp.net';
        const fake = createFakeContact(botNumber);
        const time = getCurrentTime('time2');

        try {
          await sock.sendMessage(botNumber, {
            text:
`┏━━━━━✧ ADEVOS-X BOT CONNECTED ✧━━━━━━
┃✧ Prefix: ${global.prefix}
┃✧ Mode: ${global.mode || 'public'}
┃✧ Platform: ${global.server}
┃✧ Bot: ADEVOS-X BOT v${global.version}
┃✧ Commands: ${global.commands?.size || 0}
┃✧ Status: Active ✅
┃✧ Time: ${time}
┃✧ Developer: DAVEX
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            ...channelInfo,
          }, { quoted: fake });
          console.log(chalk.green('[ADEVOS-X BOT] ✅ Startup message sent.'));

          // ── Self-test: inject fake .alive command 35s after connect ──
          // This bypasses the receive pipeline to confirm commands work
          setTimeout(async () => {
            try {
              const botJid = sock.user?.id || '';
              const botNum = botJid.split(':')[0] + '@s.whatsapp.net';
              const fakeMsg = {
                key: { remoteJid: botNum, fromMe: true, id: 'SELF-TEST-001' },
                message: { conversation: `${global.prefix || '.'}alive` },
                messageTimestamp: Math.floor(Date.now() / 1000),
                pushName: 'SelfTest',
              };
              console.log(chalk.bgMagenta.white('[DEBUG SELF-TEST] Injecting fake .alive command into pipeline...'));
              await handleMessage(sock, { messages: [fakeMsg], type: 'notify' });
              console.log(chalk.bgMagenta.white('[DEBUG SELF-TEST] Pipeline test complete.'));
            } catch (e) {
              console.error(chalk.red('[DEBUG SELF-TEST] Error:'), e.message);
            }
          }, 35000);
        } catch (error) {
          console.error(chalk.red('[ADEVOS-X BOT] Could not send startup message:'), error.message);
        }
      } else {
        console.log(chalk.cyan('[ADEVOS-X BOT] 🔄 Reconnected (startup message already sent).'));
      }

      await delay(1000);

      // Follow newsletters
      try {
        await sock.newsletterFollow('120363400480173280@newsletter');
        console.log(chalk.green('[ADEVOS-X BOT] ✅ Newsletter 1 followed'));
      } catch (err) {
        console.log(chalk.yellow(`[ADEVOS-X BOT] ⚠️ Newsletter 1: ${err.message}`));
      }

      await delay(1000);

      try {
        await sock.newsletterFollow('1203634037440256@newsletter');
        console.log(chalk.green('[ADEVOS-X BOT] ✅ Newsletter 2 followed'));
      } catch (err) {
        console.log(chalk.yellow(`[ADEVOS-X BOT] ⚠️ Newsletter 2: ${err.message}`));
      }
    }

    if (connection === 'close') {
      const error      = lastDisconnect?.error;
      const statusCode = (error instanceof Boom) ? error.output?.statusCode : (error?.output?.statusCode || 0);

      console.log(chalk.yellow(`[ADEVOS-X BOT] ⚠️ Connection closed. Status code: ${statusCode}`));

      // Logged out / 401
      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log(chalk.red('[ADEVOS-X BOT] 🚨 Logged out — deleting session'));
        clearSession();
        await delay(3000);
        process.exit(0);
      }

      // Bad session
      if (statusCode === DisconnectReason.badSession) {
        console.log(chalk.red('[ADEVOS-X BOT] 🚨 Bad session — deleting and reconnecting'));
        deleteSessionFolder();
        reconnectAttempts = 0;
        await delay(3000);
        return connect();
      }

      // 408 pairing timeout
      if (statusCode === 408 && isPairing) {
        console.log(chalk.yellow('[ADEVOS-X BOT] ⏱️ Pairing timeout (408) — reconnecting for new code...'));
        isPairing = false;
        await delay(3000);
        return connect();
      }

      // Restart-required codes
      if ([515, 516].includes(statusCode)) {
        console.log(chalk.yellow(`[ADEVOS-X BOT] 🔄 Restart required (${statusCode}) — reconnecting...`));
        reconnectAttempts = 0;
        await delay(3000);
        return connect();
      }

      // Normal reconnect codes
      if ([408, 428, DisconnectReason.timedOut, DisconnectReason.connectionLost].includes(statusCode)) {
        console.log(chalk.cyan('[ADEVOS-X BOT] 🔄 Connection lost — reconnecting...'));
        reconnectAttempts = 0;
        await delay(5000);
        return connect();
      }

      // 500 — corrupted session
      if (statusCode === 500) {
        if (reconnectAttempts >= 3) {
          console.log(chalk.red('[ADEVOS-X BOT] 🗑️ Too many 500 errors — deleting session'));
          deleteSessionFolder();
          reconnectAttempts = 0;
          await delay(5000);
          return connect();
        }
        reconnectAttempts++;
        console.log(chalk.yellow(`[ADEVOS-X BOT] 🔄 Retry ${reconnectAttempts}/3 in 30s...`));
        await delay(30000);
        return connect();
      }

      // All others — retry indefinitely; never exit silently
      reconnectAttempts++;
      const wait = Math.min(10000 * reconnectAttempts, 60_000);
      console.log(chalk.cyan(`[ADEVOS-X BOT] 🔄 Reconnecting... (attempt ${reconnectAttempts}) in ${wait / 1000}s`));
      await delay(wait);
      return connect();
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Incoming messages (ev.on — this is what Baileys actually fires for messages) ──
  sock.ev.on('messages.upsert', (m) => {
    const { messages, type } = m;
    console.log(chalk.cyan(`[DEBUG messages.upsert ev.on] type=${type} count=${messages.length}`));

    // Store messages + handle status broadcasts
    for (const msg of messages) {
      if (!msg.key?.remoteJid) continue;
      if (msg.key.remoteJid === 'status@broadcast') {
        handleStatusUpdate(sock, { messages: [msg], type }).catch(() => {});
        continue;
      }
      try { storeMessage(msg.key.remoteJid, msg); } catch (_) {}

      // Antidelete — protocol-level delete-for-everyone
      const proto = msg.message?.protocolMessage;
      if ((proto?.type === 0 || proto?.type === 7) && proto?.key) {
        handleMessageRevocation(sock, msg).catch(() => {});
      }
    }

    // Route to command handler
    handleMessage(sock, m).catch(e =>
      console.error(chalk.red('[ADEVOS-X BOT] MSG ERROR:'), e.message)
    );
  });

  // ev.process for remaining bufferable events
  sock.ev.process(async (events) => {
    const evKeys = Object.keys(events).filter(k => k !== 'messages.upsert');
    if (evKeys.length) {
      console.log(chalk.gray('[DEBUG ev.process] events:', evKeys.join(', ')));
    }

    // ── Group participant changes (antidemote, welcome/bye) ──
    if (events['group-participants.update']) {
      const update = events['group-participants.update'];
      handleGroupUpdate(sock, update).catch(e =>
        console.error(chalk.red('[ADEVOS-X BOT] GROUP ERROR:'), e.message)
      );
      handleAntidemote(sock, update).catch(() => {});
    }

    // ── Store-level message delete (backup antidelete path) ──
    if (events['messages.delete']) {
      handleMessagesDelete(sock, events['messages.delete']).catch(() => {});
    }
  });

  // Anti-call — decline/block incoming calls
  sock.ev.on('call', async (calls) => {
    try {
      for (const call of calls) {
        if (call.status !== 'offer') continue;
        const cfg = getSetting('anticall', { enabled: false, mode: 'decline', message: 'Calls are not allowed!' });
        if (!cfg.enabled) continue;

        const callerId = call.from;
        const botNum = (sock.user.id || '').split(':')[0];
        if ((callerId || '').includes(botNum)) continue;

        try { await sock.rejectCall(call.id, call.from); } catch {}

        const callerNum = (callerId || '').split('@')[0];
        const botName = getBotName();
        const ownerJid = botNum + '@s.whatsapp.net';
        const fake = createFakeContact(callerId || ownerJid);

        if (cfg.mode === 'block' || cfg.mode === 'both') {
          try { await sock.updateBlockStatus(callerId, 'block'); } catch {}
          sock.sendMessage(ownerJid, {
            text: `┌─ *${botName}* ─┐\n│\n│ CALL BLOCKED\n│ From: @${callerNum}\n│ Mode: ${(cfg.mode || 'block').toUpperCase()}\n│\n└─────────────┘`,
            mentions: [callerId]
          }, { quoted: fake }).catch(() => {});
        }

        const customMsg = cfg.message || 'Calls are not allowed!';
        sock.sendMessage(callerId, {
          text: `┌─ *${botName}* ─┐\n│\n│ ${customMsg}\n│\n└─────────────┘`
        }, { quoted: fake }).catch(() => {});
      }
    } catch (e) {}
  });
}

// ═══════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════

// Init dirs and commands
init();
setGlobals();

// ─── Dave X style startup frame ──────────────────────────────────────────────
(function printStartupFrame() {
  const border   = chalk.hex('#00ff00');
  const titleClr = chalk.hex('#ff00ff').bold;
  const info     = chalk.hex('#00ffff');
  const W = 48;
  const center = (s) => {
    const len = s.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').length;
    const pad = Math.max(0, Math.floor((W - len) / 2));
    return ' '.repeat(pad) + s + ' '.repeat(Math.max(0, W - len - pad));
  };
  console.log('');
  console.log(border('┌' + '─'.repeat(W) + '┐'));
  console.log(border('│') + titleClr(center('ADEVOS-X BOT v3.0.0')) + border('│'));
  console.log(border('├' + '─'.repeat(W) + '┤'));
  console.log(border('│') + info(center('Powered by Dave-Tech | CJS Mode')) + border('│'));
  console.log(border('│') + info(center('WhatsApp Multi-Device Bot')) + border('│'));
  console.log(border('├' + '─'.repeat(W) + '┤'));
  console.log(border('│') + info(center('Loading modules...')) + border('│'));
  console.log(border('└' + '─'.repeat(W) + '┘'));
  console.log('');
})();

checkEnvStatus();

console.log(chalk.cyan(`[ADEVOS-X BOT] 🖥️  Platform : ${global.server}`));
console.log(chalk.cyan(`[ADEVOS-X BOT] 📦 Node     : ${process.version}`));
console.log('');

// ── Memory management ──
console.log(chalk.cyan('[ADEVOS-X BOT] 📊 Initializing memory optimization...'));

if (global.gc) {
  console.log(chalk.green('[ADEVOS-X BOT] ✅ Garbage collection enabled!'));
} else {
  console.log(chalk.yellow('[ADEVOS-X BOT] ⚠️ GC not available. Run with --expose-gc to enable.'));
}

setInterval(() => {
  if (global.gc) {
    try {
      global.gc();
      const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
      if (rss > 200) console.log(chalk.cyan(`[ADEVOS-X BOT] 🧹 GC: RAM ${rss} MB`));
    } catch (e) {}
  }
}, 30_000);

setInterval(() => {
  const rss = process.memoryUsage().rss / 1024 / 1024;
  if (rss >= 270) {
    console.log(chalk.red(`[ADEVOS-X BOT] 🔴 CRITICAL RAM: ${rss.toFixed(2)} MB — forcing cleanup...`));
    if (global.gc) { try { global.gc(); } catch (e) {} }
    if (global.sock?.msgRetryCounterCache) global.sock.msgRetryCounterCache.clear();
  } else if (rss >= 250) {
    console.log(chalk.hex('#FFA500')(`[ADEVOS-X BOT] 🟠 High RAM: ${rss.toFixed(2)} MB — forcing GC...`));
    if (global.gc) { try { global.gc(); } catch (e) {} }
  } else if (rss >= 240) {
    console.log(chalk.yellow(`[ADEVOS-X BOT] ⚠️ RAM: ${rss.toFixed(2)} MB (Warning)`));
  }
}, 60_000);

setInterval(() => {
  try {
    let cleaned = 0;
    Object.keys(store.messages || {}).forEach(jid => {
      if (store.messages[jid]?.length > 30) {
        cleaned += store.messages[jid].length - 30;
        store.messages[jid].splice(0, store.messages[jid].length - 30);
      }
    });
    if (cleaned > 0) console.log(chalk.gray(`🗑️ Cleaned ${cleaned} messages`));
    if (global.gc) { try { global.gc(); } catch (e) {} }
  } catch (e) {}
}, 180_000);

console.log(chalk.green('[ADEVOS-X BOT] ✅ Memory optimization enabled (Low RAM mode)\n'));

// ── Error handlers ──
process.on('uncaughtException', (err) => {
  console.log(chalk.red('[ADEVOS-X BOT] ❌ Uncaught exception:'), err.message);
  console.log(chalk.yellow('[ADEVOS-X BOT] 🔄 Attempting to reconnect...'));
  setTimeout(() => connect().catch(() => {}), 5000);
});

process.on('unhandledRejection', (reason) => {
  console.log(chalk.red('[ADEVOS-X BOT] ❌ Unhandled Rejection:'), reason);
});

// ── Start ──
initDb()
  .then(() => {
    setGlobals();
    connect().catch(err => {
      console.error(chalk.red('[ADEVOS-X BOT] FATAL:'), err);
      process.exit(1);
    });
  })
  .catch(err => {
    console.error(chalk.red('[ADEVOS-X BOT] DB init error:'), err.message);
    connect().catch(err2 => {
      console.error(chalk.red('[ADEVOS-X BOT] FATAL:'), err2);
      process.exit(1);
    });
  });
