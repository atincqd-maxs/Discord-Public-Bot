const { PermissionFlagsBits } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const emojis = require('../utils/emojis.js');

module.exports = {
  name: 'bestof',
  description: 'Seçilen kullanıcıya "Best Of" rolünü verir.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const commandName = module.exports.name;
    const commandSettings = settings[commandName] || {};
    const guildConfig = commandSettings.config || {};
    const bestofRoles = guildConfig.bestof_roles || {};
    const bestofRoleId = bestofRoles[message.guild.id] || null;

    if (!args[0]) {
      console.error(`[${commandName}] Hata: Hedef ID belirtilmedi. Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, null, 'FAIL: NO_TARGET_ID');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    let targetMember;
    try {
      targetMember = await message.guild.members.fetch(args[0]);
    } catch {
      console.error(`[${commandName}] Hata: Hedef kullanıcı bulunamadı (${args[0]}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, { id: args[0], user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    if (!bestofRoleId) {
        console.error(`[${commandName}] Hata: Best Of rolü ayarlanmamış. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_BESTOF_ROLE_CONFIGURED');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    let bestofRole;
    try {
        bestofRole = await message.guild.roles.fetch(bestofRoleId);
        if (!bestofRole) throw new Error('Rol bulunamadı');
    } catch (roleError) {
         console.error(`[${commandName}] Hata: Ayarlanan Best Of rolü (${bestofRoleId}) sunucuda bulunamadı. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}`);
         await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: BESTOF_ROLE_NOT_FOUND');
         message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
         return;
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        console.error(`[${commandName}] Hata: Botun 'Rolleri Yönet' izni yok. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: BOT_NO_PERMISSION (ManageRoles)');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }
    if (botMember.roles.highest.position <= bestofRole.position) {
        console.error(`[${commandName}] Hata: Bot hiyerarşisi Best Of rolü için yetersiz. Bot Rolü Pozisyon: ${botMember.roles.highest.position}, Best Of Rol Pozisyon: ${bestofRole.position}. Kullanan: ${authorMember.id}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (HIERARCHY - Bot role too low for bestof role)');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }
    if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
        console.error(`[${commandName}] Hata: Bot hiyerarşisi hedef üye için yetersiz. Bot Rolü Pozisyon: ${botMember.roles.highest.position}, Hedef Rol Pozisyon: ${targetMember.roles.highest.position}. Kullanan: ${authorMember.id}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (HIERARCHY - Bot role too low for target)');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    try {
        if (!targetMember.roles.cache.has(bestofRole.id)) {
            await targetMember.roles.add(bestofRole, `Best Of: Yetkili ${authorMember.user.tag}`);
            await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'SUCCESS');
            await message.react(emojis.SUCCESS).catch(e => {
              if (e.code !== 10008) {
                  console.error(`[${commandName}] Başarı tepkisi eklenemedi:`, e);
              }
            });
        } else {
            console.error(`[${commandName}] Hata: Kullanıcı (${targetMember.id}) zaten Best Of rolüne sahip. Kullanan: ${authorMember.id}`);
            await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: ALREADY_HAS_ROLE');
            message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        }
    } catch (err) {
      console.error(`[${commandName}] Genel hata:`, err.message);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: ${err.message}`);
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
    }
  }
};