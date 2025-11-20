const { EmbedBuilder, Colors } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const { schedulePunishmentEnd } = require('../utils/punishmentManager.js');
const emojis = require('../utils/emojis.js');

async function logForgivenessToDb(db, punishment, forgivenBy) {
    if (!punishment || !forgivenBy) return;
    try {
        const query = `
            INSERT INTO ceza_af_logs
            (original_ceza_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, ceza_tipi, original_sebep, forgive_timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        const targetUser = await forgivenBy.guild.members.fetch(punishment.user_id).catch(() => null);

        await db.execute(query, [
            punishment.id,
            punishment.user_id,
            targetUser?.user?.tag || 'Bilinmiyor',
            targetUser?.user?.displayAvatarURL({ dynamic: true }) || null,
            forgivenBy.id,
            forgivenBy.user.tag,
            forgivenBy.user.displayAvatarURL({ dynamic: true }),
            punishment.ceza_tipi,
            punishment.sebep
        ]);
    } catch (dbError) {
        console.error("Affetme logunu veritabanına yazma hatası:", dbError);
    }
}


module.exports = {
  name: 'unvmute',
  description: 'Bir kullanıcının aktif ses susturmasını kaldırır.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const targetId = args[0];
    const cezaTipi = 'voicemute';
    const commandName = module.exports.name;

    if (!targetId || !/^\d{17,19}$/.test(targetId)) {
      console.error(`[${commandName}] Hata: Geçersiz hedef ID (${targetId}). Kullanan: ${authorMember.id}`);
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

    try {
      const [activePunishments] = await db.query(
        'SELECT id, user_id, ceza_tipi, sebep, channel_id, guild_id FROM cezalar WHERE user_id = ? AND ceza_tipi = ? AND aktif = 1 ORDER BY id DESC',
        [targetId, cezaTipi]
      );

      if (activePunishments.length === 0) {
        console.error(`[${commandName}] Hata: Aktif ses susturması bulunamadı (${targetId}). Kullanan: ${authorMember.id}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_ACTIVE_PUNISHMENTS');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
      }

      const forgivenessPromises = activePunishments.map(async (punishment) => {
           try {
               await db.execute('UPDATE cezalar SET aktif = 0 WHERE id = ?', [punishment.id]);
               const reasonForUnpunish = `Yetkili (${authorMember.user.tag}) tarafından affedildi.`;
               await schedulePunishmentEnd(message.client, db, punishment.guild_id, targetId, cezaTipi, punishment.channel_id, reasonForUnpunish);
               await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `SUCCESS: Removed punishment ID: ${punishment.id}`);
               const fullPunishmentData = { ...punishment, user_id: targetId };
               await logForgivenessToDb(db, fullPunishmentData, authorMember);
               return true;
           } catch (dbError) {
                console.error(`[${commandName}] Ses susturma affetme (ID: ${punishment.id}) hatası:`, dbError);
                await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: DB_ERROR ID: ${punishment.id}`);
                return false;
           }
      });

      const results = await Promise.all(forgivenessPromises);
      const successCount = results.filter(Boolean).length;

      if (successCount > 0) {
           await message.react(emojis.SUCCESS).catch(e => {
               if (e.code !== 10008) {
                   console.error(`[${commandName}] Başarı tepkisi eklenemedi:`, e);
               }
           });
      } else {
           console.error(`[${commandName}] Hata: Ses susturmaları kaldırılırken bir hata oluştu. Hedef: ${targetId}, Kullanan: ${authorMember.id}`);
           message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      }


    } catch (error) {
      console.error(`[${commandName}] Genel hata:`, error);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember ? targetMember : { id: targetId }, `FAIL: ${error.message}`);
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
    }
  }
};