const { EmbedBuilder } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const emojis = require('../utils/emojis.js');

function formatDuration(totalSeconds) {
    if (totalSeconds < 1) return '0 saniye';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let result = '';
    if (hours > 0) result += `${hours} saat, `;
    if (minutes > 0) result += `${minutes} dakika, `;
    if (seconds > 0 || result === '') result += `${seconds} saniye`;

    if (result.endsWith(', ')) {
        result = result.slice(0, -2);
    }
    return result;
}

function getDateXDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


module.exports = {
    name: 'stat',
    description: 'Kullanıcının belirtilen gün sayısındaki aktivite istatistiklerini gösterir.',
    async execute(message, args, db, settings) {
        const authorMember = message.member;
        const commandName = module.exports.name;

        let targetUser = message.author;
        let days = 7;

        if (args.length > 0) {
            const mentionedUser = message.mentions.users.first();
            const potentialId = args[0].match(/^\d{17,19}$/);
            const potentialDays = parseInt(args[0]);

            if (mentionedUser) {
                targetUser = mentionedUser;
                if (args.length > 1) {
                    const potentialDaysAfterMention = parseInt(args[1]);
                    if (!isNaN(potentialDaysAfterMention) && potentialDaysAfterMention >= 1 && potentialDaysAfterMention <= 30) {
                        days = potentialDaysAfterMention;
                    }
                }
            } else if (potentialId) {
                 try {
                     const fetchedUser = await message.client.users.fetch(potentialId[0]);
                     targetUser = fetchedUser;
                     if (args.length > 1) {
                         const potentialDaysAfterId = parseInt(args[1]);
                         if (!isNaN(potentialDaysAfterId) && potentialDaysAfterId >= 1 && potentialDaysAfterId <= 30) {
                            days = potentialDaysAfterId;
                         }
                     }
                 } catch {
                      await logToDb(message.client, settings, db, commandName, authorMember, { id: potentialId[0] }, 'FAIL: TARGET_NOT_FOUND (ID)');
                      message.react(emojis.ERROR);
                      return message.reply({ content: `Belirtilen ID (${potentialId[0]}) ile kullanıcı bulunamadı.`, allowedMentions: { repliedUser: false } });
                 }
            } else if (!isNaN(potentialDays) && potentialDays >= 1 && potentialDays <= 30) {
                days = potentialDays;
                 if (args.length > 1) {
                    const mentionedUserAfterDays = message.mentions.users.first();
                    const potentialIdAfterDays = args[1].match(/^\d{17,19}$/);
                    if(mentionedUserAfterDays) {
                         targetUser = mentionedUserAfterDays;
                    } else if (potentialIdAfterDays) {
                         try {
                            const fetchedUser = await message.client.users.fetch(potentialIdAfterDays[0]);
                            targetUser = fetchedUser;
                         } catch {
                            await logToDb(message.client, settings, db, commandName, authorMember, { id: potentialIdAfterDays[0] }, 'FAIL: TARGET_NOT_FOUND (ID)');
                            message.react(emojis.ERROR);
                            return message.reply({ content: `Belirtilen ID (${potentialIdAfterDays[0]}) ile kullanıcı bulunamadı.`, allowedMentions: { repliedUser: false } });
                         }
                    }
                }
            } else if (args[0]) {
                 await logToDb(message.client, settings, db, commandName, authorMember, null, 'FAIL: INVALID_ARGS');
                 message.react(emojis.ERROR);
                 return message.reply({ content: 'Kullanimlar: `.stat`, `.stat @kullanıcı`, `.stat 15`, `.stat @kullanıcı 10`, `.stat <ID> 5`', allowedMentions: { repliedUser: false } });
            }
        }

        const startDate = getDateXDaysAgo(days);
        const guildId = message.guild.id;
        const targetId = targetUser.id;

        try {
            const [voiceStats] = await db.query(
                `SELECT channel_id, SUM(total_seconds) as total, SUM(stream_seconds) as stream, SUM(camera_seconds) as camera
                 FROM user_voice_stats
                 WHERE user_id = ? AND guild_id = ? AND stat_date >= ?
                 GROUP BY channel_id`,
                [targetId, guildId, startDate]
            );

            const [messageStats] = await db.query(
                `SELECT channel_id, SUM(message_count) as total
                 FROM user_message_stats
                 WHERE user_id = ? AND guild_id = ? AND stat_date >= ?
                 GROUP BY channel_id`,
                [targetId, guildId, startDate]
            );

            let totalVoiceSeconds = 0;
            let totalStreamSeconds = 0;
            let totalCameraSeconds = 0;
            let totalMessages = 0;
            const channelVoiceStats = new Map();
            const channelStreamStats = new Map();
            const channelCameraStats = new Map();
            const channelMessageStats = new Map();
            const categoryVoiceStats = new Map();

            const guildSettings = message.client.guildSettings[guildId] || {};
            const statCategories = guildSettings.stat_categories || {};
            const categoryChannelMap = new Map();
             for (const categoryName in statCategories) {
                 categoryVoiceStats.set(categoryName, 0);
                 const channelIds = statCategories[categoryName] || [];
                 const channelSet = new Set(channelIds);
                 categoryChannelMap.set(categoryName, channelSet);
             }


            voiceStats.forEach(row => {
                const total = parseInt(row.total) || 0;
                const stream = parseInt(row.stream) || 0;
                const camera = parseInt(row.camera) || 0;
                const channelId = row.channel_id;

                totalVoiceSeconds += total;
                totalStreamSeconds += stream;
                totalCameraSeconds += camera;

                if (total > 0) channelVoiceStats.set(channelId, total);
                if (stream > 0) channelStreamStats.set(channelId, stream);
                if (camera > 0) channelCameraStats.set(channelId, camera);

                let foundCategory = false;
                for (const [categoryName, channelSet] of categoryChannelMap.entries()) {
                    if (channelSet.has(channelId)) {
                        categoryVoiceStats.set(categoryName, (categoryVoiceStats.get(categoryName) || 0) + total);
                        foundCategory = true;
                        break;
                    }
                }
            });

            messageStats.forEach(row => {
                const total = parseInt(row.total) || 0;
                totalMessages += total;
                if (total > 0) channelMessageStats.set(row.channel_id, total);
            });

            const sortedCategoryVoice = Array.from(categoryVoiceStats.entries()).sort(([, a], [, b]) => b - a);
            const sortedChannelVoice = Array.from(channelVoiceStats.entries()).sort(([, a], [, b]) => b - a);
            const sortedChannelStream = Array.from(channelStreamStats.entries()).sort(([, a], [, b]) => b - a);
            const sortedChannelCamera = Array.from(channelCameraStats.entries()).sort(([, a], [, b]) => b - a);
            const sortedChannelMessage = Array.from(channelMessageStats.entries()).sort(([, a], [, b]) => b - a);

            const embed = new EmbedBuilder()
                .setAuthor({ name: `${targetUser.username} adlı kullanıcının ${days} günlük istatistikleri`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL({ dynamic: true }) });

            let description = '';

            description += `**Toplam Kategori Sıralaması (${formatDuration(totalVoiceSeconds)})**\n`;
            if (sortedCategoryVoice.length > 0) {
                sortedCategoryVoice.forEach(([categoryName, seconds]) => {
                    description += `${emojis.SATIR_NOKTA} ${categoryName}: \`${formatDuration(seconds)}\`\n`;
                });
            } else {
                description += `${emojis.SATIR_NOKTA} *Veri yok.*\n`;
            }
            description += '\n';

            description += `**Toplam Kanal Sıralaması (Toplam ${sortedChannelVoice.length} kanalda durmuş)**\n`;
            if (sortedChannelVoice.length > 0) {
                sortedChannelVoice.slice(0, 10).forEach(([channelId, seconds]) => {
                    const channel = message.guild.channels.cache.get(channelId);
                    description += `${emojis.SATIR_NOKTA} ${channel ? channel.toString() : `#${channelId}`} \`${formatDuration(seconds)}\`\n`;
                });
            } else {
                description += `${emojis.SATIR_NOKTA} *Veri yok.*\n`;
            }
            description += '\n';

            description += `**Toplam Yayın Sıralaması (Toplam ${formatDuration(totalStreamSeconds)})**\n`;
            if (sortedChannelStream.length > 0) {
                sortedChannelStream.slice(0, 10).forEach(([channelId, seconds]) => {
                    const channel = message.guild.channels.cache.get(channelId);
                    description += `${emojis.SATIR_NOKTA} ${channel ? channel.toString() : `#${channelId}`} \`${formatDuration(seconds)}\`\n`;
                });
            } else {
                description += `${emojis.SATIR_NOKTA} *Veri yok.*\n`;
            }
            description += '\n';

            description += `**Toplam Kamera Sıralaması (Toplam ${formatDuration(totalCameraSeconds)})**\n`;
             if (sortedChannelCamera.length > 0) {
                sortedChannelCamera.slice(0, 10).forEach(([channelId, seconds]) => {
                    const channel = message.guild.channels.cache.get(channelId);
                    description += `${emojis.SATIR_NOKTA} ${channel ? channel.toString() : `#${channelId}`} \`${formatDuration(seconds)}\`\n`;
                });
            } else {
                description += `${emojis.SATIR_NOKTA} *Veri yok.*\n`;
            }
            description += '\n';

            description += `**Toplam Mesaj Kanal Sıralaması (${totalMessages} mesaj)**\n`;
             if (sortedChannelMessage.length > 0) {
                sortedChannelMessage.slice(0, 10).forEach(([channelId, count]) => {
                    const channel = message.guild.channels.cache.get(channelId);
                    description += `${emojis.SATIR_NOKTA} ${channel ? channel.toString() : `#${channelId}`} \`${count} mesaj\`\n`;
                });
            } else {
                description += `${emojis.SATIR_NOKTA} *Veri yok.*\n`;
            }

            embed.setDescription(description.trim());

            await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
            await logToDb(message.client, settings, db, commandName, authorMember, targetUser, `SUCCESS: ${days} days`);

        } catch (error) {
            console.error(`[${commandName}] Komut işlenirken hata oluştu:`, error);
            await logToDb(message.client, settings, db, commandName, authorMember, targetUser, `FAIL: ${error.message}`);
            message.react(emojis.ERROR);
            message.reply({ content: 'İstatistikler alınırken bir hata oluştu.', allowedMentions: { repliedUser: false } });
        }
    }
};