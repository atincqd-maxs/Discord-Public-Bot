require('dotenv').config()
const { autoJoinVoiceChannels } = require('./utils/voice-join.js');
const fs = require('fs')
const express = require('express');
const { Client, Events, GatewayIntentBits, Collection, Routes, MessageFlags, EmbedBuilder, Colors, PermissionFlagsBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js')
const { REST } = require('@discordjs/rest')
const mysql = require('mysql2/promise')
const { schedulePunishmentEnd } = require('./utils/punishmentManager.js');
const emojis = require('./utils/emojis.js');

const prefix = '.'
const STAT_UPDATE_INTERVAL = 60000;

const clientIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildPresences,
  GatewayIntentBits.GuildModeration
];

const client = new Client({ intents: clientIntents });
const client2 = new Client({ intents: clientIntents });

client.commands = new Collection();
client.prefixCommands = new Collection();
client.activeVoiceMutes = new Map();
client.activeChatMutes = new Map();
client.activeJails = new Map();
client.activeYargi = new Map();
client.voiceStateCache = new Map();
client.voiceStateStats = new Map();
client.activeVoiceConnections = new Map();
client.activeVoicePlayers = new Map();
client.statUpdateInterval = null;

client2.commands = new Collection();
client2.prefixCommands = new Collection();
client2.activeVoiceMutes = new Map();
client2.activeChatMutes = new Map();
client2.activeJails = new Map();
client2.activeYargi = new Map();
client2.voiceStateCache = new Map();
client2.activeVoiceConnections = new Map();
client2.activeVoicePlayers = new Map();

const syncTriggerPath = './sync.trigger'
const guildDataPath = './guild_data.json'

if (!fs.existsSync(syncTriggerPath)) fs.writeFileSync(syncTriggerPath, Date.now().toString())
if (!fs.existsSync(guildDataPath)) fs.writeFileSync(guildDataPath, '{}');
if (!fs.existsSync('./commands_notslash')) fs.mkdirSync('./commands_notslash');

let settings = {}
let guildSettings = {}
let db
let mainBotReady = false;

async function initDb() {
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    })
    console.log('[Bilgi] Veritabanına Bağlanıldı')

    await db.execute(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id VARCHAR(255) NOT NULL PRIMARY KEY,
        config JSON NOT NULL
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS voice_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guild_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          user_tag VARCHAR(255),
          user_avatar VARCHAR(512),
          channel_id VARCHAR(255) NOT NULL,
          channel_name VARCHAR(255),
          event_type ENUM('JOIN', 'LEAVE') NOT NULL,
          user_mic_state BOOLEAN,
          user_headphone_state BOOLEAN,
          user_camera_state BOOLEAN,
          members_list TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_voice_logs_user_id (user_id),
          INDEX idx_voice_logs_timestamp (timestamp)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS registrations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guild_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          user_tag VARCHAR(255),
          user_avatar VARCHAR(512) NULL DEFAULT NULL,
          moderator_id VARCHAR(255) NOT NULL,
          moderator_tag VARCHAR(255),
          moderator_avatar VARCHAR(512) NULL DEFAULT NULL,
          new_nickname VARCHAR(255),
          gender ENUM('erkek', 'kadin', 'unspecified') DEFAULT 'unspecified',
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_reg_user_id (user_id),
          INDEX idx_reg_moderator_id (moderator_id)
      )
    `);

     await db.execute(`
       CREATE TABLE IF NOT EXISTS command_settings (
         command_name VARCHAR(255) NOT NULL PRIMARY KEY,
         is_enabled BOOLEAN DEFAULT TRUE,
         allowed_roles JSON,
         allowed_users JSON,
         config JSON,
         show_logpanel BOOLEAN DEFAULT TRUE
       )
     `);

     await db.execute(`
       CREATE TABLE IF NOT EXISTS command_logs (
         id INT AUTO_INCREMENT PRIMARY KEY,
         command_name VARCHAR(255) NOT NULL,
         executor_id VARCHAR(255),
         executor_tag VARCHAR(255),
         executor_avatar VARCHAR(512),
         target_id VARCHAR(255),
         target_tag VARCHAR(255),
         target_avatar VARCHAR(512),
         status VARCHAR(255),
         timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )
     `);

     await db.execute(`
       CREATE TABLE IF NOT EXISTS cezalar (
         id INT AUTO_INCREMENT PRIMARY KEY,
         guild_id VARCHAR(255) NOT NULL,
         user_id VARCHAR(255) NOT NULL,
         user_tag VARCHAR(255),
         user_avatar VARCHAR(512),
         moderator_id VARCHAR(255) NOT NULL,
         moderator_tag VARCHAR(255),
         moderator_avatar VARCHAR(512),
         ceza_tipi VARCHAR(50) NOT NULL,
         sebep TEXT,
         baslangic_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         bitis_tarihi TIMESTAMP NULL DEFAULT NULL,
         aktif BOOLEAN DEFAULT TRUE,
         channel_id VARCHAR(255) NULL DEFAULT NULL,
         previous_roles JSON DEFAULT NULL,
         INDEX idx_cezalar_user_id (user_id),
         INDEX idx_cezalar_aktif (aktif),
         INDEX idx_cezalar_tipi (ceza_tipi)
       )
     `);

     await db.execute(`
       ALTER TABLE cezalar
       ADD COLUMN IF NOT EXISTS previous_roles JSON DEFAULT NULL
     `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS ceza_af_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            original_ceza_id INT NOT NULL,
            user_id VARCHAR(255) NOT NULL,
            user_tag VARCHAR(255),
            user_avatar VARCHAR(512),
            moderator_id VARCHAR(255) NOT NULL,
            moderator_tag VARCHAR(255),
            moderator_avatar VARCHAR(512),
            ceza_tipi VARCHAR(50) NOT NULL,
            original_sebep TEXT,
            forgive_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_af_user_id (user_id),
            INDEX idx_af_moderator_id (moderator_id)
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS user_voice_stats (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          stat_date DATE NOT NULL,
          total_seconds INT UNSIGNED DEFAULT 0,
          stream_seconds INT UNSIGNED DEFAULT 0,
          camera_seconds INT UNSIGNED DEFAULT 0,
          UNIQUE KEY user_guild_channel_date (user_id, guild_id, channel_id, stat_date),
          INDEX idx_user_date (user_id, stat_date),
          INDEX idx_guild_date (guild_id, stat_date)
        )
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS user_message_stats (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          guild_id VARCHAR(255) NOT NULL,
          channel_id VARCHAR(255) NOT NULL,
          stat_date DATE NOT NULL,
          message_count INT UNSIGNED DEFAULT 0,
          UNIQUE KEY user_guild_channel_date_msg (user_id, guild_id, channel_id, stat_date),
          INDEX idx_user_date_msg (user_id, stat_date),
          INDEX idx_guild_date_msg (guild_id, stat_date)
        )
      `);
	  
      await db.execute(`
        CREATE TABLE IF NOT EXISTS yetki_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          guild_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          user_tag VARCHAR(255),
          moderator_id VARCHAR(255) NOT NULL,
          moderator_tag VARCHAR(255),
          added_roles JSON,
          all_user_roles JSON,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_yetki_user_id (user_id),
          INDEX idx_yetki_guild_id (guild_id),
          INDEX idx_yetki_moderator_id (moderator_id)
        )
      `);

      await db.execute(`
        ALTER TABLE yetki_logs
        ADD COLUMN IF NOT EXISTS all_user_roles JSON DEFAULT NULL AFTER added_roles
      `);


  } catch (e) {
    console.error('Veritabanı bağlantısı veya tablo oluşturma başarısız!', e)
    process.exit(1)
  }
}

