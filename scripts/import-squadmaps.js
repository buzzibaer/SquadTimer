import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://squadmaps.com/';
const CLASSES = new Set(['MBT', 'MGS', 'IFV']);

// Decode a JavaScript string literal without evaluating the containing bundle.
export function decodeJsString(literal) {
  let result = '';
  for (let i = 0; i < literal.length; i += 1) {
    const char = literal[i];
    if (char !== '\\') {
      result += char;
      continue;
    }
    const escaped = literal[++i];
    if (escaped === undefined) throw new Error('unterminated JavaScript escape');
    if (escaped === '\n') continue;
    if (escaped === '\r' && literal[i + 1] === '\n') { i += 1; continue; }
    const simple = { "'": "'", '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '0': '\0' };
    if (Object.hasOwn(simple, escaped)) {
      result += simple[escaped];
      continue;
    }
    if (escaped === 'x') {
      const hex = literal.slice(i + 1, i + 3);
      if (!/^[\da-f]{2}$/i.test(hex)) throw new Error('invalid hexadecimal JavaScript escape');
      result += String.fromCharCode(parseInt(hex, 16));
      i += 2;
      continue;
    }
    if (escaped === 'u') {
      if (literal[i + 1] === '{') {
        const end = literal.indexOf('}', i + 2);
        const hex = literal.slice(i + 2, end);
        if (end < 0 || !/^[\da-f]{1,6}$/i.test(hex)) throw new Error('invalid Unicode JavaScript escape');
        result += String.fromCodePoint(parseInt(hex, 16));
        i = end;
      } else {
        const hex = literal.slice(i + 1, i + 5);
        if (!/^[\da-f]{4}$/i.test(hex)) throw new Error('invalid Unicode JavaScript escape');
        result += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      }
      continue;
    }
    throw new Error(`unsupported JavaScript escape: \\${escaped}`);
  }
  return result;
}

export function extractJsonParsePayloads(source) {
  const payloads = [];
  const marker = 'JSON.parse(';
  let from = 0;
  while ((from = source.indexOf(marker, from)) !== -1) {
    let start = from + marker.length;
    while (/\s/.test(source[start] ?? '')) start += 1;
    const quote = source[start];
    if (quote !== "'" && quote !== '"') { from = start + 1; continue; }
    let end = start + 1;
    let escaped = false;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) break;
    }
    if (end >= source.length) throw new Error('unterminated JSON.parse literal in source chunk');
    const decoded = decodeJsString(source.slice(start + 1, end));
    try {
      payloads.push(JSON.parse(decoded));
    } catch (error) {
      // Other JSON.parse calls may contain non-catalog strings. Ignore those;
      // the required catalog payload is selected structurally below.
      if (decoded.includes('"Maps"') || decoded.includes('"factionSetups"')) throw error;
    }
    from = end + 1;
  }
  return payloads;
}

function validNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

export function normalizeVehicleRoster(roster) {
  if (!Array.isArray(roster)) throw new Error('invalid vehicle roster: expected an array');
  const grouped = new Map();
  for (const row of roster) {
    if (!row || typeof row !== 'object') throw new Error('invalid vehicle roster: expected vehicle rows');
    if (!CLASSES.has(row.vehType)) continue;
    if (typeof row.type !== 'string' || !row.type.trim() ||
      typeof row.rawType !== 'string' || !row.rawType.trim() ||
      !Number.isInteger(row.count) || row.count < 1 ||
      !validNumber(row.delay) || !validNumber(row.respawnTime)) {
      throw new Error('invalid vehicle roster: missing model, class, quantity, delay, or respawn');
    }
    const key = `${row.type}\u0000${row.vehType}\u0000${row.delay}\u0000${row.respawnTime}`;
    const current = grouped.get(key);
    if (current) current.count += row.count;
    else grouped.set(key, {
      id: `${row.rawType}-delay${row.delay}-respawn${row.respawnTime}`,
      name: row.type,
      vehicleClass: row.vehType,
      count: row.count,
      firstSpawnMinutes: row.delay,
      respawnMinutes: row.respawnTime,
    });
  }
  return [...grouped.values()];
}

function readCatalogPayload(payload) {
  if (Array.isArray(payload?.Maps) && payload.Maps.some((entry) => entry?.teamConfigs?.factions?.team1Units)) return payload;
  return undefined;
}

