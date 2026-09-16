import type { ControlStation } from "../control/contracts";
import type { DataSourceResult } from "../sdpi";

export function stationItems(stations: ControlStation[]): DataSourceResult {
  return stations.map((station) => ({
    value: station.id,
    label: station.name,
  }));
}

export function offlineStationItems(label: string): DataSourceResult {
  return [{ value: "", label, disabled: true }];
}

export function findStation(stations: ControlStation[] | null | undefined, stationId: string): ControlStation | undefined {
  return stations?.find((station) => station.id === stationId);
}
