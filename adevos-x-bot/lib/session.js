const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const SESSION_DIR = path.join(__dirname, '../data/session/auth.db');
const CREDS_PATH = path.join(SESSION_DIR, 'creds.json');

// =========================================================
// Load session from SESSION_ID environment variable
// =========================================================
function loadEnvSession() {
  const envSession = process.env.SESSION_ID;

  if (!envSession || envSession.trim() === '') {
    return false;
  }

  // Session already on disk — don't overwrite
  if (fs.existsSync(CREDS_PATH)) {
    console.log(chalk.cyan('[ADEVOS-X BOT] Existing session found on disk'));
    return true;
  }

  console.log(chalk.yellow('[ADEVOS-X BOT] SESSION_ID found in env — loading...'));

  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  try {
    let sessionString = envSession.trim();

    // Remove known prefixes
    const prefixes = ['ADEVOS-X BOT:', 'DAVE-X:~', 'DAVE-X:', 'DAVE-MD:', 'DAVE-AI:', 'SESSION:', 'BAILEYS:', 'MD:'];
    for (const prefix of prefixes) {
      if (sessionString.toUpperCase().startsWith(prefix.toUpperCase())) {
        sessionString = sessionString.slice(prefix.length).trim();
        break;
      }
    }

    let parsed = null;

    // Attempt 1: Raw JSON
    if (sessionString.startsWith('{') && sessionString.endsWith('}')) {
      try { parsed = JSON.parse(sessionString); } catch (e) {}
    }

    // Attempt 2: Standard base64
    if (!parsed) {
      try {
        const decoded = Buffer.from(sessionString, 'base64').toString('utf8');
        if (decoded.includes('{')) parsed = JSON.parse(decoded);
      } catch (e) {}
    }

    // Attempt 3: URL-safe base64
    if (!parsed) {
      try {
        const safe = sessionString.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(safe, 'base64').toString('utf8');
        if (decoded.includes('{')) parsed = JSON.parse(decoded);
      } catch (e) {}
    }

    // Attempt 4: Hex
    if (!parsed) {
      try {
        const decoded = Buffer.from(sessionString, 'hex').toString('utf8');
        if (decoded.includes('{')) parsed = JSON.parse(decoded);
      } catch (e) {}
    }

    // Attempt 5: Extract JSON from string
    if (!parsed) {
      const match = sessionString.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (e) {}
      }
    }

    if (!parsed) {
      console.log(chalk.red('[ADEVOS-X BOT] Could not parse SESSION_ID in any known format'));
      return false;
    }

    // Validate it's a Baileys session
    const required = ['noiseKey', 'signedIdentityKey', 'signedPreKey', 'registrationId'];
    const hasRequired = required.some(k => parsed.hasOwnProperty(k));
    if (!hasRequired) {
      console.log(chalk.red('[ADEVOS-X BOT] SESSION_ID missing required Baileys fields'));
      return false;
    }

    fs.writeFileSync(CREDS_PATH, JSON.stringify(parsed, null, 2));
    console.log(chalk.green('[ADEVOS-X BOT] Session loaded from SESSION_ID env successfully'));
    return true;

  } catch (error) {
    console.log(chalk.red('[ADEVOS-X BOT] Unexpected error loading session:'), error.message);
    return false;
  }
}

// =========================================================
// Parse and save a pasted session string
// =========================================================
function parseAndSaveSession(sessionInput) {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  try {
    let sessionData = sessionInput.trim();

    const prefixes = ['ADEVOS-X BOT:', 'DAVE-X:~', 'DAVE-X:', 'DAVE-MD:', 'DAVE-AI:', 'SESSION:', 'BAILEYS:', 'MD:'];
    for (const prefix of prefixes) {
      if (sessionData.toUpperCase().startsWith(prefix.toUpperCase())) {
        sessionData = sessionData.slice(prefix.length).trim();
        break;
      }
    }

    let credsJson = null;

    if (sessionData.startsWith('{') && sessionData.endsWith('}')) {
      try { credsJson = JSON.parse(sessionData); } catch (e) {}
    }

    if (!credsJson) {
      try {
        const decoded = Buffer.from(sessionData, 'base64').toString('utf8');
        if (decoded.includes('{')) credsJson = JSON.parse(decoded);
      } catch (e) {}
    }

    if (!credsJson) {
      try {
        const safe = sessionData.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(safe, 'base64').toString('utf8');
        if (decoded.includes('{')) credsJson = JSON.parse(decoded);
      } catch (e) {}
    }

    if (!credsJson) {
      const match = sessionData.match(/\{[\s\S]*\}/);
      if (match) {
        try { credsJson = JSON.parse(match[0]); } catch (e) {}
      }
    }

    if (!credsJson) {
      return { success: false, error: 'Could not parse session in any known format' };
    }

    const required = ['noiseKey', 'signedIdentityKey', 'signedPreKey', 'registrationId'];
    const hasRequired = required.some(k => credsJson.hasOwnProperty(k));
    if (!hasRequired) {
      return { success: false, error: 'Not a valid Baileys session (missing required keys)' };
    }

    fs.writeFileSync(CREDS_PATH, JSON.stringify(credsJson, null, 2));
    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

// =========================================================
// Clear session (for logout/re-pair)
// =========================================================
function clearSession() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    return true;
  } catch (e) {
    return false;
  }
}

function hasSession() {
  return fs.existsSync(CREDS_PATH);
}

module.exports = { loadEnvSession, parseAndSaveSession, clearSession, hasSession };
