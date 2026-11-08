// © 2026 김용현
// Vercel function: checks the admin password and signs notices with a private
// key that never reaches the browser. Clients verify with the public key.
import { createHash, createPrivateKey, sign, timingSafeEqual } from 'node:crypto';

const MAX_TEXT_LENGTH = 200; // matches the admin textarea's maxlength

function passwordMatches(input) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof input !== 'string') return false;
  const digest = (s) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(input), digest(expected));
}

function signBody(body) {
  const key = createPrivateKey({
    key: Buffer.from(process.env.NOTICE_SIGNING_KEY, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });
  const json = JSON.stringify(body);
  // ieee-p1363 is the signature encoding WebCrypto's ECDSA verify expects.
  const sig = sign('sha256', Buffer.from(json), { key, dsaEncoding: 'ieee-p1363' });
  return { body: json, sig: sig.toString('base64') };
}

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!process.env.ADMIN_PASSWORD || !process.env.NOTICE_SIGNING_KEY) {
    return res.status(500).json({ error: 'not configured' });
  }

  const { password, action, text, expiresAt = null, by } = req.body || {};
  if (!passwordMatches(password)) return res.status(401).json({ error: 'password' });

  const at = Date.now();
  if (action === 'login') return res.status(200).json({ ok: true });
  if (action === 'clear') return res.status(200).json(signBody({ clear: true, at }));
  if (action !== 'post') return res.status(400).json({ error: 'action' });

  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) return res.status(400).json({ error: 'text' });
  if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= at)) {
    return res.status(400).json({ error: 'expiresAt' });
  }
  const author = typeof by === 'string' && by ? by.slice(0, 12) : '관리자';
  return res.status(200).json(signBody({ text: trimmed, at, by: author, expiresAt }));
}
