import streamDeck, { action, SingletonAction, type KeyDownEvent } from "@elgato/streamdeck";

import { control } from "../control-client";

@action({ UUID: "de.nichtlegacy.ilovemusic.next" })
export class NextChannelAction extends SingletonAction {
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await control.next();
      await ev.action.showOk();
    } catch (err) {
      streamDeck.logger.warn(`next failed: ${(err as Error).message}`);
      await ev.action.showAlert();
    }
  }
}
