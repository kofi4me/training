import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const valid = name => /^(?:(?:(?:account-|login-)?[a-f0-9]{64})\.json|KN-[A-F0-9-]{36}\.(?:json|pdf))$/.test(name);

export async function backup(source, target) {
  const files = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!entry.isFile() || !valid(entry.name)) throw Error('Unexpected data file; stop the service and inspect the data directory.');
    const bytes = await readFile(path.join(source, entry.name));
    files.push({ name: entry.name, bytes, sha256: digest(bytes) });
  }
  await mkdir(target, { mode: 0o700 });
  for (const file of files) await writeFile(path.join(target, file.name), file.bytes, { mode: 0o600, flag: 'wx' });
  await writeFile(path.join(target, 'manifest.json'), JSON.stringify({ version: 1, created: new Date().toISOString(), files: files.map(({ name, sha256 }) => ({ name, sha256 })) }), { mode: 0o600, flag: 'wx' });
}

export async function restore(source, target) {
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw Error('Invalid backup manifest.');
  const checked = [], names = new Set();
  for (const file of manifest.files) {
    if (!valid(file.name) || names.has(file.name)) throw Error('Invalid or duplicate backup filename.');
    names.add(file.name);
    const bytes = await readFile(path.join(source, file.name));
    if (digest(bytes) !== file.sha256) throw Error('Backup checksum mismatch.');
    checked.push({ name: file.name, bytes });
  }
  await mkdir(target, { mode: 0o700 });
  for (const file of checked) await writeFile(path.join(target, file.name), file.bytes, { mode: 0o600, flag: 'wx' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, source, target, offline] = process.argv.slice(2);
  if (!['backup', 'restore'].includes(mode) || !source || !target || offline !== '--offline') throw Error('Usage: node backup.js backup|restore SOURCE NEW_DIRECTORY --offline (stop the app first)');
  await (mode === 'backup' ? backup : restore)(path.resolve(source), path.resolve(target));
  console.log(`${mode} completed; contains personal data. Store securely.`);
}
