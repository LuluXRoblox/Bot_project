import { sendDM } from '../lib/discord.js';
import { setVerifyCode } from '../lib/db.js';

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id } = req.body || {};
  if (!user_id) {
    return res.status(400).json({ error: 'user_id wajib diisi' });
  }

  const code = generateCode();

  try {
    await setVerifyCode(user_id, code);
    await sendDM(
      user_id,
      `🔐 Kode verifikasi kamu: **${code}**\n\nMasukkan kode ini di Termux untuk lanjut. Kode berlaku 5 menit.`
    );
    return res.status(200).json({ ok: true, message: 'Kode dikirim lewat DM' });
  } catch (err) {
    // Kemungkinan besar: user belum pernah satu server dengan bot, atau DM ditutup
    return res.status(400).json({
      error: 'Gagal mengirim DM. Pastikan kamu sudah invite bot ke server dan DM terbuka.',
      detail: err.message,
    });
  }
}
