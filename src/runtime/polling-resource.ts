const OFFLINE_GRACE_MS = 15000;

export type ResourceStatus = "idle" | "live" | "stale" | "offline";

export type RuntimeSnapshot<T> = {
  status: ResourceStatus;
  value: T | null;
  updatedAt?: number;
  error?: Error;
};

type Listener<T> = (snapshot: RuntimeSnapshot<T>) => void;

export class PollingResource<T> {
  private snapshot: RuntimeSnapshot<T> = { status: "idle", value: null };
  private listeners = new Set<Listener<T>>();
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<RuntimeSnapshot<T>> | undefined;

  constructor(
    private readonly load: () => Promise<T>,
    private readonly pollIntervalMs: number,
  ) {}

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);

    if (this.listeners.size === 1) {
      void this.refresh();
      this.timer = setInterval(() => {
        void this.refresh();
      }, this.pollIntervalMs);
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }

  getSnapshot(): RuntimeSnapshot<T> {
    return this.snapshot;
  }

  /**
   * Fetches the resource and publishes the result to every subscriber.
   *
   * Concurrent callers normally share one request. Pass `force` after a
   * mutation: a request that was already in flight was sent before the change
   * and would report the old state, so waiting for it and then asking again is
   * the only way to observe the result.
   */
  async refresh(options: { force?: boolean } = {}): Promise<RuntimeSnapshot<T>> {
    if (this.inFlight && options.force) {
      await this.inFlight.catch(() => undefined);
    }

    if (this.inFlight) return this.inFlight;

    this.inFlight = this.refreshInternal().finally(() => {
      this.inFlight = undefined;
    });

    return this.inFlight;
  }

  private async refreshInternal(): Promise<RuntimeSnapshot<T>> {
    try {
      const value = await this.load();
      this.snapshot = {
        status: "live",
        value,
        updatedAt: Date.now(),
      };
    } catch (error) {
      const err = toError(error);
      const hasFreshValue = this.snapshot.updatedAt !== undefined && Date.now() - this.snapshot.updatedAt < OFFLINE_GRACE_MS;
      this.snapshot = {
        status: hasFreshValue && this.snapshot.value !== null ? "stale" : "offline",
        value: this.snapshot.value,
        updatedAt: this.snapshot.updatedAt,
        error: err,
      };
    }

    for (const listener of this.listeners) {
      listener(this.snapshot);
    }

    return this.snapshot;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
