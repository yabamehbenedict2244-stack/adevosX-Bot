'use strict';

const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const settings = require('../settings.js');

const USE_PG = !!(process.env.DATABASE_URL && /^postgre/i.test(process.env.DATABASE_URL));

// ============================================================
// DEFAULT SETTINGS
// ============================================================
const DEFAULT_SETTINGS = {
  botName: settings.botName || 'ADEVOS-X BOT',
  botOwner: settings.botOwner || 'DAVEX',
  ownerNumber: settings.ownerNumber || '',
  prefix: settings.prefix || '.',
  mode: settings.mode || 'public',
  version: settings.version || '3.0.0',
  alwaysonline: 'false',
  antibug: 'false',
  anticall: 'false',
  autotype: 'false',
  autoread: 'false',
  autoreact: 'off',
  autobio: 'false',
  chatbot: false,
  chatbotpm: false,
  fontstyle: 'none',
  autoblock: 'false',
  autoemoji: 'off',
  autorecord: 'false',
  autoviewstatus: 'true',
  autoreactstatus: 'false',
  autorecordtype: 'off',
  statusantidelete: 'false',
  antiedit: 'private',
  antidelete: 'off',
  menustyle: '2',
  menuimage: '',
  packname: settings.packname || 'ADEVOS-X BOT',
  author: settings.botOwner || 'DAVEX',
  watermark: settings.watermark || 'ADEVOS-X BOT',
  anticallmsg: '',
  warnLimit: '3',
  timezone: settings.timezone || 'Africa/Nairobi',
  createdAt: String(Date.now()),
};

// ============================================================
// ENCODE / DECODE
// ============================================================
function _encode(value) {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function _decode(str) {
  if (str === 'true') return true;
  if (str === 'false') return false;
  try { return JSON.parse(str); } catch { return str; }
}

// ============================================================
// POSTGRESQL BACKEND
// ============================================================
let pgPool = null;
const _mem = {
  settings: new Map(),
  commands: new Map(),
  chats: new Map(),
  stats: new Map(),
  ready: false,
};

async function initDb() {
  if (!USE_PG) {
    try { getDb(); _syncGlobals(); } catch (e) { console.error(chalk.red('[DB] SQLite init error:'), e.message); }
    return;
  }
  try {
    const { Pool } = require('pg');
    const sslDisabled = process.env.DATABASE_URL?.includes('sslmode=disable') || process.env.PGSSLMODE === 'disable';
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslDisabled ? false : { rejectUnauthorized: false }
    });

    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_data (
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (category, key)
      );
      CREATE TABLE IF NOT EXISTS chats (
        jid TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL DEFAULT 'null',
        PRIMARY KEY (jid, key)
      );
      CREATE TABLE IF NOT EXISTS stats (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '0'
      );
    `);

    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      await pgPool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, String(v)]);
    }
    await pgPool.query("INSERT INTO stats (key, value) VALUES ('totalCommands', '0') ON CONFLICT (key) DO NOTHING");
    await pgPool.query("INSERT INTO stats (key, value) VALUES ('totalMessages', '0') ON CONFLICT (key) DO NOTHING");
    await pgPool.query(`INSERT INTO stats (key, value) VALUES ('startTime', '${Date.now()}') ON CONFLICT (key) DO NOTHING`);

    const sr = await pgPool.query('SELECT key, value FROM settings');
    for (const r of sr.rows) _mem.settings.set(r.key, r.value);

    const cr = await pgPool.query('SELECT category, key, value FROM command_data');
    for (const r of cr.rows) _mem.commands.set(`${r.category}:${r.key}`, r.value);

    const chr = await pgPool.query('SELECT jid, key, value FROM chats');
    for (const r of chr.rows) _mem.chats.set(`${r.jid}:${r.key}`, r.value);

    const str = await pgPool.query('SELECT key, value FROM stats');
    for (const r of str.rows) _mem.stats.set(r.key, r.value);

    _mem.ready = true;
    _syncGlobals();
    console.log(chalk.green('[DB] PostgreSQL connected ✅  (in-memory cache loaded)'));
  } catch (e) {
    console.error(chalk.red('[DB] PostgreSQL init error:'), e.message);
    console.log(chalk.yellow('[DB] Falling back to SQLite'));
    try { getDb(); _syncGlobals(); } catch (e2) { console.error('[DB] SQLite fallback error:', e2.message); }
  }
}

function _pgWriteSetting(key, value) {
  if (!pgPool) return;
  pgPool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]).catch(() => {});
}
function _pgWriteCommand(category, key, value) {
  if (!pgPool) return;
  pgPool.query('INSERT INTO command_data (category, key, value) VALUES ($1, $2, $3) ON CONFLICT (category, key) DO UPDATE SET value = EXCLUDED.value', [category, key, value]).catch(() => {});
}
function _pgWriteChat(jid, key, value) {
  if (!pgPool) return;
  pgPool.query('INSERT INTO chats (jid, key, value) VALUES ($1, $2, $3) ON CONFLICT (jid, key) DO UPDATE SET value = EXCLUDED.value', [jid, key, value]).catch(() => {});
}
function _pgWriteStat(key, value) {
  if (!pgPool) return;
  pgPool.query('INSERT INTO stats (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]).catch(() => {});
}

// ============================================================
// SQLITE BACKEND (used when no DATABASE_URL)
// ============================================================
const DATA_DIR = path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'davex.db');
let db = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDb() {
  if (db) return db;
  ensureDataDir();
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  _initSqliteSchema();
  _seedSqliteDefaults();
  return db;
}

function _initSqliteSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS command_data (category TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL DEFAULT '{}', PRIMARY KEY (category, key));
    CREATE TABLE IF NOT EXISTS chats (jid TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL DEFAULT 'null', PRIMARY KEY (jid, key));
    CREATE TABLE IF NOT EXISTS users (jid TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL DEFAULT 'null', PRIMARY KEY (jid, key));
    CREATE TABLE IF NOT EXISTS stats (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '0');
  `);
}