function indexRecords(payloads) {
  let mapPayload;
  let factionSetups;
  const vehicleDefinitions = Object.create(null);
  for (const payload of payloads) {
    const maps = readCatalogPayload(payload);
    if (maps && (!mapPayload || maps.Maps.length > mapPayload.Maps.length)) mapPayload = maps;
    if (payload?.factionSetups && typeof payload.factionSetups === 'object') factionSetups = payload.factionSetups;
    for (const root of [payload?.vehicles, payload?.vehicleSetups, payload?.vehicleDefinitions, payload]) {
      if (!root || typeof root !== 'object' || Array.isArray(root)) continue;
      for (const [id, definition] of Object.entries(root)) {
        if (definition && typeof definition === 'object' &&
          typeof definition.displayName === 'string' && typeof definition.type === 'string' &&
          Number.isFinite(definition.respawnTime)) vehicleDefinitions[id] = definition;
      }
    }
  }
  if (!mapPayload || !factionSetups) throw new Error('SquadMaps data schema not found in current homepage scripts');
  return { layers: mapPayload.Maps, factionSetups, vehicleDefinitions };
}

function getAllowedUnits(layer, team) {
  const factions = layer.teamConfigs?.factions?.[`team${team}Units`];
  if (!Array.isArray(factions)) return undefined;
  return factions.flatMap((faction) => [
    { faction: faction.factionID, unitId: faction.defaultUnit },
    ...(faction.types ?? []).map((type) => ({ faction: faction.factionID, unitId: type.unit })),
  ]).filter((entry) => entry.faction && entry.unitId);
}

function sourceLayerName(layer) {
  return layer.Name ?? layer.rawName;
}

function resolveRawName(rawName, vehicleDefinitions) {
  if (typeof rawName === 'string') return { rawType: rawName, metadata: vehicleDefinitions[rawName] };
  if (!rawName || typeof rawName !== 'object') return undefined;
  const variants = Object.values(rawName).filter((value) => typeof value === 'string')
    .map((rawType) => ({ rawType, metadata: vehicleDefinitions[rawType] }));
  if (!variants.length || variants.some((variant) => !variant.metadata)) return undefined;
  const semantics = new Set(variants.map(({ metadata }) =>
    `${metadata.displayName}\u0000${metadata.type}\u0000${metadata.respawnTime}`));
  // Without a published per-map biome field, use the alternatives only when
  // every biome variant resolves to the same displayed model and timers.
  if (semantics.size !== 1) return undefined;
  return variants[0];
}

function normalizeLayer(layer, factionSetups, team, biome) {
  const allowed = getAllowedUnits(layer, team);
  if (!allowed) return { entries: [], missing: ['team faction/unit list absent'] };
  const entries = [];
  const missing = [];
  for (const { faction, unitId } of allowed) {
    const setup = factionSetups[unitId];
    if (!setup || !Array.isArray(setup.vehicles)) {
      missing.push(`${faction}/${unitId}: unit roster absent`);
      continue;
    }
    const roster = [];
    let unresolved = false;
    for (const vehicle of setup.vehicles) {
      let resolved;
      if (biome && vehicle.rawName && typeof vehicle.rawName === 'object') {
        const rawType = vehicle.rawName[biome];
        resolved = rawType ? { rawType, metadata: factionSetups.__vehicleDefinitions?.[rawType] } : undefined;
      } else {
        resolved = resolveRawName(vehicle.rawName, factionSetups.__vehicleDefinitions ?? {});
      }
      if (!resolved?.rawType) {
        unresolved = true;
        continue;
      }
      const { rawType, metadata } = resolved;
      if (!metadata) {
        unresolved = true;
        continue;
      }
      if (!CLASSES.has(metadata.type)) continue;
      if (!Number.isFinite(metadata.respawnTime)) {
        unresolved = true;
        continue;
      }
      roster.push({
        type: metadata.displayName ?? vehicle.displayName ?? rawType,
        rawType,
        count: vehicle.count,
        delay: vehicle.delay,
        respawnTime: metadata.respawnTime,
        vehType: metadata.type,
      });
    }
    if (unresolved) {
      missing.push(`${faction}/${unitId}: vehicle biome or timer unresolved`);
      continue;
    }
    const models = normalizeVehicleRoster(roster);
    const classCoverage = Object.fromEntries(['MBT', 'MGS', 'IFV'].map((vehicleClass) => [
      vehicleClass, models.some((model) => model.vehicleClass === vehicleClass) ? 'known' : 'known-empty',
    ]));
    entries.push({
      map: layer.mapName ?? layer.mapId,
      layer: sourceLayerName(layer),
      layerId: layer.rawName ?? layer.levelName,
      layerAliases: [...new Set([
        layer.rawName,
        layer.levelName,
        sourceLayerName(layer),
        layer.gamemode && layer.layerVersion ? `${layer.gamemode} ${layer.layerVersion}` : undefined,
        layer.mapName && layer.gamemode && layer.layerVersion
          ? `${layer.mapName} · ${layer.gamemode} ${layer.layerVersion}` : undefined,
      ].filter(Boolean))],
      mode: layer.gamemode,
      team,
      faction,
      unit: setup.type ?? unitId.replace(`${faction}_`, ''),
      status: 'verified',
      classCoverage,
      models,
    });
  }
  return { entries, missing };
}

