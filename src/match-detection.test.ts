import { expect, it } from 'vitest';
import { isNewRotation, type MatchStatus } from './match-detection';

const rotation: MatchStatus = {
  layer: 'Goose Bay · RAAS v1', connection: 'connected', eventId: 'event-1', at: '2026-11-24T12:00:00Z',
};

it('offers each completed rotation once and ignores status or unavailable responses', () => {
  expect(isNewRotation(rotation, null)).toBe(true);
  expect(isNewRotation(rotation, 'event-1')).toBe(false);
  expect(isNewRotation({ ...rotation, connection: 'disconnected' }, null)).toBe(false);
  expect(isNewRotation({ ...rotation, layer: null }, null)).toBe(false);
  expect(isNewRotation(null, null)).toBe(false);
});

it('detects status-only changes without treating them as rotations', () => {
  const phaseStatus: MatchStatus = { ...rotation, phase: 'map_vote', version: 'v10.6.3_Hotfix6' };
  expect(isNewRotation(phaseStatus, 'event-1')).toBe(false);
  expect(phaseStatus.phase).toBe('map_vote');
});
