import streamDeck, {
  action,
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { control } from "../control-client";
import { toggleStateFor, toggleTitleFor } from "../presenters/control";
import { forgetAction, setStateIfChanged, setTitleIfChanged } from "../render-cache";
import { controlRuntime, type RuntimeSnapshot } from "../runtime/control-runtime";
import type { ControlState } from "../control/contracts";

type ActionInstance = WillAppearEvent["action"];

@action({ UUID: "de.nichtlegacy.ilovemusic.toggle" })
export class ToggleAction extends SingletonAction {
  private unsubscribe: (() => void) | undefined;
  private visible = 0;

  override onWillAppear(ev: WillAppearEvent): void {
    this.visible += 1;
    if (!this.unsubscribe) {
      this.unsubscribe = controlRuntime.subscribeState((snapshot) => {
        void this.renderSnapshot(snapshot).catch(logRenderFailure);
      });
    }

    // subscribeState pushes the current snapshot only to the listener it just
    // registered, and that listener exists only for the first visible key. A
    // second key, or one returning from a page switch after onWillDisappear
    // cleared its cache entry, would otherwise show the manifest default until
    // the next poll tick. Paint it from the snapshot we already hold.
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
      await control.toggle();
    } catch (err) {
      streamDeck.logger.warn(`toggle failed: ${(err as Error).message}`);
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
      await setStateIfChanged(actionInstance, toggleStateFor(snapshot.value));
    }
    await setTitleIfChanged(actionInstance, toggleTitleFor(snapshot.value));
  }
}

function logRenderFailure(err: unknown): void {
  // These renders are deliberately not awaited by their callers. Without this
  // any rejection would surface as an unhandled promise rejection and can take
  // the plugin process down; the SDK's own settings request even rejects with
  // a plain string rather than an Error.
  streamDeck.logger.warn(`toggle render failed: ${err instanceof Error ? err.message : String(err)}`);
}
