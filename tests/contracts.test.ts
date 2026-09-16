import {
  decodeControlState,
  decodeHandshake,
  decodeStations,
  decodeVolumeSnapshot,
} from "../src/control/contracts";
import { assert, test } from "./helpers";

test("decodeControlState validates nested payloads and clamps volume", () => {
  const state = decodeControlState({
    phase: "playing",
    station: { id: "chill", name: "Chillout" },
    nowPlaying: { artist: "Tycho", title: "Awake", artworkURL: "https://example.com/art.jpg" },
    favorite: true,
    volume: 104.7,
    muted: false,
  });

  assert.equal(state.phase, "playing");
  assert.equal(state.station?.name, "Chillout");
  assert.equal(state.nowPlaying?.artist, "Tycho");
  assert.equal(state.favorite, true);
  assert.equal(state.volume, 100);
  assert.equal(state.muted, false);
});

test("decodeStations rejects non-array payloads", () => {
  assert.throws(() => decodeStations({}), /return an array/);
});

test("decodeHandshake requires port and token", () => {
  const handshake = decodeHandshake({ port: 5151, token: "abc", version: 2 });
  assert.equal(handshake.port, 5151);
  assert.equal(handshake.token, "abc");
  assert.equal(handshake.version, 2);
  assert.throws(() => decodeHandshake({ port: "bad", token: "abc" }), /handshake.port/);
});

test("decodeVolumeSnapshot validates types", () => {
  const snapshot = decodeVolumeSnapshot({ volume: 11.8, muted: true });
  assert.deepEqual(snapshot, { volume: 12, muted: true });
  assert.throws(() => decodeVolumeSnapshot({ volume: "11", muted: true }), /volume/);
});
