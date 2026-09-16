import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { control } from "../control-client";
import { forgetAction, setStateIfChanged, setTitleIfChanged } from "../render-cache";
import { normalizeVolumeStepSettings, type VolumeStepSettingsInput } from "../settings/actions";

@action({ UUID: "de.nichtlegacy.ilovemusic.volumestep" })
export class VolumeStepAction extends SingletonAction<VolumeStepSettingsInput> {
  override async onWillAppear(ev: WillAppearEvent<VolumeStepSettingsInput>): Promise<void> {
    await this.render(ev.action, ev.payload.settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<VolumeStepSettingsInput>): void {
    // This action writes titles and states through the render cache, so its
    // entry has to go when the key does. Otherwise a reappearing key compares
    // against a value Stream Deck no longer shows and the render is skipped as
    // unchanged.
    forgetAction(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<VolumeStepSettingsInput>): Promise<void> {
    await this.render(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<VolumeStepSettingsInput>): Promise<void> {
    const settings = normalizeVolumeStepSettings(ev.payload.settings);

    try {
      await control.stepVolume(settings.direction === "up" ? settings.stepPercent : -settings.stepPercent);
      await ev.action.showOk();
    } catch (err) {
      streamDeck.logger.warn(`volume step failed: ${(err as Error).message}`);
      await ev.action.showAlert();
    }

    await this.render(ev.action, ev.payload.settings);
  }

  private async render(
    actionInstance: WillAppearEvent<VolumeStepSettingsInput>["action"],
    settingsInput: VolumeStepSettingsInput,
  ): Promise<void> {
    const settings = normalizeVolumeStepSettings(settingsInput);

    if (actionInstance.isKey()) {
      await setStateIfChanged(actionInstance, settings.direction === "up" ? 0 : 1);
    }
    await setTitleIfChanged(
      actionInstance,
      settings.direction === "up" ? `+${settings.stepPercent} %` : `-${settings.stepPercent} %`,
    );
  }
}
