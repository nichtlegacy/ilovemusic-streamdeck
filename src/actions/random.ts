import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { control } from "../control-client";
import { forgetAction, setTitleIfChanged } from "../render-cache";
import { normalizeRandomSettings, type RandomSettingsInput } from "../settings/actions";

@action({ UUID: "de.nichtlegacy.ilovemusic.random" })
export class RandomChannelAction extends SingletonAction<RandomSettingsInput> {
  override async onWillAppear(ev: WillAppearEvent<RandomSettingsInput>): Promise<void> {
    await this.render(ev.action, ev.payload.settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<RandomSettingsInput>): void {
    // This action writes titles and states through the render cache, so its
    // entry has to go when the key does. Otherwise a reappearing key compares
    // against a value Stream Deck no longer shows and the render is skipped as
    // unchanged.
    forgetAction(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<RandomSettingsInput>): Promise<void> {
    await this.render(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<RandomSettingsInput>): Promise<void> {
    const favoritesOnly = normalizeRandomSettings(ev.payload.settings).pool === "favorites";
    try {
      await control.random(favoritesOnly);
      await ev.action.showOk();
    } catch (err) {
      streamDeck.logger.warn(`random failed: ${(err as Error).message}`);
      await ev.action.showAlert();
    }
  }

  private async render(
    actionInstance: WillAppearEvent<RandomSettingsInput>["action"],
    settingsInput: RandomSettingsInput,
  ): Promise<void> {
    const settings = normalizeRandomSettings(settingsInput);
    await setTitleIfChanged(actionInstance, settings.pool === "favorites" ? "Fav" : "");
  }
}
