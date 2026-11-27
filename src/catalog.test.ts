import { expect, it } from 'vitest';
import { catalog, catalogInfo, findDetectedLayer, findLineup, hasKnownLineup, layerMatches } from './catalog';

it('contains both Anvil GFI Armored team options with structurally valid source timers', () => {
  for (const team of [1, 2]) {
    const entry = findLineup('Anvil', 'Anvil_RAAS_v1', team, 'GFI', 'Armored');
    expect(entry).toBeDefined();
    for (const model of entry!.models) {
      expect(model.count).toBeGreaterThan(0);
      expect(Number.isFinite(model.firstSpawnMinutes)).toBe(true);
      expect(Number.isFinite(model.respawnMinutes)).toBe(true);
    }
  }
});

it('matches actual raw layer IDs and keeps layer aliases', () => {
  const chora = catalog.find((entry) => entry.layerId === 'Chora_AAS_v2');
  expect(chora).toBeDefined();
  expect(layerMatches(chora!, 'Chora_AAS_v2')).toBe(true);
  expect(layerMatches(chora!, 'Chora AAS v2')).toBe(true);
  expect(layerMatches(chora!, 'AAS v2')).toBe(true);
  expect(layerMatches(chora!, 'Chora · AAS V2')).toBe(true);
  expect(findLineup('Chora', 'Chora_AAS_v2', 1, 'GFI', 'Combined Arms')?.layerId).toBe('Chora_AAS_v2');
  expect(catalog.some((entry) => entry.map === 'Fallujah' && entry.layerAliases?.length)).toBe(true);
});

it('resolves detected Al Basrah rotations to the catalog lineup and leaves missing layers unknown', () => {
  const alBasrah = findDetectedLayer('Al Basrah · AAS v2');
  expect(alBasrah.length).toBeGreaterThan(0);
  expect(alBasrah[0].layerId).toBe('AlBasrah_AAS_v2');
  expect(hasKnownLineup(alBasrah)).toBe(true);
  const missing = findDetectedLayer('Al Basrah · AAS v99');
  expect(missing).toEqual([]);
  expect(hasKnownLineup(missing)).toBe(false);
});

it('keeps team lineups isolated and absent catalog combinations unknown', () => {
  expect(findLineup('Unknown', 'RAAS V1', 1, 'X', 'Y')).toBeUndefined();
  expect(findLineup('Anvil', 'Anvil_RAAS_v1', 3, 'GFI', 'Armored')).toBeUndefined();
  expect(catalogInfo.provenance).toContain('squadmaps.com');
  expect(catalogInfo.coverage).toMatch(/AAS\/RAAS layers/);
});

it('ships structurally complete source selections for both teams', () => {
  expect(catalog.length).toBeGreaterThan(0);
  expect(new Set(catalog.map((entry) => entry.team))).toEqual(new Set([1, 2]));
  const keys = catalog.map((entry) => [entry.layerId, entry.team, entry.faction, entry.unit].join('/'));
  expect(new Set(keys).size).toBe(catalog.length);
  expect(catalog.every((entry) => ['AAS', 'RAAS'].includes(entry.mode) &&
    entry.models.every((model) => ['MBT', 'MGS', 'IFV'].includes(model.vehicleClass) && model.count > 0))).toBe(true);
  expect(catalogInfo.coverage).toMatch(/unresolved source records/);
});
