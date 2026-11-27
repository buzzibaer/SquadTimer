import { catalog, catalogInfo, findDetectedLayer, hasKnownLineup } from './catalog';
import { adjustStagingReference, loadRound, saveRound, type Round } from './storage';
import { replay, reportStatuses, type KillReport, type VehicleClass } from './tracker';
import { timerIconMarkup } from './timer-icons';
import { isNewRotation, type MatchStatus } from './match-detection';
import { squadMapsLinkMarkup, squadMapsUrl, validSquadMapsUrl } from './squadmaps-link';
import { connectionStatusMarkup } from './connection-status';
import { setupLayerSelectMarkup } from './setup-layer-select';
import { killButtonMarkup } from './kill-button';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
let round: Round | null = loadRound();
let now = Date.now();
let lastUndo: KillReport | undefined;
let mode: 'setup' | 'match' = round ? 'match' : 'setup';
let matchStatus: MatchStatus | null = null;
let previousDetectedVersion: string | null = null;
let detectedVersionChanged = false;
let handledEventId: string | null = null;
let setupTrackingMode: 'staging' | 'late-join' = 'staging';
const setupChoice = { map: 'Anvil', layer: 'Anvil RAAS v1', team: '2', faction: 'GFI', unit: 'Armored' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const classes: VehicleClass[] = ['MBT', 'MGS', 'IFV'];
function persist() { if (round) saveRound(round); }
function render() {
  now = Date.now();
  app.innerHTML = `<header class="top"><a class="brand" href="#"><span class="mark">ST</span> SQUAD<span class="muted">TIMER</span></a><span id="offline-status" class="local">${navigator.serviceWorker?.controller ? '● OFFLINE AKTIV' : '○ OFFLINE NOCH NICHT AKTIV'}</span></header>` +
    (mode === 'setup' ? setupView() : matchView());
  bind();
}
function detectedLayerCopy(layer: string) {
  return hasKnownLineup(findDetectedLayer(layer))
    ? 'Fahrzeugdaten vorhanden. Wähle die gegnerische Aufstellung.'
    : 'Für diesen Layer sind keine bekannten Fahrzeugdaten vorhanden. Unbekannt bedeutet nicht leer; es werden keine Fahrzeuge angenommen.';
}
function setupConnectionMarkup(status: MatchStatus | null) {
  const connected = status?.connection === 'connected';
  const text = connected
    ? `Client verbunden${status.layer ? ` · Letzter erkannter Layer: ${esc(status.layer)} · ${esc(detectedLayerCopy(status.layer))}` : ''}`
    : 'Lokale Log-Erkennung nicht verbunden oder nicht aktiviert.';
  return connectionStatusMarkup(connected, `${text}${phaseMarkup(status)}`);
}
function phaseMarkup(status: MatchStatus | null) {
  const phase = status?.phase === 'map_vote' ? 'Kartenabstimmung läuft' :
    status?.phase === 'faction_vote' ? 'Fraktionsabstimmung läuft' :
      status?.phase === 'loading' ? 'Kartenwechsel läuft' : '';
  const versionChanged = detectedVersionChanged;
  return `${phase ? ` <span class="phase-indicator">${esc(phase)}</span>` : ''}${status?.version ? ` <span class="game-version">Spielversion ${esc(status.version)}${versionChanged ? ' · Version lokal erkannt; Katalog bei Bedarf prüfen (kein Nachweis für veraltete Daten).' : ''}</span>` : ''}`;
}
function matchConnectionMarkup(status: MatchStatus | null) {
  const connected = status?.connection === 'connected';
  const text = connected
    ? `Client verbunden${status.layer ? ` · ${esc(status.layer)}` : ''}`
    : 'Client nicht verbunden / Erkennung nicht aktiviert';
  return connectionStatusMarkup(connected, `${text}${phaseMarkup(status)}`);
}
function roundSquadMapsUrl(activeRound: Round): string | undefined {
  const saved = activeRound.squadMapsUrl ? validSquadMapsUrl(activeRound.squadMapsUrl) : undefined;
  if (saved) return saved;
  const [mapName, ...layerParts] = activeRound.label.split(' · ');
  const layerName = layerParts.join(' · ');
  const entry = catalog.find((candidate) => candidate.map === mapName && candidate.layer === layerName);
  return entry ? squadMapsUrl(entry.map, entry.layerId, entry.mode) : undefined;
}
function setupView() {
  const prefix = (fields: number) => catalog.filter((e) =>
    e.map === setupChoice.map &&
    (fields < 2 || e.layer === setupChoice.layer) &&
    (fields < 3 || String(e.team) === setupChoice.team) &&
    (fields < 4 || e.faction === setupChoice.faction) &&
    (fields < 5 || e.unit === setupChoice.unit));
  const options = (id: keyof typeof setupChoice, entries: string[], fallback: string) =>
    `<select id="${id}">${entries.length ? [...new Set(entries)].map((value) => `<option ${setupChoice[id] === value ? 'selected' : ''}>${esc(value)}</option>`).join('') : `<option value="${esc(setupChoice[id])}" selected>${fallback}</option>`}</select>`;
  const maps = [...new Set([...catalog.map((e) => e.map), setupChoice.map].filter(Boolean))];
  const teams = ['1', '2'];
  const factions = [...new Set(prefix(3).map((e) => e.faction))];
  const units = [...new Set(prefix(4).map((e) => e.unit))];
  const entry = catalog.find((e) => e.map === setupChoice.map && e.layer === setupChoice.layer && String(e.team) === setupChoice.team && e.faction === setupChoice.faction && e.unit === setupChoice.unit);
  return `<main class="setup"><div class="eyebrow">TAKTISCHE ÜBERSICHT / 01</div><h1>Neue Runde<span class="dot">.</span></h1><p class="intro">Aufstellung wählen. Verfügbarkeit manuell nachhalten.</p>
    <div class="form-grid"><label>Karte${options('map', maps, 'Keine Kartendaten')}</label>
     <label>Spielmodus${setupLayerSelectMarkup(catalog, setupChoice.map, setupChoice.layer)}</label>
    <label>Gegnerisches Team<select id="team">${teams.map((t) => `<option value="${t}" ${setupChoice.team === t ? 'selected' : ''}>Team ${t}</option>`).join('')}</select></label>
    <label>Fraktion${options('faction', factions, 'Daten unbekannt')}</label>
    <label class="full">Einheit${options('unit', units, 'Daten unbekannt')}</label></div>
      <div id="rotation-status" class="rotation-status">${setupConnectionMarkup(matchStatus)}</div>
    <div class="coverage"><b>DATENSTAND · ${esc(catalogInfo.version)}</b><p>${esc(catalogInfo.coverage)}</p><small>${esc(catalogInfo.provenance)}</small></div>
     <div id="lineup" class="lineup">${entry ? '' : '<div class="unknown-lineup">Für diese Auswahl liegen keine verifizierten Aufstellungsdaten vor. Unbekannt bedeutet nicht leer; eine Runde mit Fahrzeug-Timern kann nicht gestartet werden.</div>'}</div>
     <div id="setup-map-link">${entry ? squadMapsLinkMarkup(squadMapsUrl(entry.map, entry.layerId, entry.mode) ?? '') : ''}</div>
     <section class="staging"><div><div class="eyebrow">ZEITNULLPUNKT</div><h2>Wie möchtest du einsteigen?</h2>
       <label class="entry-mode"><input type="radio" name="entry-mode" value="staging" ${setupTrackingMode === 'staging' ? 'checked' : ''}> Ab Staging-Ende tracken</label>
       <label class="entry-mode"><input type="radio" name="entry-mode" value="late-join" ${setupTrackingMode === 'late-join' ? 'checked' : ''}> Laufender Runde beitreten</label>
       <p>${setupTrackingMode === 'staging' ? 'Erstspawn-Zeiten ab dem bekannten Staging-Ende.' : 'Vorherige Abschüsse und Verfügbarkeit bleiben unbekannt; es werden keine Timer erfunden.'}</p></div>
       <label>${setupTrackingMode === 'staging' ? 'Minuten seit Staging-Ende' : 'Bekannte Minuten seit Staging-Ende (optional)'}<input id="elapsed" type="number" min="0" ${setupTrackingMode === 'staging' ? 'value="0" required' : 'placeholder="Unbekannt"'}></label>
       <button id="start" class="primary" ${entry ? '' : 'disabled'}>${setupTrackingMode === 'staging' ? 'AB STAGING-ENDE TRACKEN' : 'LAUFENDER RUNDE BEITRETEN'} <span>→</span></button></section>
  </main>`;
}
function matchView() {
  if (!round) return '';
  const activeRound = round;
  const [currentMap, ...currentLayerParts] = activeRound.label.split(' · ');
  const currentLayer = catalog.find((entry) => entry.map === currentMap && entry.layer === currentLayerParts.join(' · '));
  const detectedEntries = matchStatus?.layer ? findDetectedLayer(matchStatus.layer) : [];
  const detectedAt = matchStatus?.at ? Date.parse(matchStatus.at) : NaN;
  const confirmedLaterLayerChange = Boolean(Number.isFinite(detectedAt) &&
    detectedAt > (activeRound.trackingStartedAt ?? activeRound.started) &&
    currentLayer && detectedEntries.length &&
    !detectedEntries.some((entry) => entry.layerId === currentLayer.layerId));
  const result = replay(activeRound.lineup, activeRound.reports, activeRound.stagingEndedAt, now, {
    mode: activeRound.trackingMode ?? 'staging', trackingStartedAt: activeRound.trackingStartedAt,
  });
  const conflicts = new Set(result.conflicts);
  const statuses = reportStatuses(activeRound.reports, result);
  const reportMarkup = (r: KillReport) => `<div class="report ${statuses[r.id] === 'conflict' ? 'report-conflict' : ''}" data-report="${esc(r.id)}"><span class="report-dot"></span><time>${new Date(r.at).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><strong>${esc(r.vehicleClass)}-Abschuss <em class="review-flag" data-review="${esc(r.id)}" ${statuses[r.id] === 'conflict' ? '' : 'hidden'}>Meldung prüfen</em></strong><input aria-label="Zeitpunkt der Meldung" data-time="${esc(r.id)}" type="datetime-local" step="1" max="${dateTimeLocalValue(now)}" value="${dateTimeLocalValue(r.at)}"><select data-edit="${esc(r.id)}"><option value="">Typ unbekannt</option>${activeRound.lineup.filter((m) => m.vehicleClass === r.vehicleClass).map((m) => `<option value="${esc(m.id)}" ${r.modelId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select><button class="delete" data-delete="${esc(r.id)}" aria-label="Meldung löschen">×</button></div>`;
  const orderedReports = [...activeRound.reports].sort((a,b) => b.at-a.at);
  return `<main class="match"><div class="match-head"><div><div class="eyebrow">LIVE-RUNDE / ${esc(round.label)}</div>${squadMapsLinkMarkup(roundSquadMapsUrl(round) ?? '')}<h1>Fahrzeugstatus<span class="dot">.</span></h1><p class="intro">Mögliche Verfügbarkeit aus Meldungen · keine Sichtungsbestätigung</p></div><button id="newround" class="quiet">＋ Neue Runde</button></div>
     <div class="assumption">${round.trackingMode === 'late-join' ? '◷ AUSGANGSLAGE UNBEKANNT' : '◷ ERSTSPAWN-NULLPUNKT UNVERIFIZIERT'} <span>${round.trackingMode === 'late-join' ? 'Nur beobachtete Meldungen werden berücksichtigt; mögliche Verfügbarkeit ist keine bestätigte Aufstellung.' : 'Staging-Ende als Zeitbasis angenommen'} · ${esc(round.catalogVersion || 'Lokaler Snapshot')}</span></div>
    <details class="catalog-source"><summary>Katalogherkunft und Snapshot</summary><p>${esc(round.catalogProvenance || 'Keine Herkunftsinformation im älteren lokalen Snapshot.')}</p></details>
      ${isNewRotation(matchStatus, handledEventId) ? `<aside class="rotation-offer"><div><b>NEUER LAYER ERKANNT${confirmedLaterLayerChange ? ' · RUNDE GEWECHSELT' : ''}</b><p>${esc(matchStatus!.layer!)} · ${esc(matchStatus!.at ?? '')}</p><small>${esc(detectedLayerCopy(matchStatus!.layer!))}</small></div><button id="accept-rotation" class="quiet">Erkanntes Match öffnen</button></aside>` : ''}
     <div id="match-connection-status" class="connection-status">${matchConnectionMarkup(matchStatus)}</div>
     <div id="conflict-summary" class="warning" ${result.conflicts.length ? '' : 'hidden'}>⚠ ${result.conflicts.length} Meldung(en) prüfen · Details in der Meldungsliste</div>
     <details class="staging-edit"><summary>${round.stagingEndedAt === null ? 'Staging-Ende optional nachtragen' : 'Staging-Endzeit korrigieren'}</summary><label>Staging-Ende (lokale Zeit)<input id="staging-time" type="datetime-local" step="1" max="${dateTimeLocalValue(now)}" value="${round.stagingEndedAt === null ? '' : dateTimeLocalValue(round.stagingEndedAt)}"></label><button id="save-staging-time" class="quiet">Zeitpunkt übernehmen</button><small>Abschussmeldungen bleiben auf ihren absoluten Zeitpunkten. Leer lassen speichert „unbekannt“.</small></details>
    <div class="class-grid">${classes.map((c) => {
      const state = result.classes[c]; const total = state.total;
      const classModels = activeRound.lineup.filter((m) => m.vehicleClass === c);
      const firstSpawnAt = state.pendingTimers.filter((timer) => timer.origin === 'first-spawn');
      const respawnDue = state.pendingTimers.filter((timer) => timer.origin === 'respawn');
      const coverage = activeRound.classCoverage[c] ?? 'unknown';
      const rosterText = coverage === 'known-empty' ? 'Bestätigt keine Fahrzeuge' :
        coverage === 'unknown' && classModels.length === 0 ? 'Aufstellung unbekannt' :
          classModels.map((m) => `${m.count}× ${esc(m.name)}`).join(' · ') || 'Aufstellung unbekannt';
      const displayedRoster = activeRound.trackingMode === 'late-join' && classModels.length
        ? `Katalog · nicht als aktuelle Aufstellung bestätigt: ${rosterText}` : rosterText;
      const caption = activeRound.trackingMode === 'late-join' ? 'KATALOGSUMME · AUSGANGSLAGE UNBEKANNT' :
        coverage === 'known-empty' ? 'BESTÄTIGT LEERE AUFSTELLUNG' :
          coverage === 'unknown' ? 'ABDECKUNG UNBEKANNT' : 'MÖGLICHERWEISE VERFÜGBAR';
      return `<section class="vehicle"><div class="vehicle-head"><span class="class">${c}</span><span>${displayedRoster}</span></div>
         <div class="count" id="count-${c}">${state.min === state.max ? state.min : `${state.min}–${state.max}`}<small> / ${total}</small></div><div class="caption">${caption}</div>
         ${killButtonMarkup(c)}
         <div class="possible" id="compositions-${c}"><b>MÖGLICHE ZUSAMMENSETZUNGEN</b>${state.possibleCompositions.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
            <div class="timers"><b>${activeRound.trackingMode === 'late-join' ? 'ERSTSPAWN · NUR BEVORSTEHEND' : 'ERSTSPAWN · AB STAGING-ENDE'}</b><div id="first-spawn-${c}">${timerMarkup(firstSpawnAt, c)}</div></div>
           <div class="timers"><b>RESPAWN · ALTERNATIVE TERMINE*</b><div id="respawn-${c}">${timerMarkup(respawnDue, c)}</div><small>*Mögliche Termine, keine zusätzlichen Fahrzeuge.</small></div>
         </section>`;
    }).join('')}</div>
    <div class="undo-row">${lastUndo ? '<button id="undo" class="quiet">↶ Rückgängig</button>' : '<span>Jede Meldung bleibt lokal auf diesem Gerät.</span>'}</div>
     <section class="reports"><div class="report-title"><h2>Meldungen</h2><span>${activeRound.reports.length} GESAMT</span></div><div id="current-reports">${orderedReports.filter((r) => statuses[r.id] !== 'history').map(reportMarkup).join('')}</div><p id="current-empty" class="empty" ${orderedReports.some((r) => statuses[r.id] !== 'history') ? 'hidden' : ''}>Keine aktuellen Meldungen.</p><details id="report-history"><summary>Verlauf <span id="history-count"></span></summary><div id="history-reports">${orderedReports.filter((r) => statuses[r.id] === 'history').map(reportMarkup).join('')}</div><p id="history-empty" class="empty" ${orderedReports.some((r) => statuses[r.id] === 'history') ? 'hidden' : ''}>Noch kein Verlauf.</p></details></section>
  </main>`;
}
function dateTimeLocalValue(timestamp: number) {
  const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 19);
}
function formatRemaining(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function bind() {
  const lineup = document.querySelector('#lineup');
  for (const key of ['map', 'layer', 'team', 'faction', 'unit'] as const) {
    document.querySelector<HTMLSelectElement>(`#${key}`)?.addEventListener('change', (event) => {
      setupChoice[key] = (event.currentTarget as HTMLSelectElement).value;
      const order = ['map', 'layer', 'team', 'faction', 'unit'] as const;
      const index = order.indexOf(key);
      const matches = catalog.filter((entry) => entry.map === setupChoice.map &&
        (index < 1 || entry.layer === setupChoice.layer) &&
        (index < 2 || String(entry.team) === setupChoice.team) &&
        (index < 3 || entry.faction === setupChoice.faction) &&
        (index < 4 || entry.unit === setupChoice.unit));
      const first = matches[0];
      if (first) {
        for (const child of order.slice(index + 1)) {
          const value = child === 'team' ? String(first.team) : first[child];
          setupChoice[child] = value;
        }
      } else {
        for (const child of order.slice(index + 1)) setupChoice[child] = '';
      }
      render();
    });
  }
  document.querySelectorAll<HTMLInputElement>('input[name="entry-mode"]').forEach((input) =>
    input.addEventListener('change', () => {
      setupTrackingMode = input.value as 'staging' | 'late-join';
      render();
    }));
  const updateLineup = () => {
    if (!lineup) return;
    const entry = catalog.find((e) => e.map === setupChoice.map && e.layer === setupChoice.layer &&
      String(e.team) === setupChoice.team && e.faction === setupChoice.faction && e.unit === setupChoice.unit);
    if (!entry) {
      lineup.innerHTML = '<div class="unknown-lineup">Für diese Auswahl liegen keine verifizierten Fahrzeugdaten vor. Unbekannt bedeutet nicht leer; Fahrzeug-Timer können nicht gestartet werden.</div>';
      return;
    }
    lineup.innerHTML = `<div class="lineup-title">AUFSTELLUNG ZUR KONTROLLE <span>SQUADMAPS-FAKTENDATEN</span></div><div class="models">${classes.map((c) => `<div><b>${c}</b>${entry.classCoverage[c] === 'known-empty' ? '<span class="empty-known">Bestätigt keine Fahrzeuge</span>' : entry.classCoverage[c] === 'unknown' ? '<span class="unknown">Daten unbekannt</span>' : entry.models.filter((m) => m.vehicleClass === c).map((m) => `<span>${m.count}× ${esc(m.name)} <small>Erstspawn ${m.firstSpawnMinutes}′ / Respawn ${m.respawnMinutes}′</small></span>`).join('') || '<span class="unknown">Daten unbekannt</span>'}</div>`).join('')}</div>`;
  };
    updateLineup();
    document.querySelector('#start')?.addEventListener('click', () => {
      const selected = catalog.find((e) => e.map === setupChoice.map && e.layer === setupChoice.layer &&
        String(e.team) === setupChoice.team && e.faction === setupChoice.faction && e.unit === setupChoice.unit);
      if (!selected) return;
      if (round && !confirm('Neue Runde übernehmen? Die bisherige Runde und Meldungen werden ersetzt.')) return;
      const elapsedInput = document.querySelector<HTMLInputElement>('#elapsed')!;
      const elapsedText = elapsedInput.value.trim();
      const elapsed = elapsedText === '' ? undefined : Number(elapsedText);
      if ((setupTrackingMode === 'staging' && (elapsed === undefined || !Number.isFinite(elapsed) || elapsed < 0)) ||
          (elapsed !== undefined && (!Number.isFinite(elapsed) || elapsed < 0))) {
        elapsedInput.setCustomValidity('Bitte eine gültige, nicht-negative Minutenzahl eingeben.');
        elapsedInput.reportValidity();
        return;
      }
      elapsedInput.setCustomValidity('');
      const trackingStartedAt = Date.now();
      const stagingEndedAt = elapsed === undefined ? null : trackingStartedAt - elapsed * 60_000;
      if (stagingEndedAt !== null && !Number.isFinite(new Date(stagingEndedAt).getTime())) {
        elapsedInput.setCustomValidity('Dieser Zeitpunkt liegt außerhalb des gültigen Zeitbereichs.');
        elapsedInput.reportValidity();
        return;
      }
      round = {
      schemaVersion: 1, started: trackingStartedAt, trackingStartedAt,
      trackingMode: setupTrackingMode, stagingEndedAt,
      squadMapsUrl: squadMapsUrl(selected.map, selected.layerId, selected.mode),
      lineup: structuredClone(selected.models), label: `${selected.map} · ${selected.layer}`, reports: [],
      classCoverage: structuredClone(selected.classCoverage), catalogVersion: catalogInfo.version,
      catalogProvenance: catalogInfo.provenance,
    };
    mode = 'match'; lastUndo = undefined; persist(); render();
  });
  document.querySelectorAll<HTMLButtonElement>('.kill').forEach((button) => button.addEventListener('click', () => {
    if (!round) return;
    const report: KillReport = { id: crypto.randomUUID(), at: Date.now(), vehicleClass: button.dataset.class as VehicleClass };
    round.reports.push(report); lastUndo = report; persist(); render();
  }));
  document.querySelector('#undo')?.addEventListener('click', () => {
    if (!round || !lastUndo) return;
    round.reports = round.reports.filter((r) => r.id !== lastUndo!.id); lastUndo = undefined; persist(); render();
  });
  document.querySelector('#save-staging-time')?.addEventListener('click', () => {
    if (!round) return;
    const input = document.querySelector<HTMLInputElement>('#staging-time')!;
    const timestamp = input.value === '' ? null : parseLocalDateTime(input.value);
    if (timestamp === undefined || (timestamp !== null && timestamp > Date.now())) {
      input.setCustomValidity('Bitte einen gültigen Zeitpunkt in der Vergangenheit eingeben.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    round = adjustStagingReference(round, timestamp);
    persist();
    tick();
  });
  document.querySelectorAll<HTMLSelectElement>('[data-edit]').forEach((select) => select.addEventListener('change', () => {
    const found = round?.reports.find((r) => r.id === select.dataset.edit);
    if (found) { found.modelId = select.value || undefined; persist(); render(); }
  }));
  document.querySelectorAll<HTMLInputElement>('[data-time]').forEach((input) => input.addEventListener('change', () => {
    const found = round?.reports.find((r) => r.id === input.dataset.time);
    if (!found) return;
    const timestamp = parseLocalDateTime(input.value);
    if (timestamp === undefined || timestamp > Date.now()) {
      input.setCustomValidity('Bitte einen gültigen Zeitpunkt in der Vergangenheit eingeben.');
      input.reportValidity();
      input.value = dateTimeLocalValue(found.at);
      return;
    }
    input.setCustomValidity('');
    found.at = timestamp;
    persist();
    render();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((button) => button.addEventListener('click', () => {
    if (!round) return;
    round.reports = round.reports.filter((r) => r.id !== button.dataset.delete); persist(); render();
  }));
    document.querySelector('#newround')?.addEventListener('click', () => {
    mode = 'setup'; render();
  });
  document.querySelector('#accept-rotation')?.addEventListener('click', () => {
    if (!matchStatus?.layer || !matchStatus.eventId) return;
    const detectedLayer = matchStatus.layer;
    const selectedEntry = findDetectedLayer(detectedLayer)[0];
    setupChoice.map = selectedEntry?.map ?? detectedLayer.split(' · ')[0] ?? '';
    setupChoice.layer = selectedEntry?.layer ?? '';
    if (selectedEntry) {
      setupChoice.team = String(selectedEntry.team);
      setupChoice.faction = selectedEntry.faction;
      setupChoice.unit = selectedEntry.unit;
    } else {
      setupChoice.team = '2'; setupChoice.faction = ''; setupChoice.unit = '';
    }
    handledEventId = matchStatus.eventId;
    mode = 'setup';
    render();
  });
}
function parseLocalDateTime(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}
function timerMarkup(rows: ReturnType<typeof replay>['classes'][VehicleClass]['pendingTimers'], vehicleClass: VehicleClass) {
  if (!rows.length) return '<span>Keine ausstehend</span>';
  return rows.map((row) => {
    const candidates = row.candidates.map((candidate) => `${formatRemaining(candidate.at - now)} · ${esc(candidate.modelName)}`);
    const schedule = candidates.length > 1 ? `${candidates.join(' / ')}` : candidates[0];
    return `<span class="timer-row">${timerIconMarkup(vehicleClass)}<span class="timer-copy">${schedule}${row.possiblyAvailable ? ' · möglicherweise bereits verfügbar' : ''}</span></span>`;
  }).join('');
}
function tick() {
  now = Date.now();
  const offline = document.querySelector<HTMLElement>('#offline-status');
  if (offline) offline.textContent = navigator.serviceWorker?.controller ? '● OFFLINE AKTIV' : '○ OFFLINE NOCH NICHT AKTIV';
  if (mode !== 'match' || !round) return;
  const result = replay(round.lineup, round.reports, round.stagingEndedAt, now, {
    mode: round.trackingMode ?? 'staging', trackingStartedAt: round.trackingStartedAt,
  });
  const conflictSummary = document.querySelector<HTMLElement>('#conflict-summary');
  if (conflictSummary) {
    conflictSummary.hidden = result.conflicts.length === 0;
    conflictSummary.textContent = `⚠ ${result.conflicts.length} Meldung(en) prüfen · Details in der Meldungsliste`;
  }
  const statuses = reportStatuses(round.reports, result);
  const activeContainer = document.querySelector<HTMLElement>('#current-reports');
  const historyContainer = document.querySelector<HTMLElement>('#history-reports');
  for (const report of round.reports) {
    const row = document.querySelector<HTMLElement>(`[data-report="${CSS.escape(report.id)}"]`);
    const target = statuses[report.id] === 'history' ? historyContainer : activeContainer;
    if (row && target && row.parentElement !== target) target.append(row);
  }
  const currentRows = activeContainer?.querySelectorAll('[data-report]').length ?? 0;
  const historyRows = historyContainer?.querySelectorAll('[data-report]').length ?? 0;
  const currentEmpty = document.querySelector<HTMLElement>('#current-empty');
  if (currentEmpty) currentEmpty.hidden = currentRows > 0;
  const historyEmpty = document.querySelector<HTMLElement>('#history-empty');
  if (historyEmpty) historyEmpty.hidden = historyRows > 0;
  const historyCount = document.querySelector<HTMLElement>('#history-count');
  if (historyCount) historyCount.textContent = historyRows ? `(${historyRows})` : '';
  const conflictIds = new Set(result.conflicts);
  for (const report of round.reports) {
    const row = document.querySelector<HTMLElement>(`[data-report="${CSS.escape(report.id)}"]`);
    const flag = document.querySelector<HTMLElement>(`[data-review="${CSS.escape(report.id)}"]`);
    row?.classList.toggle('report-conflict', conflictIds.has(report.id));
    if (flag) flag.hidden = !conflictIds.has(report.id);
  }
  for (const vehicleClass of classes) {
    const state = result.classes[vehicleClass];
    const count = document.querySelector(`#count-${vehicleClass}`);
    if (count) count.innerHTML = `${state.min === state.max ? state.min : `${state.min}–${state.max}`}<small> / ${state.total}</small>`;
    const compositions = document.querySelector(`#compositions-${vehicleClass}`);
    if (compositions) compositions.innerHTML = `<b>MÖGLICHE ZUSAMMENSETZUNGEN</b>${state.possibleCompositions.map((s) => `<span>${esc(s)}</span>`).join('')}`;
    const first = document.querySelector(`#first-spawn-${vehicleClass}`);
     if (first) first.innerHTML = timerMarkup(state.pendingTimers.filter((timer) => timer.origin === 'first-spawn'), vehicleClass);
    const respawn = document.querySelector(`#respawn-${vehicleClass}`);
     if (respawn) respawn.innerHTML = timerMarkup(state.pendingTimers.filter((timer) => timer.origin === 'respawn'), vehicleClass);
  }
}
window.addEventListener('focus', tick);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
window.setInterval(tick, 1_000);
async function pollMatchStatus() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!response.ok) return;
    const status = await response.json() as MatchStatus;
    if (JSON.stringify(status) !== JSON.stringify(matchStatus)) {
      if (status.version && previousDetectedVersion && status.version !== previousDetectedVersion) detectedVersionChanged = true;
      if (status.version) previousDetectedVersion = status.version;
      matchStatus = status;
      if (mode === 'match' && isNewRotation(status, handledEventId)) render();
      else if (mode === 'match') {
        const statusElement = document.querySelector<HTMLElement>('#match-connection-status');
        if (statusElement) statusElement.innerHTML = matchConnectionMarkup(status);
      } else {
        const statusElement = document.querySelector<HTMLElement>('#rotation-status');
        if (statusElement) statusElement.innerHTML = setupConnectionMarkup(status);
      }
    }
  } catch { /* Optional helper is intentionally silent when not configured. */ }
}
void pollMatchStatus();
window.setInterval(() => void pollMatchStatus(), 5_000);
if ('serviceWorker' in navigator && document.querySelector('script[type="module"]')?.getAttribute('src')?.includes('/assets/')) {
  const updateOfflineStatus = () => tick();
  navigator.serviceWorker.addEventListener('controllerchange', updateOfflineStatus);
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(updateOfflineStatus)
      .catch(() => updateOfflineStatus());
  });
}
render();