export function buildCatalog({ layers, factionSetups, vehicleDefinitions, biomeForLayer, baseMapNames, mapsWithoutLayerLists = [] }) {
  const enrichedSetups = Object.assign(Object.create(null), factionSetups, { __vehicleDefinitions: vehicleDefinitions });
  const entries = [];
  const gaps = [];
  const allowedNames = baseMapNames ? new Set(baseMapNames) : undefined;
  const applicableLayers = layers.filter((layer) =>
    ['AAS', 'RAAS'].includes(String(layer.gamemode).toUpperCase()) &&
    (!allowedNames || allowedNames.has(layer.mapName)));
  for (const layer of applicableLayers) {
    for (const team of [1, 2]) {
      const { entries: rows, missing } = normalizeLayer(layer, enrichedSetups, team, biomeForLayer?.(layer));
      entries.push(...rows);
      for (const reason of missing) gaps.push({ map: layer.mapName ?? layer.mapId, layer: sourceLayerName(layer), team, reason });
    }
  }
  if (!entries.length) throw new Error('No AAS/RAAS team lineups could be resolved');
  return {
    schemaVersion: 1,
    source: SOURCE,
    retrievedAt: new Date().toISOString(),
    sourceSha256: '',
    coverage: {
      sourceLayers: applicableLayers.length,
      aasLayers: applicableLayers.filter((layer) => String(layer.gamemode).toUpperCase() === 'AAS').length,
      raasLayers: applicableLayers.filter((layer) => String(layer.gamemode).toUpperCase() === 'RAAS').length,
      homepageMapCards: (baseMapNames?.length ?? 0) + mapsWithoutLayerLists.length,
      mapsWithoutLayerLists,
      lineupCount: entries.length,
      unresolvedCount: gaps.length,
      gaps,
    },
    entries,
  };
}

export function assertLayerCrossChecks(catalog) {
  if (!catalog.entries.some((row) => row.layerId === 'Chora_AAS_v2' && row.mode === 'AAS')) {
    throw new Error('SquadMaps layer detection cross-check failed: Chora_AAS_v2 absent');
  }
  if (!catalog.entries.some((row) => row.map === 'Fallujah' && row.layerAliases?.length)) {
    throw new Error('SquadMaps layer detection cross-check failed: Fallujah aliases absent');
  }
}

function expandedEntries(snapshot) {
  return snapshot.entries.map((entry) => {
    const lineup = entry.lineupId ? snapshot.lineups?.[entry.lineupId] : undefined;
    return { ...entry, ...(lineup ?? {}) };
  });
}

const selectionKey = (entry) => JSON.stringify([entry.layerId, entry.team, entry.faction, entry.unit]);

