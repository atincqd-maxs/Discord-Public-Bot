const { PermissionFlagsBits } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const emojis = require('../utils/emojis.js');

module.exports = {
  name: 'cek',
  description: 'Bir kullanıcıyı yanınıza çeker.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const cache = message.client.voiceStateCache;
    const commandName = module.exports.name;

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

    const authorChannelId = cache.get(authorMember.id);
    const targetChannelId = cache.get(targetMember.id);

    if (!authorChannelId) {
      console.error(`[${commandName}] Hata: Komutu kullanan seste değil (${authorMember.id}).`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: AUTHOR_NOT_IN_VOICE');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
    if (!targetChannelId) {
      console.error(`[${commandName}] Hata: Hedef seste değil (${targetMember.id}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: TARGET_NOT_IN_VOICE');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
    if (authorChannelId === targetChannelId) {
      console.error(`[${commandName}] Hata: Kullanan ve hedef aynı kanalda (${targetMember.id}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: ALREADY_IN_CHANNEL');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers)) {
      console.error(`[${commandName}] Hata: Botun 'Üyeleri Taşı' izni yok. Sunucu: ${message.guild.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: BOT_NO_PERMISSION');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    try {
      await targetMember.voice.setChannel(authorChannelId);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'SUCCESS');
      await message.react(emojis.SUCCESS).catch(e => { if (e.code !== 10008) console.error(`[${commandName}] Başarı tepkisi eklenemedi:`, e);});
    } catch (err) {
      console.error(`[${commandName}] Genel hata:`, err.message);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: ${err.message}`);
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
    }
  }
};