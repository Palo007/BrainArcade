// Checks the on-screen texts: every key in both languages, same {placeholders}, plural shapes,
// and every t('key') in src has an English text. Exit code 1 on any problem.
// Run: node tools/check-i18n.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MESSAGES } from '../src/locales/index.js';

const problems = [];
const en = MESSAGES.en, sk = MESSAGES.sk;
const holes = (m) => new Set(JSON.stringify(m).match(/\{\w+\}/g) || []);
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

for (const k of Object.keys(en)) {
  if (!(k in sk)) { problems.push(`sk missing: ${k}`); continue; }
  if (!same(holes(en[k]), holes(sk[k]))) problems.push(`placeholders differ: ${k}`);
  const plural = typeof en[k] === 'object';
  if (plural !== (typeof sk[k] === 'object')) problems.push(`plural shape differs: ${k}`);
  if (plural && !(sk[k].one && sk[k].few && sk[k].other)) problems.push(`sk plural needs one/few/other: ${k}`);
}
for (const k of Object.keys(sk)) if (!(k in en)) problems.push(`en missing: ${k}`);

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'locales') walk(p); } else if (/\.(jsx?|mjs)$/.test(f) && f !== 'i18n.js') files.push(p);
  }
})('src');
for (const p of files) {
  for (const m of readFileSync(p, 'utf8').matchAll(/\bt\(\s*['"]([\w.-]+)['"]/g)) {
    if (!(m[1] in en)) problems.push(`used but not defined: ${m[1]} (${p})`);
  }
}

console.log(`${Object.keys(en).length} en keys, ${Object.keys(sk).length} sk keys`);
if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
console.log('OK');
