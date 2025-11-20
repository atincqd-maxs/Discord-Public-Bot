const emojis = require('../utils/emojis.js');

module.exports = {
    name: 'tag',
    description: 'Sunucuya ayarlı olan tagı gönderir.',
    /**
     * @param {import('discord.js').Message} message
     * @param {string[]} args
     * @param {import('mysql2/promise').Pool} db
     * @param {Object} settings
     */
    async execute(message, args, db, settings) {
        
        const guildSettings = message.client.guildSettings[message.guild.id] || {};

        const guildTag = guildSettings.tag_text;

        if (guildTag && guildTag.trim() !== '') {
            await message.channel.send(guildTag);
        } else {
            message.react(emojis.ERROR || '❌').catch(() => {});
            const reply = await message.reply('Bu sunucu için bir tag ayarlanmamış');
            
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 5000);
        }
    }
};