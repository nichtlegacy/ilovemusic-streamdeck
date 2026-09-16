import streamDeck from "@elgato/streamdeck";

import {
  decodeControlState,
  decodeEmpty,
  decodeStations,
  decodeVolumeSnapshot,
  type ControlState,
  type ControlStation,
  type Handshake,
  type VolumeSnapshot,
} from "./contracts";
import {
  AppUnavailableError,
  ControlProtocolError,
  ControlRequestError,
  ControlTransportError,
} from "./errors";
import { createHandshakeCache, type HandshakeCache } from "./handshake";

type Logger = Pick<typeof streamDeck.logger, "debug">;
type FetchLike = typeof fetch;
type Decoder<T> = (value: unknown) => T;

type RequestOptions<T> = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  decode: Decoder<T>;
  retryOnRediscovery: boolean;
};

export type ControlClient = {
  state(): Promise<ControlState>;
  stations(): Promise<ControlStation[]>;
  volume(): Promise<VolumeSnapshot>;
  setVolume(volume: number): Promise<void>;
  stepVolume(delta: number): Promise<void>;
  toggleMute(): Promise<void>;
  setMute(muted: boolean): Promise<void>;
  toggle(): Promise<void>;
  toggleFavorite(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  random(favoritesOnly?: boolean): Promise<void>;
  select(stationId: string): Promise<void>;
};

type CreateControlClientOptions = {
  fetchImpl?: FetchLike;
  handshakeCache?: HandshakeCache;
  logger?: Logger;
};

export function createControlClient(options: CreateControlClientOptions = {}): ControlClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const handshakeCache = options.handshakeCache ?? createHandshakeCache();
  const logger = options.logger ?? streamDeck.logger;

  async function request<T>(requestOptions: RequestOptions<T>): Promise<T> {
    const attempts = requestOptions.retryOnRediscovery ? 2 : 1;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const forceHandshakeRefresh = attempt > 0;
      let handshake: Handshake;

      try {
        handshake = await handshakeCache.get(forceHandshakeRefresh);
      } catch (error) {
        throw wrapAvailabilityError(error);
      }

      try {
        const response = await fetchImpl(`http://127.0.0.1:${handshake.port}${requestOptions.path}`, {
          method: requestOptions.method,
          headers: {
            Authorization: `Bearer ${handshake.token}`,
            "Content-Type": "application/json",
          },
          body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
          signal: AbortSignal.timeout(4000),
        });

        if (response.status === 401 || response.status === 403) {
          // The app mints a new token on every launch, so a rejected token means
          // the cached handshake belongs to a previous process. Drop it even for
          // mutations, which must not be replayed: the request still fails, but
          // the next one rediscovers instead of failing forever.
          handshakeCache.invalidate();
          if (attempt === 0 && requestOptions.retryOnRediscovery) {
            logger.debug(`control request retry after rediscovery: ${requestOptions.method} ${requestOptions.path} -> ${response.status}`);
            continue;
          }
        }

        if (!response.ok) {
          throw new ControlRequestError(requestOptions.method, requestOptions.path, response.status);
        }

        const payload = await decodeResponseBody(response, requestOptions.path);
        return requestOptions.decode(payload);
      } catch (error) {
        const err = normalizeRequestError(error, requestOptions);
        lastError = err;
        // `normalizeRequestError` has already wrapped a raw TypeError/TimeoutError
        // into a ControlTransportError, so the raw-type check that used to sit
        // here could never match and this branch was dead code.
        if (err instanceof ControlTransportError) {
          // The control server binds an ephemeral port, so a refused connection
          // means the cached handshake points at a port the app no longer owns.
          // Without dropping it the plugin stays offline until it is restarted.
          handshakeCache.invalidate();
          if (attempt === 0 && requestOptions.retryOnRediscovery) {
            logger.debug(`control request retry after transport failure: ${requestOptions.method} ${requestOptions.path} -> ${err.message}`);
            continue;
          }
        }
        throw err;
      }
    }

    throw lastError ?? new AppUnavailableError(`ILoveMusic app not reachable: ${requestOptions.method} ${requestOptions.path}`);
  }

  return {
    state: () => request({ method: "GET", path: "/v1/state", decode: decodeControlState, retryOnRediscovery: true }),
    stations: () => request({ method: "GET", path: "/v1/stations", decode: decodeStations, retryOnRediscovery: true }),
    volume: () => request({ method: "GET", path: "/v1/volume", decode: decodeVolumeSnapshot, retryOnRediscovery: true }),
    setVolume: (volume: number) => request({ method: "POST", path: "/v1/volume", body: { volume }, decode: decodeEmpty, retryOnRediscovery: false }),
    stepVolume: (delta: number) => request({ method: "POST", path: "/v1/volume/step", body: { delta }, decode: decodeEmpty, retryOnRediscovery: false }),
    toggleMute: () => request({ method: "POST", path: "/v1/mute", decode: decodeEmpty, retryOnRediscovery: false }),
    setMute: (muted: boolean) => request({ method: "POST", path: "/v1/mute", body: { muted }, decode: decodeEmpty, retryOnRediscovery: false }),
    toggle: () => request({ method: "POST", path: "/v1/toggle", decode: decodeEmpty, retryOnRediscovery: false }),
    toggleFavorite: () => request({ method: "POST", path: "/v1/favorite", decode: decodeEmpty, retryOnRediscovery: false }),
    play: () => request({ method: "POST", path: "/v1/play", decode: decodeEmpty, retryOnRediscovery: false }),
    pause: () => request({ method: "POST", path: "/v1/pause", decode: decodeEmpty, retryOnRediscovery: false }),
    next: () => request({ method: "POST", path: "/v1/next", decode: decodeEmpty, retryOnRediscovery: false }),
    random: (favoritesOnly?: boolean) =>
      request({
        method: "POST",
        path: "/v1/random",
        body: favoritesOnly ? { favoritesOnly: true } : undefined,
        decode: decodeEmpty,
        retryOnRediscovery: false,
      }),
    select: (stationId: string) =>
      request({
        method: "POST",
        path: "/v1/select",
        body: { stationId },
        decode: decodeEmpty,
        retryOnRediscovery: false,
      }),
  };
}

export const control = createControlClient();

async function decodeResponseBody(response: Response, path: string): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ControlProtocolError(`invalid JSON response from ${path}`, { cause: error });
  }
}

function normalizeRequestError(error: unknown, requestOptions: Pick<RequestOptions<unknown>, "method" | "path">): Error {
  if (
    error instanceof AppUnavailableError ||
    error instanceof ControlProtocolError ||
    error instanceof ControlRequestError ||
    error instanceof ControlTransportError
  ) {
    return error;
  }

  const err = toError(error);
  if (isRetryableTransportError(err)) {
    return new ControlTransportError(
      `ILoveMusic app not reachable: ${requestOptions.method} ${requestOptions.path} (${err.message})`,
      { cause: err },
    );
  }

  return err;
}

function wrapAvailabilityError(error: unknown): AppUnavailableError {
  if (error instanceof AppUnavailableError) {
    return error;
  }

  return new AppUnavailableError(`ILoveMusic app not running (${toError(error).message})`, { cause: error });
}

function isRetryableTransportError(error: Error): boolean {
  return error instanceof TypeError || error.name === "AbortError" || error.name === "TimeoutError";
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
