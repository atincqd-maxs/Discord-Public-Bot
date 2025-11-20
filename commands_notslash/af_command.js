const { EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ComponentType, Colors } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const { schedulePunishmentEnd } = require('../utils/punishmentManager.js');

function getCezaTuruAdi(cezaTipi, channelId = null) {
    if (cezaTipi === 'chatmute') return 'Mute';
    if (cezaTipi === 'voicemute') return 'VMute';
    if (cezaTipi === 'jail') return 'Jail';
    if (cezaTipi === 'uyari1') return 'Uyarı 1';
    if (cezaTipi === 'uyari2') return 'Uyarı 2';
    return (cezaTipi || '').toUpperCase();
}

function calculateDurationString(start, end) {
    try {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (isNaN(startDate) || isNaN(endDate) || !end) return 'Kalıcı';

        let diff = Math.abs(endDate.getTime() - startDate.getTime()) / 1000;

        const d = Math.floor(diff / (24 * 60 * 60));
        diff -= d * 24 * 60 * 60;
        const h = Math.floor(diff / (60 * 60));
        diff -= h * 60 * 60;
        const m = Math.floor(diff / 60);

        let result = '';
        if (d > 0) result += `${d} gün `;
        if (h > 0) result += `${h} saat `;
        if (m > 0) result += `${m} dakika `;

        const trimmedResult = result.trim();
        return trimmedResult === '' ? '< 1 dakika' : trimmedResult;
     } catch(e) {
        return '?';
     }
}

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
  name: 'af',
  description: 'Bir kullanıcının aktif cezasını kaldırır.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const targetId = args[0];

    if (!targetId || !/^\d{17,19}$/.test(targetId)) {
      await logToDb(message.client, settings, db, 'af', authorMember, null, 'FAIL: INVALID_ARGS');
      return;
    }

    let targetMember;
    try {
      targetMember = await message.guild.members.fetch(targetId);
    } catch {
      await logToDb(message.client, settings, db, 'af', authorMember, { id: targetId, user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND');
      return;
    }

    try {
      const [activePunishments] = await db.query(
        'SELECT id, user_id, ceza_tipi, sebep, channel_id, guild_id, baslangic_tarihi, bitis_tarihi, moderator_id, previous_roles FROM cezalar WHERE user_id = ? AND aktif = 1 ORDER BY id DESC',
        [targetId]
      );

      if (activePunishments.length === 0) {
        await logToDb(message.client, settings, db, 'af', authorMember, targetMember, 'FAIL: NO_ACTIVE_PUNISHMENTS');
        try {
            await message.reply({ content: `<@${targetId}> adlı kullanıcının aktif cezası bulunmuyor.`, allowedMentions: { repliedUser: false, users: [] } });
        } catch (e) { console.error("Reply error:", e); }
        return;
      }

      const maxOptions = 25;
      const punishmentListForEmbed = [];
      const options = activePunishments.slice(0, maxOptions).map((ceza, index) => {
        const cezaTuruAdiEmbed = getCezaTuruAdi(ceza.ceza_tipi);
        const cezaTuruAdiSelect = getCezaTuruAdi(ceza.ceza_tipi);

        const moderatorMention = ceza.moderator_id ? `<@${ceza.moderator_id}>` : 'Bilinmiyor';
        const sebep = ceza.sebep || 'Belirtilmemiş';
        const durationDisplay = calculateDurationString(ceza.baslangic_tarihi, ceza.bitis_tarihi);

        const embedLine = `${index + 1} [**${cezaTuruAdiEmbed}**] ${moderatorMention} : ${sebep}`;
        punishmentListForEmbed.push(embedLine);

        const selectLabel = `${cezaTuruAdiSelect} (${durationDisplay})`.substring(0, 100);
        const selectDescription = `Sebep: ${sebep}`.substring(0, 100);

        return new StringSelectMenuOptionBuilder()
          .setLabel(selectLabel)
          .setValue(ceza.id.toString())
          .setDescription(selectDescription);
      });

      let hasTooManyOption = false;
      if (activePunishments.length > maxOptions) {
          options.push(
              new StringSelectMenuOptionBuilder()
                .setLabel('DİKKAT: 25\'ten fazla ceza var!')
                .setValue('too_many')
                .setDescription('Tümü listelenemiyor.')
          );
          hasTooManyOption = true;
          punishmentListForEmbed.push('**... (25\'ten fazla ceza)**');
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`unpunish_select_${targetId}_${message.id}`)
        .setPlaceholder('Affetmek istediğiniz cezaları seçin...')
        .setMinValues(1)
        .setMaxValues(hasTooManyOption ? options.length -1 : options.length)
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embedDescription = [
          `<@${targetId}> adlı kullanıcının aktif cezaları aşağıda listelenmiştir.`,
          '',
          ...punishmentListForEmbed,
          ''
      ].join('\n');

      const embed = new EmbedBuilder()
        .setColor(Colors.DarkGrey)
        .setAuthor({ name: targetMember.user.username, iconURL: targetMember.user.displayAvatarURL({dynamic: true}) })
        .setDescription(embedDescription);


      const replyMessage = await message.reply({
          embeds: [embed],
          components: [row],
          allowedMentions: { repliedUser: false }
      });

      const filter = (interaction) =>
        interaction.customId === `unpunish_select_${targetId}_${message.id}` &&
        interaction.user.id === message.author.id &&
        interaction.isStringSelectMenu();

      const collector = replyMessage.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000 });

      collector.on('collect', async (interaction) => {

        await interaction.deferUpdate();

        const selectedCezaIds = interaction.values;
        let finalPlaceholder = 'Bir hata oluştu.';
        let successCount = 0;

        if (selectedCezaIds.includes('too_many')) {
            finalPlaceholder = 'Çok fazla ceza var, işlem yapılamadı.';
        } else {
            const forgivenessPromises = selectedCezaIds.map(async (selectedCezaId) => {
                const selectedPunishment = activePunishments.find(p => p.id.toString() === selectedCezaId);

                if (!selectedPunishment) {
                    await logToDb(message.client, settings, db, 'af', authorMember, targetMember, `FAIL: SELECTED_PUNISHMENT_NOT_FOUND ID: ${selectedCezaId}`);
                    return null;
                }

                try {
                    await db.execute('UPDATE cezalar SET aktif = 0 WHERE id = ?', [selectedCezaId]);

                    const reasonForUnpunish = `Yetkili (${authorMember.user.tag}) tarafından affedildi.`;
                    
                    if (selectedPunishment.ceza_tipi === 'uyari1' || selectedPunishment.ceza_tipi === 'uyari2') {
                        try {
                            const uyari1Settings = (settings['uyari1'] || {}).config || {};
                            const uyari1Roles = uyari1Settings.uyari1_roles || {};
                            const uyari1RoleId = uyari1Roles[message.guild.id] || null;

                            const uyari2Settings = (settings['uyari2'] || {}).config || {};
                            const uyari2Roles = uyari2Settings.uyari2_roles || {};
                            const uyari2RoleId = uyari2Roles[message.guild.id] || null;

                            let roleToRemoveId = null;
                            if (selectedPunishment.ceza_tipi === 'uyari1') {
                                roleToRemoveId = uyari1RoleId;
                            } else {
                                roleToRemoveId = uyari2RoleId;
                            }

                            if (roleToRemoveId) {
                                if (targetMember && targetMember.roles.cache.has(roleToRemoveId)) {
                                    await targetMember.roles.remove(roleToRemoveId, reasonForUnpunish);
                                }
                            }
                        } catch (roleError) {
                            console.error(`[AF] Uyarı rolü (${selectedPunishment.ceza_tipi}) kaldırılırken hata:`, roleError.message);
                        }
                    }
                    
                    await schedulePunishmentEnd(
                        message.client,
                        db,
                        selectedPunishment.guild_id,
                        targetId,
                        selectedPunishment.ceza_tipi,
                        selectedPunishment.channel_id,
                        reasonForUnpunish,
                        selectedPunishment.previous_roles // Rol verisi iletiliyor
                    );
                    await logToDb(message.client, settings, db, 'af', authorMember, targetMember, `SUCCESS: Removed punishment ID: ${selectedCezaId}`);
                    const fullSelectedPunishmentData = { ...selectedPunishment, user_id: targetId };
                    await logForgivenessToDb(db, fullSelectedPunishmentData, authorMember);
                    return selectedPunishment;
                } catch (dbError) {
                    console.error(`Ceza affetme (ID: ${selectedCezaId}) hatası:`, dbError);
                    await logToDb(message.client, settings, db, 'af', authorMember, targetMember, `FAIL: DB_ERROR ID: ${selectedCezaId}`);
                    return null;
                }
            });

            const results = await Promise.all(forgivenessPromises);
            const successfullyForgiven = results.filter(p => p !== null);
            successCount = successfullyForgiven.length;

            if (successCount > 0) {
                 finalPlaceholder = `Cezalar affedildi. (${successCount} adet)`;
            } else {
                finalPlaceholder = 'Seçilen cezalar affedilemedi veya bulunamadı.';
                if (results.length !== selectedCezaIds.length) {
                     finalPlaceholder = 'Veritabanı hatası oluştu.';
                }
            }
        }

        const finalOptions = options.map(opt => {
             const builder = new StringSelectMenuOptionBuilder()
                .setLabel(opt.data.label)
                .setValue(opt.data.value);
            if(opt.data.description) builder.setDescription(opt.data.description);
            return builder;
        });


        const disabledSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`unpunish_select_${targetId}_${message.id}_done`)
            .setPlaceholder(finalPlaceholder)
            .setDisabled(true)
            .addOptions(finalOptions.length > 0 ? finalOptions : [new StringSelectMenuOptionBuilder().setLabel('x').setValue('x')]);

        const disabledRow = new ActionRowBuilder().addComponents(disabledSelectMenu);

        await interaction.editReply({ embeds: [embed], components: [disabledRow] });

        collector.stop('user');
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time' && replyMessage && !replyMessage.deleted) {
            const finalOptions = options.map(opt => {
                const builder = new StringSelectMenuOptionBuilder()
                    .setLabel(opt.data.label)
                    .setValue(opt.data.value);
                if(opt.data.description) builder.setDescription(opt.data.description);
                return builder;
            });

            const timedOutSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`unpunish_select_${targetId}_${message.id}_timedout`)
                .setPlaceholder('Seçim süresi doldu.')
                .setDisabled(true)
                .addOptions(finalOptions.length > 0 ? finalOptions : [new StringSelectMenuOptionBuilder().setLabel('x').setValue('x')]);

            const timedOutRow = new ActionRowBuilder().addComponents(timedOutSelectMenu);
            replyMessage.edit({ embeds:[embed], components: [timedOutRow] }).catch(e=>{
                 if (e.code !== 10008) {
                    console.error("Mesaj düzenleme hatası (süre doldu):",e)
                 }
            });
        }
      });

    } catch (error) {
      console.error("'.af' komutu genel hata:", error);
      await logToDb(message.client, settings, db, 'af', authorMember, targetUser ? targetUser : { id: targetId }, `FAIL: ${error.message}`);
       try {
            await message.reply({ content: 'İşlem sırasında bir hata oluştu.', allowedMentions: { repliedUser: false } });
        } catch (replyError) { console.error("Reply error:", replyError); }
    }
  }
};
