const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const emojis = require('../utils/emojis.js');

module.exports = {
  name: 'sleep',
  description: 'Bir kullanıcıyı AFK kanalına gönderir.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const commandName = module.exports.name;
    const commandSettings = settings[commandName] || {};
    const guildConfig = commandSettings.config || {};
    const afkChannels = guildConfig.afk_channels || {};
    const afkChannelId = afkChannels[message.guild.id] || null;

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

    if (!afkChannelId) {
        console.error(`[${commandName}] Hata: AFK kanalı ayarlanmamış. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_AFK_CHANNEL_CONFIGURED');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    const guild = await message.client.guilds.fetch(message.guild.id, { force: true });
    const freshTargetState = await guild.members.fetch({ user: targetMember.id, force: true });

    if (!freshTargetState.voice.channel) {
      console.error(`[${commandName}] Hata: Hedef seste değil (${targetMember.id}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: TARGET_NOT_IN_VOICE');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    if (freshTargetState.voice.channelId === afkChannelId) {
        console.error(`[${commandName}] Hata: Hedef zaten AFK kanalında (${targetMember.id}). Kullanan: ${authorMember.id}`);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: ALREADY_IN_AFK_CHANNEL');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.MoveMembers)) {
      console.error(`[${commandName}] Hata: Botun 'Üyeleri Taşı' izni yok. Sunucu: ${message.guild.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: BOT_NO_PERMISSION');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      return;
    }

    let afkChannel;
    try {
        afkChannel = await message.guild.channels.fetch(afkChannelId);
        if (!afkChannel || afkChannel.type !== ChannelType.GuildVoice) throw new Error('Kanal bulunamadı veya ses kanalı değil.');
    } catch (channelError) {
         console.error(`[${commandName}] Hata: Ayarlanan AFK kanalı (${afkChannelId}) bulunamadı veya ses kanalı değil. Sunucu: ${message.guild.id}`);
         await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: AFK_CHANNEL_NOT_FOUND');
         message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
         return;
    }


    try {
      await freshTargetState.voice.setChannel(afkChannel, `Yetkili: ${authorMember.user.tag} (.sleep)`);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'SUCCESS');
       await message.react(emojis.SUCCESS).catch(e => {
          if (e.code !== 10008) {
              console.error(`[${commandName}] Başarı tepkisi eklenemedi:`, e);
          }
      });
    } catch (err) {
      console.error(`[${commandName}] Genel hata:`, err.message);
      await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: ${err.message}`);
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
    }
  }
};