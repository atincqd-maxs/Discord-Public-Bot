const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const emojis = require('../utils/emojis.js');

async function sendChunkedMentions(message, title, membersMap, countForButton, categoryIndex) {
    const sentMessages = [];
    const membersArray = Array.from(membersMap.values());
    const mentions = membersArray.map(m => m.toString());
    const header = `**${title}** (\`${membersArray.length} kişi\`)\n`;

    if (membersArray.length === 0) {
        const msg = await message.channel.send({ content: header + "-", allowedMentions: { users: [] } });
        sentMessages.push(msg);
        return sentMessages;
    }

    const chunkSize = 80;
    for (let i = 0; i < mentions.length; i += chunkSize) {
        const chunk = mentions.slice(i, i + chunkSize);
        const content = chunk.join(", ");
        const chunkIndex = Math.floor(i / chunkSize);

        const claimButton = new ButtonBuilder()
            .setCustomId(`ysay_claim_${message.id}_${categoryIndex}_${chunkIndex}`)
            .setEmoji(emojis.YSAY_CLAIM)
            .setLabel(`(${countForButton}) İlgileniyorum.`)
            .setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder().addComponents(claimButton);

        let messageContent;
        if (i === 0) {
            messageContent = header + content;
        } else {
            messageContent = content;
        }

        const msg = await message.channel.send({ 
            content: messageContent, 
            components: [row],
            allowedMentions: { users: [] } 
        });
        sentMessages.push(msg);
    }
    return sentMessages;
}

module.exports = {
  name: 'ysay',
  description: 'Sunucudaki yetkilileri sayar ve listeler.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const commandName = module.exports.name;
    
    const guildSettings = message.client.guildSettings[message.guild.id] || {};
    const ysay_roles = guildSettings.ysay_roles;

    if (!ysay_roles || 
        (!ysay_roles.yonetim?.length && 
         !ysay_roles.alt_yonetim?.length && 
         !ysay_roles.orta_yonetim?.length && 
         !ysay_roles.ust_yonetim?.length)) {
        
        await logToDb(message.client, settings, db, commandName, authorMember, null, 'FAIL: YSAY_ROLES_NOT_CONFIGURED');
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        try {
            await message.reply({ content: 'Yetkili sayım (.ysay) rolleri bu sunucu için ayarlanmamış.', allowedMentions: { repliedUser: false } });
        } catch (e) { console.error("Reply error:", e); }
        return;
    }

    try {
        await message.guild.members.fetch();
        
        const allStaffMembers = new Map();
        const onlineStaffMembers = new Map();
        const offlineStaffMembers = new Map();
        
        const allCategories = [
            { title: "Yönetim Rolleri", ids: ysay_roles.yonetim || [], members: new Map() },
            { title: "Alt Yönetim Rolleri", ids: ysay_roles.alt_yonetim || [], members: new Map() },
            { title: "Orta Yönetim Rolleri", ids: ysay_roles.orta_yonetim || [], members: new Map() },
            { title: "Üst Yönetim Rolleri", ids: ysay_roles.ust_yonetim || [], members: new Map() }
        ];
        
        for (const category of allCategories) {
            if (!category.ids || category.ids.length === 0) continue;

            for (const roleId of category.ids) {
                const role = await message.guild.roles.fetch(roleId).catch(() => null);
                if (role) {
                    role.members.forEach(member => {
                        allStaffMembers.set(member.id, member);
                        category.members.set(member.id, member);
                    });
                }
            }
        }

        allStaffMembers.forEach(member => {
            if (member.voice.channel) {
                onlineStaffMembers.set(member.id, member);
            } else {
                offlineStaffMembers.set(member.id, member);
            }
        });

        const summaryMessage = [
            `**Toplam Yetkili Sayısı:** \`${allStaffMembers.size}\` kişi.`,
            `**Toplam Seste Olmayan Yetkili Sayısı:** \`${offlineStaffMembers.size}\` kişi.`
        ].join('\n');

        await message.channel.send({ content: summaryMessage, allowedMentions: { users: [] } });

        const sentMessages = [];
        let categoryIndex = 0;
        for (const category of allCategories) {
            const offlineInCategory = new Map();
            category.members.forEach((member, id) => {
                if (offlineStaffMembers.has(id)) {
                    offlineInCategory.set(id, member);
                }
            });

            const messages = await sendChunkedMentions(
                message, 
                category.title, 
                offlineInCategory, 
                offlineInCategory.size, 
                categoryIndex
            );
            sentMessages.push(...messages);
            categoryIndex++;
        }

        await logToDb(message.client, settings, db, commandName, authorMember, null, 'SUCCESS');

        if (sentMessages.length === 0) return;

        const claimedTasks = new Map();

        const collector = message.channel.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 3_600_000
        });

        collector.on('collect', async interaction => {
            try {
                if (!interaction.customId.startsWith(`ysay_claim_${message.id}`)) return;

                if (!onlineStaffMembers.has(interaction.user.id)) {
                    await interaction.reply({ 
                        content: 'Bu butonu sadece seste olan yetkililer kullanabilir.', 
                        ephemeral: true 
                    });
                    return;
                }

                if (claimedTasks.has(interaction.user.id)) {
                    const claimedCategoryTitle = claimedTasks.get(interaction.user.id);
                    await interaction.reply({ 
                        content: `Zaten \`${claimedCategoryTitle}\` ile ilgileniyorsun.`, 
                        ephemeral: true 
                    });
                    return;
                }

                await interaction.deferUpdate();

                const customIdParts = interaction.customId.split('_');
                const catIndex = parseInt(customIdParts[3], 10);
                const categoryTitle = allCategories[catIndex]?.title || 'Bilinmeyen Kategori';
                
                claimedTasks.set(interaction.user.id, categoryTitle);

                const disabledButton = new ButtonBuilder()
                    .setCustomId(`claimed_${interaction.id}`)
                    .setEmoji(emojis.YSAY_CLAIM)
                    .setLabel(` ${interaction.user.tag} ilgileniyor.`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);
                
                await interaction.message.edit({ 
                    components: [new ActionRowBuilder().addComponents(disabledButton)] 
                });
            
            } catch (e) {
                if (e.code === 10008 || e.code === 10062) {
                    console.warn(`[YSAY Collector] Etkileşim (reply/edit) başarısız oldu (Muhtemelen mesaj silindi veya etkileşim zaman aşımına uğradı). Kod: ${e.code}`);
                } else {
                    console.error("[YSAY Collector] Buton işlenirken hata:", e);
                }
            }
        });

        collector.on('end', async () => {
            for (const msg of sentMessages) {
                try {
                    const fetchedMsg = await message.channel.messages.fetch(msg.id).catch(()=>null);
                    if (!fetchedMsg || !fetchedMsg.components[0]) continue;

                    const firstComponent = fetchedMsg.components[0].components[0];
                    if (firstComponent.disabled) continue; 

                    const timedOutButton = new ButtonBuilder()
                        .setCustomId(firstComponent.customId || 'timed_out')
                        .setEmoji(firstComponent.emoji.id)
                        .setLabel(firstComponent.label)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true);

                    await fetchedMsg.edit({ 
                        components: [new ActionRowBuilder().addComponents(timedOutButton)] 
                    });
                } catch (e) {
                    if (e.code !== 10008) { 
                        console.error("[YSAY Collector End] Mesaj düzenlenirken hata:", e.message);
                    }
                }
            }
        });

    } catch (err) {
      console.error(`[${commandName}] Genel hata:`, err.message);
      await logToDb(message.client, settings, db, commandName, authorMember, null, `FAIL: ${err.message}`);
      message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
    }
  }
};