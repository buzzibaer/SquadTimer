import importedData from './data/squadmaps-catalog.json';
import type { Model } from './tracker';

export interface CatalogEntry {
  map: string;
  layer: string;
  layerId?: string;
  layerAliases?: string[];
  mode: 'AAS' | 'RAAS';
  team: 1 | 2;
  faction: string;
  unit: string;
  status: 'fixture' | 'verified' | 'unknown';
  classCoverage: Record<'MBT' | 'MGS' | 'IFV', 'known' | 'known-empty' | 'unknown'>;
  models: Model[];
}
const data = importedData as {
  schemaVersion: number;
  source: string;
  retrievedAt: string;
  sourceSha256: string;
  coverage: {
    sourceLayers: number;
    lineupCount: number;
    unresolvedCount: number;
    homepageMapCards: number;
    mapsWithoutLayerLists: string[];
  };
  entries: Array<Omit<CatalogEntry, 'models' | 'classCoverage'> & { lineupId?: string; models?: Model[]; classCoverage?: CatalogEntry['classCoverage'] }>;
  lineups?: Record<string, Pick<CatalogEntry, 'models' | 'classCoverage'>>;
};
export const catalogInfo = {
  version: `SquadMaps · ${data.retrievedAt.slice(0, 10)}`,
  provenance: `Factual vehicle fields from ${data.source} · source SHA-256 ${data.sourceSha256}.`,
  coverage: `${data.coverage.sourceLayers} base-game AAS/RAAS layers · ${data.coverage.lineupCount} team/faction/unit lineups · ${data.coverage.unresolvedCount} unresolved source records · ${data.coverage.mapsWithoutLayerLists.join(', ') || 'none'} listed without layer lists.`,
};
export const catalog: CatalogEntry[] = data.entries.map((entry) => {
  const lineup = entry.lineupId ? data.lineups?.[entry.lineupId] : undefined;
  if (lineup) return { ...entry, ...lineup };
  return entry as CatalogEntry;
});
export function layerMatches(entry: CatalogEntry, layer: string) {
  const canonical = (value: string) => value.trim().toLocaleLowerCase()
    .replace(/[_-]+/g, ' ').replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ');
  const key = canonical(layer);
  return [entry.layer, entry.layerId, ...(entry.layerAliases ?? [])]
    .some((alias) => alias && canonical(alias) === key);
}
export function findLineup(map: string, layer: string, team: number, faction: string, unit: string) {
  return catalog.find((entry) => entry.map.toLocaleLowerCase() === map.toLocaleLowerCase() && layerMatches(entry, layer) && entry.team === team &&
    entry.faction === faction && entry.unit === unit);
}
export function findDetectedLayer(layer: string) {
  const [map, ...parts] = layer.split(' · ');
  const layerName = parts.join(' · ').replace(/^([A-Z]+) v([0-9]+)$/i, '$1 V$2');
  return catalog.filter((entry) => entry.map.toLocaleLowerCase() === map.toLocaleLowerCase() && layerMatches(entry, layerName));
}
export function hasKnownLineup(entries: CatalogEntry[]) {
  return entries.some((entry) => entry.status !== 'unknown' &&
    Object.values(entry.classCoverage).some((coverage) => coverage !== 'unknown'));
}