async function loadActivePunishments(activeClient, db) {
  try {
    const [activePunishments] = await db.query('SELECT guild_id, user_id, bitis_tarihi, ceza_tipi, channel_id FROM cezalar WHERE aktif = 1');

    if (activePunishments.length === 0) {
      console.log(`[Bilgi - ${activeClient.user.tag}] Aktif Ceza Yok.`);
      return;
    }

    let scheduledCount = 0;
    let expiredCount = 0;

    for (const ceza of activePunishments) {
      let endTime = Infinity;
      let remainingTime = Infinity;
      if (ceza.bitis_tarihi) {
        endTime = new Date(ceza.bitis_tarihi).getTime();
        remainingTime = endTime - Date.now();
      }

      const guild = await activeClient.guilds.fetch(ceza.guild_id).catch(() => null);
      if (!guild) continue;

      if (remainingTime > 0) {
         if(endTime !== Infinity) scheduledCount++;

        if (ceza.ceza_tipi === 'voicemute') {
          activeClient.activeVoiceMutes.set(ceza.user_id, endTime);
          if (endTime !== Infinity) {
            setTimeout(() => {
              schedulePunishmentEnd(activeClient, db, ceza.guild_id, ceza.user_id, 'voicemute', null, 'Ceza süresi doldu.');
            }, remainingTime);
          }

          try {
            const member = await guild.members.fetch(ceza.user_id).catch(() => null);
            if (member && member.voice.channel && !member.voice.serverMute) {
              await member.voice.setMute(true, 'Susturma cezası devam ediyor. (Bot yeniden başlatıldı)').catch(err => {
                console.error(`Bot yeniden başlarken kullanıcı susturulamadı: ${member.id}`, err.message);
              });
            }
          } catch (e) {
            console.error(`Bot başlangıcında mute kontrol hatası: ${ceza.user_id}`, e);
          }

        } else if (ceza.ceza_tipi === 'chatmute') {

          if (!activeClient.activeChatMutes.has(ceza.user_id)) {
            activeClient.activeChatMutes.set(ceza.user_id, new Set());
          }
          activeClient.activeChatMutes.get(ceza.user_id).add(ceza.channel_id);

          if (endTime !== Infinity) {
            setTimeout(() => {
              schedulePunishmentEnd(activeClient, db, ceza.guild_id, ceza.user_id, 'chatmute', ceza.channel_id, 'Ceza süresi doldu.');
            }, remainingTime);
          }

          try {
            const channel = await guild.channels.fetch(ceza.channel_id).catch(() => null);
            if (!channel) continue;
            const member = await guild.members.fetch(ceza.user_id).catch(() => null);
            if (!member) continue;

            const currentPerm = channel.permissionOverwrites.cache.get(member.id);
            if (!currentPerm || currentPerm.deny.has(PermissionFlagsBits.SendMessages) === false) {
              await channel.permissionOverwrites.edit(member.id,
                { [PermissionFlagsBits.SendMessages]: false },
                { reason: 'Susturma cezası devam ediyor. (Bot yeniden başlatıldı)' }
              ).catch(err => {
                  console.error(`Bot yeniden başlarken chat mute uygulanamadı: ${member.id}`, err.message);
              });
            }
          } catch (e) {
            console.error(`Bot başlangıcında chat mute kontrol hatası: ${ceza.user_id}`, e);
          }

        } else if (ceza.ceza_tipi === 'jail') {
          activeClient.activeJails.set(ceza.user_id, endTime);
          if (endTime !== Infinity) {
            setTimeout(() => {
              schedulePunishmentEnd(activeClient, db, ceza.guild_id, ceza.user_id, 'jail', null, 'Ceza süresi doldu.');
            }, remainingTime);
          }

          try {
             const specificGuildSettings = activeClient.guildSettings[ceza.guild_id] || {};
             const jailRoleId = specificGuildSettings.jail_role_id;
             if (!jailRoleId) continue;

             const member = await guild.members.fetch(ceza.user_id).catch(() => null);
             if (member) {
                const jailRole = await guild.roles.fetch(jailRoleId).catch(() => null);
                if (jailRole) {
                    const botMember = guild.members.me;
                    if (botMember.roles.highest.position > jailRole.position) {
                        const hasJailRole = member.roles.cache.has(jailRoleId);
                        const otherRoles = member.roles.cache.filter(r => r.id !== guild.id && r.id !== jailRoleId);

                        if (otherRoles.size > 0 || !hasJailRole) {
                            console.log(`[LoadPunishments] ${member.id} için jail rol senkronizasyonu yapılıyor...`);
                            await member.roles.set([jailRoleId], 'Jail cezası devam ediyor. (Bot yeniden başlatıldı / Rol senkronizasyonu)')
                                .catch(err => {
                                    console.error(`Bot yeniden başlarken jail rolleri SET edilemedi: ${member.id}`, err.message);
                                });
                        }
                    } else {
                        console.error(`Bot yeniden başlarken jail rolü senkronize edilemedi (HİYERARŞİ - Bot rolü jail rolünden düşük): ${member.id}`);
                    }
                } else {
                     console.error(`Bot yeniden başlarken jail rolü (${jailRoleId}) bulunamadı. Sunucu: ${guild.id}`);
                }
            }
          } catch (e) {
             console.error(`Bot başlangıcında jail kontrol hatası: ${ceza.user_id}`, e);
          }
        } else if (ceza.ceza_tipi === 'yargı') {
           activeClient.activeYargi.set(ceza.user_id, Infinity);
           try {
               const specificGuildSettings = activeClient.guildSettings[ceza.guild_id] || {};
               const yargiRoleId = specificGuildSettings.yargi_role_id;
               if (!yargiRoleId) continue;

              const member = await guild.members.fetch(ceza.user_id).catch(() => null);
              if (member && !member.roles.cache.has(yargiRoleId)) {
                await member.roles.add(yargiRoleId, 'Yargı cezası devam ediyor. (Bot yeniden başlatıldı)').catch(err => {
                   console.error(`Bot yeniden başlarken YARGI rolü verilemedi: ${member.id}`, err.message);
                });
              }
            } catch (e) {
               console.error(`Bot başlangıcında YARGI kontrol hatası: ${ceza.user_id}`, e);
            }
        }
      } else if (endTime !== Infinity) {
        expiredCount++;
        console.log(`Bot kapalıyken süresi dolan ceza işleniyor (Kullanıcı: ${ceza.user_id}, Tip: ${ceza.ceza_tipi})...`);
        schedulePunishmentEnd(activeClient, db, ceza.guild_id, ceza.user_id, ceza.ceza_tipi, ceza.channel_id, 'Ceza süresi doldu (Bot kapalıyken).');
      } else {
         console.log(`Süresiz ceza yüklendi: (Kullanıcı: ${ceza.user_id}, Tip: ${ceza.ceza_tipi})`);
         if (ceza.ceza_tipi === 'jail') {
             activeClient.activeJails.set(ceza.user_id, Infinity);
             try {
                 const specificGuildSettings = activeClient.guildSettings[ceza.guild_id] || {};
                 const jailRoleId = specificGuildSettings.jail_role_id;
                 if (!jailRoleId) continue;

                 const member = await guild.members.fetch(ceza.user_id).catch(() => null);
                 if (member) {
                    const jailRole = await guild.roles.fetch(jailRoleId).catch(() => null);
                    if (jailRole) {
                        const botMember = guild.members.me;
                        if (botMember.roles.highest.position > jailRole.position) {
                            const hasJailRole = member.roles.cache.has(jailRoleId);
                            const otherRoles = member.roles.cache.filter(r => r.id !== guild.id && r.id !== jailRoleId);

                            if (otherRoles.size > 0 || !hasJailRole) {
                                console.log(`[LoadPunishments] ${member.id} için SÜRESİZ jail rol senkronizasyonu yapılıyor...`);
                                await member.roles.set([jailRoleId], 'Süresiz Jail cezası devam ediyor. (Bot yeniden başlatıldı / Rol senkronizasyonu)')
                                    .catch(err => {
                                        console.error(`Bot yeniden başlarken SÜRESİZ jail rolleri SET edilemedi: ${member.id}`, err.message);
                                    });
                            }
                        } else {
                            console.error(`Bot yeniden başlarken SÜRESİZ jail rolü senkronize edilemedi (HİYERARŞİ): ${member.id}`);
                        }
                    } else {
                         console.error(`Bot yeniden başlarken SÜRESİZ jail rolü (${jailRoleId}) bulunamadı. Sunucu: ${guild.id}`);
                    }
                }
              } catch (e) {
                 console.error(`Bot başlangıcında SÜRESİZ jail kontrol hatası: ${ceza.user_id}`, e);
              }
         } else if (ceza.ceza_tipi === 'yargı') {
             activeClient.activeYargi.set(ceza.user_id, Infinity);
             try {
                 const specificGuildSettings = activeClient.guildSettings[ceza.guild_id] || {};
                 const yargiRoleId = specificGuildSettings.yargi_role_id;
                 if (!yargiRoleId) continue;

                const member = await guild.members.fetch(ceza.user_id).catch(() => null);
                if (member && !member.roles.cache.has(yargiRoleId)) {
                  await member.roles.add(yargiRoleId, 'Yargı cezası devam ediyor. (Bot yeniden başlatıldı)').catch(err => {
                     console.error(`Bot yeniden başlarken SÜRESİZ YARGI rolü verilemedi: ${member.id}`, err.message);
                  });
                }
              } catch (e) {
                 console.error(`Bot başlangıcında SÜRESİZ YARGI kontrol hatası: ${ceza.user_id}`, e);
              }
         } else if (ceza.ceza_tipi === 'uyari1' || ceza.ceza_tipi === 'uyari2') {
            try {
                const uyari1Settings = (settings['uyari1'] || {}).config || {};
                const uyari1Roles = uyari1Settings.uyari1_roles || {};
                const uyari1RoleId = uyari1Roles[ceza.guild_id] || null;

                const uyari2Settings = (settings['uyari2'] || {}).config || {};
                const uyari2Roles = uyari2Settings.uyari2_roles || {};
                const uyari2RoleId = uyari2Roles[ceza.guild_id] || null;

                let roleToAddId = null;
                if (ceza.ceza_tipi === 'uyari1') {
                    roleToAddId = uyari1RoleId;
                } else {
                    roleToAddId = uyari2RoleId;
                }

                if (!roleToAddId) continue;

                const member = await guild.members.fetch(ceza.user_id).catch(() => null);

                if (member && !member.roles.cache.has(roleToAddId)) {
                     await member.roles.add(roleToAddId, 'Uyarı cezası devam ediyor. (Bot yeniden başlatıldı)').catch(err => {
                         console.error(`Bot yeniden başlarken SÜRESİZ ${ceza.ceza_tipi} rolü verilemedi: ${member.id}`, err.message);
                     });
                }
            } catch (e) {
                 console.error(`Bot başlangıcında SÜRESİZ ${ceza.ceza_tipi} kontrol hatası: ${ceza.user_id}`, e);
            }
         }
      }
    }
    console.log(`[Bilgi - ${activeClient.user.tag}] ${scheduledCount} adet aktif süreli ceza yüklendi ve zamanlandı.`);
    console.log(`[Bilgi - ${activeClient.user.tag}] ${expiredCount} adet süresi dolmuş ceza işlendi.`);
  } catch (e) {
    console.error('Aktif cezalar yüklenirken hata:', e);
  }
}


