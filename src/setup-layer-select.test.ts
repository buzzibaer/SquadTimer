import { expect, it } from 'vitest';
import { catalog } from './catalog';
import { setupLayerSelectMarkup } from './setup-layer-select';

it('renders only catalog layers for Anvil and Al Basrah, including valid selected layers', () => {
  const anvil = setupLayerSelectMarkup(catalog, 'Anvil', 'Anvil RAAS v1');
  expect(anvil).toContain('<option selected>Anvil RAAS v1</option>');
  expect(anvil).toContain('Anvil RAAS v2');
  expect(anvil).not.toContain('Keine Layerdaten');

  const alBasrah = setupLayerSelectMarkup(catalog, 'Al Basrah', 'Al Basrah AAS v2');
  expect(alBasrah).toContain('<option selected>Al Basrah AAS v2</option>');
  expect(alBasrah).toContain('Al Basrah RAAS v1');
  expect(alBasrah).not.toContain('Keine Layerdaten');
});

it('keeps missing maps and layers distinct without fabricating layer options', () => {
  const missingLayer = setupLayerSelectMarkup(catalog, 'Al Basrah', 'Al Basrah AAS v99');
  expect(missingLayer).toContain('Al Basrah AAS v2');
  expect(missingLayer).not.toContain('Al Basrah AAS v99');
  expect(missingLayer).not.toContain('selected');
  expect(setupLayerSelectMarkup(catalog, 'Unknown map', 'Unknown layer'))
    .toBe('<select id="layer"><option value="" selected>Keine Layerdaten</option></select>');
});
