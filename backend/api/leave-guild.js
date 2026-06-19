import { getSessionUser, getGuildOwner } from '../lib/db.js';
import { leaveGuild } from '../lib/discord.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionToken = req.headers['x-session-token'];
  const { guild_id } = req.body || {};

  if (!sessionToken || !guild_id) {
    return res.status(400).json({ error: 'session token & guild_id wajib diisi' });
  }

  const userId = await getSessionUser(sessionToken);
  if (!userId) {
    return res.status(401).json({ error: 'Session invalid atau expired, login ulang' });
  }

  const owner = await getGuildOwner(guild_id);
  if (owner !== userId) {
    return res.status(403).json({ error: 'Kamu tidak punya akses ke server ini' });
  }

  try {
    await leaveGuild(guild_id);
    return res.status(200).json({ ok: true, message: 'Bot keluar dari server' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
