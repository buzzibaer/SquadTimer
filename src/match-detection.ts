export interface MatchStatus {
  layer: string | null;
  connection: 'connected' | 'disconnected';
  eventId: string | null;
  at: string | null;
  phase?: 'map_vote' | 'faction_vote' | 'loading' | null;
  version?: string | null;
}

export function isNewRotation(status: MatchStatus | null, handledEventId: string | null): boolean {
  return Boolean(status?.connection === 'connected' && status.layer && status.eventId && status.eventId !== handledEventId);
}
