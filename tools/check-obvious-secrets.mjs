#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Deliberately narrow: fail only on high-confidence credential forms. Do not
// add generic "API key"/high-entropy matching: public identifiers (including
// AdMob test IDs) are expected in this repository and would create noise.
const patterns = [
  {
    label: 'private-key PEM header',
    regex: new RegExp(['-----BEGIN ', '(?:RSA |OPENSSH |EC |DSA )?', 'PRIVATE KEY-----'].join(''), 'g'),
  },
  {
    label: 'GitHub access token',
    regex: new RegExp('\\bgh' + '[pousr]_[A-Za-z0-9_]{30,}\\b', 'g'),
  },
  {
    label: 'AWS access-key ID',
    regex: new RegExp('\\bAK' + 'IA[0-9A-Z]{16}\\b', 'g'),
  },
];

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);

const findings = [];
for (const file of files) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    findings.push(`${file}: unreadable (${error.code ?? 'error'})`);
    continue;
  }
  if (bytes.includes(0)) continue; // binary tracked asset
  const text = bytes.toString('utf8');
  for (const { label, regex } of patterns) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const line = text.slice(0, match.index).split('\n').length;
      findings.push(`${file}:${line}: ${label}`);
    }
  }
}

if (findings.length > 0) {
  console.error('High-confidence secret pattern(s) found:');
  for (const finding of findings) console.error(`- ${finding}`);
  console.error('Remove the credential; if it was real, rotate/revoke it. Green checks are not proof of no secrets.');
  process.exit(1);
}

console.log(`Obvious-secret check passed (${files.length} tracked files; high-confidence patterns only).`);
