/**
 * Remembers each visible action instance's settings so a render never has to
 * ask Stream Deck for them.
 *
 * `action.getSettings()` is a WebSocket round-trip, and Stream Deck answers it
 * with a `didReceiveSettings` message that the SDK routes back into the
 * plugin's own `onDidReceiveSettings` handler. Suppressing that echo requires
 * `useExperimentalMessageIdentifiers`, which is only available from Stream Deck
 * 7.1 and off by default.
 *
 * Calling it from a poll tick therefore cost a request per key per tick and
 * triggered a second, unasked-for render. For Now Playing that echoed render
 * carried no artwork and blanked the key image.
 *
 * Every event that delivers settings — `willAppear`, `didReceiveSettings` —
 * feeds this cache instead.
 */
export class SettingsCache<T> {
  private readonly byActionId = new Map<string, T>();

  remember(actionId: string, settings: T): T {
    this.byActionId.set(actionId, settings);
    return settings;
  }

  recall(actionId: string): T | undefined {
    return this.byActionId.get(actionId);
  }

  forget(actionId: string): void {
    this.byActionId.delete(actionId);
  }

  get size(): number {
    return this.byActionId.size;
  }
}
