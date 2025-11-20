const { PermissionFlagsBits } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const emojis = require('../utils/emojis.js');

module.exports = {
  name: 'ban',
  description: 'Bir kullanıcıyı sunucudan kalıcı olarak yasaklar.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const targetId = args[0];
    const commandName = module.exports.name;
    const reasonInput = args.slice(1).join(' ');
    
    if (!targetId || !/^\d{17,19}$/.test(targetId)) {
      console.error(`[${commandName}] Hata: Geçersiz hedef ID (${targetId}). Kullanan: ${authorMember.id}`);
      await logToDb(message.client, settings, db, commandName, authorMember, null, 'FAIL: INVALID_ARGS');
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
       try {
          const replyMsg = await message.reply('Lütfen geçerli bir kullanıcı ID\'si girin. (`.ban <ID> <Sebep>`)');
          setTimeout(() => {
            replyMsg.delete().catch(e => { if (e.code !== 10008) console.error("Mesaj silinemedi:", e); });
          }, 7000);
        } catch (e) { console.error("Geçersiz ID hatası mesajı gönderilemedi:", e); }
      return;
    }
    
    if (!reasonInput) {
        console.error(`[${commandName}] Hata: Sebep belirtilmedi. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId }, 'FAIL: NO_REASON');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
         try {
          const replyMsg = await message.reply('Lütfen bir sebep girin. (`.ban <ID> <Sebep>`)');
          setTimeout(() => {
            replyMsg.delete().catch(e => { if (e.code !== 10008) console.error("Mesaj silinemedi:", e); });
          }, 7000);
        } catch (e) { console.error("Sebep yok hatası mesajı gönderilemedi:", e); }
        return;
    }

    const reason = reasonInput.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ .]/g, '').trim();
    if (!reason) {
        console.error(`[${commandName}] Hata: Geçerli karakter içeren sebep belirtilmedi. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId }, 'FAIL: NO_REASON (Invalid Chars)');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    const botMember = message.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.BanMembers)) {
        console.error(`[${commandName}] Hata: Botun 'Üyeleri Yasakla' izni yok. Sunucu: ${message.guild.id}, Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
        await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId }, 'FAIL: BOT_NO_PERMISSION (BanMembers)');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
    }

    let targetMember;
    try {
      targetMember = await message.guild.members.fetch(targetId);
    } catch {
      // Kullanıcı sunucuda değilse bile banlamaya çalış (ID ban)
      console.log(`[${commandName}] Bilgi: Hedef kullanıcı (${targetId}) sunucuda bulunamadı. ID üzerinden banlama denenecek.`);
      targetMember = null;
    }

    if (targetMember) {
        if (targetMember.id === message.guild.ownerId) {
            console.error(`[${commandName}] Hata: Sunucu sahibi hedeflendi. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
            await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: TARGET_IS_OWNER');
            message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
            return;
        }

        if (botMember.roles.highest.position <= targetMember.roles.highest.position) {
                console.error(`[${commandName}] Hata: Bot hiyerarşisi hedef üye için yetersiz. Bot Rolü Pozisyon: ${botMember.roles.highest.position}, Hedef Rol Pozisyon: ${targetMember.roles.highest.position}. Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
                await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (HIERARCHY - Bot role too low for target)');
                message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
                return;
        }
         if (!targetMember.bannable) {
             console.error(`[${commandName}] Hata: API: Kullanıcı banlanamaz (bannable=false). Kullanan: ${authorMember.id}, Hedef: ${targetId}`);
             await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (API - Not Bannable)');
             message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
             return;
         }
    }
    
    const targetTag = targetMember ? targetMember.user.tag : 'Bilinmiyor (ID Ban)';
    const targetAvatar = targetMember ? targetMember.user.displayAvatarURL({ dynamic: true }) : null;

    try {
        const banReason = `Ban: ${reason} (Yetkili: ${authorMember.user.tag} - ${authorMember.id})`;
        await message.guild.members.ban(targetId, { reason: banReason, deleteMessageSeconds: 0 });
        
        // Loglama için target nesnesini hazırla
        const targetLog = targetMember || { id: targetId, user: { tag: targetTag, displayAvatarURL: () => targetAvatar } };
        
        await logToDb(message.client, settings, db, commandName, authorMember, targetLog, `SUCCESS: Kalıcı Ban - ${reason}`);

        await message.channel.send(`<@${targetId}> (${targetTag}) adlı üye, <@${authorMember.id}> adlı yetkili tarafından kalıcı olarak yasaklandı.`);
        
        message.react(emojis.SUCCESS).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });

    } catch (err) {
      if (err.code === 10013) { // Unknown User
          console.error(`[${commandName}] Hata: Kullanıcı ID'si (${targetId}) bulunamadı (Unknown User). Kullanan: ${authorMember.id}`);
          await logToDb(message.client, settings, db, commandName, authorMember, { id: targetId, user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND (ID Ban Fail)');
          message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      } else if (err.code === 50013) { // Missing Permissions
         console.error(`[${commandName}] Hata: API İzin Hatası (Ban). Kullanan: ${authorMember.id}, Hedef: ${targetId}. Hata Kodu: ${err.code}`);
         await logToDb(message.client, settings, db, commandName, authorMember, targetMember, 'FAIL: NO_PERMISSION (API - Ban)');
         message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      } else {
        console.error(`[${commandName}] Genel Hata:`, err);
        await logToDb(message.client, settings, db, commandName, authorMember, targetMember, `FAIL: ${err.message}`);
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
      }
    }
  }
};