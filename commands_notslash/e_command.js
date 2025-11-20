const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, Colors } = require('discord.js');
const { logToDb } = require('../utils/logger.js');

module.exports = {
  name: 'e',
  description: 'Bir kullanıcıyı kaydeder.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;

    const targetId = args[0];
    const nameInput = args[1];
    const age = args[2];
    const emojiString = "<:tik2:1430962587692175420>";
    
    const commandSettings = settings[module.exports.name] || {};
    const guildConfig = commandSettings.config || {};
    const eRoles = (guildConfig.e_roles && guildConfig.e_roles[message.guild.id]) ? guildConfig.e_roles[message.guild.id] : {};
    const erkekRoleId = eRoles.erkek || null;
    const kadinRoleId = eRoles.kadin || null;

    if (!targetId || !nameInput || !age) {
      await logToDb(message.client, settings, db, 'e', authorMember, null, 'FAIL: INVALID_ARGS');
      return;
    }

    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 10 || ageNum > 60) {
      await logToDb(message.client, settings, db, 'e', authorMember, { id: targetId }, `FAIL: INVALID_AGE (${ageNum})`);
      return;
    }

    const nameRegex = /^[a-zA-ZğüşıöçİĞÜŞÖÇ]+$/;
    if (!nameRegex.test(nameInput)) {
      await logToDb(message.client, settings, db, 'e', authorMember, { id: targetId }, 'FAIL: INVALID_NAME');
      return;
    }

    let targetMember;
    try {
      targetMember = await message.guild.members.fetch(targetId);
    } catch {
      await logToDb(message.client, settings, db, 'e', authorMember, { id: targetId, user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND');
      try {
        const replyMsg = await message.reply('Kullanıcı bu sunucuda bulunamadı.');
        setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
      } catch (e) {
        console.error("Kullanıcı bulunamadı mesajı gönderilemedi:", e);
      }
      return;
    }

    const formattedName = nameInput.charAt(0).toUpperCase() + nameInput.slice(1).toLowerCase();
    const newNickname = `✧ ${formattedName} | ${ageNum}`;

    const embed = new EmbedBuilder()
      .setColor(Colors.DarkGrey)
      .setAuthor({ name: authorMember.user.tag, iconURL: authorMember.user.displayAvatarURL({ dynamic: true }) })
      .setDescription(
        `<@${targetMember.id}> kişisi için cinsiyet seçin.\n` +
        `Uygulanacak İsim: \`${newNickname}\``
      )
      .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL({ dynamic: true }) });

    const erkekBtnId = `reg_erkek_${targetMember.id}_${message.id}`;
    const kadinBtnId = `reg_kadin_${targetMember.id}_${message.id}`;

    const erkekBtn = new ButtonBuilder()
      .setCustomId(erkekBtnId)
      .setLabel('Erkek')
      .setStyle(ButtonStyle.Secondary);

    const kadinBtn = new ButtonBuilder()
      .setCustomId(kadinBtnId)
      .setLabel('Kadın')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(erkekBtn, kadinBtn);

    const replyMessage = await message.reply({ embeds: [embed], components: [row] });

    const filter = (i) =>
      (i.customId === erkekBtnId || i.customId === kadinBtnId) &&
      i.user.id === authorMember.id;

    const collector = replyMessage.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate();

      const gender = interaction.customId === erkekBtnId ? 'erkek' : 'kadin';
      const genderText = gender === 'erkek' ? 'Erkek' : 'Kadın';
      
      const roleIdToAdd = (gender === 'erkek') ? erkekRoleId : kadinRoleId;
      const roleIdToRemove = (gender === 'erkek') ? kadinRoleId : erkekRoleId;

      try {
        await targetMember.setNickname(newNickname, `Kayıt: ${authorMember.user.tag}`);
        
        if (roleIdToRemove) {
            try {
                if (targetMember.roles.cache.has(roleIdToRemove)) {
                    await targetMember.roles.remove(roleIdToRemove, `Kayıt (Rol Değişimi): ${authorMember.user.tag}`);
                }
            } catch (roleRemoveError) {
                console.error("Eski kayıt rolü kaldırma hatası:", roleRemoveError);
                await logToDb(message.client, settings, db, 'e', authorMember, targetMember, `FAIL: OLD_ROLE_REMOVE_ERROR (${roleRemoveError.message})`);
            }
        }
        
        if (roleIdToAdd) {
            try {
                const role = await message.guild.roles.fetch(roleIdToAdd);
                if (role) {
                    if (!targetMember.roles.cache.has(role.id)) {
                        await targetMember.roles.add(role, `Kayıt (${genderText}): ${authorMember.user.tag}`);
                    }
                } else {
                    await logToDb(message.client, settings, db, 'e', authorMember, targetMember, `FAIL: CONFIGURED_ROLE_NOT_FOUND ID: ${roleIdToAdd}`);
                }
            } catch (roleError) {
                console.error("Kayıt rolü verme hatası:", roleError);
                await logToDb(message.client, settings, db, 'e', authorMember, targetMember, `FAIL: ROLE_ADD_ERROR (${roleError.message})`);
            }
        }

        // --- YENİ EKLENEN KISIM ---
        // Genel sunucu ayarlarından Oto Rol'ü al
        const generalGuildSettings = message.client.guildSettings[message.guild.id] || {};
        const autoroleRoleId = generalGuildSettings.autorole_role_id;

        // Eğer bir Oto Rol ayarlanmışsa ve kullanıcı bu role sahipse, rolü kaldır.
        if (autoroleRoleId && targetMember.roles.cache.has(autoroleRoleId)) {
            try {
                await targetMember.roles.remove(autoroleRoleId, `Kayıt tamamlandı: ${authorMember.user.tag}`);
            } catch (autoroleRemoveError) {
                console.error(`Oto Rol (${autoroleRoleId}) kaldırma hatası (Kullanıcı: ${targetMember.id}):`, autoroleRemoveError.message);
                // Rol kaldırma başarısız olursa bile kayda devam et, sadece logla.
            }
        }
        // --- YENİ EKLENEN KISIM SONU ---
        
      } catch (err) {
        if (err.code === 50013) {
           await logToDb(message.client, settings, db, 'e', authorMember, targetMember, 'FAIL: NO_PERMISSION (HIERARCHY)');
           try {
              const replyMsg = await message.reply('Hiyerarşi Hatası: Botun rolü bu üyenin rolünden düşük olduğu için isim/rol değiştiremiyor.');
              setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
           } catch (e) { console.error("Hiyerarşi hatası mesajı gönderilemedi:", e); }
        } else {
          console.error(`'.e' komutu (nickname/role) başarısız oldu:`, err);
          await logToDb(message.client, settings, db, 'e', authorMember, targetMember, `FAIL: ${err.message}`);
        }
        collector.stop();
        return;
      }

      try {
        await db.execute(
          'INSERT INTO registrations (guild_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, new_nickname, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
              message.guild.id, 
              targetMember.id, 
              targetMember.user.tag, 
              targetMember.user.displayAvatarURL({ dynamic: true }), 
              authorMember.id, 
              authorMember.user.tag, 
              authorMember.user.displayAvatarURL({ dynamic: true }), 
              newNickname, 
              gender
          ]
        );
      } catch (dbError) {
        console.error("Kayıt veritabanı hatası:", dbError);
        await logToDb(message.client, settings, db, 'e', authorMember, targetMember, `FAIL: DB_INSERT_ERROR ${dbError.message}`);
        try {
          const replyMsg = await message.reply('Veritabanı hatası: Kayıt oluşturulamadı.');
          setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
        } catch (e) { console.error("DB hatası mesajı gönderilemedi:", e); }
        collector.stop();
        return;
      }
      
      await logToDb(message.client, settings, db, 'e', authorMember, targetMember, `SUCCESS: ${newNickname} (${gender})`);

      const updatedEmbed = new EmbedBuilder()
        .setColor(Colors.DarkGrey)
        .setAuthor({ name: authorMember.user.tag, iconURL: authorMember.user.displayAvatarURL({ dynamic: true }) })
        .setDescription(
          `<@${targetMember.id}> kişisinin adı **${newNickname}** olarak değiştirildi.\n\n` +
          `${emojiString} **${genderText}** olarak kaydedildi.`
        )
        .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL({ dynamic: true }) });

      const successBtn = new ButtonBuilder()
        .setCustomId(`reg_success_${message.id}`)
        .setLabel('Kayıt İşlemi Başarılı!')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      const successRow = new ActionRowBuilder().addComponents(successBtn);

      await interaction.editReply({ embeds: [updatedEmbed], components: [successRow] });
      collector.stop('completed');
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        try {
          await replyMessage.delete();
        } catch (e) {
          if (e.code !== 10008) {
            console.error("Süresi dolan kayıt mesajı silinemedi:", e);
          }
        }
      }
    });
  }
};