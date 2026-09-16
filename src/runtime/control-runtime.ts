import { control } from "../control/client";
import type { ControlState, ControlStation, VolumeSnapshot } from "../control/contracts";
import { PollingResource, type RuntimeSnapshot } from "./polling-resource";

const STATE_POLL_INTERVAL_MS = 3000;
const STATIONS_POLL_INTERVAL_MS = 30000;

/// Volume contract:
///   `/v1/state` is the canonical source for `volume` and `muted`. Callers
///   should normally get those values from the polled state snapshot without
///   issuing a separate `/v1/volume` request.
///
///   `/v1/volume` is kept as a defensive fallback for the unlikely case that
///   a future build of the mac app stops including `volume`/`muted` in the
///   state payload. To avoid amplifying that into N+1 traffic (one fetch per
///   visible volume key), the fallback is shared:
///     - In-flight `control.volume()` calls are deduped across all callers.
///     - The most-recent result is memoized for `VOLUME_FALLBACK_TTL_MS` so a
///       burst of action renders only causes one network round-trip.
const VOLUME_FALLBACK_TTL_MS = 2500;

const stateResource = new PollingResource<ControlState>(() => control.state(), STATE_POLL_INTERVAL_MS);
const stationsResource = new PollingResource<ControlStation[]>(() => control.stations(), STATIONS_POLL_INTERVAL_MS);

let volumeFallbackInFlight: Promise<VolumeSnapshot> | undefined;
let volumeFallbackCache: { value: VolumeSnapshot; expiresAt: number } | undefined;

export type { RuntimeSnapshot } from "./polling-resource";

export const controlRuntime = {
  subscribeState(listener: (snapshot: RuntimeSnapshot<ControlState>) => void): () => void {
    return stateResource.subscribe(listener);
  },

  getStateSnapshot(): RuntimeSnapshot<ControlState> {
    return stateResource.getSnapshot();
  },

  refreshState(options: { force?: boolean } = {}): Promise<RuntimeSnapshot<ControlState>> {
    return stateResource.refresh(options);
  },

  subscribeStations(listener: (snapshot: RuntimeSnapshot<ControlStation[]>) => void): () => void {
    return stationsResource.subscribe(listener);
  },

  getStationsSnapshot(): RuntimeSnapshot<ControlStation[]> {
    return stationsResource.getSnapshot();
  },

  refreshStations(options: { force?: boolean } = {}): Promise<RuntimeSnapshot<ControlStation[]>> {
    return stationsResource.refresh(options);
  },

  async resolveVolumeSnapshot(state: ControlState | null | undefined): Promise<VolumeSnapshot> {
    if (state && typeof state.volume === "number" && typeof state.muted === "boolean") {
      return { volume: clampPercent(state.volume), muted: state.muted };
    }

    return fetchVolumeFallback();
  },

  /** Test-only: reset the dedup/memo cache between cases. */
  __resetForTests(): void {
    volumeFallbackInFlight = undefined;
    volumeFallbackCache = undefined;
  },
};

function fetchVolumeFallback(): Promise<VolumeSnapshot> {
  const now = Date.now();
  if (volumeFallbackCache && volumeFallbackCache.expiresAt > now) {
    return Promise.resolve(volumeFallbackCache.value);
  }

  if (volumeFallbackInFlight) {
    return volumeFallbackInFlight;
  }

  const pending = control
    .volume()
    .then((snapshot) => {
      const normalized: VolumeSnapshot = {
        volume: clampPercent(snapshot.volume),
        muted: snapshot.muted,
      };
      volumeFallbackCache = { value: normalized, expiresAt: Date.now() + VOLUME_FALLBACK_TTL_MS };
      return normalized;
    })
    .finally(() => {
      if (volumeFallbackInFlight === pending) {
        volumeFallbackInFlight = undefined;
      }
    });

  volumeFallbackInFlight = pending;
  return pending;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
