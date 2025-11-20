require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior } = require('@discordjs/voice');
const mysql = require('mysql2/promise');

const BOT_TOKEN2 = process.env.BOT_TOKEN2;
const BOT_ID_2 = process.env.BOT_ID_2;
const BOT_ID_2ENTIFIER = 'bot2'; // Bu botun paneldeki kimliği

if (!BOT_TOKEN2 || !BOT_ID_2) {
    console.error(`[voice-bot2] HATA: .env dosyasında BOT_TOKEN2 veya BOT_ID_2 eksik!`);
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

let db;

async function connectDb() {
    try {
        db = await mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 2, // Sadece bu işlem için az sayıda bağlantı yeterli
            queueLimit: 0
        });
        console.log('[voice-bot2] Veritabanına bağlanıldı.');
    } catch (e) {
        console.error('[voice-bot2] Veritabanı bağlantısı başarısız!', e);
        process.exit(1);
    }
}

async function getGuildSettings() {
    if (!db) return {};
    try {
        const [rows] = await db.query('SELECT guild_id, config FROM guild_settings');
        const settingsMap = {};
        for (const row of rows) {
            try {
                settingsMap[row.guild_id] = JSON.parse(row.config || '{}');
            } catch (parseError) {
                console.error(`[voice-bot2] Sunucu ${row.guild_id} ayarları ayrıştırılamadı:`, parseError);
                settingsMap[row.guild_id] = {};
            }
        }
        return settingsMap;
    } catch (e) {
        console.error('[voice-bot2] Sunucu ayarları alınırken hata oluştu:', e);
        return {};
    }
}

client.once('ready', async () => {
    console.log(`[voice-bot2] ${client.user.tag} olarak giriş yapıldı.`);
    client.user.setPresence({ status: 'invisible' });

    await connectDb();
    const guildSettings = await getGuildSettings();

    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const settings = guildSettings[guildId];
            if (!settings) continue;

            const channelIdToJoin = settings.auto_join_voice_channel_id;
            const botsToJoin = settings.auto_join_voice_bot_selection || [];

            if (!channelIdToJoin || !botsToJoin.includes(BOT_ID_2ENTIFIER)) {
                continue;
            }

            console.log(`[voice-bot2] ${guild.name} sunucusu için katılma ayarı bulundu (Kanal: ${channelIdToJoin}).`);

            const channel = await client.channels.fetch(channelIdToJoin).catch(() => null);

            if (channel && channel.type === ChannelType.GuildVoice) {
                // İzin kontrolü
                const perms = channel.permissionsFor(client.user.id);
                if (!perms || !perms.has('ViewChannel') || !perms.has('Connect')) {
                    console.warn(`[voice-bot2] HATA: ${guild.name} sunucusundaki ${channel.name} kanalına katılma izni yok.`);
                    continue;
                }

                // Kanala katıl ve bağlantıyı tut
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: false
                });

                const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });
                connection.subscribe(player);

                connection.on('stateChange', (oldState, newState) => {
                    console.log(`[voice-bot2] ${guild.name} Bağlantı Durumu: ${oldState.status} -> ${newState.status}`);
                    if (newState.status === 'ready') {
                        console.log(`[voice-bot2] BAŞARILI: ${guild.name} sunucusundaki ${channel.name} kanalına katıldı.`);
                    } else if (newState.status === 'disconnected' || newState.status === 'destroyed') {
                         console.warn(`[voice-bot2] ${guild.name} sunucusundaki bağlantı kesildi/yok edildi.`);
                         // İsteğe bağlı: Tekrar bağlanmayı deneyebilirsin
                    }
                });

                connection.on('error', (error) => {
                     console.error(`[voice-bot2] Bağlantı Hatası (${guild.name}):`, error.message);
                });

            } else {
                console.warn(`[voice-bot2] ${guild.name} sunucusunda ayarlanan kanal (${channelIdToJoin}) bulunamadı veya ses kanalı değil.`);
            }
        } catch (e) {
            console.error(`[voice-bot2] ${guild.name} sunucusu işlenirken hata oluştu:`, e.message);
        }
    }
});

client.login(BOT_TOKEN2);