function _seedSqliteDefaults() {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction((rows) => { for (const [k, v] of rows) insert.run(k, String(v)); });
  tx(Object.entries(DEFAULT_SETTINGS));
  db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)').run('totalCommands', '0');
  db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)').run('totalMessages', '0');
  db.prepare('INSERT OR IGNORE INTO stats (key, value) VALUES (?, ?)').run('startTime', String(Date.now()));
}

// ============================================================
// UNIFIED API
// ============================================================
function getSetting(key, defaultValue = null) {
  try {
    if (USE_PG && _mem.ready) {
      if (!_mem.settings.has(key)) return defaultValue;
      return _decode(_mem.settings.get(key));
    }
    if (USE_PG && !_mem.ready) return defaultValue;
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return defaultValue;
    return _decode(row.value);
  } catch { return defaultValue; }
}

function updateSetting(key, value) {
  try {
    const strVal = _encode(value);
    if (USE_PG) {
      _mem.settings.set(key, strVal);
      _pgWriteSetting(key, strVal);
    } else {
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, strVal);
    }
    _syncGlobals();
    return true;
  } catch { return false; }
}

function getAllSettings() {
  try {
    if (USE_PG && _mem.ready) {
      const out = {};
      for (const [k, v] of _mem.settings.entries()) out[k] = _decode(v);
      return out;
    }
    if (USE_PG && !_mem.ready) return {};
    const rows = getDb().prepare('SELECT key, value FROM settings').all();
    const out = {};
    for (const { key, value } of rows) out[key] = _decode(value);
    return out;
  } catch { return {}; }
}

