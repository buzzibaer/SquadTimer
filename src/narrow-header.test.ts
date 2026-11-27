import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('allows the match header and its New Round button to fit narrow viewports', () => {
  const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const narrowRules = styles.match(/@media\s*\(max-width:\s*400px\)\s*\{([^}]*(?:\}[^}]*)*)\}/)?.[1] ?? '';
  expect(narrowRules).toContain('.match-head>div{min-width:0}');
  expect(narrowRules).toContain('.match-head .quiet{white-space:normal');
});
