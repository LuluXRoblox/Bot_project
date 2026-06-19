import { getSessionUser, getGuildOwner, getHistory } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionToken = req.headers['x-session-token'];
  const guildId = req.query.guild_id;

  if (!sessionToken || !guildId) {
    return res.status(400).json({ error: 'session token & guild_id wajib diisi' });
  }

  const userId = await getSessionUser(sessionToken);
  if (!userId) {
    return res.status(401).json({ error: 'Session invalid atau expired, login ulang' });
  }

  const owner = await getGuildOwner(guildId);
  if (owner !== userId) {
    return res.status(403).json({ error: 'Kamu tidak punya akses ke server ini' });
  }

  const history = await getHistory(guildId);
  return res.status(200).json({ ok: true, history });
}