function getCommandData(category, key = null, defaultValue = null) {
  try {
    if (USE_PG && _mem.ready) {
      if (key === null) {
        const prefix = `${category}:`;
        const out = {};
        for (const [k, v] of _mem.commands.entries()) {
          if (k.startsWith(prefix)) out[k.slice(prefix.length)] = _decode(v);
        }
        return Object.keys(out).length ? out : defaultValue;
      }
      const v = _mem.commands.get(`${category}:${key}`);
      return v !== undefined ? _decode(v) : defaultValue;
    }
    if (USE_PG && !_mem.ready) return defaultValue;
    if (key === null) {
      const rows = getDb().prepare('SELECT key, value FROM command_data WHERE category = ?').all(category);
      const out = {};
      for (const r of rows) out[r.key] = _decode(r.value);
      return Object.keys(out).length ? out : defaultValue;
    }
    const row = getDb().prepare('SELECT value FROM command_data WHERE category = ? AND key = ?').get(category, key);
    if (!row) return defaultValue;
    return _decode(row.value);
  } catch { return defaultValue; }
}

function updateCommandData(category, key, value) {
  try {
    if (typeof key === 'object' && value === undefined) {
      for (const [k, v] of Object.entries(key)) {
        const strVal = _encode(v);
        if (USE_PG) { _mem.commands.set(`${category}:${k}`, strVal); _pgWriteCommand(category, k, strVal); }
        else { getDb().prepare('INSERT OR REPLACE INTO command_data (category, key, value) VALUES (?, ?, ?)').run(category, k, strVal); }
      }
    } else {
      const strVal = _encode(value);
      if (USE_PG) { _mem.commands.set(`${category}:${key}`, strVal); _pgWriteCommand(category, key, strVal); }
      else { getDb().prepare('INSERT OR REPLACE INTO command_data (category, key, value) VALUES (?, ?, ?)').run(category, key, strVal); }
    }
    return true;
  } catch { return false; }
}

function getChatData(chatId, key, defaultValue = null) {
  try {
    if (USE_PG && _mem.ready) {
      const v = _mem.chats.get(`${chatId}:${key}`);
      return v !== undefined ? _decode(v) : defaultValue;
    }
    if (USE_PG && !_mem.ready) return defaultValue;
    const row = getDb().prepare('SELECT value FROM chats WHERE jid = ? AND key = ?').get(chatId, key);
    if (!row) return defaultValue;
    return _decode(row.value);
  } catch { return defaultValue; }
}

function updateChatData(chatId, key, value) {
  try {
    const strVal = _encode(value);
    if (USE_PG) { _mem.chats.set(`${chatId}:${key}`, strVal); _pgWriteChat(chatId, key, strVal); }
    else { getDb().prepare('INSERT OR REPLACE INTO chats (jid, key, value) VALUES (?, ?, ?)').run(chatId, key, strVal); }
    return true;
  } catch { return false; }
}

// ============================================================
// SUDO
// ============================================================
function getSudo() { return getCommandData('sudo', 'list', []); }
function isSudo(jid) {
  if (!jid) return false;
  const num = jid.split('@')[0].split(':')[0];
  return getSudo().some(s => String(s).split('@')[0].split(':')[0] === num);
}
function addSudo(jid) {
  const num = jid.split('@')[0].split(':')[0];
  const list = getSudo(); if (!list.includes(num)) list.push(num);
  return updateCommandData('sudo', 'list', list);
}
function removeSudo(jid) {
  const num = jid.split('@')[0].split(':')[0];
  return updateCommandData('sudo', 'list', getSudo().filter(s => String(s).split('@')[0].split(':')[0] !== num));
}

// ============================================================
// BANNED
// ============================================================
function getBanned() { return getCommandData('banned', 'list', []); }
function isBanned(jid) {
  const num = jid.split('@')[0].split(':')[0];
  return getBanned().some(s => String(s).split('@')[0].split(':')[0] === num);
}
function addBanned(jid) {
  const num = jid.split('@')[0].split(':')[0];
  const list = getBanned(); if (!list.includes(num)) list.push(num);
  return updateCommandData('banned', 'list', list);
}
function removeBanned(jid) {
  const num = jid.split('@')[0].split(':')[0];
  return updateCommandData('banned', 'list', getBanned().filter(s => String(s).split('@')[0].split(':')[0] !== num));
}

