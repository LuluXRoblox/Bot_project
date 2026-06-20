import { InteractionType, InteractionResponseType } from 'discord-interactions';
import { waitUntil } from '@vercel/functions';
import { isValidRequest, readRawBody } from '../lib/discord-verify.js';
import { runSetup, listTemplates } from '../lib/setup-engine.js';
import { pushHistory, getHistory } from '../lib/db.js';
import { leaveGuild } from '../lib/discord.js';

// Wajib: matikan body parser otomatis Vercel supaya bisa baca raw body
// buat verifikasi signature dari Discord.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const rawBody = await readRawBody(req);

  if (!isValidRequest(rawBody, signature, timestamp)) {
    return res.status(401).send('invalid request signature');
  }

  const interaction = JSON.parse(rawBody);

  // Discord ngecek endpoint ini hidup dengan kirim PING, wajib balas PONG
  if (interaction.type === InteractionType.PING) {
    return res.status(200).json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    return handleCommand(interaction, res);
  }

  return res.status(400).json({ error: 'unsupported interaction type' });
}

async function handleCommand(interaction, res) {
  const { name, options } = interaction.data;
  const guildId = interaction.guild_id;

  if (name === 'list-template') {
    const templates = listTemplates();
    const desc = templates.map((t) => `• **${t.name}** (\`${t.key}\`)`).join('\n');
    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Template tersedia:\n${desc}` },
    });
  }

  if (name === 'setup-history') {
    const history = await getHistory(guildId);
    if (!history.length) {
      return res.status(200).json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Belum ada riwayat setup di server ini.' },
      });
    }
    const lines = history
      .slice(0, 10)
      .map(
        (h) =>
          `${h.status === 'success' ? '✅' : '❌'} ${h.template} (${h.mode}) — ${new Date(
            h.date
          ).toLocaleString('id-ID')}`
      )
      .join('\n');
    return res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: lines },
    });
  }

  if (name === 'setup-server') {
    const opt = Object.fromEntries((options || []).map((o) => [o.name, o.value]));
    const templateKey = opt.template;
    const mode = opt.mode;

    // Balas dulu "lagi proses..." (deferred) - Discord cuma kasih 3 detik buat respond awal
    res.status(200).json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

    // PENTING: Vercel matiin function begitu response terkirim, kecuali dibungkus waitUntil.
    // Ini yang bikin proses setup tetap jalan sampai selesai walau respond awal udah dikirim.
    waitUntil(
      (async () => {
        try {
          const result = await runSetup({ guildId, templateKey, mode });
          await sendFollowup(interaction, formatSetupResult(result));
          await pushHistory(guildId, {
            guildId,
            template: templateKey,
            mode,
            date: new Date().toISOString(),
            status: 'success',
            result,
          });
        } catch (err) {
          await sendFollowup(interaction, `❌ Setup gagal: ${err.message}`);
          await pushHistory(guildId, {
            guildId,
            template: templateKey,
            mode,
            date: new Date().toISOString(),
            status: 'failed',
            error: err.message,
          });
        }
      })()
    );
    return;
  }

  if (name === 'bot-leave') {
    res.status(200).json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: '👋 Oke, bot akan keluar dari server ini.' },
    });
    waitUntil(
      leaveGuild(guildId).catch(() => {
        /* abaikan kalau gagal */
      })
    );
    return;
  }

  return res.status(400).json({ error: 'unknown command' });
}

function formatSetupResult(result) {
  if ('rolesCreated' in result) {
    return [
      `✅ **Setup selesai!**`,
      `Template: ${result.template}`,
      `Roles: ${result.rolesCreated}/${result.rolesTotal}`,
      `Categories: ${result.categoriesCreated}/${result.categoriesTotal}`,
      `Channels: ${result.channelsCreated}/${result.channelsTotal}`,
      `Waktu: ${(result.timeMs / 1000).toFixed(1)}s`,
    ].join('\n');
  }
  return [
    `✅ **Rapikan selesai!**`,
    `Renamed: ${result.renamed}`,
    `Moved: ${result.moved}`,
    `Reordered: ${result.reordered}`,
    `Cleaned: ${result.cleaned}`,
  ].join('\n');
}

async function sendFollowup(interaction, content) {
  const appId = interaction.application_id;
  const token = interaction.token;
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}
