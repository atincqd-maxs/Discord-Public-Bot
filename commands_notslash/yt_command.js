const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const emojis = require('../utils/emojis.js');

function formatRelativeTime(timestamp) {
    if (!timestamp) return 'Bilinmiyor';
    const seconds = Math.floor(new Date(timestamp).getTime() / 1000);
    return `<t:${seconds}:R>`;
}

module.exports = {
  name: 'yt',
  description: 'Kullanıcıya yetki rollerini gösterir ve verir.',
  
  async execute(message, args, db, settings) {
    
    if (!args[0]) {
      return message.reply('Lütfen bir kullanıcı ID\'si veya etiketi belirtin.');
    }
    const targetId = args[0].replace(/[<@!>]/g, '');
    const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      return message.reply('Bu kullanıcıyı sunucuda bulamadım.');
    }

    const executorMember = message.member;
    const guildSettings = message.client.guildSettings[message.guild.id] || {};
    const yetkiRolleri = guildSettings.yetki_roles || [];

    if (yetkiRolleri.length === 0) {
        return message.reply('Bu sunucuda henüz "Yetki Olarak Tanınan Roller" ayarlanmamış. Lütfen panelden ayarlayın.');
    }

    const executorHighestRole = executorMember.roles.highest;
    const botHighestRole = message.guild.members.me.roles.highest;

    const displayRoles = [];
    const menuOptions = [];

    for (const roleId of yetkiRolleri) {
        const role = await message.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
            console.warn(`[yt_command] Ayarlanan yetki rolü (ID: ${roleId}) sunucuda bulunamadı: ${message.guild.id}`);
            continue;
        }

        if (targetMember.roles.cache.has(role.id)) continue;
        if (executorHighestRole.position <= role.position) continue;
        if (botHighestRole.position <= role.position) continue;

        displayRoles.push(`${emojis.SATIR_NOKTA} <@&${role.id}>`);
        
        menuOptions.push({
            label: role.name,
            value: role.id,
            description: `ID: ${role.id}`
        });
    }

    let ilkYetkiData = { zaman: 'Kayıt Yok', veren: 'Kayıt Yok', roller: 'Kayıt Yok' };
    let sonYetkiData = { zaman: 'Kayıt Yok', veren: 'Kayıt Yok', roller: 'Kayıt Yok' };

    try {
        const [logs] = await db.query(
            'SELECT * FROM yetki_logs WHERE user_id = ? AND guild_id = ? ORDER BY timestamp ASC',
            [targetMember.id, message.guild.id]
        );

        if (logs.length > 0) {
            const ilkLog = logs[0];
            const sonLog = logs[logs.length - 1];
            
            const ilkRoller = JSON.parse(ilkLog.all_user_roles || ilkLog.added_roles || '[]')
                                .filter(r => r !== message.guild.id)
                                .map(r => `<@&${r}>`).join(', ') || 'Bilinmiyor';
            const sonRoller = JSON.parse(sonLog.all_user_roles || sonLog.added_roles || '[]')
                                .filter(r => r !== message.guild.id)
                                .map(r => `<@&${r}>`).join(', ') || 'Bilinmiyor';

            ilkYetkiData = {
                zaman: formatRelativeTime(ilkLog.timestamp),
                veren: `<@${ilkLog.moderator_id}>`,
                roller: ilkRoller
            };

            sonYetkiData = {
                zaman: formatRelativeTime(sonLog.timestamp),
                veren: `<@${sonLog.moderator_id}>`,
                roller: sonRoller
            };
        }
    } catch (e) {
        console.error("Yetki logları çekilirken hata:", e);
        if (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR') {
             ilkYetkiData = { zaman: 'TABLO HATASI (Botu Yeniden Başlat)', veren: 'TABLO HATASI', roller: 'TABLO HATASI' };
             sonYetkiData = { zaman: 'TABLO HATASI (Botu Yeniden Başlat)', veren: 'TABLO HATASI', roller: 'TABLO HATASI' };
        } else {
             ilkYetkiData = { zaman: 'Veritabanı Hatası', veren: 'Veritabanı Hatası', roller: 'Veritabanı Hatası' };
             sonYetkiData = { zaman: 'Veritabanı Hatası', veren: 'Veritabanı Hatası', roller: 'Veritabanı Hatası' };
        }
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: targetMember.user.tag, iconURL: targetMember.user.displayAvatarURL() })
      .setDescription(
        `${targetMember.toString()} adlı kişiye verilebilecek roller aşağıda listelenmiştir.\n\n` +
        (displayRoles.length > 0 ? displayRoles.join('\n') : '*Verilebilecek rol bulunamadı (Kullanıcı tüm yetkilere sahip veya sizin yetkiniz yetersiz).*')
      )
      .addFields(
        { 
            name: "İlk Yetki Durumu", 
            value: `**Alış Zamanı:** ${ilkYetkiData.zaman}\n**Yetkiyi Veren:** ${ilkYetkiData.veren}\n**Rolleri:** ${ilkYetkiData.roller}`,
            inline: false 
        },
        { 
            name: "Son Yetki Durumu", 
            value: `**Alış Zamanı:** ${sonYetkiData.zaman}\n**Yetkiyi Veren:** ${sonYetkiData.veren}\n**Rolleri:** ${sonYetkiData.roller}`,
            inline: false
        }
      )
      .setFooter({ text: `${message.author.tag} tarafından kullanıldı.`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`yt_yetki_ver_${message.author.id}_${targetMember.id}`)
        .setPlaceholder('Yetki Ver')
        .setMinValues(1);

    if (menuOptions.length > 0) {
        selectMenu.setMaxValues(menuOptions.length);
        selectMenu.addOptions(menuOptions);
        selectMenu.setDisabled(false);
    } else {
        selectMenu.setMaxValues(1);
        selectMenu.addOptions([{ label: 'Verilebilecek rol yok', value: 'none', default: true }]);
        selectMenu.setDisabled(true);
    }
    
    const row = new ActionRowBuilder().addComponents(selectMenu);

    await message.reply({ embeds: [embed], components: [row] });
  }
};