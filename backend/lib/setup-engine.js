import fs from 'fs';
import path from 'path';
import {
  getGuildRoles,
  createRole,
  deleteRole,
  getGuildChannels,
  createChannel,
  modifyChannel,
  deleteChannel,
  getChannelMessages,
  sleep,
} from './discord.js';
import { setLastCreated, getLastCreated } from './db.js';

const DELAY = 350; // ms antar request, jaga2 rate limit Discord

const CHANNEL_TYPE = { text: 0, voice: 2, category: 4 };

export function loadTemplate(key) {
  const file = path.join(process.cwd(), 'templates', `${key}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Template "${key}" tidak ditemukan`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export function listTemplates() {
  const dir = path.join(process.cwd(), 'templates');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      return { key: data.key, name: data.name };
    });
}

/**
 * Entry point utama. mode: 'recreate' | 'overwrite' | 'tidy'
 */
export async function runSetup({ guildId, templateKey, mode }) {
  const template = loadTemplate(templateKey);
  const start = Date.now();

  let result;
  if (mode === 'recreate') {
    result = await modeRecreate(guildId, template);
  } else if (mode === 'overwrite') {
    result = await modeOverwrite(guildId, template);
  } else if (mode === 'tidy') {
    result = await modeTidy(guildId, template);
  } else {
    throw new Error(`Mode "${mode}" tidak dikenal`);
  }

  result.timeMs = Date.now() - start;
  result.template = template.name;
  return result;
}

// ====================================================
// MODE 1: BUAT ULANG
// Hapus channel/role yang dibuat di setup sebelumnya, lalu buat dari nol
// ====================================================
async function modeRecreate(guildId, template) {
  const prev = await getLastCreated(guildId);

  if (prev) {
    for (const id of prev.channelIds || []) {
      try {
        await deleteChannel(id);
        await sleep(DELAY);
      } catch (e) {
        /* channel mungkin sudah dihapus manual, skip */
      }
    }
    for (const id of prev.categoryIds || []) {
      try {
        await deleteChannel(id); // kategori juga dihapus lewat endpoint channel
        await sleep(DELAY);
      } catch (e) {}
    }
    for (const id of prev.roleIds || []) {
      try {
        await deleteRole(guildId, id);
        await sleep(DELAY);
      } catch (e) {}
    }
  }

  return buildFromScratch(guildId, template);
}

// ====================================================
// MODE 2: TIMPA
// Cek yang sudah ada, tambahkan yang kurang, tidak hapus apapun
// ====================================================
async function modeOverwrite(guildId, template) {
  const existingRoles = await getGuildRoles(guildId);
  const existingChannels = await getGuildChannels(guildId);

  const roleIds = [];
  let rolesCreated = 0;
  for (const role of template.roles) {
    const found = existingRoles.find((r) => r.name === role.name);
    if (found) {
      roleIds.push(found.id);
    } else {
      const created = await createRole(guildId, role);
      roleIds.push(created.id);
      rolesCreated++;
      await sleep(DELAY);
    }
  }

  let categoriesCreated = 0;
  let channelsCreated = 0;
  const categoryIds = [];
  const channelIds = [];

  for (const cat of template.categories) {
    let catObj = existingChannels.find(
      (c) => c.type === CHANNEL_TYPE.category && c.name === cat.name
    );
    if (!catObj) {
      catObj = await createChannel(guildId, { name: cat.name, type: CHANNEL_TYPE.category });
      categoriesCreated++;
      await sleep(DELAY);
    }
    categoryIds.push(catObj.id);

    for (const ch of cat.channels) {
      const type = CHANNEL_TYPE[ch.type] ?? 0;
      const exists = existingChannels.find(
        (c) => c.name === ch.name && c.parent_id === catObj.id
      );
      if (!exists) {
        const createdCh = await createChannel(guildId, {
          name: ch.name,
          type,
          parent_id: catObj.id,
        });
        channelIds.push(createdCh.id);
        channelsCreated++;
        await sleep(DELAY);
      } else {
        channelIds.push(exists.id);
      }
    }
  }

  await setLastCreated(guildId, { roleIds, categoryIds, channelIds });

  return {
    rolesCreated,
    categoriesCreated,
    channelsCreated,
    rolesTotal: template.roles.length,
    categoriesTotal: template.categories.length,
    channelsTotal: template.categories.reduce((a, c) => a + c.channels.length, 0),
  };
}

