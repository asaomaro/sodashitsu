import { CodexRecordEnvelope } from "./CodexRecordEnvelope.js";
import type { NativeSubagentRecords } from "./NativeSubagentRecords.js";
const MAX_LINE = 256 * 1024;
/** Retains at most one ordinary line; oversized non-child JSON is validated and discarded. */
export class CodexSubagentStream {
  private pieces: Buffer[] = [];
  private size = 0;
  private envelope: CodexRecordEnvelope | undefined;
  invalid = false;
  get partial(): boolean { return this.size !== 0; }
  consume(bytes: Buffer, fold: NativeSubagentRecords): void {
    let at = 0;
    while (at < bytes.length && !this.invalid) {
      const newline = bytes.indexOf(10, at), end = newline < 0 ? bytes.length : newline;
      const piece = bytes.subarray(at, end);
      if (this.envelope) {
        if (!this.envelope.feed(piece)) this.invalid = true;
      } else if (this.size + piece.length <= MAX_LINE) {
        // Copy slices so a tiny trailing fragment cannot retain a full 4MiB input allocation.
        if (piece.length) this.pieces.push(Buffer.from(piece));
      } else {
        this.envelope = new CodexRecordEnvelope();
        for (const previous of this.pieces) if (!this.envelope.feed(previous)) this.invalid = true;
        this.pieces = [];
        if (!this.envelope.feed(piece) || !this.envelope.irrelevant) this.invalid = true;
      }
      this.size += piece.length;
      if (newline < 0 || this.invalid) return;
      if (this.envelope) { if (!this.envelope.finish()) this.invalid = true; else fold.consume(null); }
      else if (this.size) {
        try { fold.consume(JSON.parse(Buffer.concat(this.pieces, this.size).toString("utf8"))); }
        catch { this.invalid = true; }
      }
      this.pieces = []; this.size = 0; this.envelope = undefined;
      at = end + 1;
    }
  }
}
