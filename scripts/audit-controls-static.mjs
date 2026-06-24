#!/usr/bin/env node
/**
 * Static audit: every control in CONTROL_REGISTRY must exist in index.html.
 * Run: node scripts/audit-controls-static.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const auditSrc = readFileSync(join(root, 'src/help/controlAudit.js'), 'utf8');

const ids = [...auditSrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
const cinematicKeys = [...auditSrc.matchAll(/key:\s*'([^']+)'/g)];

const missing = ids.filter((id) => !html.includes(`id="${id}"`));
const bundled = html.includes('/samples/the-blue-monk.mp3');

console.log('Static control audit');
console.log('--------------------');
console.log(`Registry controls: ${ids.length}`);
console.log(`Bundled track 09: ${bundled ? 'OK' : 'MISSING'}`);
if (missing.length) {
  console.log(`Missing in HTML: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('All registry IDs found in index.html');