async function updateGuildDataCache() {
  const data = {
    guilds: [],
    roles: {},
    channels: {},
    voiceChannels: {}
  };
  try {
    await client.guilds.fetch();
    for (const guild of client.guilds.cache.values()) {
      data.guilds.push({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL()
      });

      const roles = await guild.roles.fetch();
      data.roles[guild.id] = roles
        .filter(role => role.name !== '@everyone' && !role.managed)
        .map(role => ({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position
        }))
        .sort((a, b) => b.position - a.position);

      const channels = await guild.channels.fetch();

      data.channels[guild.id] = channels
        .filter(channel => channel.type === ChannelType.GuildText)
        .map(channel => ({
            id: channel.id,
            name: channel.name,
            position: channel.position
        }))
        .sort((a, b) => a.position - b.position);


      data.voiceChannels[guild.id] = channels
        .filter(channel => channel.type === ChannelType.GuildVoice)
        .map(channel => ({
            id: channel.id,
            name: channel.name,
            position: channel.position
        }))
        .sort((a, b) => a.position - b.position);
    }
    fs.writeFileSync(guildDataPath, JSON.stringify(data));
  } catch (e) {
    console.error('Sunucu verileri önbelleğe alınırken hata oluştu:', e);
  }
}


async function updateSettingsFromDb() {
  try {
    const [rows] = await db.query('SELECT command_name, is_enabled, allowed_roles, allowed_users, config, show_logpanel FROM command_settings');
    const newSettings = {};
    for (const row of rows) {
      newSettings[row.command_name] = {
        is_enabled: !!row.is_enabled,
        allowed_roles: JSON.parse(row.allowed_roles || '[]'),
        allowed_users: JSON.parse(row.allowed_users || '{}'),
        config: JSON.parse(row.config || '{}'),
        show_logpanel: row.show_logpanel !== null ? !!row.show_logpanel : true
      };
    }
    settings = newSettings;
    console.log('[Bilgi] Komut-Ayarları Güncellendi');
  } catch (e) {
    console.error('Komut ayarları güncellenirken hata oluştu:', e);
  }
}

async function updateGuildSettingsFromDb() {
  try {
    const [rows] = await db.query('SELECT guild_id, config FROM guild_settings');
    const newSettings = {};
    for (const row of rows) {
        newSettings[row.guild_id] = JSON.parse(row.config || '{}');
    }
    guildSettings = newSettings;
    client.guildSettings = guildSettings;
    client2.guildSettings = guildSettings;
    console.log('[Bilgi] Genel Sunucu Ayarları Güncellendi.');
  } catch (e) {
    console.error('Genel sunucu ayarları güncellenirken hata oluştu:', e);
  }
}

async function reloadCommandsAndSyncDb() {
  client.commands.clear()
  client2.commands.clear()
  client.prefixCommands.clear()
  client2.prefixCommands.clear()

  const commandsToDeploy = []
  const allFileNames = []

  const commandFolders = ['./commands', './commands_notslash'];
  for (const folder of commandFolders) {
      if (!fs.existsSync(folder)) continue;
      const commandFiles = fs.readdirSync(folder).filter(f => f.endsWith('_command.js'));
       for (const file of commandFiles) {
            const cmdName = file.replace('_command.js', '');
            if (!allFileNames.includes(cmdName)) allFileNames.push(cmdName);
            try {
              const filePath = `${folder}/${file}`;
              delete require.cache[require.resolve(filePath)];
              const cmd = require(filePath);

              if (folder === './commands' && cmd.data && cmd.data.name) {
                 client.commands.set(cmd.data.name, cmd);
                 client2.commands.set(cmd.data.name, cmd);
                 commandsToDeploy.push(cmd.data.toJSON());
              } else if (folder === './commands_notslash' && cmd.name) {
                 client.prefixCommands.set(cmd.name, cmd);
                 client2.prefixCommands.set(cmd.name, cmd);
              }
            } catch (e) {
              console.error(`${folder === './commands' ? 'Slash' : 'Prefix'} komutu yüklenemedi: ${file}`, e);
            }
        }
  }


  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
      const data = await rest.put(
          Routes.applicationCommands(process.env.BOT_ID),
          { body: commandsToDeploy },
      )
  } catch (error) {
      console.error('Discord API\'ye komutlar yüklenirken hata oluştu (Ana Bot):', error);
  }

  if (process.env.BOT_TOKEN2 && process.env.BOT_ID_2) {
      const rest2 = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN2);
      try {
          const data2 = await rest2.put(
              Routes.applicationCommands(process.env.BOT_ID_2),
              { body: commandsToDeploy },
          )
      } catch (error) {
          console.error('Discord API\'ye komutlar yüklenirken hata oluştu (Bot 2):', error);
      }
  }


  try {
    if (!db) await initDb()
    const [dbRows] = await db.query('SELECT command_name FROM command_settings')
    const dbNames = dbRows.map(r => r.command_name)

    const toAdd = allFileNames.filter(name => !dbNames.includes(name))
    if (toAdd.length > 0) {
      const query = 'INSERT IGNORE INTO command_settings (command_name, is_enabled, allowed_roles, allowed_users, config, show_logpanel) VALUES ' + toAdd.map(name => '(?, 1, ?, ?, ?, 1)').join(', ')
      const defaultRoles = '[]';
      const defaultUsers = '{}';
      const defaultConfig = '{}';
      const params = toAdd.flatMap(name => [name, defaultRoles, defaultUsers, defaultConfig]);

      await db.execute(query, params)
      console.log(`${toAdd.length} new command(s) added to DB.`)
    }

    const toRemove = dbNames.filter(name => !allFileNames.includes(name));
    if (toRemove.length > 0) {
      const query = 'DELETE FROM command_settings WHERE command_name IN (' + toRemove.map(() => '?').join(', ') + ')'
      await db.execute(query, toRemove)
      console.log(`${toRemove.length} old command(s) removed from DB.`)
    }
    await updateSettingsFromDb()
    await updateGuildSettingsFromDb()
  } catch (e) {
    console.error('Veritabanı senkronizasyonu sırasında hata:', e)
  }
}

function getCurrentDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function updateUserVoiceStats(activeClient, userId, guildId, channelId, durationSeconds, isStreaming, isCameraOn) {
    if (!activeClient || activeClient.user.id !== process.env.BOT_ID) return;
    if (!userId || !guildId || !channelId || durationSeconds <= 0) return;

    try {
        const statDate = getCurrentDateString();
        const streamAdd = isStreaming ? durationSeconds : 0;
        const cameraAdd = isCameraOn ? durationSeconds : 0;

        await db.execute(`
            INSERT INTO user_voice_stats (user_id, guild_id, channel_id, stat_date, total_seconds, stream_seconds, camera_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                total_seconds = total_seconds + VALUES(total_seconds),
                stream_seconds = stream_seconds + VALUES(stream_seconds),
                camera_seconds = camera_seconds + VALUES(camera_seconds)
        `, [userId, guildId, channelId, statDate, durationSeconds, streamAdd, cameraAdd]);
    } catch (e) {
        console.error(`[Stat Update Error] user_voice_stats güncellenemedi (User: ${userId}, Guild: ${guildId}):`, e.message);
    }
}

async function periodicStatUpdate(activeClient) {
    if (activeClient.user.id !== process.env.BOT_ID) return;
    const now = Date.now();
    for (const [userId, userStats] of activeClient.voiceStateStats.entries()) {
        try {
            const durationMs = now - userStats.lastUpdateTime;
            const durationSeconds = Math.round(durationMs / 1000);

            if (durationSeconds > 0) {
                 await updateUserVoiceStats(
                    activeClient,
                    userId,
                    userStats.guildId,
                    userStats.channelId,
                    durationSeconds,
                    userStats.isStreaming,
                    userStats.isCameraOn
                 );
                 userStats.lastUpdateTime = now;
            }
        } catch (e) {
             console.error(`[Stat Update Interval Error - ${activeClient.user.tag}] User: ${userId} - ${e.message}`);
        }
    }
}

async function onVoiceStateUpdate(oldState, newState) {
  const activeClient = newState.client;
  const userId = newState.id;
  const guildId = newState.guild.id;
  const now = Date.now();
  const userStats = client.voiceStateStats.get(userId);
  const isMainBot = activeClient.user.id === process.env.BOT_ID;

  if (newState.channelId) {
    activeClient.voiceStateCache.set(newState.id, newState.channelId);
  } else {
    activeClient.voiceStateCache.delete(newState.id);
  }
  const currentGuildSettings = activeClient.guildSettings[newState.guild.id] || activeClient.guildSettings[oldState.guild.id];
  const discordLogChannelId = currentGuildSettings?.voice_log_join_channel;
  let logChannel;
  if (discordLogChannelId) {
      logChannel = await activeClient.channels.fetch(discordLogChannelId).catch(() => null);
      if (!logChannel || !logChannel.isTextBased()) {
          logChannel = null;
      }
  }
  const logToDatabase = async (guild, member, channel, eventType, state, membersListJSON) => {
    if (!member || !channel) return;
    try {
        const query = `
            INSERT INTO voice_logs
            (guild_id, user_id, user_tag, user_avatar, channel_id, channel_name, event_type, user_mic_state, user_headphone_state, user_camera_state, members_list, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        await db.execute(query, [
            guild.id,
            member.id,
            member.user.tag,
            member.user.displayAvatarURL({ dynamic: true }),
            channel.id,
            channel.name,
            eventType,
            state.selfMute,
            state.selfDeaf,
            state.selfVideo,
            membersListJSON
        ]);
    } catch (dbError) {
        console.error("Veritabanına ses logu yazma hatası:", dbError);
    }
  };
  const getMembersListData = (channel, eventType, member, limit = 25) => {
      if (!channel) return { members: [], count: 0, overLimit: false };
      const membersInChannel = channel.members;
      let membersData = [];
      let overLimit = false;

      if (membersInChannel.size === 0) {
          if (eventType === 'JOIN' && member) {
              membersData.push({
                  id: member.id,
                  username: member.user.username,
                  displayName: member.displayName,
                  avatar: member.user.displayAvatarURL({ dynamic: true, size: 32}) || `https://cdn.discordapp.com/embed/avatars/${member.id % 5}.png`
              });
          }
      } else {
          const memberArray = Array.from(membersInChannel.values());
          if (memberArray.length > limit) {
              overLimit = true;
          }
          membersData = memberArray.slice(0, limit).map(m => ({
              id: m.id,
              username: m.user.username,
              displayName: m.displayName,
              avatar: m.user.displayAvatarURL({ dynamic: true, size: 32}) || `https://cdn.discordapp.com/embed/avatars/${m.id % 5}.png`
          }));
      }

      return {
          members: membersData,
          count: membersInChannel.size,
          overLimit: overLimit
      };
  }
   const formatMembersForDiscord = (membersData, count, overLimit, eventType) => {
      if (count === 0 && eventType === 'LEAVE') return 'Kimse kalmadı';
      if (membersData.length === 0) return 'Kimse yok';

      let text = membersData.map(m => `<@${m.id}> [\`\`${m.username} - ${m.id}\`\`]`).join('\n');
      if (overLimit) {
          text += `\n**${membersData.length}'ten fazla üye bulunuyor.**`;
      }
      return text;
   }
  if (newState.channelId && (oldState.channelId !== newState.channelId)) {
    try {
        const member = newState.member;
        const channel = newState.channel;
        if (member && channel) {
            const eventType = 'JOIN';
            const membersDataResult = getMembersListData(channel, eventType, member);
            const membersListJSON = JSON.stringify(membersDataResult);
            const membersListForDiscord = formatMembersForDiscord(
                membersDataResult.members,
                membersDataResult.count,
                membersDataResult.overLimit,
                eventType
            );

            if (logChannel) {
                const desc = [
                    `<@${member.id}> adlı üye ${channel.toString()} adlı ses kanalına katıldı.`,
                    '',
                    '**Kanal Girdiği Anda:**',
                    `• Mikrofonu: **${newState.selfMute ? 'Kapalı' : 'Açık'}**`,
                    `• Kulaklığı: **${newState.selfDeaf ? 'Kapalı' : 'Açık'}**`,
                    `• Kamerası: **${newState.selfVideo ? 'Açık' : 'Kapalı'}**`,
                    '',
                    `• Girdiği Kanal: ${channel.toString()}`,
                    `• Girdiği Kanalın ID'si: \`${channel.id}\``,
                    `• Giriş Süresi: <t:${Math.floor(Date.now() / 1000)}:R>`,
                    '',
                    '**Girdiği Kanalda Bulunan Üyeler:**',
                    membersListForDiscord
                ];
                const embed = new EmbedBuilder().setColor('#262624').setDescription(desc.join('\n'));
                if (isMainBot) {
                    await logChannel.send({ embeds: [embed] });
                }
            }
            if (isMainBot) {
                await logToDatabase(newState.guild, member, channel, eventType, newState, membersListJSON);
            }
        }
    } catch (e) {
         console.error('Ses giriş log hatası:', e);
    }
  }
  if (oldState.channelId && (oldState.channelId !== newState.channelId)) {
    try {
        const member = oldState.member;
        const channel = oldState.channel;
         if (member && channel) {
            const eventType = 'LEAVE';
            const membersDataResult = getMembersListData(channel, eventType, member);
            const membersListJSON = JSON.stringify(membersDataResult);
            const membersListForDiscord = formatMembersForDiscord(
                membersDataResult.members,
                membersDataResult.count,
                membersDataResult.overLimit,
                eventType
            );

            if (logChannel) {
                const desc = [
                    `<@${member.id}> adlı üye ${channel.toString()} adlı ses kanalından ayrıldı.`,
                    '',
                    '**Kanaldan Çıktığı Anda:**',
                    `• Mikrofonu: **${oldState.selfMute ? 'Kapalı' : 'Açık'}**`,
                    `• Kulaklığı: **${oldState.selfDeaf ? 'Kapalı' : 'Açık'}**`,
                    `• Kamerası: **${oldState.selfVideo ? 'Açık' : 'Kapalı'}**`,
                    '',
                    `• Çıktığı Kanal: ${channel.toString()}`,
                    `• Çıktığı Kanalın ID'si: \`${channel.id}\``,
                    `• Çıkış Süresi: <t:${Math.floor(Date.now() / 1000)}:R>`,
                    '',
                    '**Çıktığı Kanalda Kalan Üyeler:**',
                    membersListForDiscord
                ];
                const embed = new EmbedBuilder().setColor('#262624').setDescription(desc.join('\n'));
                 if (isMainBot) {
                    await logChannel.send({ embeds: [embed] });
                }
            }
             if (isMainBot) {
                await logToDatabase(oldState.guild, member, channel, eventType, oldState, membersListJSON);
            }
        }
    } catch (e) {
         console.error('Ses çıkış log hatası:', e);
    }
  }

  if (isMainBot && !newState.member?.user.bot) {
      try {
        if (!oldState.channelId && newState.channelId) {
          client.voiceStateStats.set(userId, {
            joinTime: now,
            lastUpdateTime: now,
            channelId: newState.channelId,
            guildId: guildId,
            isStreaming: newState.streaming || false,
            isCameraOn: newState.selfVideo || false
          });
        }
        else if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
          if (userStats && userStats.channelId === oldState.channelId) {
            const durationMs = now - userStats.lastUpdateTime;
            const durationSeconds = Math.round(durationMs / 1000);
            if (durationSeconds > 0) {
              await updateUserVoiceStats(client, userId, userStats.guildId, userStats.channelId, durationSeconds, userStats.isStreaming, userStats.isCameraOn);
            }
            client.voiceStateStats.delete(userId);
          }
          if (newState.channelId && oldState.channelId !== newState.channelId) {
            client.voiceStateStats.set(userId, {
              joinTime: now,
              lastUpdateTime: now,
              channelId: newState.channelId,
              guildId: guildId,
              isStreaming: newState.streaming || false,
              isCameraOn: newState.selfVideo || false
            });
          }
        }
        else if (oldState.channelId && newState.channelId && oldState.channelId === newState.channelId && userStats) {
          const stateChanged = (oldState.streaming || false) !== (newState.streaming || false) || (oldState.selfVideo || false) !== (newState.selfVideo || false);
          const durationMs = now - userStats.lastUpdateTime;
          const durationSeconds = Math.round(durationMs / 1000);

          if (durationSeconds > 0) {
            await updateUserVoiceStats(client, userId, userStats.guildId, userStats.channelId, durationSeconds, userStats.isStreaming, userStats.isCameraOn);
            userStats.lastUpdateTime = now;
          }

          if (stateChanged) {
            userStats.isStreaming = newState.streaming || false;
            userStats.isCameraOn = newState.selfVideo || false;
          }
        }
      } catch(e) {
        console.error(`[Stat Error] onVoiceStateUpdate içinde istatistik hatası (User: ${userId}):`, e);
      }
  } else if (isMainBot && newState.member?.user.bot && userStats && oldState.channelId && !newState.channelId) {
        client.voiceStateStats.delete(userId);
  }

  try {
    const activeMuteEndTime = activeClient.activeVoiceMutes.get(newState.id);
    if (activeMuteEndTime && Date.now() < activeMuteEndTime) {
      if (oldState.serverMute && !newState.serverMute) {
        newState.member?.voice.setMute(true, 'Susturma süresi henüz dolmadı.').catch(err => {
          console.error(`Kullanıcı yeniden susturulamadı (Rate Limit?): ${newState.id}`, err.message);
        });
      }
      else if (!oldState.channelId && newState.channelId && !newState.serverMute) {
        newState.member?.voice.setMute(true, 'Susturma cezası devam ediyor.').catch(err => {
          console.error(`Kullanıcı sese girince susturulamadı (Rate Limit?): ${newState.id}`, err.message);
        });
      }
    }
  } catch (e) {
    console.error('voiceStateUpdate (mute check) hatası:', e);
  }
}

