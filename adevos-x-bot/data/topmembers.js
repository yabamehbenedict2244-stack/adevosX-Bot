import fs from 'fs';
import path from 'path';

const dataFilePath = path.join(__dirname, '..', 'data', 'messageCount.json');

function loadMessageCounts() {
    if (fs.existsSync(dataFilePath)) {
        const data = fs.readFileSync(dataFilePath);
        return JSON.parse(data);
    }
    return {};
}

function saveMessageCounts(messageCounts) {
    const dataDir = path.dirname(dataFilePath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(dataFilePath, JSON.stringify(messageCounts, null, 2));
}

function incrementMessageCount(groupId, userId) {
    const messageCounts = loadMessageCounts();

    if (!messageCounts[groupId]) {
        messageCounts[groupId] = {};
    }

    if (!messageCounts[groupId][userId]) {
        messageCounts[groupId][userId] = 0;
    }

    messageCounts[groupId][userId] += 1;
    saveMessageCounts(messageCounts);
}

module.exports = {
    name: 'topmembers',
    aliases: ['top', 'leaderboard'],
    category: 'group',
    description: 'Show top members by message count',
    usage: '.topmembers',
    execute: async (sock, message, args, context) => {
        const { chatId, reply, react } = context;

        if (!chatId.endsWith('@g.us')) {
            return await reply('This command is only available in group chats.');
        }

        try {
            await react('🏆');

            const messageCounts = loadMessageCounts();
            const groupCounts = messageCounts[chatId] || {};

            const sortedMembers = Object.entries(groupCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);

            if (sortedMembers.length === 0) {
                return await reply('No message activity recorded yet.');
            }

            let message = '🏆 **Top Members Based on Message Count:**\n\n';
            sortedMembers.forEach(([userId, count], index) => {
                const emoji = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
                message += `${emoji} ${index + 1}. @${userId.split('@')[0]} - ${count} messages\n`;
            });

            await sock.sendMessage(chatId, { 
                text: message, 
                mentions: sortedMembers.map(([userId]) => userId),
                ...context.channelInfo
            });
        } catch (error) {
            await reply('Failed to get top members list.');
        }
    },
    incrementMessageCount
};