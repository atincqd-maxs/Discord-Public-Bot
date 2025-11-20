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
  name: 'vmute',
  description: 'Bir kullanıcıyı sesten susturur.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const targetId = args[0];
    const commandName = module.exports.name;

    if (message.client.activeVoiceMutes.has(targetId)) {
       console.error(`[${commandName}] Hata: Kullanıcı (${targetId}) zaten ses susturmasına sahip.`);
      try {
        const replyMsg = await message.reply('Bu kullanıcının zaten aktif bir ses susturması bulunuyor.');
        setTimeout(() => {
          replyMsg.delete().catch(e => {
            if (e.code !== 10008) console.error("Mesaj silinemedi:", e);
          });
        }, 5000);
      } catch (e) {
        console.error("Ephemeral reply hatası:", e);
      }
      return;
    }

    const durationStr = args[1];
    const reasonInput = args.slice(2).join(' ');
    const reason = reasonInput.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ .]/g, '').trim() || 'Sebep belirtilmedi.'; // Regex güncellendi

    if (!targetId || !durationStr) {
      console.error(`[${commandName}] Hata: Geçersiz argümanlar. Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, null, 'FAIL: INVALID_ARGS');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    let targetMember;
    try {
      targetMember = await message.guild.members.fetch(targetId);
    } catch {
      console.error(`[${commandName}] Hata: Hedef kullanıcı bulunamadı (${targetId}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId, user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    const durationMs = parseDuration(durationStr);
    const maxDuration = 60 * 60 * 1000;

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
      if (targetMember.voice.channel) {
         if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MuteMembers)) {
            console.error(`[${commandName}] Hata: Botun 'Üyeleri Sustur' izni yok. Sunucu: ${message.guild.id}`);
            await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: BOT_NO_PERMISSION (MuteMembers)');
            message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
            return;
         }
        await targetMember.voice.setMute(true, reason);
      } else {
           console.log(`[${commandName}] Bilgi: Hedef (${targetId}) seste olmadığı için sadece veritabanına kaydedildi.`);
      }

      await db.execute(
        'INSERT INTO cezalar (guild_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, ceza_tipi, sebep, bitis_tarihi, aktif, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)',
        [message.guild.id, targetMember.id, targetMember.user.tag, targetMember.user.displayAvatarURL({ dynamic: true }), authorMember.id, authorMember.user.tag, authorMember.user.displayAvatarURL({ dynamic: true }), 'voicemute', reason, bitis_tarihi]
      );

      message.client.activeVoiceMutes.set(targetMember.id, bitis_tarihi.getTime());

      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `SUCCESS: ${durationStr} - ${reason}`);

      await message.react(emojis.SUCCESS).catch(e => {if (e.code !== 10008) console.error("Tepki eklenemedi:", e)});


      setTimeout(() => {
        schedulePunishmentEnd(message.client, db, message.guild.id, targetMember.id, 'voicemute', null, 'Ceza süresi doldu.');
      }, durationMs);

    } catch (err) {
      console.error(`[${commandName}] Genel hata:`, err.message);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: ${err.message}`);
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
    }
  }
};