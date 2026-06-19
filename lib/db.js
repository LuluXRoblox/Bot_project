import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'discord_setup_bot';

if (!uri) {
  console.warn('[db] MONGODB_URI belum di-set!');
}

// Cache koneksi supaya tidak bikin koneksi baru tiap function invocation (best practice serverless)
let cachedClient = null;
let cachedDb = null;
let indexesReady = false;

async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
  }
  if (!cachedDb) {
    cachedDb = cachedClient.db(dbName);
  }

  if (!indexesReady) {
    // Idempotent - aman dipanggil berkali-kali, cuma benar2 jalan sekali per cold start
    await Promise.all([
      cachedDb.collection('verify_codes').createIndex({ createdAt: 1 }, { expireAfterSeconds: 5 * 60 }),
      cachedDb.collection('sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 }),
      cachedDb.collection('guild_owners').createIndex({ userId: 1 }),
      cachedDb.collection('history').createIndex({ guildId: 1, date: -1 }),
    ]);
    indexesReady = true;
  }

  return cachedDb;
}

// ====== VERIFIKASI KODE (DM) ======
// TTL index di createdAt otomatis hapus dokumen setelah 5 menit

export async function setVerifyCode(userId, code) {
  const db = await getDb();
  await db.collection('verify_codes').updateOne(
    { _id: userId },
    { $set: { code, createdAt: new Date() } },
    { upsert: true }
  );
}

export async function getVerifyCode(userId) {
  const db = await getDb();
  const doc = await db.collection('verify_codes').findOne({ _id: userId });
  return doc ? doc.code : null;
}

export async function deleteVerifyCode(userId) {
  const db = await getDb();
  await db.collection('verify_codes').deleteOne({ _id: userId });
}

// ====== SESSION ======
// TTL index di createdAt otomatis hapus dokumen setelah 1 jam

export async function createSession(token, userId) {
  const db = await getDb();
  await db.collection('sessions').insertOne({ _id: token, userId, createdAt: new Date() });
}

export async function getSessionUser(token) {
  const db = await getDb();
  const doc = await db.collection('sessions').findOne({ _id: token });
  return doc ? doc.userId : null;
}

// ====== KEPEMILIKAN GUILD ======
// guild_owners: { _id: guildId, userId }
// Cari balik "server milik user X" tinggal query field userId, lebih simpel dibanding bikin index terpisah

export async function setGuildOwner(guildId, userId) {
  const db = await getDb();
  await db.collection('guild_owners').updateOne(
    { _id: guildId },
    { $set: { userId } },
    { upsert: true }
  );
}

export async function getGuildOwner(guildId) {
  const db = await getDb();
  const doc = await db.collection('guild_owners').findOne({ _id: guildId });
  return doc ? doc.userId : null;
}

export async function getGuildsByOwner(userId) {
  const db = await getDb();
  const docs = await db.collection('guild_owners').find({ userId }).toArray();
  return docs.map((d) => d._id);
}

// ====== HISTORY SETUP ======

export async function pushHistory(guildId, entry) {
  const db = await getDb();
  await db.collection('history').insertOne({ guildId, ...entry });

  // simpan cuma 20 terakhir per guild, hapus sisanya
  const old = await db
    .collection('history')
    .find({ guildId })
    .sort({ date: -1 })
    .skip(20)
    .project({ _id: 1 })
    .toArray();

  if (old.length > 0) {
    await db.collection('history').deleteMany({ _id: { $in: old.map((d) => d._id) } });
  }
}

export async function getHistory(guildId) {
  const db = await getDb();
  return db.collection('history').find({ guildId }).sort({ date: -1 }).limit(20).toArray();
}

// ====== TRACKING APA YANG DIBUAT BOT (buat mode "Buat Ulang") ======

export async function setLastCreated(guildId, data) {
  const db = await getDb();
  await db.collection('last_created').updateOne(
    { _id: guildId },
    { $set: data },
    { upsert: true }
  );
}

export async function getLastCreated(guildId) {
  const db = await getDb();
  return db.collection('last_created').findOne({ _id: guildId });
}
