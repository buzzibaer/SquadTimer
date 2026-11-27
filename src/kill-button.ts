import type { VehicleClass } from './tracker';

export function killButtonMarkup(vehicleClass: VehicleClass) {
  return `<button class="kill" data-class="${vehicleClass}" aria-label="${vehicleClass}-Abschuss melden">＋ ${vehicleClass}-Abschuss melden <small>Typ unbekannt</small></button>`;
}