// ====================================================
// MODE 3: RAPIKAN
// Rename channel yang namanya beda tipis, pindah ke kategori yang benar,
// urutkan sesuai template, hapus channel teks yang kosong (0 pesan)
// ====================================================
async function modeTidy(guildId, template) {
  const existingChannels = await getGuildChannels(guildId);
  let renamed = 0;
  let moved = 0;
  let reordered = 0;
  let cleaned = 0;

  let position = 0;
  for (const cat of template.categories) {
    const catObj = existingChannels.find(
      (c) => c.type === CHANNEL_TYPE.category && c.name === cat.name
    );
    if (!catObj) continue; // kalau kategori belum ada, lewati (mode ini hanya merapikan yang sudah ada)

    if (catObj.position !== position) {
      await modifyChannel(catObj.id, { position });
      reordered++;
      await sleep(DELAY);
    }
    position++;

    let chPos = 0;
    for (const ch of cat.channels) {
      const match = existingChannels.find(
        (c) => c.parent_id === catObj.id && c.name.toLowerCase() === ch.name.toLowerCase()
      );
      if (match) {
        const patch = {};
        if (match.name !== ch.name) patch.name = ch.name;
        if (match.position !== chPos) patch.position = chPos;
        if (Object.keys(patch).length > 0) {
          await modifyChannel(match.id, patch);
          if (patch.name) renamed++;
          if (patch.position !== undefined) moved++;
          await sleep(DELAY);
        }
      }
      chPos++;
    }
  }

  // Bersihkan channel teks kosong yang TIDAK ada di template (dianggap sampah)
  const templateChannelNames = new Set();
  template.categories.forEach((c) => c.channels.forEach((ch) => templateChannelNames.add(ch.name)));

  for (const ch of existingChannels) {
    if (ch.type !== CHANNEL_TYPE.text) continue;
    if (templateChannelNames.has(ch.name)) continue;
    try {
      const msgs = await getChannelMessages(ch.id, 1);
      if (!msgs || msgs.length === 0) {
        await deleteChannel(ch.id);
        cleaned++;
        await sleep(DELAY);
      }
    } catch (e) {
      /* skip kalau gagal cek */
    }
  }

  return { renamed, moved, reordered, cleaned };
}

// ====================================================
// HELPER: bangun dari nol (dipakai oleh mode recreate & setup pertama kali)
// ====================================================
async function buildFromScratch(guildId, template) {
  const roleIds = [];
  for (const role of template.roles) {
    const created = await createRole(guildId, role);
    roleIds.push(created.id);
    await sleep(DELAY);
  }

  const categoryIds = [];
  const channelIds = [];
  for (const cat of template.categories) {
    const catObj = await createChannel(guildId, { name: cat.name, type: CHANNEL_TYPE.category });
    categoryIds.push(catObj.id);
    await sleep(DELAY);

    for (const ch of cat.channels) {
      const type = CHANNEL_TYPE[ch.type] ?? 0;
      const createdCh = await createChannel(guildId, {
        name: ch.name,
        type,
        parent_id: catObj.id,
      });
      channelIds.push(createdCh.id);
      await sleep(DELAY);
    }
  }

  await setLastCreated(guildId, { roleIds, categoryIds, channelIds });

  return {
    rolesCreated: roleIds.length,
    categoriesCreated: categoryIds.length,
    channelsCreated: channelIds.length,
    rolesTotal: template.roles.length,
    categoriesTotal: template.categories.length,
    channelsTotal: template.categories.reduce((a, c) => a + c.channels.length, 0),
  };
}
