// © 2026 김용현
// Pulls the campus data (D) and course lines (COURSES) out of the approved draft.
// Run: node scripts/extract-sian-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync(new URL('../reference/sian.html', import.meta.url), 'utf8');
const grab = (name) => {
  const m = html.match(new RegExp(`<script>const ${name} = (\\{.*?\\});</script>`, 's'));
  if (!m) throw new Error(`${name} not found in sian.html`);
  return JSON.parse(m[1]);
};
const D = grab('D');
const COURSES = grab('COURSES');
mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/data/campus.json', import.meta.url), JSON.stringify(D));
writeFileSync(new URL('../src/data/courses.json', import.meta.url), JSON.stringify(COURSES));
console.log('campus keys:', Object.keys(D).join(','));
console.log('courses:', Object.keys(COURSES).map((k) => `${k}=${COURSES[k].length}`).join(','));
