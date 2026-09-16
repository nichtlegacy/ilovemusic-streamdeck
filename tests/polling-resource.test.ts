import { PollingResource } from "../src/runtime/polling-resource";
import { assert, test } from "./helpers";

test("PollingResource transitions from live to stale to offline based on freshness", async () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  let shouldFail = false;
  const resource = new PollingResource(async () => {
    if (shouldFail) {
      throw new Error("offline");
    }

    return { value: "ok" };
  }, 60_000);

  try {
    await resource.refresh();
    assert.equal(resource.getSnapshot().status, "live");

    shouldFail = true;
    now += 1_000;
    await resource.refresh();
    assert.equal(resource.getSnapshot().status, "stale");
    assert.deepEqual(resource.getSnapshot().value, { value: "ok" });

    now += 16_000;
    await resource.refresh();
    assert.equal(resource.getSnapshot().status, "offline");
    assert.deepEqual(resource.getSnapshot().value, { value: "ok" });
  } finally {
    Date.now = originalNow;
  }
});

test("forced refresh after a mutation does not reuse the request that preceded it", async () => {
  let loads = 0;
  let release: (() => void) | undefined;
  const resource = new PollingResource<number>(async () => {
    loads += 1;
    if (loads === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return loads;
  }, 60_000);

  const firstSnapshot = resource.refresh();
  await new Promise((resolve) => setTimeout(resolve, 1));

  // A key press mutated server state while that first request was still open.
  // Joining it would report the value from before the mutation.
  const forced = resource.refresh({ force: true });
  release?.();

  await firstSnapshot;
  const result = await forced;

  assert.equal(loads, 2, "forced refresh must issue its own request");
  assert.equal(result.value, 2);
});

test("unforced refresh still shares an in-flight request", async () => {
  let loads = 0;
  const resource = new PollingResource<number>(async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return loads;
  }, 60_000);

  const [a, b] = await Promise.all([resource.refresh(), resource.refresh()]);

  assert.equal(loads, 1);
  assert.equal(a.value, b.value);
});
