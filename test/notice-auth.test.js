// © 2026 김용현
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import handler from '../api/notice-sign.js';
import { createNoticeVerifier } from '../src/notice-auth.js';

const makeKeys = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    pub: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    priv: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
  };
};
const keys = makeKeys();
process.env.ADMIN_PASSWORD = 'correct-password';
process.env.NOTICE_SIGNING_KEY = keys.priv;

function call(body, method = 'POST') {
  let status = 0;
  let json;
  const res = {
    status(s) { status = s; return this; },
    json(j) { json = j; return this; }
  };
  handler({ method, body }, res);
  return { status, json };
}
const post = (extra = {}) => call({ password: 'correct-password', action: 'post', text: '안녕하세요', ...extra });
const tick = () => new Promise((r) => setTimeout(r, 2));

test('wrong or missing password is rejected and gets no signature', () => {
  for (const password of ['nope', undefined, 123]) {
    const { status, json } = call({ password, action: 'post', text: 'x' });
    assert.equal(status, 401);
    assert.equal(json.sig, undefined);
  }
});

test('only POST is allowed', () => {
  assert.equal(call({}, 'GET').status, 405);
});

test('invalid notices are refused', () => {
  assert.equal(post({ text: '   ' }).status, 400);
  assert.equal(post({ text: 'a'.repeat(1001) }).status, 400);
  assert.equal(post({ expiresAt: Date.now() - 1000 }).status, 400);
  assert.equal(post({ expiresAt: 'tomorrow' }).status, 400);
  assert.equal(call({ password: 'correct-password', action: 'nuke' }).status, 400);
});

test('a signed notice verifies and keeps its fields', async () => {
  const expiresAt = Date.now() + 60000;
  const accepted = await createNoticeVerifier(keys.pub)(post({ expiresAt, by: '김샘' }).json);
  assert.equal(accepted.text, '안녕하세요');
  assert.equal(accepted.expiresAt, expiresAt);
  assert.equal(accepted.by, '김샘');
});

test('forged, tampered and foreign-key notices are ignored', async () => {
  const accept = createNoticeVerifier(keys.pub);
  const real = post().json;
  assert.equal(await accept(null), null);
  assert.equal(await accept({ text: '가짜 공지' }), null);
  assert.equal(await accept({ body: real.body.replace('안녕하세요', '가짜'), sig: real.sig }), null);
  assert.equal(await accept({ body: real.body, sig: 'not base64 !!' }), null);
  const foreign = createNoticeVerifier(makeKeys().pub);
  assert.equal(await foreign(real), null);
});

test('a verifier without a public key accepts nothing', async () => {
  assert.equal(await createNoticeVerifier(undefined)(post().json), null);
  assert.equal(await createNoticeVerifier('garbage')(post().json), null);
});

test('after a clear, an older notice replayed in the same tab is ignored', async () => {
  const accept = createNoticeVerifier(keys.pub);
  const old = post().json;
  assert.ok(await accept(old));
  await tick();
  const cleared = await accept(call({ password: 'correct-password', action: 'clear' }).json);
  assert.equal(cleared.clear, true);
  assert.equal(await accept(old), null);
});

test('rebroadcasting the current notice is still accepted', async () => {
  const accept = createNoticeVerifier(keys.pub);
  const current = post().json;
  assert.ok(await accept(current));
  assert.ok(await accept(current));
});
