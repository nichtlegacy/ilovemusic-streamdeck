import type { JsonValue } from "@elgato/utils";
import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import { control } from "../control-client";
import { fetchAsDataURL } from "../image-cache";
import { wrapStationTitle } from "../presenters/control";
import { forgetAction, setImageIfChanged, setTitleIfChanged } from "../render-cache";
import { controlRuntime, type RuntimeSnapshot } from "../runtime/control-runtime";
import { normalizeSelectSettings, type SelectSettingsInput } from "../settings/actions";
import { SettingsCache } from "../settings/cache";
import type { DataSourcePayload, DataSourceResult } from "../sdpi";
import type { ControlStation } from "../control/contracts";
import { findStation, offlineStationItems, stationItems } from "../stations/catalog";

@action({ UUID: "de.nichtlegacy.ilovemusic.select" })
export class SelectChannelAction extends SingletonAction<SelectSettingsInput> {
  private unsubscribe: (() => void) | undefined;
  private visible = 0;
  private readonly settings = new SettingsCache<SelectSettingsInput>();

  override async onWillAppear(ev: WillAppearEvent<SelectSettingsInput>): Promise<void> {
    this.settings.remember(ev.action.id, ev.payload.settings);
    this.visible += 1;
    if (!this.unsubscribe) {
      this.unsubscribe = controlRuntime.subscribeStations((snapshot) => {
        void this.renderSnapshot(snapshot).catch(logRenderFailure);
      });
    }

    // The stations resource only polls every 30 seconds, so a key that is not
    // the first visible one would stay blank for up to half a minute without
    // an immediate paint from the snapshot already in memory.
    await this.renderAction(ev.action, ev.payload.settings, controlRuntime.getStationsSnapshot());
  }

  override onWillDisappear(ev: WillDisappearEvent<SelectSettingsInput>): void {
    forgetAction(ev.action.id);
    this.settings.forget(ev.action.id);
    this.visible = Math.max(0, this.visible - 1);
    if (this.visible === 0 && this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SelectSettingsInput>): Promise<void> {
    this.settings.remember(ev.action.id, ev.payload.settings);
    await this.renderAction(ev.action, ev.payload.settings, controlRuntime.getStationsSnapshot());
  }

  override async onKeyDown(ev: KeyDownEvent<SelectSettingsInput>): Promise<void> {
    const id = normalizeSelectSettings(ev.payload.settings).stationId;
    if (!id) {
      await ev.action.showAlert();
      return;
    }
    try {
      await control.select(id);
      await ev.action.showOk();
    } catch (err) {
      streamDeck.logger.warn(`select failed: ${(err as Error).message}`);
      await ev.action.showAlert();
    }
  }

  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, SelectSettingsInput>): Promise<void> {
    if (!isDataSourceRequest(ev.payload, "getStations")) return;

    const snapshot = await controlRuntime.refreshStations();
    const items = stationItemsForSnapshot(snapshot);

    await streamDeck.ui.sendToPropertyInspector({
      event: "getStations",
      items,
    } satisfies DataSourcePayload);
  }

  private async renderSnapshot(snapshot: RuntimeSnapshot<ControlStation[]>): Promise<void> {
    for (const action of this.actions) {
      const settings = this.settings.recall(action.id) ?? await action.getSettings();
      await this.renderAction(action, settings, snapshot);
    }
  }

  private async renderAction(
    actionInstance: DidReceiveSettingsEvent<SelectSettingsInput>["action"],
    settingsInput: SelectSettingsInput,
    snapshot: RuntimeSnapshot<ControlStation[]>,
  ): Promise<void> {
    if (snapshot.status === "idle") return;

    const settings = normalizeSelectSettings(settingsInput);
    const id = settings.stationId;
    if (!id) {
      await setTitleIfChanged(actionInstance, "");
      await setImageIfChanged(actionInstance, undefined);
      return;
    }

    // A configured key must never go blank. Without a station to show, say why:
    // "Offline" when the app is unreachable, otherwise the id is configured but
    // no longer in the catalog.
    if (snapshot.status === "offline") {
      await setTitleIfChanged(actionInstance, "Offline");
      await setImageIfChanged(actionInstance, undefined);
      return;
    }

    const station = findStation(snapshot.value, id);
    if (!station) {
      await setTitleIfChanged(actionInstance, "Unknown");
      await setImageIfChanged(actionInstance, undefined);
      return;
    }

    await setTitleIfChanged(actionInstance, wrapStationTitle(station.name));
    const dataURL = station.iconURL ? await fetchAsDataURL(station.iconURL) : undefined;
    await setImageIfChanged(actionInstance, dataURL);
  }
}

function isDataSourceRequest(payload: JsonValue, event: string): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    "event" in payload &&
    (payload as { event: unknown }).event === event
  );
}

function stationItemsForSnapshot(snapshot: RuntimeSnapshot<ControlStation[]>): DataSourceResult {
  if (snapshot.value && snapshot.value.length > 0) {
    return stationItems(snapshot.value);
  }

  if (snapshot.status === "offline") {
    return offlineStationItems("ILoveMusic app not reachable");
  }

  return [];
}

function logRenderFailure(err: unknown): void {
  // These renders are deliberately not awaited by their callers. Without this
  // any rejection would surface as an unhandled promise rejection and can take
  // the plugin process down; the SDK's own settings request even rejects with
  // a plain string rather than an Error.
  streamDeck.logger.warn(`select channel render failed: ${err instanceof Error ? err.message : String(err)}`);
}
