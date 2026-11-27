import { expect, it } from 'vitest';
import { compactCatalog, compareCatalogSnapshots, decodeJsString, extractJsonParsePayloads, normalizeVehicleRoster } from './import-squadmaps.js';

it('decodes an embedded JSON.parse single-quoted literal without evaluating JavaScript', () => {
  expect(decodeJsString(String.raw`{"quoted":"say \"hi\"","slash":"a\\b","newline":"\n"}`))
    .toBe('{"quoted":"say "hi"","slash":"a\\b","newline":"\n"}');
});

it('scans escaped JSON.parse literals with a character loop and parses their JSON values', () => {
  const source = String.raw`module.exports=JSON.parse('{"Name":"Test","path":"BP_T62\\\\Test"}')`;
  expect(extractJsonParsePayloads(source)).toEqual([{ Name: 'Test', path: 'BP_T62\\Test' }]);
});

it('normalizes only tracked vehicle classes and keeps distinct timing groups separate', () => {
  const roster = [
    { type: 'T-62', rawType: 'BP_T62_GFI', count: 2, delay: 10, respawnTime: 20, vehType: 'MBT' },
    { type: 'T-62', rawType: 'BP_T62_GFI', count: 1, delay: 0, respawnTime: 15, vehType: 'MBT' },
    { type: 'BMP-1', rawType: 'BP_BMP1_GFI', count: 2, delay: 0, respawnTime: 10, vehType: 'IFV' },
    { type: 'Ural Logistics', rawType: 'BP_LOGI', count: 2, delay: 0, respawnTime: 3, vehType: 'LOGI' },
  ];
  const result = normalizeVehicleRoster(roster);
  expect(result).toHaveLength(3);
  expect(result.map(({ id, count, firstSpawnMinutes, respawnMinutes }) =>
    ({ id, count, firstSpawnMinutes, respawnMinutes }))).toEqual([
    { id: 'BP_T62_GFI-delay10-respawn20', count: 2, firstSpawnMinutes: 10, respawnMinutes: 20 },
    { id: 'BP_T62_GFI-delay0-respawn15', count: 1, firstSpawnMinutes: 0, respawnMinutes: 15 },
    { id: 'BP_BMP1_GFI-delay0-respawn10', count: 2, firstSpawnMinutes: 0, respawnMinutes: 10 },
  ]);
});

it('combines repeated visible roster rows while retaining each timing variant', () => {
  const rows = [
    { type: 'T-62', rawType: 'BP_T62_A', count: 1, delay: 0, respawnTime: 20, vehType: 'MBT' },
    { type: 'T-62', rawType: 'BP_T62_B', count: 1, delay: 0, respawnTime: 20, vehType: 'MBT' },
    { type: 'T-62', rawType: 'BP_T62_C', count: 2, delay: 10, respawnTime: 20, vehType: 'MBT' },
  ];
  expect(normalizeVehicleRoster(rows).map((model) => [model.name, model.count, model.firstSpawnMinutes, model.respawnMinutes]))
    .toEqual([['T-62', 2, 0, 20], ['T-62', 2, 10, 20]]);
});

it('fails closed on incomplete timer or vehicle classification data', () => {
  expect(() => normalizeVehicleRoster([
    { type: 'Mystery', rawType: 'BP_MYSTERY', count: 1, delay: 0, respawnTime: 10, vehType: 'UNKNOWN' },
  ])).not.toThrow();
  expect(normalizeVehicleRoster([
    { type: 'Mystery', rawType: 'BP_MYSTERY', count: 1, delay: 0, respawnTime: 10, vehType: 'UNKNOWN' },
  ])).toEqual([]);
  expect(() => normalizeVehicleRoster([
    { type: 'T-62', rawType: 'BP_T62', count: 1, delay: null, respawnTime: 10, vehType: 'MBT' },
  ])).toThrow(/invalid vehicle roster/);
});

it('reports changed lineup facts against the last catalog snapshot instead of blocking timer changes', () => {
  const snapshot = {
    entries: [
      ...[1, 2].map((team) => ({
        map: 'Anvil', layer: 'Anvil RAAS v1', layerId: 'Anvil_RAAS_v1', team,
        faction: 'GFI', unit: 'Armored',
        models: [
          { id: 't62', name: 'T-62', vehicleClass: 'MBT', count: 2, firstSpawnMinutes: 10, respawnMinutes: 20 },
        ],
      })),
    ],
  };
  const current = structuredClone(snapshot);
  current.entries[0].models[0].firstSpawnMinutes = 12;
  const diff = compareCatalogSnapshots(compactCatalog(snapshot), current);
  expect(diff.changedLineups).toHaveLength(1);
  expect(diff.changedLineups[0]).toMatchObject({
    layerId: 'Anvil_RAAS_v1', team: 1, faction: 'GFI', unit: 'Armored',
    previous: [{ id: 't62', name: 'T-62', vehicleClass: 'MBT', count: 2, firstSpawnMinutes: 10, respawnMinutes: 20 }],
    current: [{ id: 't62', name: 'T-62', vehicleClass: 'MBT', count: 2, firstSpawnMinutes: 12, respawnMinutes: 20 }],
  });
  expect(diff.addedLineups).toEqual([]);
  expect(diff.removedLineups).toEqual([]);
});

it('stores repeated lineups once in a compact catalog and keeps each selection distinct', () => {
  const compact = compactCatalog({
    schemaVersion: 1,
    source: 'https://squadmaps.com/',
    retrievedAt: '2026-11-24T00:00:00.000Z',
    sourceSha256: 'hash',
    coverage: { sourceLayers: 1, lineupCount: 2, unresolvedCount: 0, gaps: [] },
    entries: [
      { map: 'A', layer: 'A RAAS v1', layerId: 'A_RAAS_v1', layerAliases: ['A_RAAS_v1'], mode: 'RAAS', team: 1, faction: 'X', unit: 'Armored', status: 'verified', classCoverage: { MBT: 'known', MGS: 'known-empty', IFV: 'known-empty' }, models: [] },
      { map: 'A', layer: 'A RAAS v1', layerId: 'A_RAAS_v1', layerAliases: ['A_RAAS_v1'], mode: 'RAAS', team: 2, faction: 'X', unit: 'Armored', status: 'verified', classCoverage: { MBT: 'known', MGS: 'known-empty', IFV: 'known-empty' }, models: [] },
    ],
  });
  expect(Object.keys(compact.lineups)).toHaveLength(1);
  expect(compact.entries).toHaveLength(2);
  expect(compact.entries[0].lineupId).toBe(compact.entries[1].lineupId);
});
