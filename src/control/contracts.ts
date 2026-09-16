export type Phase = "idle" | "buffering" | "playing" | "paused" | "reconnecting" | "failed";

/**
 * Canonical state snapshot returned by `GET /v1/state`.
 *
 * Contract: `volume` and `muted` are mandatory in current mac app builds and
 * the plugin treats them as the canonical source. They are typed as optional
 * only as a defensive fallback for unexpected contract drift — see
 * `controlRuntime.resolveVolumeSnapshot` for how that fallback is deduped to
 * avoid N+1 `/v1/volume` requests across visible Volume actions.
 */
export type ControlState = {
  phase: Phase;
  station: { id: string; name: string } | null;
  nowPlaying: { artist: string | null; title: string | null; artworkURL: string | null } | null;
  favorite?: boolean;
  volume?: number;
  muted?: boolean;
};

export type ControlStation = {
  id: string;
  name: string;
  iconURL: string | null;
};

export type VolumeSnapshot = {
  volume: number;
  muted: boolean;
};

export type Handshake = {
  port: number;
  token: string;
  version?: number;
};

const PHASES = new Set<Phase>(["idle", "buffering", "playing", "paused", "reconnecting", "failed"]);

export function decodeHandshake(value: unknown): Handshake {
  const record = expectRecord(value, "handshake");
  const port = expectNumber(record.port, "handshake.port");
  const token = expectString(record.token, "handshake.token");
  const version = record.version === undefined ? undefined : expectNumber(record.version, "handshake.version");
  return { port, token, version };
}

export function decodeControlState(value: unknown): ControlState {
  const record = expectRecord(value, "/v1/state");
  const phase = expectPhase(record.phase, "/v1/state.phase");
  const station = decodeStationReference(record.station);
  const nowPlaying = decodeNowPlaying(record.nowPlaying);
  const favorite = record.favorite === undefined ? undefined : expectBoolean(record.favorite, "/v1/state.favorite");
  const volume = record.volume === undefined ? undefined : clampPercent(expectNumber(record.volume, "/v1/state.volume"));
  const muted = record.muted === undefined ? undefined : expectBoolean(record.muted, "/v1/state.muted");

  return { phase, station, nowPlaying, favorite, volume, muted };
}

export function decodeStations(value: unknown): ControlStation[] {
  if (!Array.isArray(value)) {
    throw new Error("expected /v1/stations to return an array");
  }

  return value.map((entry, index) => {
    const record = expectRecord(entry, `/v1/stations[${index}]`);
    return {
      id: expectString(record.id, `/v1/stations[${index}].id`),
      name: expectString(record.name, `/v1/stations[${index}].name`),
      iconURL: record.iconURL == null ? null : expectString(record.iconURL, `/v1/stations[${index}].iconURL`),
    };
  });
}

export function decodeVolumeSnapshot(value: unknown): VolumeSnapshot {
  const record = expectRecord(value, "/v1/volume");
  return {
    volume: clampPercent(expectNumber(record.volume, "/v1/volume.volume")),
    muted: expectBoolean(record.muted, "/v1/volume.muted"),
  };
}

export function decodeEmpty(value: unknown): void {
  if (value !== null && value !== undefined) {
    throw new Error("expected empty response body");
  }
}

function decodeStationReference(value: unknown): ControlState["station"] {
  if (value == null) return null;
  const record = expectRecord(value, "/v1/state.station");
  return {
    id: expectString(record.id, "/v1/state.station.id"),
    name: expectString(record.name, "/v1/state.station.name"),
  };
}

function decodeNowPlaying(value: unknown): ControlState["nowPlaying"] {
  if (value == null) return null;
  const record = expectRecord(value, "/v1/state.nowPlaying");
  return {
    artist: record.artist == null ? null : expectString(record.artist, "/v1/state.nowPlaying.artist"),
    title: record.title == null ? null : expectString(record.title, "/v1/state.nowPlaying.title"),
    artworkURL: record.artworkURL == null ? null : expectString(record.artworkURL, "/v1/state.nowPlaying.artworkURL"),
  };
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`expected ${label} to be an object`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`expected ${label} to be a string`);
  }
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`expected ${label} to be a finite number`);
  }
  return value;
}

function expectBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`expected ${label} to be a boolean`);
  }
  return value;
}

function expectPhase(value: unknown, label: string): Phase {
  if (typeof value !== "string" || !PHASES.has(value as Phase)) {
    throw new Error(`expected ${label} to be one of ${Array.from(PHASES).join(", ")}`);
  }
  return value as Phase;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
