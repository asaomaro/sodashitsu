import { DesktopPointerWitness } from "./DesktopPointerWitness.js";
/** The helper's stderr contains arbitrary diagnostics. Accept only the private
 * ASCII ACK prefix, after negotiation, for a submitted input still outstanding. */
export class DesktopInputAcks {
  enabled = false;
  pointerEnabled = false;
  private line = "";
  private discard = false;
  private pending = new Map<number, false | "down" | "cancelled">();
  constructor(
    private acknowledge: (seq: number) => void,
    private pointer?: (seq: number, witness: DesktopPointerWitness) => void,
  ) {}
  submitted(seq: number, pointerCandidate = false) {
    this.pending.set(seq, pointerCandidate ? "down" : false);
    if (this.pending.size > 64) this.pending.delete(this.pending.keys().next().value!);
  }
  invalidatePointers() {
    for (const [seq, candidate] of this.pending)
      if (candidate === "down") this.pending.set(seq, "cancelled");
  }
  ack(seq: number, witness?: unknown) {
    if (!this.pending.has(seq)) return;
    const candidate = this.pending.get(seq);
    let proof: DesktopPointerWitness | undefined;
    if (witness !== undefined) {
      if (!this.pointerEnabled || !candidate) return;
      const parsed = DesktopPointerWitness.safeParse(witness);
      if (!parsed.success) return;
      if (candidate === "down") proof = parsed.data;
    }
    this.pending.delete(seq);
    if (proof) this.pointer?.(seq, proof);
    this.acknowledge(seq);
  }
  push(bytes: Buffer) {
    for (const byte of bytes) {
      if (byte === 10) {
        if (!this.discard && this.enabled) {
          if (this.pointerEnabled) {
            const proof =
              /^SODA_DESKTOP_POINTER_ACK ([1-9][0-9]{0,15}) ([a-f0-9-]{36}) (-?[0-9]{1,10}) (-?[0-9]{1,10}) (-?[0-9]{1,16}) ([1-9][0-9]{0,9})\r?$/.exec(
                this.line,
              );
            if (proof) {
              const seq = Number(proof[1]);
              if (Number.isSafeInteger(seq))
                this.ack(seq, {
                  epoch: proof[2],
                  x: Number(proof[3]),
                  y: Number(proof[4]),
                  window: Number(proof[5]),
                  pid: Number(proof[6]),
                });
            }
          }
          const match = /^SODA_DESKTOP_INPUT_ACK ([1-9][0-9]{0,15})\r?$/.exec(this.line);
          if (match) {
            const seq = Number(match[1]);
            if (Number.isSafeInteger(seq)) this.ack(seq);
          }
        }
        this.line = "";
        this.discard = false;
      } else if (!this.discard) {
        if (this.line.length >= (this.pointerEnabled ? 192 : 96) || byte > 127) {
          this.line = "";
          this.discard = true;
        } else this.line += String.fromCharCode(byte);
      }
    }
  }
}
