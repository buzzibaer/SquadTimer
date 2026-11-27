const esc = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function squadMapsUrl(mapName: string, layerId: string | undefined, mode: string): string | undefined {
  if (!layerId || (mode !== 'AAS' && mode !== 'RAAS')) return undefined;
  const match = layerId.match(/^([A-Za-z0-9]+)_(AAS|RAAS)_v(\d+)$/);
  if (!match || match[2] !== mode) return undefined;
  const mapId = match[1];
  const expectedMapId = mapName.replace(/[^a-z0-9]/gi, '');
  // SquadMaps uses a shorter identifier for Kamdesh Highlands.
  if (mapName === 'Kamdesh Highlands') {
    if (mapId !== 'Kamdesh') return undefined;
  } else if (mapId.toLocaleLowerCase() !== expectedMapId.toLocaleLowerCase()) return undefined;
  const url = new URL('https://squadmaps.com/');
  url.searchParams.set('map', mapId);
  url.searchParams.set('layer', `${match[2]}v${match[3]}`);
  return url.toString();
}

export function validSquadMapsUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'squadmaps.com' ||
        !parsed.searchParams.get('map') || !parsed.searchParams.get('layer')) return undefined;
    return parsed.toString();
  } catch { return undefined; }
}

export function squadMapsLinkMarkup(url: string): string {
  const safeUrl = validSquadMapsUrl(url);
  if (!safeUrl) return '';
  return `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">SquadMaps öffnen ↗</a>`;
}
