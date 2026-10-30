import { randomUUID } from "node:crypto";
import { localRole } from "./security.js";

export type RecordingPhase = "capturing" | "review";
/** One visible trusted bubble may capture microphone audio after its explicit begin action. */
export class RecordingLease {
  private lease: { token: string; owner: number; phase: RecordingPhase; expires: number } | null =
    null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly expired: (owner: number, phase: RecordingPhase, token: string) => void,
    private readonly now = () => performance.now(),
  ) {}
  begin(owner: number): string {
    this.expire();
    if (this.lease) throw Error("前の録音を停止・破棄してから始めてください。");
    const token = randomUUID();
    this.lease = { token, owner, phase: "capturing", expires: this.now() + 300_000 };
    this.arm();
    return token;
  }
  has(owner?: number): boolean {
    this.expire();
    return !!this.lease && (owner === undefined || owner === this.lease.owner);
  }
  permits(
    owner: number,
    permission: string,
    details: {
      isMainFrame: boolean;
      requestingUrl?: string;
      mediaType?: string;
      mediaTypes?: readonly string[];
    },
  ): boolean {
    this.expire();
    const media = details.mediaTypes ?? (details.mediaType ? [details.mediaType] : []);
    return (
      this.lease?.owner === owner &&
      this.lease.phase === "capturing" &&
      permission === "media" &&
      details.isMainFrame &&
      localRole(details.requestingUrl ?? "") === "bubble" &&
      media.length === 1 &&
      media[0] === "audio" &&
      (details.mediaType === undefined || details.mediaType === "audio")
    );
  }
  stopped(owner: number, token: string): void {
    this.assert(owner, token, "capturing");
    this.lease!.phase = "review";
    this.lease!.expires = this.now() + 300_000;
    this.arm();
  }
  discard(owner: number, token: string): void {
    this.assert(owner, token);
    this.cancel();
  }
  consume(owner: number, token: string): void {
    this.assert(owner, token, "review");
    this.cancel();
  }
  cancel(owner?: number): void {
    if (owner !== undefined && this.lease?.owner !== owner) return;
    this.lease = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private assert(owner: number, token: string, phase?: RecordingPhase): void {
    this.expire();
    if (
      !this.lease ||
      this.lease.owner !== owner ||
      this.lease.token !== token ||
      (phase !== undefined && this.lease.phase !== phase)
    )
      throw Error("録音の期限または対象が変わりました。録音し直してください。");
  }
  private expire(): void {
    const lease = this.lease;
    if (!lease || this.now() < lease.expires) return;
    this.cancel();
    this.expired(lease.owner, lease.phase, lease.token);
  }
  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    const check = () => {
      this.timer = null;
      this.expire();
      if (this.lease) this.arm();
    };
    this.timer = setTimeout(check, Math.max(1, Math.ceil(this.lease!.expires - this.now())));
  }
}