async function onGuildMemberUpdate(oldMember, newMember) {
  const activeClient = newMember.client;
  const guildId = newMember.guild.id;
  const userId = newMember.id;
  const isMainBot = activeClient.user.id === process.env.BOT_ID;

  if (isMainBot) {
    try {
      const uyari1Settings = (settings['uyari1'] || {}).config || {};
      const uyari1Roles = uyari1Settings.uyari1_roles || {};
      const uyari1RoleId = uyari1Roles[guildId] || null;

      const uyari2Settings = (settings['uyari2'] || {}).config || {};
      const uyari2Roles = uyari2Settings.uyari2_roles || {};
      const uyari2RoleId = uyari2Roles[guildId] || null;

      const specificGuildSettings = activeClient.guildSettings[guildId] || {};
      const jailRoleId = specificGuildSettings.jail_role_id;
      const yargiRoleId = specificGuildSettings.yargi_role_id;

      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;

      const hadJail = jailRoleId ? oldRoles.has(jailRoleId) : false;
      const hasJail = jailRoleId ? newRoles.has(jailRoleId) : false;

      const hadYargi = yargiRoleId ? oldRoles.has(yargiRoleId) : false;
      const hasYargi = yargiRoleId ? newRoles.has(yargiRoleId) : false;

      const hadUyari1 = uyari1RoleId ? oldRoles.has(uyari1RoleId) : false;
      const hasUyari1 = uyari1RoleId ? newRoles.has(uyari1RoleId) : false;

      const hadUyari2 = uyari2RoleId ? oldRoles.has(uyari2RoleId) : false;
      const hasUyari2 = uyari2RoleId ? newRoles.has(uyari2RoleId) : false;


      if ((!hadJail && hasJail) || (!hadYargi && hasYargi)) {
          const reason = hasYargi ? 'Yargı rolü eklendiği için uyarı/jail rolü kaldırıldı.' : 'Jail rolü eklendiği için uyarı rolü kaldırıldı.';
          if (uyari1RoleId && (hasUyari1 || oldRoles.has(uyari1RoleId))) {
               await newMember.roles.remove(uyari1RoleId, reason).catch(err => {
                   console.error(`[GuildMemberUpdate] uyari1 rolü (${uyari1RoleId}) jail/yargı eklenince kaldırılamadı: ${userId}`, err.message);
               });
               await db.execute('UPDATE cezalar SET aktif = 0 WHERE user_id = ? AND ceza_tipi = ? AND guild_id = ? AND aktif = 1', [userId, 'uyari1', guildId]);
          }
          if (uyari2RoleId && (hasUyari2 || oldRoles.has(uyari2RoleId))) {
               await newMember.roles.remove(uyari2RoleId, reason).catch(err => {
                   console.error(`[GuildMemberUpdate] uyari2 rolü (${uyari2RoleId}) jail/yargı eklenince kaldırılamadı: ${userId}`, err.message);
               });
               await db.execute('UPDATE cezalar SET aktif = 0 WHERE user_id = ? AND ceza_tipi = ? AND guild_id = ? AND aktif = 1', [userId, 'uyari2', guildId]);
          }
          if (hasYargi && jailRoleId && (hasJail || oldRoles.has(jailRoleId))) {
               await newMember.roles.remove(jailRoleId, reason).catch(err => {
                   console.error(`[GuildMemberUpdate] jail rolü (${jailRoleId}) yargı eklenince kaldırılamadı: ${userId}`, err.message);
               });
               await db.execute('UPDATE cezalar SET aktif = 0 WHERE user_id = ? AND ceza_tipi = ? AND guild_id = ? AND aktif = 1', [userId, 'jail', guildId]);
          }
      }

      if (hasJail && jailRoleId) {
        const otherRoles = newRoles.filter(r => r.id !== newMember.guild.id && r.id !== jailRoleId);
        if (otherRoles.size > 0) {
            const botMember = newMember.guild.members.me;
            const jailRole = await newMember.guild.roles.fetch(jailRoleId).catch(() => null);

            if (jailRole && botMember.roles.highest.position > jailRole.position) {
                 let canManageAll = true;
                 for (const role of otherRoles.values()) {
                     if (botMember.roles.highest.position <= role.position) {
                         canManageAll = false;
                         console.warn(`[GuildMemberUpdate] ${newMember.id} jail'de ama hiyerarşi yetmediği için ekstra rolü (${role.name}) kaldırılamadı.`);
                         break;
                     }
                 }

                 if (canManageAll) {
                    await newMember.roles.set([jailRoleId], 'Jail cezası aktifken başka roller eklendiği için roller sıfırlandı.')
                        .catch(err => console.error(`[GuildMemberUpdate] Jail'deki üyenin (${newMember.id}) rolleri sıfırlanamadı:`, err.message));
                 }
            }
        }
      }

      if (hadJail && !hasJail) {
          const [activeJail] = await db.query(
            'SELECT id FROM cezalar WHERE user_id = ? AND ceza_tipi = ? AND guild_id = ? AND aktif = 1',
            [userId, 'jail', guildId]
          );
          if (activeJail.length > 0) {
            await newMember.roles.add(jailRoleId, 'Aktif jail cezası devam ettiği için rol geri verildi.').catch(err => {
              console.error(`[GuildMemberUpdate] jail rolü (${jailRoleId}) geri verilemedi: ${userId}`, err.message);
            });
          }
      }

      if (hadYargi && !hasYargi) {
          const [activeYargi] = await db.query(
            'SELECT id FROM cezalar WHERE user_id = ? AND ceza_tipi = ? AND guild_id = ? AND aktif = 1',
            [userId, 'yargı', guildId]
          );
          if (activeYargi.length > 0) {
            await newMember.roles.add(yargiRoleId, 'Aktif yargı cezası devam ettiği için rol geri verildi.').catch(err => {
              console.error(`[GuildMemberUpdate] yargı rolü (${yargiRoleId}) geri verilemedi: ${userId}`, err.message);
            });
          }
      }

      if (hadUyari1 && !hasUyari1) {
        const [activeUyari] = await db.query(
          'SELECT id FROM cezalar WHERE user_id = ? AND ceza_tipi = ? AND guild_id = ? AND aktif = 1',
          [userId, 'uyari1', guildId]
        );
        if (activeUyari.length > 0) {
          await newMember.roles.add(uyari1RoleId, 'Aktif uyarı cezası (uyari1) devam ettiği için rol geri verildi.').catch(err => {
            console.error(`[GuildMemberUpdate] uyari1 rolü (${uyari1RoleId}) geri verilemedi: ${userId}`, err.message);
          });
        }
      }

      if (hadUyari2 && !hasUyari2) {
        const [activeUyari] = await db.query(
          'SELECT id FROM cezalar WHERE user_id = ? AND ceza_tipi = ? AND guild_id = ? AND aktif = 1',
          [userId, 'uyari2', guildId]
        );
        if (activeUyari.length > 0) {
          await newMember.roles.add(uyari2RoleId, 'Aktif uyarı cezası (uyari2) devam ettiği için rol geri verildi.').catch(err => {
            console.error(`[GuildMemberUpdate] uyari2 rolü (${uyari2RoleId}) geri verilemedi: ${userId}`, err.message);
          });
        }
      }

    } catch (e) {
      console.error('[GuildMemberUpdate] Rol geri verme kontrolü sırasında hata:', e);
    }
  }
}
async function onGuildMemberAdd(member) {
    const activeClient = member.client;
    const guildId = member.guild.id;
    const guildSettingsForEvent = activeClient.guildSettings[guildId] || {};
    const isMainBot = activeClient.user.id === process.env.BOT_ID;

    try {
        const selectedWelcomeBot = guildSettingsForEvent.welcome_bot_selection || 'bot1';

        if ((selectedWelcomeBot === 'bot1' && isMainBot) || (selectedWelcomeBot === 'bot2' && !isMainBot && process.env.BOT_TOKEN2)) {
            const welcomeChannelId = guildSettingsForEvent.welcome_channel_id;
            if (welcomeChannelId) {
                const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
                if (channel && channel.isTextBased()) {
                    const memberCount = member.guild.memberCount;
                    const welcomeEmbed = new EmbedBuilder()
                        .setAuthor({ name: member.guild.name, iconURL: member.guild.iconURL({ dynamic: true }) })
                        .setDescription(
                            `Merhabalar ${member.toString()} aramıza hoş geldin. Seninle beraber sunucumuz \`${memberCount}\` kişiye ulaştı.\n\n` +
                            `Sunucumuza kayıt olduğunda kurallar kanalına göz atmayı unutmayınız. Kayıt olduktan sonra kuralları okuduğunuzu \n\n`+
                            `kabul edeceğiz ve içeride yapılacak cezalandırma işlemlerini bunu göz önünde bulundurarak yapacağız.🎉`
                        );
                    await channel.send({ embeds: [welcomeEmbed] });
                } else {
                    console.error(`Hoşgeldin kanalı (${welcomeChannelId}) bulunamadı veya metin kanalı değil. Sunucu: ${guildId}`);
                }
            }
        }
    } catch (error) {
        console.error(`Hoşgeldin mesajı gönderilirken hata oluştu. Üye: ${member.id}, Sunucu: ${guildId}`, error);
    }

    try {
        const selectedAutoroleBot = guildSettingsForEvent.autorole_bot_selection || 'bot1';

        if ((selectedAutoroleBot === 'bot1' && isMainBot) || (selectedAutoroleBot === 'bot2' && !isMainBot && process.env.BOT_TOKEN2)) {
            const autoroleRoleId = guildSettingsForEvent.autorole_role_id;
            if (autoroleRoleId) {
                const role = await member.guild.roles.fetch(autoroleRoleId).catch(() => null);
                if (role) {
                    const botMember = member.guild.members.me;
                    if(!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                        console.error(`Oto Rol verilemedi: Botun 'Rolleri Yönet' izni yok. Sunucu: ${guildId}, Rol: ${role.id}`);
                        return;
                    }
                    if (botMember.roles.highest.position <= role.position) {
                        console.error(`Oto Rol verilemedi: Botun rolü (${botMember.roles.highest.name}) Oto Rol (${role.name})'den düşük veya aynı seviyede. Sunucu: ${guildId}`);
                        return;
                    }
                    await member.roles.add(role, 'Oto Rol');
                } else {
                    console.error(`Ayarlanan Oto Rol (${autoroleRoleId}) sunucuda bulunamadı. Sunucu: ${guildId}`);
                }
            }
        }
    } catch (error) {
        console.error(`Oto Rol verilirken hata oluştu. Üye: ${member.id}, Sunucu: ${guildId}`, error);
    }
}

