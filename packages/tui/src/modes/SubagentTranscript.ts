import type { SubagentTranscriptEntry } from "@sodashitsu/protocol";
import type { RequestPort } from "../term/PaneRegistry.js";
import { plainText } from "./SubagentList.js";
import { wrapText } from "./overlay.js";

/** A bounded, read-only child log. The caller owns the current parent/proof/connection scope. */
export class SubagentTranscript {
  private rows: SubagentTranscriptEntry[] = [];
  private offset: number | undefined;
  private dead = false;
  private busy = false;
  private omitted = false;
  private note = "読み込んでいます…";
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    readonly agentId: string,
    readonly title: string,
    private readonly paneId: string,
    private readonly conn: RequestPort,
    private readonly scope: () => string | null,
    private readonly openedScope: string,
    private readonly redraw: () => void,
  ) {
    this.timer = setInterval(() => void this.poll(), 1500);
    this.timer.unref?.();
    void this.poll();
  }
  valid(): boolean {
    if (this.dead || this.scope() !== this.openedScope) {
      this.dispose();
      return false;
    }
    return true;
  }
  private async poll(): Promise<void> {
    if (this.busy || !this.valid()) return;
    this.busy = true;
    try {
      const result = await this.conn.request("agent.subagent_transcript", {
        paneId: this.paneId, agentId: this.agentId,
        ...(this.offset !== undefined ? { offset: this.offset } : {}),
      });
      if (!this.valid()) return;
      this.offset = result.offset;
      if (result.reset) { this.rows = []; this.omitted = false; }
      this.omitted ||= !!result.omittedBefore || !!result.clipped || result.entries.some(entry=>entry.truncated);
      if (result.status === "ok") {
        this.rows.push(...result.entries);
        // The Web reader keeps at most 800 entries; additionally cap retained text at one API read (1 MiB).
        let chars = this.rows.reduce((n, row) => n + row.text.length + (row.kind==="tool"?row.name.length:0), 0);
        while (this.rows.length > 800 || chars > 1024 * 1024) {
          const removed=this.rows.shift()!;chars -= removed.text.length+(removed.kind==="tool"?removed.name.length:0);
          this.omitted = true;
        }
        this.note = this.rows.length ? "" : "まだ書かれたものがありません";
      } else this.note = result.status === "pending" ? "記録がまだありません" : "記録を読めません";
    } catch (error) {
      if((error as {code?:string}|null)?.code==="not_found"){
        this.dispose();this.redraw();return;
      }
      if (this.valid()) this.note = "会話記録を取得できません";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  lines(width: number): string[] {
    if (!this.valid()) return ["記録の参照が無効になりました。Escで情報へ戻る"];
    return [
      ...wrapText(plainText(this.title), width),
      "読むだけ。指示はメインエージェントへ送ってください",
      ...(this.omitted ? ["長い記録の一部を省いています"] : []),
      ...this.rows.flatMap(row => wrapText(plainText(`${row.kind === "prompt" ? "指示" : row.kind === "say" ? "発言" : row.kind === "tool" ? `道具 ${row.name}` : "結果"}: ${row.text}`), width)),
      ...(this.note ? [this.note] : []),
      "↑↓ スクロール · Esc 情報へ戻る",
    ];
  }
  dispose(): void {
    this.dead = true;
    clearInterval(this.timer);
    this.rows = [];
  }
}
