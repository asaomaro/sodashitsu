import { MarkdownView, type DocumentRow } from "./document.js";
import { stringWidth } from "../render/width.js";
import type { KeyInput } from "@sodashitsu/client-core";
import { clientErrorMessage, errorCodeOf } from "@sodashitsu/client-core";
import {
  loadSummarySettings,
  type ConversationMessage,
  type ConversationSummary,
  type PastAgentSession,
} from "@sodashitsu/protocol";
import type { UiState } from "../model/UiState.js";
import type { PrefsModel } from "../model/PrefsModel.js";
import type { SessionModel } from "../model/SessionModel.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { plainText } from "./SubagentList.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isDown,
  isUp,
  isEsc,
  isEnter,
  wrapText,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import type { Rect } from "../render/Screen.js";

export class ConversationDialog implements Overlay {
  private readonly markdown = new MarkdownView();
  private messages: ConversationMessage[] = [];
  private sessions: PastAgentSession[] = [];
  private selected = 0;
  private scroll = 0;
  private detail: string | null = null;
  private next: number | null = 0;
  private busy = false;
  private dead = false;
  private error = "";
  private rect: Rect | null = null;
  private hits: { y: number; index: number }[] = [];
  constructor(
    private readonly mode: "messages" | "summary" | "sessions",
    private readonly paneId: string | null,
    private readonly ui: UiState,
    private readonly conn: RequestPort,
    private readonly prefs: PrefsModel,
    private readonly model: SessionModel,
    private readonly redraw: () => void,
    private readonly focus: (id: string) => void,
    private readonly jump: (paneId: string, text: string) => void,
  ) {
    if (mode !== "summary") void this.load();
    else void this.cached();
  }
  private async load() {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      if (this.mode === "sessions") {
        const r = await this.conn.request("agent.sessions", { query: "", limit: 100 });
        if (!this.dead) {
          this.sessions = r.sessions;
          if (r.partial) this.error = "探索上限内のセッションです。";
        }
      } else if (this.paneId && this.next !== null) {
        const r = await this.conn.request("agent.conversation", {
          paneId: this.paneId,
          offset: this.next,
        });
        if (!this.dead) {
          this.messages.push(...r.messages);
          this.next = r.nextOffset;
          if (r.partial) this.error = "一部の記録のみ表示しています。";
        }
      }
    } catch {
      if (!this.dead) this.error = "会話記録を取得できません。";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private summaryText(r: ConversationSummary) {
    return (
      (r.partial ? "記録の一部を省略して要約しています。\n" : "") +
      (r.stale ? "未反映の会話記録があります。\n" : "") +
      (r.updatedAt ? "更新: " + new Date(r.updatedAt).toLocaleString() + "\n" : "") +
      r.kind +
      " · " +
      (r.model || "既定モデル") +
      "\n\n" +
      r.text
    );
  }
  private async cached() {
    if (!this.paneId) return;
    try {
      const r = await this.conn.request("agent.summary_cached", { paneId: this.paneId, offset: 0 });
      if (!this.dead && !this.busy && r.summary) {
        this.detail = this.summaryText(r.summary);
        this.redraw();
      }
    } catch {
      /* Manual generation remains available. */
    }
  }
  private async summarize(mode: "update" | "rebuild" = "update") {
    if (!this.paneId || this.busy) return;
    this.busy = true;
    this.error = "";
    this.redraw();
    try {
      const r = await this.conn.request("agent.summary", {
        paneId: this.paneId,
        settings: { ...loadSummarySettings(this.prefs.shared.summarySettings), sessionId: "" },
        mode,
      });
      if (!this.dead) {
        this.detail = this.summaryText(r);
        this.scroll = 0;
      }
    } catch (e) {
      if (!this.dead)
        this.error =
          errorCodeOf(e) === "summary_model_unavailable"
            ? clientErrorMessage("summary_model_unavailable")
            : "要約できません。設定・ログインを確認してください。";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private users() {
    return this.messages.filter((m) => m.role === "user");
  }
  private async resume() {
    const row = this.sessions[this.selected],
      source = this.model.focusedPaneId;
    if (!row || !source || this.busy) return;
    this.busy = true;
    this.redraw();
    try {
      const r = await this.conn.request("pane.split", {
        paneId: source,
        direction: "right",
        ...(row.cwd ? { newCwd: { policy: "path", path: row.cwd } } : {}),
      });
      const begin = Date.now();
      while (!this.dead) {
        try {
          await this.conn.request("agent.resume", {
            paneId: r.pane.id,
            kind: row.kind,
            sessionId: row.sessionId,
          });
          if (!this.dead) {
            this.focus(r.pane.id);
            this.ui.setScreen("base");
            this.ui.closeDialog();
          }
          break;
        } catch (e) {
          if ((e as { code?: string }).code !== "agent_pane_busy" || Date.now() - begin > 10000)
            throw e;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    } catch {
      if (!this.dead) this.error = "再開できません。新しいペインの起動条件を確認してください。";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private openSelected() {
    if (this.mode === "summary") {
      void this.cached();
      return;
    }
    if (this.mode === "sessions") {
      void this.resume();
      return;
    }
    const selected = this.users()[this.selected];
    if (!selected) return;
    if (this.paneId) this.jump(this.paneId, selected.text);
    const index = this.messages.findIndex((m) => m.id === selected.id);
    this.detail = this.messages
      .slice(index)
      .map((m) => (m.role === "user" ? "あなた" : "エージェント") + "\n" + m.text)
      .join("\n\n");
    this.scroll = 0;
  }
  handleKey(k: KeyInput): void {
    if (isEsc(k)) {
      if (this.detail) {
        this.detail = null;
        this.scroll = 0;
      } else this.cancel();
      return;
    }
    if (k.key === " " || k.key === "Space") {
      this.openSelected();
      return;
    }
    if (
      this.mode !== "sessions" &&
      (isEnter(k) || (this.mode === "summary" && (k.key === "r" || k.key === "R")))
    ) {
      void this.summarize(k.key === "R" ? "rebuild" : "update");
      return;
    }
    if (this.detail) {
      if (isUp(k)) this.scroll = Math.max(0, this.scroll - 1);
      else if (isDown(k)) this.scroll++;
      return;
    }
    const count = this.mode === "sessions" ? this.sessions.length : this.users().length;
    if (isUp(k)) this.selected = Math.max(0, this.selected - 1);
    else if (isDown(k)) this.selected = Math.min(count - 1, this.selected + 1);
    else if (k.key === "r" || k.key === "n") void this.load();
    else if (isEnter(k)) this.openSelected();
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "down" && ev.button === 0 && !this.detail) {
      const hit = this.hits.find((h) => h.y === ev.y);
      if (hit) {
        this.selected = hit.index;
        this.openSelected();
      }
    }
    if (ev.action === "wheel")
      this.handleKey({
        key: ev.button === 65 ? "ArrowDown" : "ArrowUp",
        code: "",
        type: "keydown",
        composing: false,
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      });
    return true;
  }
  cancel() {
    this.ui.closeDialog();
  }
  dispose() {
    this.dead = true;
  }
  render({ grid, theme }: OverlayRenderContext) {
    this.hits = [];
    this.rect = centeredRect(grid, grid.w - 2, grid.h - 2);
    const c = dialogColors(theme),
      area = drawBox(
        grid,
        this.rect,
        c,
        this.mode === "messages"
          ? "送信メッセージ"
          : this.mode === "summary"
            ? "会話の要約"
            : "過去のセッション",
      );
    const rows = this.detail
      ? wrapText(plainText(this.detail), area.w)
      : this.mode === "summary"
        ? ["Enterで要約を生成。専用セッションは自動管理します。"]
        : this.mode === "sessions"
          ? this.sessions.map((r) => `${r.kind} · ${r.title} · ${r.cwd ?? ""}`)
          : this.users().map((m) => (m.at ? m.at + " " : "") + m.text.replace(/\s+/g, " "));
    const start = this.detail
      ? Math.min(this.scroll, Math.max(0, rows.length - area.h + 2))
      : Math.max(0, this.selected - area.h + 3);
    const rich:DocumentRow[]|null = this.detail ? this.markdown.render(this.detail,area.w) : null;
    const visibleStart = rich ? Math.min(this.scroll, Math.max(0,rich.length-area.h+2)) : start;
    (rich ?? rows.map(text=>[{text,attrs:0}])).slice(visibleStart,visibleStart+area.h-2).forEach((spans, i) => {
      const text=spans.map(s=>s.text).join("");
      if (!this.detail) this.hits.push({ y: area.y + i, index: start + i });
      if(rich){let x=area.x;for(const s of spans){grid.text(x,area.y+i,s.text,c.fg,c.bg,s.attrs,Math.max(0,area.x+area.w-x));x+=stringWidth(s.text);}return;}
      grid.text(
        area.x,
        area.y + i,
        plainText(text),
        c.fg,
        !this.detail && start + i === this.selected ? c.active : c.bg,
        0,
        area.w,
      );
    });
    grid.text(
      area.x,
      area.y + area.h - 2,
      this.busy ? "処理中…" : this.error,
      c.dim,
      c.bg,
      0,
      area.w,
    );
    grid.text(
      area.x,
      area.y + area.h - 1,
      this.mode === "summary"
        ? "↑↓スクロール・Enter要約・Space開く・Shift+R作り直す・Esc戻る"
        : this.mode === "messages"
          ? "↑↓選択・Enter要約・Space/クリック開く・n続き・Esc戻る"
          : "↑↓選択・Enter/Space再開・n続き・Esc戻る",
      c.dim,
      c.bg,
      0,
      area.w,
    );
    return hiddenCursor();
  }
}
