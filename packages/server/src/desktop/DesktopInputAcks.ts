/** The helper's stderr contains arbitrary diagnostics. Accept only the private
 * ASCII ACK prefix, after negotiation, for a submitted input still outstanding. */
export class DesktopInputAcks {
  enabled = false;
  private line = "";
  private discard = false;
  private pending = new Set<number>();
  constructor(private acknowledge: (seq: number) => void) {}
  submitted(seq: number) {
    this.pending.add(seq);
    if (this.pending.size > 64) this.pending.delete(this.pending.values().next().value!);
  }
  ack(seq: number) {
    if (this.pending.delete(seq)) this.acknowledge(seq);
  }
  push(bytes: Buffer) {
    for (const byte of bytes) {
      if (byte === 10) {
        if (!this.discard && this.enabled) {
          const match = /^SODA_DESKTOP_INPUT_ACK ([1-9][0-9]{0,15})\r?$/.exec(this.line);
          if (match) { const seq=Number(match[1]); if (Number.isSafeInteger(seq)) this.ack(seq); }
        }
        this.line="";this.discard=false;
      } else if (!this.discard) {
        if (this.line.length >= 96 || byte > 127) { this.line="";this.discard=true; }
        else this.line+=String.fromCharCode(byte);
      }
    }
  }
}
