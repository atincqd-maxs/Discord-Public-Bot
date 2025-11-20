const { PermissionFlagsBits } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const emojis = require('../utils/emojis.js');

module.exports = {
  name: 'uyari1',
  description: 'Kullanıcıya 1. seviye uyarı rolünü verir.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const commandName = module.exports.name;
    const otherWarningCommand = 'uyari2';
    const thisWarningType = 'uyari1';

    const commandSettings = settings[commandName] || {};
    const guildConfig = commandSettings.config || {};
    const uyari1Roles = guildConfig.uyari1_roles || {};
    const uyari1RoleId = uyari1Roles[message.guild.id] || null;

    const otherCommandSettings = settings[otherWarningCommand] || {};
    const otherGuildConfig = otherCommandSettings.config || {};
    const uyari2Roles = otherGuildConfig.uyari2_roles || {};
    const uyari2RoleId = uyari2Roles[message.guild.id] || null;


    const targetId = args[0];
    const reasonInput = args.slice(1).join(' ');
    const reason = reasonInput.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ ]/g, '').trim() || 'Sebep belirtilmedi.';


    if (!targetId) {
      console.error(`[${commandName}] Hata: Hedef ID belirtilmedi. Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, null, 'FAIL: NO_TARGET_ID');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
     if (!reasonInput) {
        console.error(`[${commandName}] Hata: Sebep belirtilmedi. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId }, 'FAIL: NO_REASON');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    let targetMember;
    try {
      targetMember = await message.guild.members.fetch(targetId);
    } catch {
      console.error(`[${commandName}] Hata: Hedef kullanıcı bulunamadı. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}, Hedef ID: ${targetId}`);
      await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId, user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    if (!uyari1RoleId) {
        console.error(`[${commandName}] Hata: Uyarı 1 rolü ayarlanmamış. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_UYARI1_ROLE_CONFIGURED');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    if (uyari1RoleId === uyari2RoleId && uyari1RoleId !== null) {
        console.error(`[${commandName}] Hata: Uyarı rolleri aynı olamaz. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: WARNING_ROLES_ARE_SAME');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    let uyariRole;
    try {
        uyariRole = await message.guild.roles.fetch(uyari1RoleId);
        if (!uyariRole) throw new Error('Rol bulunamadı');
    } catch (roleError) {
         console.error(`[${commandName}] Hata: Ayarlanan uyarı 1 rolü (${uyari1RoleId}) sunucuda bulunamadı. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
         await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: UYARI1_ROLE_NOT_FOUND');
         message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
         return;
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        console.error(`[${commandName}] Hata: Botun 'Rolleri Yönet' izni yok. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: BOT_NO_PERMISSION (ManageRoles)');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }
    if (botMember.roles.highest.position <= uyariRole.position) {
        console.error(`[${commandName}] Hata: Bot hiyerarşisi uyarı 1 rolü için yetersiz. Bot Rolü Pozisyon: ${botMember.roles.highest.position}, Uyarı Rolü Pozisyon: ${uyariRole.position}. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (HIERARCHY - Bot role too low for warning role)');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }
    if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
        console.error(`[${commandName}] Hata: Bot hiyerarşisi hedef üye için yetersiz. Bot Rolü Pozisyon: ${botMember.roles.highest.position}, Hedef Rol Pozisyon: ${targetMember.roles.highest.position}. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (HIERARCHY - Bot role too low for target)');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    try {
         const hasUyari1 = targetMember.roles.cache.has(uyari1RoleId);
         const hasUyari2 = uyari2RoleId ? targetMember.roles.cache.has(uyari2RoleId) : false;

        if (hasUyari1) {
             console.error(`[${commandName}] Hata: Kullanıcı (${targetId}) zaten uyarı 1 rolüne sahip. Kullanan: ${authorMember.id}`);
             await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: ALREADY_HAS_ROLE');
             message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
             return;
        }

        if (hasUyari2) {
            try {
                await db.execute('UPDATE cezalar SET aktif = 0 WHERE user_id = ? AND ceza_tipi = ? AND aktif = 1', [targetId, otherWarningCommand]);
                const uyari2RoleToRemove = await message.guild.roles.fetch(uyari2RoleId);
                if (uyari2RoleToRemove && botMember.roles.highest.position > uyari2RoleToRemove.position) {
                    await targetMember.roles.remove(uyari2RoleToRemove, `Uyarı 1 veriliyor: Yetkili ${authorMember.user.tag}`);
                } else {
                     await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: CANNOT_REMOVE_OTHER_WARNING_ROLE (Hierarchy/Not Found)');
                }
            } catch (removeError) {
                console.error(`[${commandName}] Uyarı 2 rolü (${uyari2RoleId}) kaldırılamadı:`, removeError);
                await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: REMOVE_UYARI2_ROLE_ERROR (${removeError.message})`);
            }
        }

        const sql = `
            INSERT INTO cezalar
            (guild_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, ceza_tipi, sebep, baslangic_tarihi, aktif)
            VALUES (?, ?, ?, ?, ?, ?, ?, '${thisWarningType}', ?, NOW(), ?)
        `;
        const params = [
            message.guild.id,
            targetMember.id,
            targetMember.user.tag,
            targetMember.user.displayAvatarURL({ dynamic: true }) ?? null,
            authorMember.id,
            authorMember.user.tag,
            authorMember.user.displayAvatarURL({ dynamic: true }) ?? null,
            reason,
            1
        ];

        await db.execute(sql, params);


        await targetMember.roles.add(uyariRole, `Uyarı 1: Yetkili ${authorMember.user.tag} - Sebep: ${reason}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `SUCCESS: ${reason}`);
        await message.react(emojis.SUCCESS).catch(e => {
            if (e.code !== 10008) {
                console.error(`[${commandName}] Başarı tepkisi eklenemedi:`, e);
            }
        });

    } catch (err) {
      console.error(`[${commandName}] Genel hata:`, err.message);
       if (err.sqlMessage) {
           await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: DB_INSERT_ERROR ${err.sqlMessage}`);
       } else {
           await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: ${err.message}`);
       }
       message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
    }
  }
};