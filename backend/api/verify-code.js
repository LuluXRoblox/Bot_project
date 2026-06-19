import crypto from 'crypto';
import { getVerifyCode, deleteVerifyCode, createSession } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id, code } = req.body || {};
  if (!user_id || !code) {
    return res.status(400).json({ error: 'user_id dan code wajib diisi' });
  }

  const stored = await getVerifyCode(user_id);

  if (!stored) {
    return res.status(400).json({ error: 'Kode sudah expired, minta kode baru' });
  }

  if (String(stored) !== String(code)) {
    return res.status(400).json({ error: 'Kode salah' });
  }

  await deleteVerifyCode(user_id);

  const token = crypto.randomBytes(24).toString('hex');
  await createSession(token, user_id);

  return res.status(200).json({ ok: true, session_token: token });
}
