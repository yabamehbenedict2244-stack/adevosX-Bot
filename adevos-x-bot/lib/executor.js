const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

global.commands = global.commands || new Map();
global.aliases = global.aliases || new Map();
global.fileCategories = global.fileCategories || {};

function registerCommands(commandsExport, filePath) {
  if (!Array.isArray(commandsExport)) {
    commandsExport = [commandsExport];
  }

  const fileName = path.basename(filePath, '.js');
  const categoryName = fileName.toLowerCase();

  for (const command of commandsExport) {
    if (!command || !command.name || typeof command.execute !== 'function') continue;
    command.filePath = filePath;
    global.commands.set(command.name, command);

    if (command.aliases && Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        global.aliases.set(alias, command);
      }
    }

    if (!global.fileCategories[categoryName]) {
      global.fileCategories[categoryName] = [];
    }
    if (!global.fileCategories[categoryName].includes(command.name)) {
      global.fileCategories[categoryName].push(command.name);
    }
  }
}

function loadCommandFile(filePath) {
  try {
    delete require.cache[require.resolve(filePath)];
    let commandsExport = require(filePath);
    if (commandsExport.default) commandsExport = commandsExport.default;
    registerCommands(commandsExport, filePath);
  } catch (err) {
    console.error(chalk.red(`Failed to load ${path.basename(filePath)}: ${err.message}`));
  }
}

function loadCommands() {
  const commandsPath = path.join(__dirname, '../plugins');
  global.fileCategories = {};

  function readDirRecursive(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        readDirRecursive(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        loadCommandFile(entryPath);
      }
    }
  }

  readDirRecursive(commandsPath);

  for (const category in global.fileCategories) {
    global.fileCategories[category].sort();
  }

  fs.watch(commandsPath, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.js')) return;
    const filePath = path.join(commandsPath, filename);
    if (fs.existsSync(filePath)) {
      console.log(chalk.yellowBright(`[ADEVOS-X BOT] Reloading: ${filename}`));
      loadCommandFile(filePath);
    } else {
      global.commands.forEach((cmd, name) => {
        if (cmd.filePath === filePath) global.commands.delete(name);
      });
    }
  });

  const total = global.commands.size;
  console.log(chalk.greenBright(`[ADEVOS-X BOT] Loaded ${total} commands from ${Object.keys(global.fileCategories).length} categories`));
}

module.exports = { loadCommands };
