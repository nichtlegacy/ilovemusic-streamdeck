import { nowPlayingTitleFor, volumeTitleFor, wrapStationTitle } from "../src/presenters/control";
import {
  normalizeNowPlayingSettings,
  normalizeRandomSettings,
  normalizeSelectSettings,
  normalizeVolumeSettings,
  normalizeVolumeStepSettings,
} from "../src/settings/actions";
import { assert, test } from "./helpers";
import { SettingsCache } from "../src/settings/cache";

test("settings normalizers translate Stream Deck payload strings into stable values", () => {
  assert.deepEqual(normalizeNowPlayingSettings({ showChannelName: "false", showSongInfo: "true" }), {
    showChannelName: false,
    showSongInfo: true,
  });
  assert.deepEqual(normalizeVolumeSettings({ showLabel: "true", bigPercent: false }), {
    showLabel: true,
    bigPercent: false,
  });
  assert.deepEqual(normalizeRandomSettings({ pool: "favorites" }), { pool: "favorites" });
  assert.deepEqual(normalizeSelectSettings({ stationId: "  synthwave  " }), { stationId: "synthwave" });
  assert.deepEqual(normalizeVolumeStepSettings({ direction: "down", stepPercent: "15" }), {
    direction: "down",
    stepPercent: 15,
  });
});

test("presenters derive compact titles without action-local logic", () => {
  const title = nowPlayingTitleFor(
    {
      phase: "playing",
      station: { id: "nightdrive", name: "Night Drive" },
      nowPlaying: { artist: "FM-84", title: "Running In The Night", artworkURL: null },
    },
    { showChannelName: true, showSongInfo: true },
  );

  assert.equal(title, "Night Drive\nFM-84\nRunning In The Night");
  assert.equal(volumeTitleFor({ volume: 42, muted: false }, { showLabel: false, bigPercent: true }), "42\n%");
  assert.equal(wrapStationTitle("Very Long Station Name"), "Very Long\nStation\nName");
});

test("settings cache serves renders without a round-trip and drops instances on disappear", () => {
  const cache = new SettingsCache<{ stationId?: string }>();

  assert.equal(cache.recall("key-1"), undefined, "unknown instance has no settings yet");

  cache.remember("key-1", { stationId: "synthwave" });
  cache.remember("key-2", { stationId: "hiphop" });

  // Renders read from here instead of calling action.getSettings(), which on
  // Stream Deck below 7.1 echoes back into onDidReceiveSettings and triggers a
  // second render — the one that used to clear Now Playing's artwork.
  assert.deepEqual(cache.recall("key-1"), { stationId: "synthwave" });
  assert.deepEqual(cache.recall("key-2"), { stationId: "hiphop" });

  cache.remember("key-1", { stationId: "chillout" });
  assert.deepEqual(cache.recall("key-1"), { stationId: "chillout" }, "latest settings win");

  cache.forget("key-1");
  assert.equal(cache.recall("key-1"), undefined);
  assert.equal(cache.size, 1, "forgetting one instance must not affect the others");
});
