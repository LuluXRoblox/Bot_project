import { getBotGuilds, getBotUser, findBotInviter, getGuild } from '../lib/discord.js';
import { getSessionUser, getGuildOwner, setGuildOwner, getGuildsByOwner } from '../lib/db.js';

/**
 * Sinkronisasi: untuk setiap guild yang bot ikuti tapi belum tercatat ownernya,
 * cek audit log buat tahu siapa yang invite, lalu simpan.
 */
async function syncGuildOwnership() {
  const guilds = await getBotGuilds();
  const bot = await getBotUser();

  for (const g of guilds) {
    const existingOwner = await getGuildOwner(g.id);
    if (existingOwner) continue;

    try {
      const inviterId = await findBotInviter(g.id, bot.id);
      if (inviterId) {
        await setGuildOwner(g.id, inviterId);
      }
    } catch (e) {
      // bot mungkin belum punya permission VIEW_AUDIT_LOG di guild ini, skip
    }
  }

  return guilds;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
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

  await syncGuildOwnership();

  const guildIds = await getGuildsByOwner(userId);
  const guilds = [];
  for (const id of guildIds) {
    try {
      const g = await getGuild(id);
      guilds.push({ id: g.id, name: g.name });
    } catch (e) {
      // bot mungkin sudah di-kick dari guild ini, skip
    }
  }

  return res.status(200).json({ ok: true, guilds });
}
