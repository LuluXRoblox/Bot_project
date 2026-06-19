import { verifyKey } from 'discord-interactions';

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

export function isValidRequest(rawBody, signature, timestamp) {
  if (!signature || !timestamp || !PUBLIC_KEY) return false;
  try {
    return verifyKey(rawBody, signature, timestamp, PUBLIC_KEY);
  } catch (e) {
    return false;
  }
}

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
