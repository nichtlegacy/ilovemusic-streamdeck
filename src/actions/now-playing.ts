import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { control } from "../control-client";
import { fetchAsDataURL } from "../image-cache";
import { nowPlayingTitleFor } from "../presenters/control";
import { forgetAction, setImageIfChanged, setTitleIfChanged } from "../render-cache";
import { controlRuntime, type RuntimeSnapshot } from "../runtime/control-runtime";
import {
  normalizeNowPlayingSettings,
  type NowPlayingSettingsInput,
} from "../settings/actions";
import { SettingsCache } from "../settings/cache";
import type { ControlState } from "../control/contracts";

@action({ UUID: "de.nichtlegacy.ilovemusic.nowplaying" })
export class NowPlayingAction extends SingletonAction<NowPlayingSettingsInput> {
  private unsubscribe: (() => void) | undefined;
  private visible = 0;
  private readonly settings = new SettingsCache<NowPlayingSettingsInput>();
  private renderGeneration = 0;

  override onWillAppear(ev: WillAppearEvent<NowPlayingSettingsInput>): void {
    this.settings.remember(ev.action.id, ev.payload.settings);
    this.visible += 1;
    if (!this.unsubscribe) {
      this.unsubscribe = controlRuntime.subscribeState((snapshot) => {
        void this.renderSnapshot(snapshot).catch(logRenderFailure);
      });
    }

    // subscribeState hands the current snapshot only to the listener it just
    // registered, and that exists for the first visible key alone. Without this
    // a second key, or one returning from a page switch, keeps the manifest
    // default for up to a full poll interval.
    void this.renderAppearingAction(ev).catch(logRenderFailure);
  }

  private async renderAppearingAction(ev: WillAppearEvent<NowPlayingSettingsInput>): Promise<void> {
    const snapshot = controlRuntime.getStateSnapshot();
    await this.renderAction(ev.action, ev.payload.settings, snapshot, await artworkFor(snapshot));
  }

  override onWillDisappear(ev: WillDisappearEvent<NowPlayingSettingsInput>): void {
    forgetAction(ev.action.id);
    this.settings.forget(ev.action.id);
    this.visible = Math.max(0, this.visible - 1);
    if (this.visible === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<NowPlayingSettingsInput>): Promise<void> {
    this.settings.remember(ev.action.id, ev.payload.settings);
    const snapshot = controlRuntime.getStateSnapshot();
    // Re-resolve the artwork instead of passing undefined, which used to clear
    // the key image on every settings echo.
    await this.renderAction(ev.action, ev.payload.settings, snapshot, await artworkFor(snapshot));
  }

  override async onKeyDown(ev: KeyDownEvent<NowPlayingSettingsInput>): Promise<void> {
    try {
      await control.toggle();
    } catch (err) {
      streamDeck.logger.warn(`toggle from nowplaying failed: ${(err as Error).message}`);
      await ev.action.showAlert();
      return;
    }
    await controlRuntime.refreshState({ force: true });
  }

  private async renderSnapshot(snapshot: RuntimeSnapshot<ControlState>): Promise<void> {
    const generation = ++this.renderGeneration;
    const dataURL = await artworkFor(snapshot);

    // Artwork can take seconds to arrive while the state polls every three, so
    // a slow fetch for the previous track could otherwise land after the next
    // tick and write the old title and image back over the new ones.
    if (generation !== this.renderGeneration) return;

    for (const action of this.actions) {
      const settings = this.settings.recall(action.id) ?? await action.getSettings();
      await this.renderAction(action, settings, snapshot, dataURL);
    }
  }

  private async renderAction(
    actionInstance: DidReceiveSettingsEvent<NowPlayingSettingsInput>["action"],
    settingsInput: NowPlayingSettingsInput,
    snapshot: RuntimeSnapshot<ControlState>,
    dataURL: string | undefined,
  ): Promise<void> {
    if (snapshot.status === "idle") return;

    if (snapshot.status === "offline" || !snapshot.value) {
      await setTitleIfChanged(actionInstance, "Offline");
      await setImageIfChanged(actionInstance, undefined);
      return;
    }

    const settings = normalizeNowPlayingSettings(settingsInput);
    await setTitleIfChanged(actionInstance, nowPlayingTitleFor(snapshot.value, settings));
    await setImageIfChanged(actionInstance, dataURL);
  }
}

async function artworkFor(snapshot: RuntimeSnapshot<ControlState>): Promise<string | undefined> {
  const artworkURL = snapshot.value?.nowPlaying?.artworkURL ?? null;
  if (snapshot.status === "offline" || !artworkURL) return undefined;
  return fetchAsDataURL(artworkURL);
}

function logRenderFailure(err: unknown): void {
  // These renders are deliberately not awaited by their callers. Without this
  // any rejection would surface as an unhandled promise rejection and can take
  // the plugin process down; the SDK's own settings request even rejects with
  // a plain string rather than an Error.
  streamDeck.logger.warn(`now playing render failed: ${err instanceof Error ? err.message : String(err)}`);
}
