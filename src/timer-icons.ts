import tankIcon from '../Tank_vehicle_icon.webp?inline';
import mgsIcon from '../Mgs_vehicle_icon.webp?inline';
import trackedIfvIcon from '../Trackedifv_vehicle_icon.webp?inline';
import type { VehicleClass } from './tracker';

const icons: Record<VehicleClass, string> = {
  MBT: tankIcon,
  MGS: mgsIcon,
  IFV: trackedIfvIcon,
};

export function timerIconMarkup(vehicleClass: VehicleClass): string {
  return `<img class="timer-icon" src="${icons[vehicleClass]}" alt="" aria-hidden="true">`;
}
