import { describe, expect, it } from 'vitest';
import { connectionStatusMarkup } from './connection-status';

describe('connectionStatusMarkup', () => {
  it('renders a green-state indicator beside the readable connected text', () => {
    expect(connectionStatusMarkup(true, 'Client verbunden · Layer')).toBe(
      '<span class="connection-indicator connection-indicator--connected" aria-hidden="true"></span>Client verbunden · Layer',
    );
  });

  it('renders a red-state indicator beside the qualified disconnected text', () => {
    expect(connectionStatusMarkup(false, 'Client nicht verbunden / Erkennung nicht aktiviert')).toBe(
      '<span class="connection-indicator connection-indicator--disconnected" aria-hidden="true"></span>Client nicht verbunden / Erkennung nicht aktiviert',
    );
  });
});
