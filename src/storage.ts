import type { KillReport, Model, VehicleClass } from './tracker';

const KEY = 'squadtimer.round.v1';
export interface Round {
  schemaVersion: 1;
  started: number;
  stagingEndedAt: number | null;
  trackingMode?: 'staging' | 'late-join';
  trackingStartedAt?: number;
  squadMapsUrl?: string;
  lineup: Model[];
  label: string;
  reports: KillReport[];
  classCoverage: Record<VehicleClass, 'known' | 'known-empty' | 'unknown'>;
  catalogVersion: string;
  catalogProvenance: string;
}
export function adjustStagingReference(round: Round, timestamp: number | null): Round {
  return { ...round, stagingEndedAt: timestamp };
}
export function loadRound(): Round | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Round | null;
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.lineup) || !Array.isArray(value.reports)) return null;
    value.classCoverage ??= { MBT: 'unknown', MGS: 'unknown', IFV: 'unknown' };
    value.catalogVersion ??= 'Legacy snapshot';
    value.catalogProvenance ??= 'Herkunft in älterem lokalen Snapshot nicht gespeichert.';
    return value;
  } catch { return null; }
}
export function saveRound(round: Round | null): void {
  if (round) localStorage.setItem(KEY, JSON.stringify(round));
  else localStorage.removeItem(KEY);
}
