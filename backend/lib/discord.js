const API_BASE = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generic request ke Discord API dengan auto-retry kalau kena rate limit (429).
 */
async function discordRequest(endpoint, { method = 'GET', body } = {}) {
  if (!BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN belum di-set di env Vercel');

  const headers = {
    Authorization: `Bot ${BOT_TOKEN}`,
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const retryAfter = (data.retry_after || 1) * 1000 + 200;
    await sleep(retryAfter);
    return discordRequest(endpoint, { method, body });
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg = data && data.message ? data.message : res.statusText;
    const err = new Error(`Discord API error (${res.status}): ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ====== USER / DM ======

export async function createDMChannel(userId) {
  return discordRequest('/users/@me/channels', {
    method: 'POST',
    body: { recipient_id: userId },
  });
}

export async function sendMessage(channelId, content) {
  return discordRequest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: { content },
  });
}

export async function sendDM(userId, content) {
  const dm = await createDMChannel(userId);
  return sendMessage(dm.id, content);
}

// ====== BOT INFO ======

export async function getBotUser() {
  return discordRequest('/users/@me');
}

// ====== GUILD INFO ======

export async function getBotGuilds() {
  // Daftar guild yang bot ikuti saat ini
  return discordRequest('/users/@me/guilds');
}

export async function getGuild(guildId) {
  return discordRequest(`/guilds/${guildId}`);
}

export async function leaveGuild(guildId) {
  return discordRequest(`/users/@me/guilds/${guildId}`, { method: 'DELETE' });
}

/**
 * Cari siapa yang invite bot ke guild ini lewat Audit Log (action_type 28 = BOT_ADD).
 * Butuh permission VIEW_AUDIT_LOG.
 */
export async function findBotInviter(guildId, botUserId) {
  const data = await discordRequest(
    `/guilds/${guildId}/audit-logs?action_type=28&limit=20`
  );
  if (!data || !data.audit_log_entries) return null;
  const entry = data.audit_log_entries.find((e) => e.target_id === botUserId);
  return entry ? entry.user_id : null;
}

// ====== ROLES ======

export async function getGuildRoles(guildId) {
  return discordRequest(`/guilds/${guildId}/roles`);
}

export async function createRole(guildId, { name, color = 0, hoist = false, permissions = '0', mentionable = false }) {
  return discordRequest(`/guilds/${guildId}/roles`, {
    method: 'POST',
    body: { name, color, hoist, permissions, mentionable },
  });
}

export async function deleteRole(guildId, roleId) {
  return discordRequest(`/guilds/${guildId}/roles/${roleId}`, { method: 'DELETE' });
}

// ====== CHANNELS ======
// type: 0 = text, 2 = voice, 4 = category

export async function getGuildChannels(guildId) {
  return discordRequest(`/guilds/${guildId}/channels`);
}

export async function createChannel(guildId, { name, type = 0, parent_id, position, permission_overwrites }) {
  return discordRequest(`/guilds/${guildId}/channels`, {
    method: 'POST',
    body: { name, type, parent_id, position, permission_overwrites },
  });
}

export async function modifyChannel(channelId, payload) {
  return discordRequest(`/channels/${channelId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function deleteChannel(channelId) {
  return discordRequest(`/channels/${channelId}`, { method: 'DELETE' });
}

export async function getChannelMessages(channelId, limit = 1) {
  return discordRequest(`/channels/${channelId}/messages?limit=${limit}`);
}

export { sleep };
