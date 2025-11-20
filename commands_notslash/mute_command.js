const { EmbedBuilder, Colors, PermissionFlagsBits } = require('discord.js');
const { logToDb } = require('../utils/logger.js');
const { schedulePunishmentEnd } = require('../utils/punishmentManager.js');

function parseDuration(durationStr) {
  const match = durationStr.match(/^(\d+)([mhd])$/);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'm': return amount * 60 * 1000;
    case 'h': return amount * 60 * 60 * 1000;
    case 'd': return amount * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

module.exports = {
  name: 'mute',
  description: 'Bir kullanıcıyı bu kanalda susturur.',
  async execute(message, args, db, settings) {
    const authorMember = message.member;
    const targetId = args[0];
    const channel = message.channel;

    if (message.client.activeChatMutes.get(targetId)?.has(channel.id)) {
      try {
        const replyMsg = await message.reply('Bu kullanıcının zaten bu kanalda aktif bir susturması bulunuyor.');
        setTimeout(() => {
          replyMsg.delete().catch(e => {
            if (e.code !== 10008) console.error("Mesaj silinemedi:", e);
          });
        }, 5000);
      } catch (e) {
        console.error("Ephemeral reply hatası:", e);
      }
      return;
    }

    const durationStr = args[1];
    const reasonInput = args.slice(2).join(' ');
    const reason = reasonInput.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Sebep belirtilmedi.';

    if (!targetId || !durationStr) {
      await logToDb(message.client, settings, db, 'mute', authorMember, null, 'FAIL: INVALID_ARGS');
      return;
    }

    let targetMember;
    try {
      targetMember = await message.guild.members.fetch(targetId);
    } catch {
      await logToDb(message.client, settings, db, 'mute', authorMember, { id: targetId, user: { tag: 'Bilinmiyor' } }, 'FAIL: TARGET_NOT_FOUND');
      return;
    }

    const durationMs = parseDuration(durationStr);

    if (!durationMs) {
      await logToDb(message.client, settings, db, 'mute', authorMember, targetMember, 'FAIL: INVALID_DURATION_FORMAT');
      return;
    }

    if (durationMs <= 0) {
      await logToDb(message.client, settings, db, 'mute', authorMember, targetMember, 'FAIL: DURATION_TOO_SHORT');
      return;
    }

    const bitis_tarihi = new Date(Date.now() + durationMs);

    try {
      await channel.permissionOverwrites.edit(targetMember.id,
        { [PermissionFlagsBits.SendMessages]: false },
        { reason: reason }
      );

      await db.execute(
        'INSERT INTO cezalar (guild_id, user_id, user_tag, user_avatar, moderator_id, moderator_tag, moderator_avatar, ceza_tipi, sebep, bitis_tarihi, aktif, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
        [message.guild.id, targetMember.id, targetMember.user.tag, targetMember.user.displayAvatarURL({ dynamic: true }), authorMember.id, authorMember.user.tag, authorMember.user.displayAvatarURL({ dynamic: true }), 'chatmute', reason, bitis_tarihi, channel.id]
      );

      if (!message.client.activeChatMutes.has(targetMember.id)) {
        message.client.activeChatMutes.set(targetMember.id, new Set());
      }
      message.client.activeChatMutes.get(targetMember.id).add(channel.id);

      await logToDb(message.client, settings, db, 'mute', authorMember, targetMember, `SUCCESS: ${durationStr} - ${reason} - #${channel.name}`);

      await message.react('1430712456971292772').catch(e => console.error("Tepki eklenemedi:", e));

      setTimeout(() => {
        schedulePunishmentEnd(message.client, db, message.guild.id, targetMember.id, 'chatmute', channel.id, 'Ceza süresi doldu.');
      }, durationMs);

    } catch (err) {
      if (err.code === 50013 || err.code === 40001) {
         await logToDb(message.client, settings, db, 'mute', authorMember, targetMember, 'FAIL: NO_PERMISSION');
      } else {
        console.error(`'.mute' komutu başarısız oldu:`, err);
        await logToDb(message.client, settings, db, 'mute', authorMember, targetMember, `FAIL: ${err.message}`);
      }
    }
  }
};