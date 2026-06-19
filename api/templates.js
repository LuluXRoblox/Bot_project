import { listTemplates } from '../lib/setup-engine.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const templates = listTemplates();
    return res.status(200).json({ ok: true, templates });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
