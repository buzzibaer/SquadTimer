import { describe, expect, it } from 'vitest';
import { replay, reportStatuses, type KillReport, type Model, type VehicleClass } from './tracker';

const minute = 60_000;
const start = Date.UTC(2026, 0, 1);
const at = (minutes: number) => start + minutes * minute;
const models: Model[] = [
  { id: 't72', name: 'T-72S', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 20 },
  { id: 't62', name: 'T-62', vehicleClass: 'MBT', count: 2, firstSpawnMinutes: 10, respawnMinutes: 20 },
  { id: 'bmp', name: 'BMP-1', vehicleClass: 'IFV', count: 2, firstSpawnMinutes: 0, respawnMinutes: 10 },
];
const report = (id: string, minutes: number, vehicleClass: VehicleClass = 'MBT', modelId?: string): KillReport =>
  ({ id, at: at(minutes), vehicleClass, modelId });

describe('chronological candidate replay', () => {
  it('starts late joins with uncertain availability and no invented timers for earlier first spawns', () => {
    const late = replay(models, [], null, at(15), { mode: 'late-join', trackingStartedAt: at(15) });
    expect(late.classes.MBT).toMatchObject({ min: 0, max: 3, total: 3 });
    expect(late.classes.MBT.pendingTimers).toEqual([]);
    expect(late.classes.MBT.possibleCompositions).toContain('Ausgangslage unbekannt · maximal möglich: T-72S × 1, T-62 × 2');
  });

  it('uses a valid observed kill to restrict maximum availability without claiming certainty', () => {
    const late = replay(models, [report('observed', 16)], null, at(16), {
      mode: 'late-join', trackingStartedAt: at(15),
    }).classes.MBT;
    expect(late).toMatchObject({ min: 0, max: 2, total: 3 });
    expect(late.pendingTimers.filter((timer) => timer.origin === 'respawn')).toHaveLength(1);
    expect(late.possibleCompositions).not.toContain('T-62 × 2, T-72S × 1');
  });

  it('uses known elapsed staging time for future firstspawn eligibility but omits elapsed timers', () => {
    const late = replay(models, [], at(0), at(5), {
      mode: 'late-join', trackingStartedAt: at(5),
    }).classes.MBT;
    expect(late).toMatchObject({ min: 0, max: 1, total: 3 });
    expect(late.pendingTimers.map((timer) => timer.candidates[0]?.modelId)).toEqual(['t62', 't62']);
  });

  it('rejects late-join reports timestamped before tracking began', () => {
    const result = replay(models, [report('before', 14)], null, at(16), {
      mode: 'late-join', trackingStartedAt: at(15),
    });
    expect(result.conflicts).toContain('before');
    expect(result.classes.MBT.max).toBe(3);
  });

  it('keeps simultaneous late-join reports as separate real timers and flags excess reports', () => {
    const pair: Model[] = [
      { id: 'two', name: 'Two', vehicleClass: 'MBT', count: 2, firstSpawnMinutes: 0, respawnMinutes: 20 },
    ];
    const result = replay(pair, [
      report('a', 16), report('b', 16), report('c', 16),
    ], null, at(16), { mode: 'late-join', trackingStartedAt: at(15) });
    expect(result.conflicts).toEqual(['c']);
    expect(result.classes.MBT.max).toBe(0);
    expect(result.classes.MBT.pendingTimers.filter((timer) => timer.origin === 'respawn')).toHaveLength(2);
  });

  it('keeps reports current through exact expiry and uncertain alternatives, then archives them', () => {
    const varied: Model[] = [
      { id: 'fast', name: 'Fast', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 5 },
      { id: 'slow', name: 'Slow', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 20 },
    ];
    const kill = report('a', 1, 'MBT');
    expect(reportStatuses([kill], replay(varied, [kill], start, at(6)))).toEqual({ a: 'active' });
    expect(reportStatuses([kill], replay(varied, [kill], start, at(21)))).toEqual({ a: 'active' });
    expect(reportStatuses([kill], replay(varied, [kill], start, at(21) + 1))).toEqual({ a: 'history' });
  });

  it('gives conflict review precedence and reevaluates corrected reports', () => {
    const one: Model[] = [{ id: 'only', name: 'Only', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 2 }];
    const bad = report('bad', 1, 'MBT', 'missing');
    const active = replay(one, [bad], start, at(1));
    expect(reportStatuses([bad], active)).toEqual({ bad: 'conflict' });
    const corrected = { ...bad, modelId: 'only' };
    expect(reportStatuses([corrected], replay(one, [corrected], start, at(1)))).toEqual({ bad: 'active' });
    expect(reportStatuses([corrected], replay(one, [corrected], start, at(4)))).toEqual({ bad: 'history' });
  });
  it('tracks first spawns, then one unknown kill and both possible compositions', () => {
    expect(replay(models, [], start, at(0)).classes.MBT).toMatchObject({ min: 1, max: 1 });
    expect(replay(models, [], start, at(10)).classes.MBT).toMatchObject({ min: 3, max: 3 });
    const state = replay(models, [report('a', 11)], start, at(11)).classes.MBT;
    expect(state).toMatchObject({ min: 2, max: 2 });
    expect(state.possibleCompositions).toEqual(expect.arrayContaining(['T-62 × 2', 'T-72S × 1, T-62 × 1']));
  });

  it('shows a 1–2 count range when a short respawn has elapsed but a long one has not', () => {
    const mixed: Model[] = [
      { id: 'fast', name: 'Fast', vehicleClass: 'MGS', count: 1, firstSpawnMinutes: 0, respawnMinutes: 5 },
      { id: 'slow', name: 'Slow', vehicleClass: 'MGS', count: 1, firstSpawnMinutes: 0, respawnMinutes: 20 },
    ];
    const state = replay(mixed, [report('a', 1, 'MGS')], start, at(8)).classes.MGS;
    expect(state).toMatchObject({ min: 1, max: 2 });
    expect(state.possibleCompositions).toEqual(expect.arrayContaining(['Fast × 1', 'Fast × 1, Slow × 1']));
  });

  it('flags impossible reports, permits correction, and replays deletion', () => {
    const one: Model[] = [
      { id: 'only', name: 'Only', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 20 },
    ];
    const impossible = replay(one, [report('bad', 1, 'MBT', 'unknown')], start, at(1));
    expect(impossible.conflicts).toEqual(['bad']);
    expect(impossible.classes.MBT.min).toBe(1);
    expect(impossible.classes.MBT.pendingTimers).toEqual([]);
    expect(replay(one, [report('fixed', 1, 'MBT', 'only')], start, at(1)).classes.MBT.min).toBe(0);
    expect(replay(one, [], start, at(1)).classes.MBT.min).toBe(1);
  });

  it('allows a distinct repeated kill only after that vehicle respawns', () => {
    const one: Model[] = [
      { id: 'only', name: 'Only', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 20 },
    ];
    const beforeRespawn = replay(one, [report('a', 1, 'MBT', 'only'), report('b', 20, 'MBT', 'only')], start, at(20));
    expect(beforeRespawn.conflicts).toEqual(['b']);
    const afterRespawn = replay(one, [report('a', 1, 'MBT', 'only'), report('b', 21, 'MBT', 'only')], start, at(21));
    expect(afterRespawn.conflicts).toEqual([]);
    expect(afterRespawn.classes.MBT.min).toBe(0);
  });

  it('retains timer origin when first-spawn and respawn candidates share a timestamp', () => {
    const collision: Model[] = [
      { id: 'first', name: 'First', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 20, respawnMinutes: 20 },
      { id: 'respawning', name: 'Respawning', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 20 },
    ];
    const result = replay(collision, [report('kill', 0, 'MBT', 'respawning')], start, at(1)).classes.MBT;
    expect(result.pendingTimers.map((row) => row.origin)).toEqual(expect.arrayContaining(['first-spawn', 'respawn']));
  });

  it('keeps simultaneous identical vehicle kills and first-spawn slots as separate rows', () => {
    const two: Model[] = [{ id: 'tank', name: 'Tank', vehicleClass: 'MBT', count: 2, firstSpawnMinutes: 0, respawnMinutes: 20 }];
    const result = replay(two, [report('a', 1, 'MBT', 'tank'), report('b', 1, 'MBT', 'tank')], start, at(2)).classes.MBT;
    expect(result.pendingTimers.filter((row) => row.origin === 'respawn')).toHaveLength(2);
    const delayed: Model[] = [{ ...two[0], firstSpawnMinutes: 10 }];
    expect(replay(delayed, [], start, at(0)).classes.MBT.pendingTimers.filter((row) => row.origin === 'first-spawn')).toHaveLength(2);
  });

  it('groups alternative models and durations under one unknown report row', () => {
    const available: Model[] = [
      { id: 'fast', name: 'Fast', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 5 },
      { id: 'slow', name: 'Slow', vehicleClass: 'MBT', count: 1, firstSpawnMinutes: 0, respawnMinutes: 20 },
    ];
    const result = replay(available, [report('unknown', 1)], start, at(2)).classes.MBT;
    const respawn = result.pendingTimers.filter((row) => row.origin === 'respawn');
    expect(respawn).toHaveLength(1);
    expect(respawn[0].candidates.map((candidate) => candidate.modelId)).toEqual(expect.arrayContaining(['fast', 'slow']));
  });

  it('marks a report timer when one alternative may already be available', () => {
    const varied: Model[] = [
      { id: 'fast', name: 'Fast', vehicleClass: 'MGS', count: 1, firstSpawnMinutes: 0, respawnMinutes: 5 },
      { id: 'slow', name: 'Slow', vehicleClass: 'MGS', count: 1, firstSpawnMinutes: 0, respawnMinutes: 20 },
    ];
    const row = replay(varied, [report('uncertain', 1, 'MGS')], start, at(8)).classes.MGS.pendingTimers[0];
    expect(row.possiblyAvailable).toBe(true);
    expect(row.candidates.map((candidate) => candidate.modelId)).toEqual(['slow']);
  });

  it('does not permit an unknown kill before that model first spawns', () => {
    const delayed: Model[] = [
      { id: 'late', name: 'Late', vehicleClass: 'MGS', count: 1, firstSpawnMinutes: 10, respawnMinutes: 10 },
    ];
    expect(replay(delayed, [report('early', 3, 'MGS')], start, at(3)).conflicts).toEqual(['early']);
  });
});