// ============================================================
// WELCOME / GOODBYE
// ============================================================
function getWelcome(chatId) { return getCommandData('welcome', chatId, null); }
function setWelcome(chatId, msg) { return updateCommandData('welcome', chatId, { enabled: true, message: msg }); }
function removeWelcome(chatId) { return updateCommandData('welcome', chatId, { enabled: false, message: '' }); }
function isWelcomeEnabled(chatId) { const w = getWelcome(chatId); return !!(w && w.enabled); }

function getGoodbye(chatId) { const g = getCommandData('goodbye', chatId, null); return g ? g.message : null; }
function setGoodbye(chatId, msg) { return updateCommandData('goodbye', chatId, { enabled: true, message: msg }); }
function removeGoodbye(chatId) { return updateCommandData('goodbye', chatId, { enabled: false, message: '' }); }
function isGoodbyeEnabled(chatId) { const g = getCommandData('goodbye', chatId, null); return !!(g && g.enabled); }

// ============================================================
// STATS
// ============================================================
function incrementStat(key) {
  try {
    if (USE_PG) {
      const current = parseInt(_mem.stats.get(key) || '0') || 0;
      const next = String(current + 1);
      _mem.stats.set(key, next); _pgWriteStat(key, next);
    } else {
      const row = getDb().prepare('SELECT value FROM stats WHERE key = ?').get(key);
      const current = row ? parseInt(row.value) || 0 : 0;
      getDb().prepare('INSERT OR REPLACE INTO stats (key, value) VALUES (?, ?)').run(key, String(current + 1));
    }
  } catch {}
}

function getStat(key) {
  try {
    if (USE_PG && _mem.ready) { const v = _mem.stats.get(key); return v ? (isNaN(v) ? v : Number(v)) : 0; }
    if (USE_PG && !_mem.ready) return 0;
    const row = getDb().prepare('SELECT value FROM stats WHERE key = ?').get(key);
    return row ? (isNaN(row.value) ? row.value : Number(row.value)) : 0;
  } catch { return 0; }
}

// ============================================================
// COMPAT
// ============================================================
function loadDatabase() {
  const s = getAllSettings();
  return {
    settings: s, chats: {}, users: {},
    stats: { totalCommands: getStat('totalCommands'), totalMessages: getStat('totalMessages'), startTime: getStat('startTime') },
    commandData: { sudo: getSudo(), banned: getBanned() }
  };
}

function _syncGlobals() {
  try {
    global.botName = getSetting('botName', 'ADEVOS-X BOT');
    global.botOwner = getSetting('botOwner', 'DAVEX');
    global.prefix = getSetting('prefix', '.');
    global.mode = getSetting('mode', 'public');
  } catch {}
}

// ============================================================
// FONT STYLE
// ============================================================
function applyFontStyle(text) {
  if (!text) return text;
  try {
    const style = getSetting('fontstyle', 'none');
    if (!style || style === 'none') return text;
    const { applyBotFont } = require('./fontStyles');
    return applyBotFont(text, style);
  } catch { return text; }
}

// ============================================================
// INIT (SQLite only — PG uses initDb() called externally)
// ============================================================
if (!USE_PG) {
  try { getDb(); _syncGlobals(); } catch (e) { console.error(chalk.red('[DB] Init error:'), e.message); }
}

module.exports = {
  getDb: USE_PG ? (() => null) : getDb,
  initDb,
  getSetting, updateSetting, getAllSettings, applyFontStyle,
  getChatData, updateChatData,
  getCommandData, updateCommandData,
  getSudo, isSudo, addSudo, removeSudo,
  getBanned, isBanned, addBanned, removeBanned,
  getWelcome, setWelcome, removeWelcome, isWelcomeEnabled,
  getGoodbye, setGoodbye, removeGoodbye, isGoodbyeEnabled,
  incrementStat, getStat, loadDatabase,
};
