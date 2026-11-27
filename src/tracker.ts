export type VehicleClass = 'MBT' | 'MGS' | 'IFV';
export interface Model {
  id: string;
  name: string;
  vehicleClass: VehicleClass;
  count: number;
  firstSpawnMinutes: number;
  respawnMinutes: number;
}
export interface KillReport {
  id: string;
  at: number;
  vehicleClass: VehicleClass;
  modelId?: string;
}
export interface ClassState {
  min: number;
  max: number;
  total: number;
  possibleCompositions: string[];
  candidateNextAvailability: number[];
  pendingTimers: TimerRow[];
}
export interface TimerCandidate {
  at: number;
  modelId: string;
  modelName: string;
}
export interface TimerRow {
  id: string;
  origin: 'first-spawn' | 'respawn';
  candidates: TimerCandidate[];
  possiblyAvailable: boolean;
}
export interface ReplayResult {
  classes: Record<VehicleClass, ClassState>;
  conflicts: string[];
}
export type ReportStatus = 'active' | 'conflict' | 'history';
export interface ReplayOptions {
  mode?: 'staging' | 'late-join';
  trackingStartedAt?: number;
}

export function reportStatuses(reports: KillReport[], result: ReplayResult): Record<string, ReportStatus> {
  const conflicts = new Set(result.conflicts);
  const respawns = new Set((['MBT', 'MGS', 'IFV'] as const).flatMap((vehicleClass) =>
    result.classes[vehicleClass].pendingTimers
      .filter((timer) => timer.origin === 'respawn')
      .map((timer) => timer.id.slice('report:'.length))));
  return Object.fromEntries(reports.map((report) => [
    report.id,
    conflicts.has(report.id) ? 'conflict' : respawns.has(report.id) ? 'active' : 'history',
  ]));
}
interface Availability { at: number; origin: TimerRow['origin']; id: string }
type State = Map<string, Availability[]>;

const canonical = (state: State) => [...state.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, times]) => `${id}:${[...times].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).map((t) => `${t.at}/${t.origin}/${t.id}`).join(',')}`).join('|');

function composition(state: State, models: Model[], vehicleClass: VehicleClass, now: number): string {
  return models.filter((m) => m.vehicleClass === vehicleClass).map((m) => {
    const available = (state.get(m.id) ?? []).filter((t) => t.at <= now).length;
    return { name: m.name, count: available };
  }).filter((m) => m.count > 0).map((m) => `${m.name} × ${m.count}`).join(', ') || 'Keine verfügbar';
}

export function replay(models: Model[], reports: KillReport[], stagingEndedAt: number | null, now: number, options: ReplayOptions = {}): ReplayResult {
  const lateJoin = options.mode === 'late-join';
  const trackingStartedAt = options.trackingStartedAt ?? stagingEndedAt ?? now;
  const classes = {} as Record<VehicleClass, ClassState>;
  const conflicts: string[] = [];
  for (const vehicleClass of ['MBT', 'MGS', 'IFV'] as const) {
    const classModels = models.filter((m) => m.vehicleClass === vehicleClass);
    let states: State[] = [new Map(classModels.map((m) => [
      m.id,
      Array.from({ length: m.count }, (_, index) => ({
          at: lateJoin
            ? Math.max(trackingStartedAt, stagingEndedAt === null ? trackingStartedAt : stagingEndedAt + m.firstSpawnMinutes * 60_000)
            : (stagingEndedAt ?? now) + m.firstSpawnMinutes * 60_000,
         origin: 'first-spawn' as const,
         id: `first:${m.id}:${index}`,
      })).sort((a, b) => a.at - b.at),
    ]))];
    const ordered = reports.filter((r) => r.vehicleClass === vehicleClass).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    for (const event of ordered) {
      if (lateJoin && event.at < trackingStartedAt) {
        conflicts.push(event.id);
        continue;
      }
      const next: State[] = [];
      let matchedAny = false;
      for (const state of states) {
        for (const model of classModels) {
          if (event.modelId && model.id !== event.modelId) continue;
          const times = state.get(model.id) ?? [];
          const index = times.findIndex((availableAt) => availableAt.at <= event.at);
          if (index < 0) continue;
          matchedAny = true;
          const updated = new Map([...state].map(([id, list]) => [id, [...list]]));
          const updatedTimes = updated.get(model.id)!;
          updatedTimes.splice(index, 1, { at: event.at + model.respawnMinutes * 60_000, origin: 'respawn', id: `report:${event.id}` });
          updatedTimes.sort((a, b) => a.at - b.at);
          next.push(updated);
        }
      }
      if (matchedAny) states = [...new Map(next.map((s) => [canonical(s), s])).values()];
      else conflicts.push(event.id);
    }
    const counts = states.map((state) => classModels.reduce((sum, m) =>
      sum + (state.get(m.id) ?? []).filter((entry) => entry.at <= now).length, 0));
    const compositions = [...new Set(states.map((s) => composition(s, classModels, vehicleClass, now)))].sort();
    const displayedCompositions = lateJoin
      ? compositions.map((value) => `Ausgangslage unbekannt · maximal möglich: ${value}`)
      : compositions;
    const timerRows = new Map<string, TimerRow>();
    for (const state of states) for (const model of classModels) for (const entry of state.get(model.id) ?? []) {
       if (entry.origin !== 'first-spawn' || entry.at >= now) {
         if (lateJoin && entry.origin === 'first-spawn' && entry.at <= trackingStartedAt) continue;
        const row = timerRows.get(entry.id) ?? { id: entry.id, origin: entry.origin, candidates: [], possiblyAvailable: false };
        const key = `${entry.at}/${model.id}`;
        if (entry.at >= now && !row.candidates.some((candidate) => `${candidate.at}/${candidate.modelId}` === key))
          row.candidates.push({ at: entry.at, modelId: model.id, modelName: model.name });
        if (entry.at <= now) row.possiblyAvailable = true;
        timerRows.set(entry.id, row);
      }
    }
    const pendingTimers = [...timerRows.values()].filter((row) => row.candidates.length)
      .map((row) => ({ ...row, candidates: row.candidates.sort((a, b) => a.at - b.at || a.modelName.localeCompare(b.modelName)) }))
      .sort((a, b) => Math.min(...a.candidates.map((c) => c.at)) - Math.min(...b.candidates.map((c) => c.at)) || a.id.localeCompare(b.id));
    const due = [...new Set(pendingTimers.flatMap((row) => row.candidates.map((candidate) => candidate.at)))].sort((a, b) => a - b);
    classes[vehicleClass] = {
      min: lateJoin ? 0 : counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
      total: classModels.reduce((sum, m) => sum + m.count, 0),
      possibleCompositions: displayedCompositions,
      candidateNextAvailability: due,
      pendingTimers,
    };
  }
  return { classes, conflicts };
}