async function onUserUpdate(oldUser, newUser) {
    const activeClient = newUser.client;
    const isMainBot = activeClient.user.id === process.env.BOT_ID;

    if (oldUser.globalName === newUser.globalName) return;

    for (const [guildId, guild] of activeClient.guilds.cache) {
        try {
            const guildSettings = activeClient.guildSettings[guildId] || {};
            const selectedBot = guildSettings.tag_bot_selection || 'bot1';

            if (selectedBot === 'bot1' && !isMainBot) continue;
            if (selectedBot === 'bot2' && isMainBot) continue;

            const tagText = guildSettings.tag_text;
            const tagRoleId = guildSettings.tag_role_id;

            if (!tagText || !tagRoleId) {
                continue;
            }

            const member = await guild.members.fetch(newUser.id).catch(() => null);
            if (!member) {
                continue;
            }

            const hadTag = oldUser.globalName && oldUser.globalName.startsWith(tagText);
            const hasTag = newUser.globalName && newUser.globalName.startsWith(tagText);

            if (hadTag === hasTag) {
                continue;
            }

            const role = await guild.roles.fetch(tagRoleId).catch(() => null);
            if (!role) {
                console.error(`Ayarlanan Tag Rolü (${tagRoleId}) sunucuda bulunamadı. Sunucu: ${guildId}`);
                continue;
            }

            const botMember = guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                console.error(`Tag Rolü işlemi yapılamadı: Botun 'Rolleri Yönet' izni yok. Sunucu: ${guildId}, Rol: ${role.id}`);
                continue;
            }
            if (botMember.roles.highest.position <= role.position) {
                console.error(`Tag Rolü işlemi yapılamadı: Botun rolü (${botMember.roles.highest.name}) Tag Rolünden (${role.name}) düşük veya aynı seviyede. Sunucu: ${guildId}`);
                continue;
            }

            if (!hadTag && hasTag) {
                await member.roles.add(role, 'Kullanıcı tagı global ismine ekledi.');
            } else if (hadTag && !hasTag) {
                await member.roles.remove(role, 'Kullanıcı tagı global isminden çıkardı.');
            }

        } catch (e) {
            console.error(`[UserUpdate] Tag rolü verme/alma hatası: Kullanıcı ${newUser.id}, Sunucu ${guildId}`, e);
        }
    }
}


