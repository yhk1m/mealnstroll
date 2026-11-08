// © 2026 김용현
// Verifies notices signed by /api/notice-sign. The realtime channel is public,
// so a notice counts only if its signature matches the bundled public key.

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function createNoticeVerifier(publicKeyB64) {
  const keyPromise = publicKeyB64
    ? crypto.subtle.importKey(
        'spki',
        b64ToBytes(publicKeyB64),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      ).catch(() => null)
    : Promise.resolve(null);

  let lastAt = 0;

  // Resolves to the notice body, or null for anything forged, malformed or
  // older than what this tab has already accepted.
  return async function accept(envelope) {
    const key = await keyPromise;
    if (!key || typeof envelope?.body !== 'string' || typeof envelope?.sig !== 'string') return null;
    let ok = false;
    try {
      ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        b64ToBytes(envelope.sig),
        new TextEncoder().encode(envelope.body)
      );
    } catch {
      return null;
    }
    if (!ok) return null;
    let body;
    try {
      body = JSON.parse(envelope.body);
    } catch {
      return null;
    }
    if (!Number.isFinite(body?.at) || body.at < lastAt) return null;
    lastAt = body.at;
    return body;
  };
}

// Throws an Error whose message is safe to show to the admin.
export async function callNoticeApi(payload) {
  let res;
  try {
    res = await fetch('/api/notice-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error('서버에 연결하지 못했어요.');
  }
  if (res.status === 401) throw new Error('비밀번호가 틀렸습니다.');
  if (!res.ok) throw new Error(`공지 서버 오류 (${res.status})`);
  return res.json();
}
