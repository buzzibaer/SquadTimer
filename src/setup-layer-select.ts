import type { CatalogEntry } from './catalog';

const esc = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function setupLayerSelectMarkup(catalog: CatalogEntry[], map: string, selectedLayer: string) {
  const layers = [...new Set(catalog
    .filter((entry) => entry.map === map && (entry.mode === 'AAS' || entry.mode === 'RAAS'))
    .map((entry) => entry.layer))];
  const options = layers.length
    ? layers.map((layer) => `<option${selectedLayer === layer ? ' selected' : ''}>${esc(layer)}</option>`).join('')
    : '<option value="" selected>Keine Layerdaten</option>';
  return `<select id="layer">${options}</select>`;
}
