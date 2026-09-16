import { __resetImageCacheForTests, fetchAsDataURL } from "../src/image-cache";
import { assert, test } from "./helpers";

function pngResponse(): Response {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

test("image cache serves a repeated URL without refetching", async () => {
  __resetImageCacheForTests();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return pngResponse();
  }) as unknown as typeof fetch;

  const first = await fetchAsDataURL("https://example.invalid/a.png", fetchImpl);
  const second = await fetchAsDataURL("https://example.invalid/a.png", fetchImpl);

  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.ok(first?.startsWith("data:image/png;base64,"));
});

test("image cache dedupes concurrent requests for the same URL", async () => {
  __resetImageCacheForTests();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return pngResponse();
  }) as unknown as typeof fetch;

  // Two Now Playing keys rendering the same track used to issue two requests.
  const [a, b] = await Promise.all([
    fetchAsDataURL("https://example.invalid/b.png", fetchImpl),
    fetchAsDataURL("https://example.invalid/b.png", fetchImpl),
  ]);

  assert.equal(calls, 1);
  assert.equal(a, b);
});

test("image cache stops hammering a URL that failed", async () => {
  __resetImageCacheForTests();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;

  // A dead artwork URL used to be retried on every three-second poll, each
  // attempt with a four-second timeout.
  assert.equal(await fetchAsDataURL("https://example.invalid/missing.png", fetchImpl), undefined);
  assert.equal(await fetchAsDataURL("https://example.invalid/missing.png", fetchImpl), undefined);
  assert.equal(await fetchAsDataURL("https://example.invalid/missing.png", fetchImpl), undefined);

  assert.equal(calls, 1, "failure must be remembered for a backoff window");
});

test("image cache reports a network failure as no image", async () => {
  __resetImageCacheForTests();
  const fetchImpl = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;

  assert.equal(await fetchAsDataURL("https://example.invalid/boom.png", fetchImpl), undefined);
});
