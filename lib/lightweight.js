const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../data/messageStore.json');
const MAX_MESSAGES_PER_CHAT = 30;   // messages kept per JID
const MAX_JIDS = 300;               // max JID entries in messages store
const MAX_CONTACTS = 500;
const MAX_CHATS = 500;

// Keep only the fields needed for antidelete + message retry — strips heavy media buffers
function _slim(msg) {
  try {
    const { key, message, messageTimestamp, pushName } = msg;
    return { key, message, messageTimestamp, pushName };
  } catch { return msg; }
}

class LightweightStore {
  constructor() {
    this.messages = {};
    this.contacts = {};
    this.chats = {};
  }

  readFromFile() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        this.messages = data.messages || {};
        this.contacts = {};
        this.chats = {};
      }
    } catch (e) {
      this.messages = {};
      this.contacts = {};
      this.chats = {};
    }
  }

  writeToFile() {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify({ messages: this.messages }));
    } catch (e) {}
  }

  _evictMessages() {
    const keys = Object.keys(this.messages);
    if (keys.length > MAX_JIDS) {
      // Drop oldest-inserted JIDs first
      const remove = keys.slice(0, keys.length - MAX_JIDS);
      for (const k of remove) delete this.messages[k];
    }
  }

  _evictContacts() {
    const keys = Object.keys(this.contacts);
    if (keys.length > MAX_CONTACTS) {
      const remove = keys.slice(0, keys.length - MAX_CONTACTS);
      for (const k of remove) delete this.contacts[k];
    }
  }

  _evictChats() {
    const keys = Object.keys(this.chats);
    if (keys.length > MAX_CHATS) {
      const remove = keys.slice(0, keys.length - MAX_CHATS);
      for (const k of remove) delete this.chats[k];
    }
  }

  bind(ev) {
    ev.on('messages.upsert', ({ messages }) => {
      for (const msg of messages) {
        if (!msg.key?.remoteJid) continue;
        const jid = msg.key.remoteJid;
        if (!this.messages[jid]) this.messages[jid] = [];
        this.messages[jid].push(_slim(msg));
        if (this.messages[jid].length > MAX_MESSAGES_PER_CHAT) {
          this.messages[jid].splice(0, this.messages[jid].length - MAX_MESSAGES_PER_CHAT);
        }
      }
      this._evictMessages();
    });

    ev.on('contacts.upsert', (contacts) => {
      for (const contact of contacts) {
        if (contact.id) this.contacts[contact.id] = contact;
      }
      this._evictContacts();
    });

    ev.on('chats.upsert', (chats) => {
      for (const chat of chats) {
        if (chat.id) this.chats[chat.id] = chat;
      }
      this._evictChats();
    });
  }

  loadMessage(jid, id) {
    if (!this.messages[jid]) return null;
    return this.messages[jid].find(m => m.key?.id === id) || null;
  }

  getMessages(jid) {
    return this.messages[jid] || [];
  }
}

const store = new LightweightStore();
module.exports = store;
