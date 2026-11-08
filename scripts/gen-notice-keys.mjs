// Prints a new notice signing key pair. Run once: node scripts/gen-notice-keys.mjs
//   NOTICE_SIGNING_KEY      server-only env var (keep secret, no VITE_ prefix)
//   VITE_NOTICE_PUBLIC_KEY  bundled into the client (safe to expose)
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const b64 = (key, type) => key.export({ format: 'der', type }).toString('base64');

console.log(`NOTICE_SIGNING_KEY=${b64(privateKey, 'pkcs8')}`);
console.log(`VITE_NOTICE_PUBLIC_KEY=${b64(publicKey, 'spki')}`);
