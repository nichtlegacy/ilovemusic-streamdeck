// Cache around fetch → data:URL so the same artwork is not refetched on every poll.

import streamDeck from "@elgato/streamdeck";

type FetchLike = typeof fetch;

const CACHE = new Map<string, string>();
const CACHE_MAX = 64;

/**
 * URLs whose last fetch failed, with the time the next attempt is allowed.
 *
 * Without this a dead artwork URL — a 404, or a CDN that is down — was retried
 * on every three-second poll, each attempt carrying a four-second timeout.
 */
const FAILED = new Map<string, number>();
const FAILURE_BACKOFF_MS = 60_000;

/** In-flight fetches, so several keys wanting the same image issue one request. */
const IN_FLIGHT = new Map<string, Promise<string | undefined>>();

export async function fetchAsDataURL(url: string, fetchImpl: FetchLike = fetch): Promise<string | undefined> {
  const cached = CACHE.get(url);
  if (cached !== undefined) {
    // Re-insert so the most recently used entry is last, which is what the
    // eviction below assumes. Without this the map stayed in insertion order
    // and a hot station icon could be evicted by artwork churn.
    CACHE.delete(url);
    CACHE.set(url, cached);
    return cached;
  }

  const retryAfter = FAILED.get(url);
  if (retryAfter !== undefined) {
    if (retryAfter > Date.now()) return undefined;
    FAILED.delete(url);
  }

  const pending = IN_FLIGHT.get(url);
  if (pending) return pending;

  const request = load(url, fetchImpl).finally(() => {
    IN_FLIGHT.delete(url);
  });
  IN_FLIGHT.set(url, request);
  return request;
}

async function load(url: string, fetchImpl: FetchLike): Promise<string | undefined> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      rememberFailure(url, `HTTP ${res.status}`);
      return undefined;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const dataURL = `data:${mime};base64,${buf.toString("base64")}`;

    if (CACHE.size >= CACHE_MAX) {
      const oldestKey = CACHE.keys().next().value;
      if (oldestKey !== undefined) CACHE.delete(oldestKey);
    }
    CACHE.set(url, dataURL);
    return dataURL;
  } catch (err) {
    rememberFailure(url, (err as Error).message);
    return undefined;
  }
}

function rememberFailure(url: string, reason: string): void {
  FAILED.set(url, Date.now() + FAILURE_BACKOFF_MS);
  streamDeck.logger.debug(`image fetch failed for ${url}: ${reason}`);
}

/** Test-only: clear every cache so cases do not leak into one another. */
export function __resetImageCacheForTests(): void {
  CACHE.clear();
  FAILED.clear();
  IN_FLIGHT.clear();
}
