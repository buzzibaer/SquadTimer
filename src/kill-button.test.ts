import { expect, it } from 'vitest';
import { killButtonMarkup } from './kill-button';

it('names each visible kill action by its vehicle class and keeps unknown type secondary', () => {
  for (const vehicleClass of ['MBT', 'MGS', 'IFV'] as const) {
    const markup = killButtonMarkup(vehicleClass);
    expect(markup).toContain(`aria-label="${vehicleClass}-Abschuss melden"`);
    expect(markup).toContain(`＋ ${vehicleClass}-Abschuss melden`);
    expect(markup).toContain('<small>Typ unbekannt</small>');
    expect(markup).toContain(`data-class="${vehicleClass}"`);
  }
});
