const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, Colors } = require('discord.js');
const { logToDb } = require('../utils/logger.js');

function formatDbTimestampRelative(dbTimestamp) {
    if (!dbTimestamp) return '';
     try {
        const date = new Date(dbTimestamp);
        const unixTimestamp = Math.floor(date.getTime() / 1000);
        return `<t:${unixTimestamp}:R>`;
    } catch (e) {
        console.error("Timestamp formatlama hatası (R):", e);
        return '';
    }
}

function getGenderShort(gender) {
    if (gender === 'erkek') return 'E';
    if (gender === 'kadin') return 'K';
    return '?';
}


module.exports = {
  name: 'isimler',
  description: 'Bir kullanıcının geçmiş isim kayıtlarını gösterir.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const targetId = args[0];

    if (!targetId || !/^\d{17,19}$/.test(targetId)) {
      await logToDb(message.client, settings, db, 'isimler', authorMember, null, 'FAIL: INVALID_ARGS');
      return;
    }

    let targetUser;
    try {
      targetUser = await message.client.users.fetch(targetId);
    } catch (fetchError) {
      await logToDb(message.client, settings, db, 'isimler', authorMember, { id: targetId, user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND');
       try {
            await message.reply({ content: 'Geçersiz kullanıcı ID\'si veya kullanıcı bulunamadı.', allowedMentions: { repliedUser: false } });
        } catch (replyError) { console.error("Reply error:", replyError); }
      return;
    }

    try {
      const [allRegistrations] = await db.query(
        'SELECT id, timestamp, new_nickname, moderator_id, gender FROM registrations WHERE user_id = ? ORDER BY id DESC',
        [targetId]
      );

      if (allRegistrations.length === 0) {
        await logToDb(message.client, settings, db, 'isimler', authorMember, targetUser, 'FAIL: NO_RECORDS_FOUND');
         try {
            const noRecordEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL({dynamic: true}) })
                .setDescription(`<@${targetId}> adlı kullanıcının geçmiş isim kaydı bulunmuyor.`)
                .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL({dynamic: true}) });
            await message.reply({ embeds: [noRecordEmbed], allowedMentions: { repliedUser: false, users: [] } });
        } catch (replyError) { console.error("Reply error:", replyError); }
        return;
      }

      const itemsPerPage = 5;
      const totalPages = Math.ceil(allRegistrations.length / itemsPerPage);
      let currentPage = 1;

      const generateEmbed = (page) => {
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageRegistrations = allRegistrations.slice(startIndex, endIndex);

        const descriptionLines = pageRegistrations.map(reg => {
            const relativeTime = formatDbTimestampRelative(reg.timestamp);
            const nickname = reg.new_nickname || 'Bilinmiyor';
            const yetkili = reg.moderator_id ? `<@${reg.moderator_id}>` : 'Bilinmiyor';
            const gender = getGenderShort(reg.gender);

            return `${relativeTime} [${gender}] **${nickname}** : ${yetkili}`;
        });

        const embed = new EmbedBuilder()
          .setColor(Colors.DarkGrey)
          .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL({dynamic: true}) })
          .setDescription(descriptionLines.join('\n') || 'Bu sayfada kayıt yok.')
          .setFooter({ text: `${message.guild.name} • Sayfa ${page} / ${totalPages}`, iconURL: message.guild.iconURL({dynamic: true}) });

        return embed;
      };

      const generateButtons = (page) => {
          const firstId = `isimler_first_${targetId}_${message.id}`;
          const prevId = `isimler_prev_${targetId}_${message.id}`;
          const closeId = `isimler_close_${targetId}_${message.id}`;
          const nextId = `isimler_next_${targetId}_${message.id}`;
          const lastId = `isimler_last_${targetId}_${message.id}`;

          const first = new ButtonBuilder()
              .setCustomId(firstId)
              .setEmoji('1430704345044746391')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === 1);
          const previous = new ButtonBuilder()
              .setCustomId(prevId)
              .setEmoji('1430704329823748107')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === 1);
          const close = new ButtonBuilder()
              .setCustomId(closeId)
              .setEmoji('1430704097631404195')
              .setStyle(ButtonStyle.Secondary);
          const next = new ButtonBuilder()
              .setCustomId(nextId)
              .setEmoji('1430704535856484413')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === totalPages);
          const last = new ButtonBuilder()
              .setCustomId(lastId)
              .setEmoji('1430704489014366339')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === totalPages);

          return new ActionRowBuilder().addComponents(first, previous, close, next, last);
      };

      const initialEmbed = generateEmbed(currentPage);
      const initialRow = generateButtons(currentPage);

      const replyMessage = await message.reply({
          embeds: [initialEmbed],
          components: [initialRow],
          allowedMentions: { repliedUser: false }
      });

      const filter = (interaction) =>
        interaction.customId.startsWith(`isimler_`) &&
        interaction.customId.endsWith(`${targetId}_${message.id}`) &&
        interaction.user.id === message.author.id;

      const collector = replyMessage.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 120000 });

      collector.on('collect', async (interaction) => {
        try {
            const action = interaction.customId.split('_')[1];

            if (action === 'close') {
                await interaction.deferUpdate();
                try {
                    await replyMessage.delete();
                } catch (e) {
                    if (e.code !== 10008) {
                        console.error("Mesaj silinemedi (collector içinde):", e);
                    }
                }
                collector.stop('closed');
                return;
            }

            if (action === 'first') {
                currentPage = 1;
            } else if (action === 'prev') {
                currentPage = Math.max(1, currentPage - 1);
            } else if (action === 'next') {
                currentPage = Math.min(totalPages, currentPage + 1);
            } else if (action === 'last') {
                currentPage = totalPages;
            }

            const updatedEmbed = generateEmbed(currentPage);
            const updatedRow = generateButtons(currentPage);

            await interaction.update({ embeds: [updatedEmbed], components: [updatedRow] });
        } catch (interactionError) {
             console.error("Buton interaction hatası:", interactionError);
        }
      });

      collector.on('end', async (collected, reason) => {
        if (reason !== 'closed' && replyMessage && !replyMessage.deleted && replyMessage.components.length > 0) {
             try {
                const finalRow = generateButtons(currentPage);
                finalRow.components.forEach(button => button.setDisabled(true));
                await replyMessage.edit({ components: [finalRow] });
            } catch (editError) {
                if (editError.code !== 10008) {
                     console.error("İsimler mesajı butonları devre dışı bırakılamadı:", editError);
                }
            }
        }
      });

      await logToDb(message.client, settings, db, 'isimler', authorMember, targetUser, `SUCCESS: Displayed ${allRegistrations.length} records.`);


    } catch (mainError) {
      console.error("'.isimler' komutu genel hata:", mainError);
      await logToDb(message.client, settings, db, 'isimler', authorMember, targetUser ? targetUser : { id: targetId }, `FAIL: ${mainError.message}`);
       try {
            await message.reply({ content: 'İsim kayıtları alınırken bir hata oluştu.', allowedMentions: { repliedUser: false } });
        } catch (replyError) { console.error("Reply error:", replyError); }
    }
  }
};