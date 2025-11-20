const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kayitsiz')
    .setDescription('Rolü olmayan üyelere kayıtsız rolü verir. (Büyük sunucular için optimize edildi)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const roleId = '1430130025864237056';
    const priorityUserId = '1393703367787679932';
    const guild = interaction.guild;
    const ROLE_ADD_DELAY_MS = 300;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return interaction.editReply('Hata: Belirtilen rol (ID: 1430130025864237056) sunucuda bulunamadı.');
    }

    if (guild.members.me.roles.highest.position <= role.position) {
        return interaction.editReply('Hata: Botun rolü, bu rolü vermek için yeterince yüksek değil. Lütfen botun rolünü, kayıtsız rolünün üzerine taşıyın.');
    }

    let priorityMessage = '';
    try {
        const priorityMember = await guild.members.fetch(priorityUserId);
        if (priorityMember.roles.cache.size === 1) {
            await priorityMember.roles.add(role);
            priorityMessage = `Öncelikli kullanıcıya (${priorityMember.user.tag}) rol başarıyla verildi.`;
            console.log(`[KAYITSIZ GÖREVİ] Öncelikli rol verildi: ${priorityMember.user.tag}`);
        } else {
            priorityMessage = `Öncelikli kullanıcı (${priorityMember.user.tag}) zaten bir role sahip, atlandı.`;
        }
    } catch (err) {
        console.error(`Öncelikli kullanıcı (ID: ${priorityUserId}) işlenemedi:`, err.message);
        priorityMessage = `Öncelikli kullanıcı (ID: ${priorityUserId}) sunucuda bulunamadı veya bir hata oluştu.`;
    }

    await interaction.editReply(`${priorityMessage}\n\nSunucudaki 5000+ üye taranıyor... Bu işlem 1-2 dakika sürebilir, lütfen bekleyin.`);

    let allMembers;
    try {
        allMembers = await guild.members.fetch();
    } catch (err) {
        console.error(err);
        return interaction.followUp({ content: 'Hata: Sunucudaki üyeler çekilirken bir sorun oluştu. (Intent hatası olabilir)', flags: MessageFlags.Ephemeral });
    }

    const targetMembers = allMembers.filter(member => 
        member.roles.cache.size === 1 && member.id !== priorityUserId
    );

    if (targetMembers.size === 0) {
      return interaction.followUp({ content: 'Rolü olmayan (sadece @everyone rolüne sahip) başka üye bulunamadı.', flags: MessageFlags.Ephemeral });
    }

    const estimatedSeconds = (targetMembers.size * ROLE_ADD_DELAY_MS) / 1000;
    const estimatedMinutes = (estimatedSeconds / 60).toFixed(1);
    
    await interaction.followUp({ 
        content: `Tarama tamamlandı. Rolü olmayan ${targetMembers.size} üye bulundu.\n\nRol verme işlemi arka planda başlatılıyor. (Tahmini süre: ${estimatedMinutes} dakika).\n\n**İşlem bitince bir mesaj almayacaksınız.** (Konsolu takip edebilirsiniz.)`, 
        flags: MessageFlags.Ephemeral 
    });

    (async () => {
        let successCount = 0;
        let failCount = 0;
        console.log(`[KAYITSIZ GÖREVİ BAŞLADI] Sunucu: ${guild.name}. Hedef: ${targetMembers.size} üye. Hız: ${ROLE_ADD_DELAY_MS}ms`);
        
        for (const member of targetMembers.values()) {
            try {
                await member.roles.add(role);
                successCount++;
                console.log(`[KAYITSIZ GÖREVİ] Rol verildi: ${member.user.tag} (${member.id})`);
            } catch (err) {
                console.error(`Rol verilemedi (${member.user.tag}): ${err.message}`);
                failCount++;
            }
            await sleep(ROLE_ADD_DELAY_MS);
        }
        
        console.log(`[KAYITSIZ GÖREVİ TAMAMLANDI] Sunucu: ${guild.name}. Başarılı: ${successCount}, Başarısız: ${failCount}`);
    })();
  }
};
