const { logToDb } = require('../utils/logger.js');
const emojis = require('../utils/emojis.js');

module.exports = {
  name: 'git',
  description: 'Bir kullanıcının sesli odasına gider.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
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
    } catch (e) {
      console.error(`[${commandName}] Hata: Hedef kullanıcı bulunamadı (${args[0]}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, { id: args[0], user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND');
      message.react(emojis.ERROR).catch(err => { if (err.code !== 10008) console.error("Hata tepkisi eklenemedi:", err); });
      return;
    }

    await message.guild.channels.fetch();

    const guild = await message.client.guilds.fetch(message.guild.id, { force: true });
    const freshAuthorState = await guild.members.fetch({ user: authorMember.id, force: true });
    const freshTargetState = await guild.members.fetch({ user: targetMember.id, force: true });

    if (!freshAuthorState.voice.channel) {
      console.error(`[${commandName}] Hata: Komutu kullanan seste değil (${authorMember.id}).`);
      await logToDb(message.client, settings, db, commandName, freshAuthorState, freshTargetState, 'FAIL: AUTHOR_NOT_IN_VOICE');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
    if (!freshTargetState.voice.channel) {
      console.error(`[${commandName}] Hata: Hedef seste değil (${targetMember.id}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, freshAuthorState, freshTargetState, 'FAIL: TARGET_NOT_IN_VOICE');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
    if (freshAuthorState.voice.channelId === freshTargetState.voice.channelId) {
      console.error(`[${commandName}] Hata: Kullanan ve hedef aynı kanalda (${targetMember.id}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, freshAuthorState, freshTargetState, 'FAIL: ALREADY_IN_CHANNEL');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }
    if (!freshTargetState.voice.channel.joinable) {
       console.error(`[${commandName}] Hata: Hedefin kanalı katılınabilir değil (${targetMember.id}). Kanal: ${freshTargetState.voice.channelId}, Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, freshAuthorState, freshTargetState, 'FAIL: CHANNEL_NOT_JOINABLE');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    try {
      await freshAuthorState.voice.setChannel(freshTargetState.voice.channel);
      await logToDb(message.client, settings, db, commandName, freshAuthorState, freshTargetState, 'SUCCESS');
      await message.react(emojis.SUCCESS).catch(e => { if (e.code !== 10008) console.error(`[${commandName}] Başarı tepkisi eklenemedi:`, e);});
    } catch (err) {
      console.error(`[${commandName}] Genel hata:`, err.message);
      await logToDb(message.client, settings, db, commandName, freshAuthorState, freshTargetState, `FAIL: ${err.message}`);
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
    }
  }
};