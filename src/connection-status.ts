export function connectionStatusMarkup(connected: boolean, text: string): string {
  const state = connected ? 'connected' : 'disconnected';
  return `<span class="connection-indicator connection-indicator--${state}" aria-hidden="true"></span>${text}`;
}
