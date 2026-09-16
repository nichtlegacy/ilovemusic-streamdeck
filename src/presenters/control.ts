import type { ControlState, VolumeSnapshot } from "../control/contracts";

export function toggleStateFor(state: ControlState): 0 | 1 {
  return state.phase === "playing" || state.phase === "buffering" ? 1 : 0;
}

export function toggleTitleFor(state: ControlState): string {
  if (state.phase === "buffering") return "…";
  if (state.phase === "reconnecting") return "Recon";
  if (state.phase === "failed") return "Error";
  return "";
}

export function favoriteStateFor(state: ControlState): 0 | 1 {
  return state.favorite === true ? 1 : 0;
}

export function favoriteTitleFor(state: ControlState): string {
  return state.station ? "" : "No\nChan";
}

export function nowPlayingTitleFor(
  state: ControlState,
  settings: { showChannelName: boolean; showSongInfo: boolean },
): string {
  const lines: string[] = [];

  if (settings.showChannelName && state.station?.name) {
    lines.push(state.station.name);
  }

  if (settings.showSongInfo) {
    const artist = state.nowPlaying?.artist?.trim();
    const title = state.nowPlaying?.title?.trim();
    if (artist) lines.push(artist);
    if (title) lines.push(title);
  }

  return lines.join("\n");
}

export function volumeTitleFor(
  snapshot: VolumeSnapshot,
  settings: { showLabel: boolean; bigPercent: boolean },
): string {
  if (snapshot.muted) {
    return settings.showLabel ? "Vol\nMute" : "\n\nMute";
  }

  if (settings.bigPercent) {
    return settings.showLabel ? `Vol\n${snapshot.volume}%` : `${snapshot.volume}\n%`;
  }

  return settings.showLabel ? `Vol ${snapshot.volume}%` : `\n\n${snapshot.volume}%`;
}

export function wrapStationTitle(text: string): string {
  if (text.length <= 9) return text;

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if ((line + " " + word).trim().length > 9 && line.length > 0) {
      lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }

  if (line) lines.push(line);
  return lines.slice(0, 3).join("\n");
}
