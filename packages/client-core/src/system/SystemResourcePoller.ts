import type { SystemResources } from "@sodashitsu/protocol";
/** Poll only while visible and connected. A closed generation cannot update a new screen. */
export class SystemResourcePoller {
  private active = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private fetch: () => Promise<SystemResources>,
    private changed: (data: SystemResources | undefined, failed: boolean) => void,
  ) {}
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.generation++;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (active) void this.poll(this.generation);
    else this.changed(undefined, false);
  }
  private async poll(generation: number) {
    try {
      const data = await this.fetch();
      if (this.active && this.generation === generation) this.changed(data, false);
    } catch {
      if (this.active && this.generation === generation) this.changed(undefined, true);
    }
    if (this.active && this.generation === generation)
      this.timer = setTimeout(() => void this.poll(generation), 2000);
  }
}
