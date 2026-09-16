import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { control } from "../control-client";
import type { ControlState } from "../control/contracts";
import { volumeTitleFor } from "../presenters/control";
import { forgetAction, setStateIfChanged, setTitleIfChanged } from "../render-cache";
import { controlRuntime, type RuntimeSnapshot } from "../runtime/control-runtime";
import { normalizeVolumeSettings, type VolumeSettingsInput } from "../settings/actions";
import { SettingsCache } from "../settings/cache";

type ActionInstance = DidReceiveSettingsEvent<VolumeSettingsInput>["action"];

@action({ UUID: "de.nichtlegacy.ilovemusic.volume" })
export class VolumeAction extends SingletonAction<VolumeSettingsInput> {
  private unsubscribe: (() => void) | undefined;
  private visible = 0;
  private readonly settings = new SettingsCache<VolumeSettingsInput>();

  override onWillAppear(ev: WillAppearEvent<VolumeSettingsInput>): void {
    this.settings.remember(ev.action.id, ev.payload.settings);
    this.visible += 1;
    if (!this.unsubscribe) {
      this.unsubscribe = controlRuntime.subscribeState((snapshot) => {
        void this.renderSnapshot(snapshot).catch(logRenderFailure);
      });
    }

    void this.renderOne(ev.action, ev.payload.settings, controlRuntime.getStateSnapshot()).catch(logRenderFailure);
  }

  override onWillDisappear(ev: WillDisappearEvent<VolumeSettingsInput>): void {
    forgetAction(ev.action.id);
    this.settings.forget(ev.action.id);
    this.visible = Math.max(0, this.visible - 1);
    if (this.visible === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<VolumeSettingsInput>): Promise<void> {
    this.settings.remember(ev.action.id, ev.payload.settings);
    await this.renderOne(ev.action, ev.payload.settings, controlRuntime.getStateSnapshot());
  }

  override async onKeyDown(ev: KeyDownEvent<VolumeSettingsInput>): Promise<void> {
    try {
      await control.toggleMute();
    } catch (err) {
      streamDeck.logger.warn(`toggle mute failed: ${(err as Error).message}`);
      await ev.action.showAlert();
      return;
    }
    await controlRuntime.refreshState({ force: true });
  }

  private async renderSnapshot(snapshot: RuntimeSnapshot<ControlState>): Promise<void> {
    for (const action of this.actions) {
      const settings = this.settings.recall(action.id) ?? await action.getSettings();
      await this.renderOne(action, settings, snapshot);
    }
  }

  /**
   * Renders exactly one key. A failure here is contained to that key: it used
   * to abort the whole loop and drive every visible Volume key offline, so one
   * timed-out fallback request blanked keys that had perfectly good data and
   * left the keys after it in the iteration unrendered.
   */
  private async renderOne(
    actionInstance: ActionInstance,
    settingsInput: VolumeSettingsInput,
    snapshot: RuntimeSnapshot<ControlState>,
  ): Promise<void> {
    if (snapshot.status === "idle") return;

    try {
      await this.renderAction(actionInstance, settingsInput, snapshot);
    } catch (err) {
      if (snapshot.status === "stale") {
        // Keep the last good reading rather than flapping to Offline while the
        // snapshot is still within its grace period.
        streamDeck.logger.debug(`volume render kept stale state: ${(err as Error).message}`);
        return;
      }
      streamDeck.logger.warn(`volume refresh failed: ${(err as Error).message}`);
      await this.renderOffline(actionInstance);
    }
  }

  private async renderAction(
    actionInstance: ActionInstance,
    settingsInput: VolumeSettingsInput,
    snapshot: RuntimeSnapshot<ControlState>,
  ): Promise<void> {
    if (snapshot.status === "offline" || !snapshot.value) {
      await this.renderOffline(actionInstance);
      return;
    }

    const volume = await controlRuntime.resolveVolumeSnapshot(snapshot.value);
    const settings = normalizeVolumeSettings(settingsInput);

    if (actionInstance.isKey()) {
      await setStateIfChanged(actionInstance, volume.muted ? 1 : 0);
    }
    await setTitleIfChanged(actionInstance, volumeTitleFor(volume, settings));
  }

  private async renderOffline(actionInstance: ActionInstance): Promise<void> {
    if (actionInstance.isKey()) {
      await setStateIfChanged(actionInstance, 0);
    }
    await setTitleIfChanged(actionInstance, "Offline");
  }
}

function logRenderFailure(err: unknown): void {
  // These renders are deliberately not awaited by their callers. Without this
  // any rejection would surface as an unhandled promise rejection and can take
  // the plugin process down; the SDK's own settings request even rejects with
  // a plain string rather than an Error.
  streamDeck.logger.warn(`volume render failed: ${err instanceof Error ? err.message : String(err)}`);
}