let onClientReady = async (readyClient) => {
    console.log(`[Bilgi] ${readyClient.user.tag} | Bot Çevrimiçi!`);
    readyClient.user.setPresence({ status: 'invisible' });

    readyClient.guildSettings = guildSettings;
    readyClient.updateSettings = updateSettingsFromDb;

    for (const [guildId, guild] of readyClient.guilds.cache) {
        await guild.channels.fetch().catch(() => {});
        guild.channels.cache
          .filter(c => c.isVoiceBased())
          .forEach(channel => {
            channel.members.forEach(member => {
              readyClient.voiceStateCache.set(member.id, channel.id);
            });
          });
    }
    console.log(`[Bilgi - ${readyClient.user.tag}] VoiceState önbelleği kaydedildi (${readyClient.voiceStateCache.size} kullanıcı).`);

    await loadActivePunishments(readyClient, db);

    const isSecondBot = readyClient.user.id === process.env.BOT_ID_2;
    const isMainBot = readyClient.user.id === process.env.BOT_ID;

    if (isSecondBot) {
        console.log(`[Bilgi - ${readyClient.user.tag}] Bot 2, ses kanalına katılmak için 3 saniye bekliyor...`);
        setTimeout(() => {
            autoJoinVoiceChannels(readyClient);
        }, 3000);
    } else {
        await autoJoinVoiceChannels(readyClient);
    }

    if (isMainBot) {
        if (readyClient.statUpdateInterval) {
            clearInterval(readyClient.statUpdateInterval);
        }
        readyClient.statUpdateInterval = setInterval(() => {
            periodicStatUpdate(readyClient);
        }, STAT_UPDATE_INTERVAL);
        console.log(`[Bilgi - ${readyClient.user.tag}] İstatistik güncelleme zamanlayıcısı ${STAT_UPDATE_INTERVAL / 1000} saniyede bir çalışacak şekilde ayarlandı.`);
    }

    if (isMainBot && !mainBotReady) {
        mainBotReady = true;
        console.log('[Bilgi] Ana bot hazır, global sistemler başlatılıyor...');

        await reloadCommandsAndSyncDb();

        client.guildSettings = guildSettings;
        client2.guildSettings = guildSettings;
        client.updateSettings = updateSettingsFromDb;
        client2.updateSettings = updateSettingsFromDb;

        client.on(Events.GuildCreate, updateGuildDataCache);
        client.on(Events.GuildDelete, updateGuildDataCache);
        client.on(Events.GuildRoleCreate, updateGuildDataCache);
        client.on(Events.GuildRoleDelete, updateGuildDataCache);
        client.on(Events.ChannelCreate, updateGuildDataCache);
        client.on(Events.ChannelDelete, updateGuildDataCache);
        client.on(Events.GuildChannelUpdate, updateGuildDataCache);
        client.on(Events.GuildRoleUpdate, updateGuildDataCache);

        fs.watch(syncTriggerPath, (eventType) => {
            if(eventType === 'change') {
                console.log('sync.trigger değişti, ayarlar güncelleniyor...');
                updateSettingsFromDb();
                updateGuildSettingsFromDb();
            }
        });

        fs.watch('./commands', (eventType, filename) => {
          if (filename && filename.endsWith('_command.js')) {
            reloadCommandsAndSyncDb()
          }
        });

        fs.watch('./commands_notslash', (eventType, filename) => {
          if (filename && filename.endsWith('_command.js')) {
            reloadCommandsAndSyncDb()
          }
        });

        app.listen(process.env.BOT_API_PORT || 3000, () => {
            console.log(`Bot API sunucusu http://127.0.0.1:${process.env.BOT_API_PORT || 3000} adresinde çalışıyor`);
        });
    } else if (!mainBotReady) {
        console.log(`[Bilgi] ${isSecondBot ? 'İkinci bot' : 'Bot'} (${readyClient.user.tag}) hazır, ana bot bekleniyor...`);
    } else {
        console.log(`[Bilgi] Bot (${readyClient.user.tag}) hazır ve ana bota bağlandı.`);
    }
};
function checkPermissions(member, cmdSettings) {
  if (!member) return false;
  if (!cmdSettings) return true;

  const allowedRoles = cmdSettings.allowed_roles || [];
  const allowedUsersObject = cmdSettings.allowed_users || {};
  const guildId = member.guild.id;
  const usersForThisGuild = allowedUsersObject[guildId] || [];

  if (allowedRoles.length === 0 && usersForThisGuild.length === 0) {
      return true;
  }

  if (member.roles.cache.some(role => allowedRoles.includes(role.id))) {
    return true;
  }

  if (usersForThisGuild.includes(member.id)) {
    return true;
  }

  return false;
}


async function handleYetkiSelectMenu(interaction, db) {
  const customIdParts = interaction.customId.split('_');
  
  if (customIdParts.length < 5) {
      console.error("Geçersiz yt_yetki_ver customId formatı:", interaction.customId);
      return interaction.reply({ content: 'Bir hata oluştu (Geçersiz ID Formatı).', flags: [MessageFlags.Ephemeral] });
  }

  const originalAuthorId = customIdParts[customIdParts.length - 2];
  const targetUserId = customIdParts[customIdParts.length - 1];
  
  if (interaction.user.id !== originalAuthorId) {
      return interaction.reply({ 
          content: `Bu menüyü sadece komutu kullanan kişi (<@${originalAuthorId}>) kullanabilir.`, 
          flags: [MessageFlags.Ephemeral] 
      });
  }

  const moderator = interaction.member;
  const guild = interaction.guild;
  
  if (!moderator) {
      return interaction.reply({ content: 'İşlemci üye bilgisi alınamadı.', flags: [MessageFlags.Ephemeral] });
  }

  const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
  if (!targetMember) {
      return interaction.reply({ content: 'Hedef kullanıcı sunucuda bulunamadı.', flags: [MessageFlags.Ephemeral] });
  }

  const guildSettings = interaction.client.guildSettings[guild.id] || {};
  const yetkiRolleri = guildSettings.yetki_roles || [];
  
  const executorHighestRole = moderator.roles.highest;
  const botHighestRole = guild.members.me.roles.highest;

  const selectedRoleIds = interaction.values;
  const rolesToGive = [];
  const rolesFailed = [];

  for (const roleId of selectedRoleIds) {
      if (roleId === 'none') continue;

      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
          rolesFailed.push(`Rol (ID: ${roleId}) bulunamadı.`);
          continue;
      }
      
      if (!yetkiRolleri.includes(role.id)) {
          rolesFailed.push(`${role.name} rolü, "Yetki Rolü" olarak ayarlanmamış.`);
          continue;
      }
      if (executorHighestRole.position <= role.position) {
          rolesFailed.push(`${role.name} rolü, kendi rolünüzden (${executorHighestRole.name}) daha yüksek veya aynı seviyede.`);
          continue;
      }
      if (botHighestRole.position <= role.position) {
          rolesFailed.push(`${role.name} rolü, botun rolünden (${botHighestRole.name}) daha yüksek veya aynı seviyede.`);
          continue;
      }
      if (targetMember.roles.cache.has(role.id)) {
          continue;
      }
      
      rolesToGive.push(role);
  }

  if (rolesToGive.length === 0 && rolesFailed.length === 0) {
       return interaction.reply({
           content: 'Kullanıcı zaten seçilen rollere sahip veya hiçbir rol seçilmedi.',
           flags: [MessageFlags.Ephemeral]
       });
  }

  if (rolesToGive.length > 0) {
      try {
          await targetMember.roles.add(rolesToGive.map(r => r.id), `Yetki Veren: ${moderator.user.tag} (${moderator.id})`);
          
          const allRoles = Array.from(targetMember.roles.cache.keys());

          await db.execute(`
              INSERT INTO yetki_logs (guild_id, user_id, user_tag, moderator_id, moderator_tag, added_roles, all_user_roles, timestamp)
              VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
          `, [
              guild.id,
              targetMember.id,
              targetMember.user.tag,
              moderator.id,
              moderator.user.tag,
              JSON.stringify(rolesToGive.map(r => r.id)),
              JSON.stringify(allRoles)
          ]);

      } catch (e) {
          console.error("Yetki rolleri verilirken hata oluştu:", e);
          return interaction.reply({ content: `Roller verilirken bir Discord hatası oluştu: ${e.message}`, flags: [MessageFlags.Ephemeral] });
      }
  }
  
  let followupMessage = 'Yetki verildi.';
  
  if (rolesFailed.length > 0) {
      if (followupMessage) followupMessage += '\n';
      followupMessage += `**Başarısız olanlar:**\n- ${rolesFailed.join('\n- ')}`;
  }

