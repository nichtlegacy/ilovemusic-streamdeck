import { control } from "../src/control/client";
import type { ControlState, VolumeSnapshot } from "../src/control/contracts";
import { controlRuntime } from "../src/runtime/control-runtime";
import { assert, test } from "./helpers";

type VolumeFn = () => Promise<VolumeSnapshot>;

function withStubbedVolume<T>(stub: VolumeFn & { calls?: number }, body: () => Promise<T> | T): Promise<T> {
  const original = control.volume;
  control.volume = stub;
  controlRuntime.__resetForTests();
  return Promise.resolve()
    .then(body)
    .finally(() => {
      control.volume = original;
      controlRuntime.__resetForTests();
    });
}

function baseState(overrides: Partial<ControlState> = {}): ControlState {
  return {
    phase: "playing",
    station: { id: "s1", name: "Station" },
    nowPlaying: null,
    favorite: false,
    ...overrides,
  };
}

test("resolveVolumeSnapshot returns state-derived value without calling /v1/volume", async () => {
  let calls = 0;
  const stub: VolumeFn = async () => {
    calls += 1;
    return { volume: 99, muted: true };
  };

  await withStubbedVolume(stub, async () => {
    const state = baseState({ volume: 42, muted: false });
    const result = await controlRuntime.resolveVolumeSnapshot(state);
    assert.deepEqual(result, { volume: 42, muted: false });
    assert.equal(calls, 0);
  });
});

test("resolveVolumeSnapshot clamps state-derived volume", async () => {
  const stub: VolumeFn = async () => {
    throw new Error("should not be called");
  };
  await withStubbedVolume(stub, async () => {
    const result = await controlRuntime.resolveVolumeSnapshot(baseState({ volume: 142, muted: false }));
    assert.equal(result.volume, 100);
    const lo = await controlRuntime.resolveVolumeSnapshot(baseState({ volume: -5, muted: true }));
    assert.equal(lo.volume, 0);
  });
});

test("fallback dedupes concurrent callers into one /v1/volume fetch", async () => {
  let calls = 0;
  let resolveFetch: ((value: VolumeSnapshot) => void) | undefined;
  const stub: VolumeFn = () => {
    calls += 1;
    return new Promise<VolumeSnapshot>((resolve) => {
      resolveFetch = resolve;
    });
  };

  await withStubbedVolume(stub, async () => {
    // Simulate four visible Volume actions all asking at once when /v1/state
    // is missing volume + muted (the N+1 hazard the contract guards against).
    const stateMissing: ControlState = baseState({ volume: undefined, muted: undefined });
    const pending = [
      controlRuntime.resolveVolumeSnapshot(stateMissing),
      controlRuntime.resolveVolumeSnapshot(stateMissing),
      controlRuntime.resolveVolumeSnapshot(stateMissing),
      controlRuntime.resolveVolumeSnapshot(stateMissing),
    ];

    // Let microtasks run so all four register their await on the in-flight
    // promise before we resolve it.
    await Promise.resolve();
    assert.equal(calls, 1, "expected a single underlying /v1/volume fetch");

    resolveFetch?.({ volume: 55, muted: false });
    const results = await Promise.all(pending);

    assert.equal(calls, 1);
    for (const value of results) {
      assert.deepEqual(value, { volume: 55, muted: false });
    }
  });
});

test("fallback memoizes the most recent result for a short window", async () => {
  let calls = 0;
  const stub: VolumeFn = async () => {
    calls += 1;
    return { volume: 30, muted: false };
  };

  await withStubbedVolume(stub, async () => {
    const stateMissing: ControlState = baseState({ volume: undefined, muted: undefined });
    const first = await controlRuntime.resolveVolumeSnapshot(stateMissing);
    const second = await controlRuntime.resolveVolumeSnapshot(stateMissing);
    const third = await controlRuntime.resolveVolumeSnapshot(stateMissing);

    assert.deepEqual(first, { volume: 30, muted: false });
    assert.deepEqual(second, first);
    assert.deepEqual(third, first);
    assert.equal(calls, 1, "memo should serve back-to-back lookups");
  });
});

test("fallback path keeps working when state is offline (null) and dedupes too", async () => {
  let calls = 0;
  const stub: VolumeFn = async () => {
    calls += 1;
    return { volume: 12, muted: true };
  };

  await withStubbedVolume(stub, async () => {
    const [a, b] = await Promise.all([
      controlRuntime.resolveVolumeSnapshot(null),
      controlRuntime.resolveVolumeSnapshot(undefined),
    ]);
    assert.deepEqual(a, { volume: 12, muted: true });
    assert.deepEqual(b, { volume: 12, muted: true });
    assert.equal(calls, 1);
  });
});
