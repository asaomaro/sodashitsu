import type { KeyInput } from "@sodashitsu/client-core";
import type { AgentForkPreviewResult } from "@sodashitsu/protocol";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { TextInput } from "./TextInput.js";
import { centeredRect, dialogColors, drawBox, hiddenCursor, inside, isEnter, isEsc, type Overlay, type OverlayMouse, type OverlayRenderContext } from "./overlay.js";
import type { Rect, CursorState } from "../render/Screen.js";

/** 元の会話をサーバで検算し、同じフォルダ／worktree への分岐を確定する画面。 */
export class AgentForkDialog implements Overlay {
  private branch = new TextInput("");
  private worktree = false;
  private note = true;
  private field = 0;
  private preview: AgentForkPreviewResult | null = null;
  private pending = false;
  private disposed = false;
  private seq = 0;
  private initialized = false;
  private error = "";
  private rect: Rect | null = null;
  constructor(private readonly paneId: string, private readonly ui: UiState, private readonly conn: RequestPort, private readonly renderAgain: () => void, private readonly focus: (id: string) => void) { void this.refresh(); }
  private async refresh(): Promise<void> {
    const seq = ++this.seq;
    this.preview = null;
    try {
      const p = await this.conn.request("agent.fork_preview", { paneId: this.paneId, ...(this.branch.value ? { branch: this.branch.value } : {}) });
      if (this.disposed || seq !== this.seq) return;
      this.preview = p;
      if (!this.initialized && !this.branch.value && p.suggestedBranch) this.branch = new TextInput(p.suggestedBranch);
      this.initialized = true;
      this.error = "";
    } catch (e) { if (!this.disposed && seq === this.seq) this.error = String(e); }
    if (!this.disposed) this.renderAgain();
  }
  private async submit(): Promise<void> {
    if (this.pending || !this.preview?.available || (this.worktree && (!this.preview.worktreeAvailable || this.preview.branchExists || !this.branch.value.trim()))) return;
    this.pending = true; this.renderAgain();
    try {
      const result = await this.conn.request("agent.fork", { paneId: this.paneId, target: this.worktree ? { kind: "worktree", branch: this.branch.value.trim() } : { kind: "same" }, note: this.note });
      if (this.disposed) return;
      this.ui.closeDialog(); this.focus(result.paneId);
      this.ui.toast("fork を起動しました。エージェントの起動状態は新しいペインで確認できます。");
    } catch (e) { if (!this.disposed) this.error = String(e); }
    this.pending = false; if (!this.disposed) this.renderAgain();
  }
  handleKey(k: KeyInput): void {
    if (this.pending) return;
    if (isEsc(k)) return this.cancel();
    if (k.key === "Tab") { this.field = (this.field + (k.shift ? 3 : 1)) % 4; return; }
    if (isEnter(k)) { void this.submit(); return; }
    if (this.field === 0 && [" ", "ArrowLeft", "ArrowRight"].includes(k.key)) { this.worktree = !this.worktree; void this.refresh(); }
    else if (this.field === 2 && k.key === " ") this.note = !this.note;
    else if (this.field === 1) { const before = this.branch.value; this.branch.handleKey(k); if (before !== this.branch.value) void this.refresh(); }
  }
  handlePaste(text: string): void { if (!this.pending && this.field === 1) { this.branch.insert(text); void this.refresh(); } }
  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "down" && ev.button === 0 && !this.pending && this.rect) {
      const row = ev.y - this.rect.y;
      if (row === 1) { this.field = 0; this.worktree = !this.worktree; void this.refresh(); }
      else if (row === 2) this.field = 1;
      else if (row === 3) { this.field = 2; this.note = !this.note; }
      else if (row === this.rect.h - 2) void this.submit();
    }
    return true;
  }
  cancel(): void { if (!this.pending) this.ui.closeDialog(); }
  dispose(): void { this.disposed = true; this.seq++; }
  render({grid,theme}: OverlayRenderContext): CursorState {
    const c = dialogColors(theme); const r = centeredRect(grid, 88, 12); this.rect = r;
    const a = drawBox(grid,r,c,"エージェントの fork");
    const lines = [
      `行き先: ${this.worktree ? "新しい worktree" : "同じフォルダの新しいペイン"}  (Spaceで切り替え)`,
      `ブランチ: ${this.branch.value}`,
      `[${this.note ? "x" : " "}] worktree の作業フォルダをエージェントに知らせる`,
      `元のフォルダ: ${this.preview?.sourceDir ?? "…"}`,
      `作成先: ${this.worktree ? this.preview?.targetPath ?? "…" : this.preview?.sourceDir ?? "…"}`,
      this.error || (this.preview ? (!this.preview.available ? `fork不可: ${this.preview.reason}` : this.worktree && !this.preview.worktreeAvailable ? `worktree不可: ${this.preview.worktreeReason}` : this.preview.branchExists && this.worktree ? "このブランチは既に存在します" : `未コミットの変更: ${this.preview.dirtyCount ?? 0}（worktreeには引き継ぎません）`) : "条件を確認中…"),
    ];
    const branchView = this.branch.view(Math.max(0,a.w-10));
    lines[1] = `ブランチ: ${branchView.text}`;
    lines.forEach((line,i)=>{ if(i<a.h-1) grid.text(a.x,a.y+i,line,c.fg,i===this.field?c.active:c.bg,0,a.w); });
    grid.text(a.x,a.y+a.h-1,this.pending ? "起動中…" : "Enter: fork を実行   Tab: 項目移動   Esc: 閉じる",c.fg,c.bg,0,a.w);
    if (this.field === 1 && !this.pending && a.h > 2) return {visible:true,x:a.x+10+branchView.cursorCol,y:a.y+1,style:"bar",blink:true};
    return hiddenCursor();
  }
}
