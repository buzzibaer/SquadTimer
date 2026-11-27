import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { renderServiceWorker } from './build-service-worker.js';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

it('changes served service-worker bytes when built catalog assets change', () => {
  const first = renderServiceWorker(source, [{
    path: '/assets/app.js',
    content: `const catalog=${JSON.stringify({ entries: [{ model: 'T-62', delay: 10 }] })};`,
  }]);
  const second = renderServiceWorker(source, [{
    path: '/assets/app.js',
    content: `const catalog=${JSON.stringify({ entries: [{ model: 'T-62', delay: 11 }] })};`,
  }]);
  expect(first).not.toBe(second);
  expect(first).toMatch(/const CACHE = 'squadtimer-[a-f0-9]{16}';/);
  expect(second).toMatch(/const CACHE = 'squadtimer-[a-f0-9]{16}';/);
});

it('is deterministic for identical built assets', () => {
  const assets = [{ path: '/assets/app.js', content: 'same build' }];
  expect(renderServiceWorker(source, assets)).toBe(renderServiceWorker(source, assets));
});
