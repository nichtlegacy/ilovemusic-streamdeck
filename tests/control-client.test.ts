import { createControlClient } from "../src/control/client";
import { ControlProtocolError, ControlRequestError, ControlTransportError } from "../src/control/errors";
import type { HandshakeCache } from "../src/control/handshake";
import { assert, test } from "./helpers";

test("control client retries read requests after rediscovery-worthy auth failure", async () => {
  const forceFlags: boolean[] = [];
  const invalidations: number[] = [];
  const handshakeCache: HandshakeCache = {
    async get(force = false) {
      forceFlags.push(force);
      return force ? { port: 4444, token: "fresh" } : { port: 3333, token: "stale" };
    },
    invalidate() {
      invalidations.push(Date.now());
    },
  };

  const requests: Array<{ url: string; method?: string; auth?: string }> = [];
  const responses = [
    new Response("", { status: 401 }),
    new Response(JSON.stringify({
      phase: "playing",
      station: null,
      nowPlaying: null,
    }), { status: 200 }),
  ];

  const client = createControlClient({
    handshakeCache,
    fetchImpl: async (url, init) => {
      requests.push({
        url: String(url),
        method: init?.method,
        auth: init?.headers instanceof Headers ? init.headers.get("Authorization") ?? undefined : undefined,
      });
      return responses.shift() ?? new Response("", { status: 500 });
    },
    logger: { debug() {} },
  });

  const state = await client.state();

  assert.equal(state.phase, "playing");
  assert.deepEqual(forceFlags, [false, true]);
  assert.equal(invalidations.length, 1);
  assert.deepEqual(requests.map((request) => request.url), [
    "http://127.0.0.1:3333/v1/state",
    "http://127.0.0.1:4444/v1/state",
  ]);
});

test("control client does not replay mutation requests", async () => {
  const handshakeCache: HandshakeCache = {
    async get() {
      return { port: 3333, token: "stale" };
    },
    invalidate() {},
  };

  let attempts = 0;
  const client = createControlClient({
    handshakeCache,
    fetchImpl: async () => {
      attempts += 1;
      return new Response("", { status: 401 });
    },
    logger: { debug() {} },
  });

  await assert.rejects(() => client.toggle(), ControlRequestError);
  assert.equal(attempts, 1);
});

test("control client rejects malformed JSON contracts", async () => {
  const handshakeCache: HandshakeCache = {
    async get() {
      return { port: 3333, token: "token" };
    },
    invalidate() {},
  };

  const client = createControlClient({
    handshakeCache,
    fetchImpl: async () => new Response("{not-json", { status: 200 }),
    logger: { debug() {} },
  });

  await assert.rejects(() => client.state(), ControlProtocolError);
});

test("control client rediscovers after a transport failure", async () => {
  // The macOS control server binds an ephemeral port, so restarting the app
  // leaves the cached handshake pointing at a dead socket. The refused
  // connection must invalidate the cache, otherwise every later request keeps
  // targeting the old port and the plugin stays offline until it restarts.
  const forceFlags: boolean[] = [];
  let invalidations = 0;
  const handshakeCache: HandshakeCache = {
    async get(force = false) {
      forceFlags.push(force);
      return force ? { port: 4444, token: "fresh" } : { port: 3333, token: "stale" };
    },
    invalidate() {
      invalidations += 1;
    },
  };

  const urls: string[] = [];
  let calls = 0;
  const client = createControlClient({
    handshakeCache,
    fetchImpl: async (url) => {
      urls.push(String(url));
      calls += 1;
      if (calls === 1) {
        // Undici surfaces a refused connection as a TypeError.
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({ phase: "playing", station: null, nowPlaying: null }), { status: 200 });
    },
    logger: { debug() {} },
  });

  const state = await client.state();

  assert.equal(state.phase, "playing");
  assert.equal(invalidations, 1);
  assert.deepEqual(forceFlags, [false, true]);
  assert.deepEqual(urls, [
    "http://127.0.0.1:3333/v1/state",
    "http://127.0.0.1:4444/v1/state",
  ]);
});

test("control client invalidates the handshake for a failed mutation without replaying it", async () => {
  // A mutation must never be sent twice, but it still has to drop a handshake
  // the server just rejected. Otherwise a page holding only mutation keys keeps
  // using the stale token and every press fails for good.
  let invalidations = 0;
  const handshakeCache: HandshakeCache = {
    async get() {
      return { port: 3333, token: "stale" };
    },
    invalidate() {
      invalidations += 1;
    },
  };

  let attempts = 0;
  const client = createControlClient({
    handshakeCache,
    fetchImpl: async () => {
      attempts += 1;
      return new Response("", { status: 401 });
    },
    logger: { debug() {} },
  });

  await assert.rejects(() => client.next(), ControlRequestError);
  assert.equal(attempts, 1, "mutation must not be replayed");
  assert.equal(invalidations, 1, "stale handshake must still be dropped");
});

test("control client invalidates the handshake when a mutation cannot reach the app", async () => {
  let invalidations = 0;
  const handshakeCache: HandshakeCache = {
    async get() {
      return { port: 3333, token: "stale" };
    },
    invalidate() {
      invalidations += 1;
    },
  };

  let attempts = 0;
  const client = createControlClient({
    handshakeCache,
    fetchImpl: async () => {
      attempts += 1;
      throw new TypeError("fetch failed");
    },
    logger: { debug() {} },
  });

  await assert.rejects(() => client.next(), ControlTransportError);
  assert.equal(attempts, 1, "mutation must not be replayed");
  assert.equal(invalidations, 1);
});
