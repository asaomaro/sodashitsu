import { randomUUID } from "node:crypto";
export type DesktopInteractiveResource = "control" | "clipboard" | "microphone";
export type DesktopReleaseReceipt = { id: string; epoch: string };
type Completion = {
  resolve(receipt: DesktopReleaseReceipt): void;
  reject(error: Error): void;
};
type PendingRelease<Source> = {
  source: Source;
  id: string;
  epoch: string;
  until: number;
  timer: ReturnType<typeof setTimeout>;
  sent: boolean;
  acknowledged: boolean;
  completion?: Completion;
};
const kinds: DesktopInteractiveResource[] = ["control", "clipboard", "microphone"];
/** One PC-wide owner per interactive resource; capture helpers may differ. */
export class DesktopInteractiveOwner<Member, Source> {
  private owners = new Map<
    DesktopInteractiveResource,
    { member: Member; source: Source; epoch: string }
  >();
  private pending = new Map<DesktopInteractiveResource, PendingRelease<Source>>();
  private failed = false;
  private ended = false;
  private last = -Infinity;
  constructor(
    private hooks: {
      send(source: Source, id: string, resource: DesktopInteractiveResource): boolean;
      begin?(source: Source, epoch: string, resource: DesktopInteractiveResource): boolean;
      clean?(source: Source, epoch: string): boolean;
      idle(source: Source): void;
      fault(): void;
      now?: () => number;
    },
  ) {}
  get faulted() {
    return this.failed;
  }
  private current(): boolean {
    if (this.failed || this.ended) return false;
    let now: number;
    try {
      now = (this.hooks.now ?? performance.now.bind(performance))();
    } catch {
      this.fail();
      return false;
    }
    if (!Number.isFinite(now) || now < this.last) {
      this.fail();
      return false;
    }
    this.last = now;
    for (const pending of this.pending.values())
      if (now >= pending.until) {
        this.fail();
        return false;
      }
    return true;
  }
  acquire(member: Member, source: Source, resource: DesktopInteractiveResource): boolean {
    if (!kinds.includes(resource) || !this.current() || this.pending.has(resource)) return false;
    const owner = this.owners.get(resource);
    if (owner) return owner.member === member && owner.source === source;
    const candidate = { member, source, epoch: randomUUID() };
    this.owners.set(resource, candidate);
    try {
      if (this.hooks.begin && !this.hooks.begin(source, candidate.epoch, resource)) {
        this.fail();
        return false;
      }
    } catch {
      this.fail();
      return false;
    }
    return this.current() && this.owners.get(resource) === candidate;
  }
  owns(member: Member, resource: DesktopInteractiveResource): boolean {
    return this.current() && this.owners.get(resource)?.member === member;
  }
  identity(
    member: Member,
    resource: DesktopInteractiveResource,
  ): { source: Source; epoch: string } | undefined {
    if (!this.current()) return;
    const owner = this.owners.get(resource);
    if (owner?.member === member) return { source: owner.source, epoch: owner.epoch };
    return;
  }
  release(member: Member, resource: DesktopInteractiveResource): void {
    this.beginRelease(member, resource);
  }
  /** Resolves only for the exact physical helper/epoch cleanup ACK. No write,
   * ordinary input ACK, source disappearance or timeout substitutes for it. */
  releaseConfirmed(
    member: Member,
    resource: DesktopInteractiveResource,
  ): Promise<DesktopReleaseReceipt> {
    return new Promise((resolve, reject) => {
      if (!this.beginRelease(member, resource, { resolve, reject }))
        reject(Error("Desktop resource is not owned or cannot be released"));
    });
  }
  private beginRelease(
    member: Member,
    resource: DesktopInteractiveResource,
    completion?: Completion,
  ): boolean {
    if (!this.current()) return false;
    const owner = this.owners.get(resource);
    if (owner?.member !== member) return false;
    this.owners.delete(resource);
    const id = randomUUID(),
      timer = setTimeout(() => this.tick(), 5000);
    timer.unref();
    const pending = {
      source: owner.source,
      id,
      epoch: owner.epoch,
      until: this.last + 5000,
      timer,
      sent: false,
      acknowledged: false,
      ...(completion ? { completion } : {}),
    };
    this.pending.set(resource, pending);
    try {
      if (!this.hooks.send(owner.source, id, resource)) {
        this.fail();
        return false;
      }
      if (!this.current() || this.pending.get(resource) !== pending) return false;
      pending.sent = true;
      if (pending.acknowledged) this.completeRelease(resource, pending);
      return true;
    } catch {
      this.fail();
      return false;
    }
  }
  private completeRelease(resource: DesktopInteractiveResource, pending: PendingRelease<Source>) {
    clearTimeout(pending.timer);
    this.pending.delete(resource);
    pending.completion?.resolve({ id: pending.id, epoch: pending.epoch });
    this.idle(pending.source);
  }
  releaseAll(member: Member): void {
    for (const resource of kinds) this.release(member, resource);
  }
  acknowledge(source: Source, id: string): boolean {
    if (!this.current()) return false;
    for (const [resource, pending] of this.pending)
      if (pending.source === source && pending.id === id) {
        if (pending.acknowledged) return false;
        pending.acknowledged = true;
        if (pending.sent) this.completeRelease(resource, pending);
        return true;
      }
    return false;
  }
  private idle(source: Source) {
    queueMicrotask(() => {
      if (!this.failed && !this.ended)
        try {
          this.hooks.idle(source);
        } catch {
          this.fail();
        }
    });
  }
  sourceGone(source: Source): void {
    if (!this.current()) return;
    for (const [resource, owner] of this.owners)
      if (owner.source === source) {
        if (this.hooks.clean?.(source, owner.epoch)) {
          this.owners.delete(resource);
          this.idle(source);
        } else {
          this.fail();
          return;
        }
      }
    for (const pending of [...this.pending.values()])
      if (pending.source === source) {
        if (this.hooks.clean?.(source, pending.epoch)) this.acknowledge(source, pending.id);
        else {
          this.fail();
          return;
        }
      }
  }
  tick(): void {
    this.current();
  }
  private fail(): void {
    if (this.failed || this.ended) return;
    this.failed = true;
    this.owners.clear();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.completion?.reject(Error("Desktop cleanup could not be verified"));
    }
    this.pending.clear();
    queueMicrotask(() => {
      if (!this.ended)
        try {
          this.hooks.fault();
        } catch {
          /* failure stays terminal */
        }
    });
  }
  dispose(): void {
    this.ended = true;
    this.owners.clear();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.completion?.reject(Error("Desktop owner closed"));
    }
    this.pending.clear();
  }
}
