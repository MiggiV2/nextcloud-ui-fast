import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function injectManifest(template, assets) {
  if (!template.includes('__VERSION__') || !template.includes('__PRECACHE__'))
    throw new Error('service worker template is missing the __VERSION__/__PRECACHE__ placeholder');
  const sorted = [...assets].sort();
  const version = createHash('sha256').update(sorted.join('\n')).digest('hex').slice(0, 12);
  return template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(sorted));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? 'dist';
  const assets = readdirSync(join(dist, 'assets'))
    .filter((f) => !/\.(br|gz)$/.test(f))
    .map((f) => `assets/${f}`);
  const swPath = join(dist, 'sw.js');
  writeFileSync(swPath, injectManifest(readFileSync(swPath, 'utf-8'), assets));
}
