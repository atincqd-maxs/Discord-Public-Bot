const { EmbedBuilder, Colors, PresenceStatusData, ActivityType } = require('discord.js');
const { logToDb } = require('../utils/logger.js');

function truncateMemberList(membersArray, maxLength = 1020) {
    let currentLength = 0;
    const truncatedList = [];
    let remainingCount = 0;

    for (let i = 0; i < membersArray.length; i++) {
        const line = membersArray[i];
        if (currentLength + line.length + 1 <= maxLength) {
            truncatedList.push(line);
            currentLength += line.length + 1;
        } else {
            remainingCount = membersArray.length - i;
            break;
        }
    }

    let result = truncatedList.join('\n');
    if (remainingCount > 0) {
        result += `\n... (${remainingCount} kişi daha)`;
    }
    return result || 'Yok';
}


module.exports = {
  name: 'rolbilgi',
  description: 'Belirtilen rol hakkında detaylı bilgi verir.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;

    if (!args[0]) {
      await logToDb(message.client, settings, db, 'rolbilgi', authorMember, null, 'FAIL: NO_ROLE_MENTION_OR_ID');
      return;
    }

    const roleMention = args[0];
    const roleIdMatch = roleMention.match(/^<@&(\d+)>$/) || roleMention.match(/^(\d+)$/);

    if (!roleIdMatch) {
       await logToDb(message.client, settings, db, 'rolbilgi', authorMember, null, 'FAIL: INVALID_ROLE_FORMAT');
       return;
    }

    const roleId = roleIdMatch[1];
    let role;
    try {
        role = await message.guild.roles.fetch(roleId);
        if (!role) throw new Error('Rol bulunamadı');
    } catch (e) {
        await logToDb(message.client, settings, db, 'rolbilgi', authorMember, { id: roleId }, 'FAIL: ROLE_NOT_FOUND');
        try {
            await message.reply('Belirtilen rol bulunamadı.');
        } catch (replyError) { console.error("Rol bulunamadı mesajı gönderilemedi:", replyError); }
        return;
    }

    try {
        await message.guild.members.fetch();

        const membersWithRole = role.members;
        const totalMembers = membersWithRole.size;

        const membersInVoiceList = [];
        const membersOnlineNotInVoiceList = [];
        const membersOfflineList = [];

        membersWithRole.forEach(member => {
            const voiceChannel = member.voice.channel;
            const presenceStatus = member.presence?.status || 'offline';

            if (voiceChannel) {
                membersInVoiceList.push(`${member} [\`${member.displayName}\`] (<#${voiceChannel.id}>)`);
            } else if (presenceStatus !== 'offline') {
                membersOnlineNotInVoiceList.push(`${member} [\`${member.displayName}\`]`);
            } else {
                membersOfflineList.push(`${member} [\`${member.displayName}\`]`);
            }
        });

        const offlineText = truncateMemberList(membersOfflineList);
        const inVoiceText = truncateMemberList(membersInVoiceList);
        const onlineNotInVoiceText = truncateMemberList(membersOnlineNotInVoiceList);


        const embed = new EmbedBuilder()
            .setDescription(
                `Rol Adı: ${role} (\`${role.id}\`)\n` +
                `Rol Rengi: ${role.hexColor} (\`${role.hexColor}\`)\n` +
                `Rol Pozisyon: #${role.position}\n` +
                `Rol Üye Sayısı: ${totalMembers}`
            )
            .addFields(
                { name: `Offline Üyeler (${membersOfflineList.length} Kişi)`, value: offlineText, inline: false },
                { name: `Sestedeki Üyeler (${membersInVoiceList.length} Kişi)`, value: inVoiceText, inline: false },
                { name: `Aktif - Seste Olmayan Üyeler (${membersOnlineNotInVoiceList.length} Kişi)`, value: onlineNotInVoiceText, inline: false }
            )
            .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL({dynamic: true}) });

        await message.reply({ embeds: [embed] });

        await logToDb(message.client, settings, db, 'rolbilgi', authorMember, role, `SUCCESS: Displayed info for role ${role.name}`);

    } catch (err) {
      console.error(`'.rolbilgi' komutu başarısız oldu:`, err);
      await logToDb(message.client, settings, db, 'rolbilgi', authorMember, role ? role : { id: roleId }, `FAIL: ${err.message}`);
       try {
            await message.reply('Rol bilgileri alınırken bir hata oluştu.');
        } catch (replyError) { console.error("Genel hata mesajı gönderilemedi:", replyError); }
    }
  }
};