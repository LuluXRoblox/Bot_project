import { listTemplates } from '../lib/setup-engine.js';

const MODE_CHOICES = [
  { name: 'Buat Ulang', value: 'recreate' },
  { name: 'Timpa', value: 'overwrite' },
  { name: 'Rapikan', value: 'tidy' },
];

export default async function handler(req, res) {
  if (req.query.secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const templates = listTemplates();
  const templateChoices = templates.map((t) => ({ name: t.name, value: t.key }));

  const commands = [
    {
      name: 'setup-server',
      description: 'Setup struktur server (roles, categories, channels) dari template',
      default_member_permissions: '8', // 8 = Administrator, bisa diubah lewat Integrations setting tiap server
      options: [
        {
          name: 'template',
          description: 'Pilih template',
          type: 3, // STRING
          required: true,
          choices: templateChoices,
        },
        {
          name: 'mode',
          description: 'Cara setup',
          type: 3,
          required: true,
          choices: MODE_CHOICES,
        },
      ],
    },
    {
      name: 'list-template',
      description: 'Lihat daftar template yang tersedia',
      default_member_permissions: '8',
    },
    {
      name: 'setup-history',
      description: 'Lihat riwayat setup di server ini',
      default_member_permissions: '8',
    },
    {
      name: 'bot-leave',
      description: 'Bot keluar dari server ini',
      default_member_permissions: '8',
    },
  ];

  const appId = process.env.DISCORD_APPLICATION_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  try {
    const r = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: 'Gagal register commands', detail: data });
    }

    return res.status(200).json({ ok: true, registered: data.map((c) => c.name) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