function modelFacts(entry) {
  return [...(entry.models ?? [])].map((model) => ({
    id: model.id,
    name: model.name,
    vehicleClass: model.vehicleClass,
    count: model.count,
    firstSpawnMinutes: model.firstSpawnMinutes,
    respawnMinutes: model.respawnMinutes,
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function compareCatalogSnapshots(previous, current) {
  const oldEntries = new Map(expandedEntries(previous).map((entry) => [selectionKey(entry), entry]));
  const newEntries = new Map(expandedEntries(current).map((entry) => [selectionKey(entry), entry]));
  const addedLineups = [];
  const removedLineups = [];
  const changedLineups = [];
  const describe = (entry) => ({
    map: entry.map, layer: entry.layer, layerId: entry.layerId,
    team: entry.team, faction: entry.faction, unit: entry.unit,
  });
  for (const [key, entry] of newEntries) {
    const old = oldEntries.get(key);
    if (!old) {
      addedLineups.push(describe(entry));
      continue;
    }
    const before = modelFacts(old);
    const after = modelFacts(entry);
    const beforeCoverage = old.classCoverage;
    const afterCoverage = entry.classCoverage;
    if (JSON.stringify(before) !== JSON.stringify(after) ||
      JSON.stringify(beforeCoverage) !== JSON.stringify(afterCoverage)) {
      changedLineups.push({
        ...describe(entry),
        previous: before,
        current: after,
        ...(JSON.stringify(beforeCoverage) !== JSON.stringify(afterCoverage)
          ? { previousClassCoverage: beforeCoverage, currentClassCoverage: afterCoverage } : {}),
      });
    }
  }
  for (const [key, entry] of oldEntries) {
    if (!newEntries.has(key)) removedLineups.push(describe(entry));
  }
  return { addedLineups, removedLineups, changedLineups };
}

export function compactCatalog(catalog) {
  const lineups = {};
  const lineupIds = new Map();
  const entries = catalog.entries.map((entry) => {
    const signature = JSON.stringify([entry.models, entry.classCoverage]);
    let lineupId = lineupIds.get(signature);
    if (!lineupId) {
      lineupId = `roster-${createHash('sha256').update(signature).digest('hex').slice(0, 16)}`;
      lineupIds.set(signature, lineupId);
      lineups[lineupId] = { models: entry.models, classCoverage: entry.classCoverage };
    }
    const { models: _models, classCoverage: _classCoverage, ...selection } = entry;
    return { ...selection, lineupId };
  });
  return {
    schemaVersion: 2,
    source: catalog.source,
    retrievedAt: catalog.retrievedAt,
    sourceSha256: catalog.sourceSha256,
    coverage: catalog.coverage,
    entries,
    lineups,
  };
}

async function get(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'SquadTimer catalog updater' } });
  if (!response.ok) throw new Error(`SquadMaps request failed (${response.status}): ${url}`);
  return response;
}

async function loadPublicPayloads() {
  const homepage = await (await get(SOURCE)).text();
  const unescapeHtml = (value) => value.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const cardStarts = [...homepage.matchAll(/<div data-map-grid-card="true"/g)].map((match) => match.index);
  const cards = cardStarts.flatMap((start, index) => {
    const card = homepage.slice(start, cardStarts[index + 1] ?? homepage.length);
    const title = card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1];
    return title ? [{ name: unescapeHtml(title.replace(/<[^>]+>/g, '').trim()), hasLayerList: card.includes('Click to view layers') }] : [];
  });
  const baseMapNames = cards.filter((card) => card.hasLayerList).map((card) => card.name);
  const mapsWithoutLayerLists = cards.filter((card) => !card.hasLayerList).map((card) => card.name);
  if (!baseMapNames.length) throw new Error('SquadMaps homepage map enumeration not found');
  const scripts = [...new Set([...homepage.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)]
    .map((match) => new URL(match[1], SOURCE))
    .filter((url) => url.origin === new URL(SOURCE).origin)
    .map((url) => url.href))];
  if (!scripts.length) throw new Error('SquadMaps homepage contains no script references');
  const chunks = [];
  // Keep request concurrency low; only public homepage-referenced files are read.
  for (let i = 0; i < scripts.length; i += 3) {
    const batch = await Promise.all(scripts.slice(i, i + 3).map(async (url) => {
      const text = await (await get(url)).text();
      if (text.length > 35_000_000) throw new Error(`Refusing unusually large public script (${text.length} chars)`);
      return { url, text };
    }));
    chunks.push(...batch);
  }
  const relevant = chunks.filter(({ text }) =>
    text.includes('factionSetups') && text.includes('team1Units') && text.includes('spawnerSize'));
  if (!relevant.length) throw new Error('No current homepage script matched the public catalog schema');
  const payloads = relevant.flatMap(({ text }) => extractJsonParsePayloads(text));
  const sourceSha256 = createHash('sha256').update(relevant.map(({ text }) => text).join('\n')).digest('hex');
  return { payloads, sourceSha256, baseMapNames, mapsWithoutLayerLists };
}

