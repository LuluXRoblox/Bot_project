import { getSessionUser, getGuildOwner, pushHistory } from '../lib/db.js';
import { runSetup } from '../lib/setup-engine.js';
import { getGuild } from '../lib/discord.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionToken = req.headers['x-session-token'];
  if (!sessionToken) {
    return res.status(401).json({ error: 'Session token wajib diisi (header x-session-token)' });
  }

  const userId = await getSessionUser(sessionToken);
  if (!userId) {
    return res.status(401).json({ error: 'Session invalid atau expired, login ulang' });
  }

  const { guild_id, template_key, mode } = req.body || {};
  if (!guild_id || !template_key || !mode) {
    return res.status(400).json({ error: 'guild_id, template_key, dan mode wajib diisi' });
  }

  // PENTING: cek guild ini benar-benar milik user yang login
  const owner = await getGuildOwner(guild_id);
  if (owner !== userId) {
    return res.status(403).json({ error: 'Kamu tidak punya akses ke server ini' });
  }

  try {
    const guild = await getGuild(guild_id);
    const result = await runSetup({ guildId: guild_id, templateKey: template_key, mode });

    const historyEntry = {
      guildId: guild_id,
      guildName: guild.name,
      template: template_key,
      mode,
      date: new Date().toISOString(),
      status: 'success',
      result,
    };
    await pushHistory(guild_id, historyEntry);

    return res.status(200).json({ ok: true, server: guild.name, ...result });
  } catch (err) {
    await pushHistory(guild_id, {
      guildId: guild_id,
      template: template_key,
      mode,
      date: new Date().toISOString(),
      status: 'failed',
      error: err.message,
    });
    return res.status(500).json({ error: 'Setup gagal', detail: err.message });
  }
}
