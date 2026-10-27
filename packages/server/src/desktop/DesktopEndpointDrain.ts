/** Drain already accepted ciphertext before an authenticated EOF; never extend source authority. */
export class DesktopEndpointDrain {
  private pending = new Set<Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  closing = false;
  constructor(
    private readonly hooks: { active(): boolean; terminal(): Promise<void>; close(): void },
  ) {}
  track(work: Promise<void>): void {
    if (this.closed) {
      void work.catch(() => {});
      return;
    }
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.hooks.close(),
    );
  }
  begin(negotiated: boolean): void {
    if (this.closed || this.closing) return;
    if (!negotiated || !this.hooks.active()) {
      this.hooks.close();
      return;
    }
    this.closing = true;
    this.timer = setTimeout(() => this.hooks.close(), 2000);
    this.timer.unref();
    void Promise.all([...this.pending])
      .then(async () => {
        if (this.closed) return;
        if (!this.hooks.active()) {
          this.hooks.close();
          return;
        }
        await this.hooks.terminal();
      })
      .catch(() => this.hooks.close());
  }
  acknowledge(): void {
    if (this.closing && !this.closed) this.hooks.close();
  }
  dispose(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.pending.clear();
  }
}
