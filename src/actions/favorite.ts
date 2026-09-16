import streamDeck, {
  action,
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { control } from "../control-client";
import { favoriteStateFor, favoriteTitleFor } from "../presenters/control";
import { forgetAction, setStateIfChanged, setTitleIfChanged } from "../render-cache";
import { controlRuntime, type RuntimeSnapshot } from "../runtime/control-runtime";
import type { ControlState } from "../control/contracts";

type ActionInstance = WillAppearEvent["action"];

@action({ UUID: "de.nichtlegacy.ilovemusic.favorite" })
export class FavoriteAction extends SingletonAction {
  private unsubscribe: (() => void) | undefined;
  private visible = 0;

  override onWillAppear(ev: WillAppearEvent): void {
    this.visible += 1;
    if (!this.unsubscribe) {
      this.unsubscribe = controlRuntime.subscribeState((snapshot) => {
        void this.renderSnapshot(snapshot).catch(logRenderFailure);
      });
    }

    // See ToggleAction.onWillAppear: only the first visible key gets the
    // snapshot through subscribe, so every later one has to be painted here.
    void this.renderAction(ev.action, controlRuntime.getStateSnapshot()).catch(logRenderFailure);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    forgetAction(ev.action.id);
    this.visible = Math.max(0, this.visible - 1);
    if (this.visible === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await control.toggleFavorite();
    } catch (err) {
      streamDeck.logger.warn(`toggle favorite failed: ${(err as Error).message}`);
      await ev.action.showAlert();
      return;
    }
    await controlRuntime.refreshState({ force: true });
  }

  private async renderSnapshot(snapshot: RuntimeSnapshot<ControlState>): Promise<void> {
    for (const action of this.actions) {
      await this.renderAction(action, snapshot);
    }
  }

  private async renderAction(
    actionInstance: ActionInstance,
    snapshot: RuntimeSnapshot<ControlState>,
  ): Promise<void> {
    if (snapshot.status === "idle") return;

    if (snapshot.status === "offline" || !snapshot.value) {
      if (actionInstance.isKey()) await setStateIfChanged(actionInstance, 0);
      await setTitleIfChanged(actionInstance, "Offline");
      return;
    }

    if (actionInstance.isKey()) {
      await setStateIfChanged(actionInstance, favoriteStateFor(snapshot.value));
    }
    await setTitleIfChanged(actionInstance, favoriteTitleFor(snapshot.value));
  }
}

function logRenderFailure(err: unknown): void {
  // These renders are deliberately not awaited by their callers. Without this
  // any rejection would surface as an unhandled promise rejection and can take
  // the plugin process down; the SDK's own settings request even rejects with
  // a plain string rather than an Error.
  streamDeck.logger.warn(`favorite render failed: ${err instanceof Error ? err.message : String(err)}`);
}
