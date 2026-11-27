import { describe, expect, it } from 'vitest';
import { timerIconMarkup } from './timer-icons';

describe('timer icon markup', () => {
  it('uses the class pictogram as decorative imagery', () => {
    const markup = timerIconMarkup('MBT');
    expect(markup).toMatch(/^<img class="timer-icon" src="data:image\/webp;base64,/);
    expect(markup).toContain('alt="" aria-hidden="true">');
  });
});
