import { Redis } from '@upstash/redis';

// Vercel Marketplace (Upstash) bisa inject env dengan nama berbeda-beda
// tergantung versi integrasi, jadi kita fallback ke beberapa kemungkinan.
const url =
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL;

const token =
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.warn('[db] Upstash Redis env var belum di-set!');
}

export const redis = new Redis({ url, token });

// ====== VERIFIKASI KODE (DM) ======
const VERIFY_TTL = 5 * 60; // 5 menit

export async function setVerifyCode(userId, code) {
  await redis.set(`verify:${userId}`, code, { ex: VERIFY_TTL });
}

export async function getVerifyCode(userId) {
  return await redis.get(`verify:${userId}`);
}

export async function deleteVerifyCode(userId) {
  await redis.del(`verify:${userId}`);
}

// ====== SESSION ======
const SESSION_TTL = 60 * 60; // 1 jam

export async function createSession(token_, userId) {
  await redis.set(`session:${token_}`, userId, { ex: SESSION_TTL });
}

export async function getSessionUser(token_) {
  return await redis.get(`session:${token_}`);
}

// ====== KEPEMILIKAN GUILD ======
// guild_owner:{guildId} -> userId
// owner_guilds:{userId} -> set of guildId

export async function setGuildOwner(guildId, userId) {
  await redis.set(`guild_owner:${guildId}`, userId);
  await redis.sadd(`owner_guilds:${userId}`, guildId);
}

export async function getGuildOwner(guildId) {
  return await redis.get(`guild_owner:${guildId}`);
}

export async function getGuildsByOwner(userId) {
  const ids = await redis.smembers(`owner_guilds:${userId}`);
  return ids || [];
}

// ====== HISTORY SETUP ======
// history:{guildId} -> list of JSON string (terbaru di index 0)

export async function pushHistory(guildId, entry) {
  await redis.lpush(`history:${guildId}`, JSON.stringify(entry));
  await redis.ltrim(`history:${guildId}`, 0, 19); // simpan 20 terakhir
}

export async function getHistory(guildId) {
  const raw = await redis.lrange(`history:${guildId}`, 0, 19);
  return (raw || []).map((r) => (typeof r === 'string' ? JSON.parse(r) : r));
}

// ====== TRACKING APA YANG DIBUAT BOT (buat mode "Buat Ulang") ======
// last_created:{guildId} -> JSON { roleIds: [], categoryIds: [], channelIds: [] }

export async function setLastCreated(guildId, data) {
  await redis.set(`last_created:${guildId}`, JSON.stringify(data));
}

export async function getLastCreated(guildId) {
  const raw = await redis.get(`last_created:${guildId}`);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
