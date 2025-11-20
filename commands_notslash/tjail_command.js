const { EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const { schedulePunishmentEnd } = require('../utils/punishmentManager.js');
const emojis = require('../utils/emojis.js');

function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([mhd])$/);
  if (!match) return null;
  const amount = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'm': return amount * 60 * 1000;
    case 'h': return amount * 60 * 60 * 1000;
    case 'd': return amount * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

module.exports = {
  name: 'tjail',
  description: 'Bir kullanıcıyı süreli olarak jaile atar.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const targetId = args[0];
    const guildSettings = message.client.guildSettings[message.guild.id] || {};
    const commandName = module.exports.name;

     if (message.client.activeYargi.has(targetId)) {
        console.error(`[${commandName}] Hata: Kullanıcı (${targetId}) zaten yargılı olduğu için jaile atılamaz. Kullanan: ${authorMember.id}`);
        await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId }, 'FAIL: TARGET_HAS_YARGI');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        try {
          const replyMsg = await message.reply(`<@${targetId}> adlı kullanıcı zaten yargılı olduğu için jaile atılamaz.`);
          setTimeout(() => {
            replyMsg.delete().catch(e => { if (e.code !== 10008) console.error("Mesaj silinemedi:", e); });
          }, 7000);
        } catch (e) { console.error("Yargı hatası mesajı gönderilemedi:", e); }
        return;
    }

    if (message.client.activeJails.has(targetId)) {
      console.error(`[${commandName}] Hata: Kullanıcı (${targetId}) zaten jail cezasına sahip.`);
      try {
        const replyMsg = await message.reply('Bu kullanıcının zaten aktif bir jail cezası bulunuyor.');
        setTimeout(() => {
          replyMsg.delete().catch(e => { if (e.code !== 10008) console.error("Mesaj silinemedi:", e); });
        }, 5000);
      } catch (e) { console.error("Ephemeral reply hatası:", e); }
      return;
    }

    const durationStr = args[1];
    const reasonInput = args.slice(2).join(' ');
    const reason = reasonInput.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ .]/g, '').trim();

    if (!targetId || !durationStr) {
      console.error(`[${commandName}] Hata: Geçersiz argümanlar. Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, null, 'FAIL: INVALID_ARGS');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
    if (!reason) {
        console.error(`[${commandName}] Hata: Sebep belirtilmedi. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId }, 'FAIL: NO_REASON');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    const jailRoleId = guildSettings.jail_role_id || null;
    if (!jailRoleId) {
        console.error(`[${commandName}] Hata: Jail rolü ayarlanmamış. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId }, 'FAIL: NO_JAIL_ROLE_CONFIGURED');
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

    if (targetMember.id === message.guild.ownerId) {
        console.error(`[${commandName}] Hata: Sunucu sahibi hedeflendi. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: TARGET_IS_OWNER');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    const durationMs = parseDuration(durationStr);
    const maxDuration = 7 * 24 * 60 * 60 * 1000;
    if (!durationMs) {
      console.error(`[${commandName}] Hata: Geçersiz süre formatı (${durationStr}). Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: INVALID_DURATION_FORMAT');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
    if (durationMs > maxDuration) {
      console.error(`[${commandName}] Hata: Süre çok uzun (${durationStr}). Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: DURATION_TOO_LONG');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
    if (durationMs <= 0) {
      console.error(`[${commandName}] Hata: Süre çok kısa (${durationStr}). Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: DURATION_TOO_SHORT');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    const bitis_tarihi = new Date(Date.now() + durationMs);

    try {
      const jailRole = await message.guild.roles.fetch(jailRoleId);
      if (!jailRole) {
         console.error(`[${commandName}] Hata: Ayarlanan jail rolü (${jailRoleId}) sunucuda bulunamadı. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
         await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: JAIL_ROLE_NOT_FOUND');
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
      if (botMember.roles.highest.position <= jailRole.position) {
            console.error(`[${commandName}] Hata: Bot hiyerarşisi jail rolü için yetersiz. Bot Rolü Pozisyon: ${botMember.roles.highest.position}, Jail Rolü Pozisyon: ${jailRole.position}. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
            await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (HIERARCHY - Bot role too low for jail role)');
            message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
            return;
       }
       if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
            console.error(`[${commandName}] Hata: Bot hiyerarşisi hedef üye için yetersiz. Bot Rolü Pozisyon: ${botMember.roles.highest.position}, Hedef Rol Pozisyon: ${targetMember.roles.highest.position}. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
            await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (HIERARCHY - Bot role too low for target)');
            message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
            return;
       }

       // Kullanıcının mevcut rollerini al ve kaydet
       const currentRoles = targetMember.roles.cache.filter(r => r.id !== message.guild.id);
       const currentRoleIds = currentRoles.map(r => r.id);
       const rolesJson = JSON.stringify(currentRoleIds);

       // Kullanıcının rollerini SIFIRLA ve SADECE jail rolünü ver
       try {
           await targetMember.roles.set([jailRole.id], `Jail: ${reason}`);
       } catch (roleErr) {
            console.error(`[${commandName}] Hata: Roller .set() ile ayarlanamadı. Kullanan: ${authorMember.id}, Hedef: ${targetId}`, roleErr);
            await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: ROLE_SET_FAILED ${roleErr.message}`);
            message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
            return;
       }

       // Kullanıcı seste ise bağlantısını kes
       if (targetMember.voice.channel) {
           try {
               await targetMember.voice.disconnect(`Jail: ${reason}`);
           } catch (disconnectErr) {
               // Hata olursa sadece logla, işlemi durdurma
               console.error(`[${commandName}] Kullanıcı (${targetMember.id}) sesten atılamadı: ${disconnectErr.message}`);
           }
       }

      // DB'ye kaydet (rollerle birlikte)
      await db.execute(
        'INSERT INTO cezalar (guild_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, ceza_tipi, sebep, bitis_tarihi, aktif, channel_id, previous_roles) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)',
        [message.guild.id, targetMember.id, targetMember.user.tag, targetMember.user.displayAvatarURL({ dynamic: true }), authorMember.id, authorMember.user.tag, authorMember.user.displayAvatarURL({ dynamic: true }), 'jail', reason, bitis_tarihi, rolesJson]
      );

      message.client.activeJails.set(targetMember.id, bitis_tarihi.getTime());

      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `SUCCESS: ${durationStr} - ${reason}`);

       await message.react(emojis.SUCCESS).catch(e => {if (e.code !== 10008) console.error("Tepki eklenemedi:", e)});

      setTimeout(() => {
        schedulePunishmentEnd(message.client, db, message.guild.id, targetMember.id, 'jail', null, 'Ceza süresi doldu.');
      }, durationMs);

    } catch (err) {
      if (err.code === 50013 || err.code === 40001) {
         console.error(`[${commandName}] Hata: API İzin Hatası (Rol Atama/Alma). Kullanan: ${authorMember.id}, Hedef: ${targetId}. Hata Kodu: ${err.code}`);
         await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (API)');
         message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      } else {
        console.error(`[${commandName}] Genel Hata:`, err);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: ${err.message}`);
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      }
    }
  }
};