async function isAdmin(sock, chatId, senderId) {
  try {
    const groupMetadata = await sock.groupMetadata(chatId);
    const botId = sock.user.id;
    const botPhone = botId.split('@')[0].split(':')[0];

    const participant = groupMetadata.participants.find(p => {
      const pPhone = p.id.split('@')[0].split(':')[0];
      const sPhone = (senderId || '').split('@')[0].split(':')[0];
      return pPhone === sPhone;
    });

    const bot = groupMetadata.participants.find(p => {
      const pPhone = p.id.split('@')[0].split(':')[0];
      return pPhone === botPhone;
    });

    const isBotAdmin = !!(bot && (bot.admin === 'admin' || bot.admin === 'superadmin'));
    const isSenderAdmin = !!(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));

    return { isSenderAdmin, isBotAdmin };
  } catch (error) {
    return { isSenderAdmin: false, isBotAdmin: false };
  }
}

module.exports = isAdmin;
