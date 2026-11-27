import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function renderServiceWorker(template, assets) {
  const fingerprint = createHash('sha256').update(template);
  for (const asset of [...assets].sort((a, b) => a.path.localeCompare(b.path))) {
    fingerprint.update('\0').update(asset.path).update('\0').update(asset.content);
  }
  const cacheName = `squadtimer-${fingerprint.digest('hex').slice(0, 16)}`;
  if (!/const CACHE = '[^']+';/.test(template)) throw new Error('service-worker cache declaration not found');
  return template.replace(/const CACHE = '[^']+';/, `const CACHE = '${cacheName}';`);
}

async function buildServiceWorker() {
  const dist = resolve(ROOT, 'dist');
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  const paths = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
    .map((match) => match[1]))].sort();
  if (!paths.length) throw new Error('built HTML has no asset references; refusing a non-versioned service worker');
  const assets = [{ path: '/index.html', content: html }];
  for (const path of paths) {
    assets.push({ path, content: await readFile(resolve(dist, path.slice(1))) });
  }
  const template = await readFile(resolve(ROOT, 'public/sw.js'), 'utf8');
  await writeFile(resolve(dist, 'sw.js'), renderServiceWorker(template, assets), 'utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildServiceWorker().catch((error) => {
    console.error(`Service-worker build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