function validCatalog(catalog) {
  if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.entries) ||
    !catalog.entries.length || !catalog.coverage?.sourceLayers) throw new Error('refusing invalid or empty catalog');
  const keys = new Set();
  for (const entry of catalog.entries) {
    if (!['AAS', 'RAAS'].includes(entry.mode) || ![1, 2].includes(entry.team) ||
      !entry.map || !entry.layer || !entry.layerId || !entry.faction || !entry.unit ||
      !Array.isArray(entry.models)) throw new Error('refusing structurally incomplete catalog entry');
    const key = [entry.layerId, entry.team, entry.faction, entry.unit].join('/');
    if (keys.has(key)) throw new Error(`refusing duplicate lineup: ${key}`);
    keys.add(key);
    for (const model of entry.models) {
      if (!model.id || !model.name || !CLASSES.has(model.vehicleClass) ||
        !Number.isInteger(model.count) || model.count < 1 ||
        !validNumber(model.firstSpawnMinutes) || !validNumber(model.respawnMinutes)) {
        throw new Error(`refusing invalid model in ${key}`);
      }
    }
  }
  return catalog;
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, path);
}

export async function importSquadMaps({
  output = resolve(ROOT, 'src/data/squadmaps-catalog.json'),
  report = resolve(ROOT, 'src/data/squadmaps-coverage.json'),
} = {}) {
  const { payloads, sourceSha256, baseMapNames, mapsWithoutLayerLists } = await loadPublicPayloads();
  const indexes = indexRecords(payloads);
  const catalog = buildCatalog({ ...indexes, baseMapNames, mapsWithoutLayerLists });
  const catalogMaps = new Set(catalog.entries.map((entry) => entry.map));
  const missingMaps = baseMapNames.filter((map) => !catalogMaps.has(map));
  const unexpectedMaps = [...catalogMaps].filter((map) => !baseMapNames.includes(map));
  if (missingMaps.length || unexpectedMaps.length) {
    throw new Error(`homepage/source map enumeration mismatch; missing: ${missingMaps.join(', ') || 'none'}; unexpected: ${unexpectedMaps.join(', ') || 'none'}`);
  }
  catalog.sourceSha256 = sourceSha256;
  validCatalog(catalog);
  assertLayerCrossChecks(catalog);
  const previous = await readFile(output, 'utf8').then((text) => JSON.parse(text)).catch(() => undefined);
  const changes = previous
    ? compareCatalogSnapshots(previous, catalog)
    : { addedLineups: [], removedLineups: [], changedLineups: [] };
  const previousCount = previous?.coverage?.lineupCount ?? previous?.entries?.length;
  if (previousCount && catalog.entries.length < previousCount * 0.8) {
    throw new Error(`refusing coverage regression: ${previousCount} -> ${catalog.entries.length} lineups`);
  }
  if (previous?.coverage?.sourceLayers && catalog.coverage.sourceLayers < previous.coverage.sourceLayers * 0.8) {
    throw new Error(`refusing layer coverage regression: ${previous.coverage.sourceLayers} -> ${catalog.coverage.sourceLayers} layers`);
  }
  const reportData = {
    source: SOURCE,
    retrievedAt: catalog.retrievedAt,
    sourceSha256,
    maps: [...new Set(catalog.entries.map((entry) => entry.map))].sort(),
    homepageMapCards: catalog.coverage.homepageMapCards,
    mapsWithoutLayerLists: catalog.coverage.mapsWithoutLayerLists,
    sourceLayers: catalog.coverage.sourceLayers,
    aasLayers: catalog.coverage.aasLayers,
    raasLayers: catalog.coverage.raasLayers,
    lineupCount: catalog.entries.length,
    unresolvedCount: catalog.coverage.unresolvedCount,
    gaps: catalog.coverage.gaps,
    changes,
  };
  await atomicWrite(output, `${JSON.stringify(compactCatalog(catalog))}\n`);
  await atomicWrite(report, `${JSON.stringify(reportData, null, 2)}\n`);
  console.log(`SquadMaps: ${reportData.maps.length} maps, ${reportData.sourceLayers} AAS/RAAS layers, ${reportData.lineupCount} lineups, ${reportData.unresolvedCount} gaps; snapshot changes: ${changes.addedLineups.length} added, ${changes.removedLineups.length} removed, ${changes.changedLineups.length} changed`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  importSquadMaps().catch((error) => {
    console.error(`SquadMaps import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
