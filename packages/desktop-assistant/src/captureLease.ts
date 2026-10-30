import { randomUUID } from "node:crypto";
export interface CaptureSource {
  id: string;
  name: string;
  display_id: string;
}
/** Enumeration contains no pixels. Only the explicitly selected source can be granted once. */
export class CaptureLease<T extends CaptureSource> {
  private lease: {
    owner: number;
    token: string;
    expires: number;
    phase: "listing" | "listed" | "approved" | "stream";
    sources: T[];
  } | null = null;
  private busy = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private listSources: () => Promise<T[]>,
    private expired: (owner: number, active: boolean) => void,
    private now = () => performance.now(),
  ) {}
  async list(owner: number) {
    this.expire();
    if (this.busy || this.lease) throw Error("前の画面選択を中止してから始めてください。");
    this.busy = true;
    const generation = ++this.generation;
    const token = randomUUID();
    this.lease = { owner, token, expires: this.now() + 30_000, phase: "listing", sources: [] };
    this.arm();
    try {
      const sources = await this.listSources();
      this.expire();
      if (generation !== this.generation || !this.lease) return null;
      this.lease.sources = sources.slice(0, 128);
      this.lease.phase = "listed";
      return {
        token,
        sources: this.lease.sources.map((source) => ({
          id: source.id,
          name: source.name.slice(0, 200),
        })),
      };
    } catch (error) {
      if (generation === this.generation) this.cancel(owner);
      throw error;
    } finally {
      this.busy = false;
    }
  }
  approve(owner: number, token: string, id: string) {
    const lease = this.require(owner, token, "listed");
    if (!lease.sources.some((source) => source.id === id))
      throw Error("選択した画面が見つかりません。");
    lease.sources = lease.sources.filter((source) => source.id === id);
    lease.phase = "approved";
    return { token };
  }
  permits(owner: number) {
    this.expire();
    return this.lease?.owner === owner && ["approved", "stream"].includes(this.lease.phase);
  }
  take(owner: number): T {
    this.expire();
    const lease = this.lease;
    if (!lease || lease.owner !== owner || lease.phase !== "approved")
      throw Error("画面取得の許可が失効しました。");
    lease.phase = "stream";
    return lease.sources[0]!;
  }
  consume(owner: number, token: string) {
    this.require(owner, token, "stream");
    this.cancel(owner, token);
  }
  cancel(owner?: number, token?: string): boolean {
    const lease = this.lease;
    if (
      !lease ||
      (owner !== undefined && lease.owner !== owner) ||
      (token !== undefined && lease.token !== token)
    )
      return false;
    const active = ["approved", "stream"].includes(lease.phase);
    this.lease = null;
    ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return active;
  }
  private require(owner: number, token: string, phase: string) {
    this.expire();
    const lease = this.lease;
    if (!lease || lease.owner !== owner || lease.token !== token || lease.phase !== phase)
      throw Error("画面選択の期限または対象が変わりました。");
    return lease;
  }
  private expire() {
    const lease = this.lease;
    if (!lease || this.now() < lease.expires) return;
    const active = this.cancel();
    this.expired(lease.owner, active);
  }
  private arm() {
    this.timer = setTimeout(
      () => {
        this.expire();
        if (this.lease) this.arm();
      },
      Math.max(1, (this.lease?.expires ?? this.now()) - this.now()),
    );
  }
}