try {
      // 1. Orijinal mesajdaki embed'i ve component'leri alalım
      const originalEmbed = interaction.message.embeds[0];
      const originalSelectMenuComponent = interaction.message.components[0].components[0];

      const preservedOptions = originalSelectMenuComponent.options.map(opt => {
          const builder = new StringSelectMenuOptionBuilder()
              .setLabel(opt.label)
              .setValue(opt.value);
          if (opt.description) builder.setDescription(opt.description);
          if (opt.emoji) builder.setEmoji(opt.emoji);
          
          if (interaction.values.includes(opt.value)) {
              builder.setDefault(true);
          }
          return builder;
      });

	  const disabledSelectMenu = new StringSelectMenuBuilder()
          .setCustomId(interaction.customId + '_done') 
          .setPlaceholder('Yetki başarıyla verildi') 
          .setDisabled(true) 
          .setMaxValues(originalSelectMenuComponent.maxValues || 1); 

      if (preservedOptions.length > 0) {
          disabledSelectMenu.addOptions(preservedOptions);      } else {
          disabledSelectMenu.addOptions([
              new StringSelectMenuOptionBuilder().setLabel('İşlem tamamlandı').setValue('done')
          ]);
      }
          
      // 5. Yeni, devre dışı menüyü yeni bir satıra koy
      const disabledRow = new ActionRowBuilder().addComponents(disabledSelectMenu);

      // 6. Mesajı, eski embed + YENİ (devre dışı) component ile güncelle
      await interaction.update({
          embeds: [originalEmbed], // Embed'i koru
          components: [disabledRow] // Component'i değiştir
      });

      // Başarısız olan roller varsa, bunları ayrıca bildir
      if (followupMessage) {
          await interaction.followUp({
              content: followupMessage,
              flags: [MessageFlags.Ephemeral]
          });
      }
  
  } catch (updateError) {
      console.error("Mesaj güncellenirken (menü devre dışı bırakılırken) hata:", updateError);
      
      // Hata olsa bile en azından işlemi bildirelim
      await interaction.followUp({
          content: followupMessage || 'Roller verildi ancak mesaj güncellenemedi.',
          flags: [MessageFlags.Ephemeral]
      });
  }
} // handleYetkiSelectMenu fonksiyonunun sonu

async function onInteractionCreate(interaction) {

  if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('yt_yetki_ver_')) {
          await handleYetkiSelectMenu(interaction, db);
      }
      return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return;

  const cmdSettings = settings[interaction.commandName];
  const guildId = interaction.guild.id;
  const isMainBot = interaction.client.user.id === process.env.BOT_ID;

  let selectedBot = 'bot1';
  if (cmdSettings && cmdSettings.config && cmdSettings.config.executor_bot && cmdSettings.config.executor_bot[guildId]) {
      selectedBot = cmdSettings.config.executor_bot[guildId];
  }

  if (selectedBot === 'bot1' && !isMainBot) {
      return;
  }
  if (selectedBot === 'bot2' && isMainBot) {
      return;
  }

  if (cmdSettings && cmdSettings.is_enabled === false) {
    return interaction.reply({ content: `${interaction.commandName} komutu şu anda devre dışı.`, ephemeral: true });
  }

  if (!checkPermissions(interaction.member, cmdSettings)) {
    return interaction.reply({ content: 'Bu komutu kullanmak için yetkiniz yok.', ephemeral: true });
  }

  try {
    await command.execute(interaction, db, settings);
  } catch (e) {
    console.error(e);
    if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'Komut çalıştırılırken bir hata oluştu!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'Komut çalıştırılırken bir hata oluştu!', ephemeral: true });
		}
  }
}
async function onMessageCreate(message) {
  if (message.author.bot || !message.guild) {
    if (!message.content.startsWith(prefix)) return;
  }

  const isMainBot = message.client.user.id === process.env.BOT_ID;

  if (!message.author.bot && message.guild && isMainBot) {
      try {
          const userId = message.author.id;
          const guildId = message.guild.id;
          const channelId = message.channel.id;
          const statDate = getCurrentDateString();

          await db.execute(`
              INSERT INTO user_message_stats (user_id, guild_id, channel_id, stat_date, message_count)
              VALUES (?, ?, ?, ?, 1)
              ON DUPLICATE KEY UPDATE message_count = message_count + 1
          `, [userId, guildId, channelId, statDate]);
      } catch (e) {
           console.error(`[Stat Update Error] user_message_stats güncellenemedi (User: ${message.author.id}, Guild: ${message.guild.id}):`, e.message);
      }
  }

  if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      const cmdSettings = settings[commandName];

      const command = message.client.prefixCommands.get(commandName);
      if (!command) return;

      const guildId = message.guild.id;

      let selectedBot = 'bot1';
      if (cmdSettings && cmdSettings.config && cmdSettings.config.executor_bot && cmdSettings.config.executor_bot[guildId]) {
          selectedBot = cmdSettings.config.executor_bot[guildId];
      }

      if (selectedBot === 'bot1' && !isMainBot) {
          return;
      }
      if (selectedBot === 'bot2' && isMainBot) {
          return;
      }

      if (cmdSettings && cmdSettings.is_enabled === false) return;

      if (!checkPermissions(message.member, cmdSettings)) {
        message.react(emojis.ERROR).catch(e => { if (e.code !== 10008) console.error("Hata tepkisi eklenemedi:", e); });
        return;
      }

      try {
        await command.execute(message, args, db, settings);
      } catch (e) {
        console.error(e);
        message.react(emojis.ERROR).catch(err => { if (err.code !== 10008) console.error("Hata tepkisi eklenemedi:", err); });
      }
  }
}

const app = express();

app.get('/search_users', async (req, res) => {
    const { guild_id, query } = req.query;

    if (!guild_id || !query) {
        return res.status(400).json({ error: 'guild_id and query are required' });
    }

    try {
        const guild = await client.guilds.fetch(guild_id).catch(() => null);
        if (!guild) {
             const guild2 = process.env.BOT_TOKEN2 ? await client2.guilds.fetch(guild_id).catch(() => null) : null;
             if (!guild2) return res.status(404).json({ error: 'Guild not found by any bot' });

             const member2 = await guild2.members.fetch(query).catch(() => null);
             if (!member2) return res.json({ total: 0, page: 1, results: [] });

             return res.json({
                total: 1,
                page: 1,
                results: [{
                    id: member2.id,
                    tag: member2.user.tag,
                    avatar: member2.user.displayAvatarURL()
                }]
             });
        }

        const member = await guild.members.fetch(query).catch(() => null);

        if (!member) {
            return res.json({ total: 0, page: 1, results: [] });
        }

        const response = {
            total: 1,
            page: 1,
            results: [{
                id: member.id,
                tag: member.user.tag,
                avatar: member.user.displayAvatarURL()
            }]
        };
        res.json(response);

    } catch (e) {
        console.error('API /search_users hatası:', e);
        res.status(500).json({ error: 'Internal bot error' });
    }
});

;(async () => {
  await initDb();
  await updateGuildSettingsFromDb();

  [client, client2].forEach(c => {
      if (c === client2 && !process.env.BOT_TOKEN2) return;

	  c.on('error', (error) => {
          console.error(`[BOT HATA - ${c.user ? c.user.tag : 'Giriş Yapılmadı'}] Yakalanmayan bir hata oluştu:`, error.message);
      });
      c.on(Events.VoiceStateUpdate, onVoiceStateUpdate);
      c.on(Events.GuildMemberUpdate, onGuildMemberUpdate);
      c.on(Events.GuildMemberAdd, onGuildMemberAdd);
      c.on(Events.InteractionCreate, onInteractionCreate);
      c.on(Events.MessageCreate, onMessageCreate);
      c.on(Events.UserUpdate, onUserUpdate);
      c.once(Events.ClientReady, onClientReady);
  });

  await client.login(process.env.BOT_TOKEN);

  if (process.env.BOT_TOKEN2) {
    await client2.login(process.env.BOT_TOKEN2);
  } else {
    console.log('[Bilgi] İkinci bot token (BOT_TOKEN2) bulunamadı, ikinci bot başlatılmadı.');
  }
})()