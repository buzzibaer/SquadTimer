import { expect, it } from 'vitest';
import { adjustStagingReference, type Round } from './storage';

it('adjusts the staging reference without moving absolute report timestamps', () => {
  const round: Round = {
    schemaVersion: 1,
    started: 100,
    stagingEndedAt: 90,
    lineup: [],
    label: 'Test',
    reports: [{ id: 'r1', at: 120, vehicleClass: 'MBT' }],
    classCoverage: { MBT: 'known', MGS: 'unknown', IFV: 'unknown' },
    catalogVersion: 'test',
    catalogProvenance: 'test',
  };
  const updated = adjustStagingReference(round, 80);
  expect(updated.stagingEndedAt).toBe(80);
  expect(updated.reports[0].at).toBe(120);
  expect(round.stagingEndedAt).toBe(90);
});

it('preserves an unknown staging end for late-join rounds through edits', () => {
  const round: Round = {
    schemaVersion: 1, started: 100, stagingEndedAt: null, trackingMode: 'late-join',
    trackingStartedAt: 120, lineup: [], label: 'Late join',
    reports: [{ id: 'observed', at: 130, vehicleClass: 'MBT' }],
    classCoverage: { MBT: 'known', MGS: 'unknown', IFV: 'unknown' },
    catalogVersion: 'test', catalogProvenance: 'test',
  };
  expect(adjustStagingReference(round, null).stagingEndedAt).toBeNull();
  expect(adjustStagingReference(round, null).trackingMode).toBe('late-join');
  expect(adjustStagingReference(round, null).reports[0].at).toBe(130);
});
