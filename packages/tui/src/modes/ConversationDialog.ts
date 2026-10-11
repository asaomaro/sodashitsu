import type { KeyInput } from "@sodashitsu/client-core";
import {
  loadSummarySettings,
  type ConversationMessage,
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
  private async summarize() {
    if (!this.paneId || this.busy) return;
    this.busy = true;
    this.redraw();
    try {
      const r = await this.conn.request("agent.summary", {
        paneId: this.paneId,
        settings: loadSummarySettings(this.prefs.shared.summarySettings),
      });
      if (!this.dead) {
        this.detail = r.text + "\n\n要約専用セッションID: " + (r.sessionId ?? "不明");
        this.scroll = 0;
      }
    } catch {
      if (!this.dead) this.error = "要約できません。設定・ログインを確認してください。";
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
  handleKey(k: KeyInput): void {
    if (isEsc(k)) {
      if (this.detail) {
        this.detail = null;
        this.scroll = 0;
      } else this.cancel();
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
    else if (isEnter(k)) {
      if (this.mode === "summary") void this.summarize();
      else if (this.mode === "sessions") void this.resume();
      else {
        const selected = this.users()[this.selected];
        if (selected) {
          if (this.paneId) this.jump(this.paneId, selected.text);
          const index = this.messages.findIndex((m) => m.id === selected.id);
          this.detail = this.messages
            .slice(index)
            .map((m) => (m.role === "user" ? "あなた" : "エージェント") + "\n" + m.text)
            .join("\n\n");
          this.scroll = 0;
        }
      }
    }
  }
  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "down" && ev.button === 0 && !this.detail) {
      const hit = this.hits.find((h) => h.y === ev.y);
      if (hit) {
        this.selected = hit.index;
        this.handleKey({
          key: "Enter",
          code: "Enter",
          type: "keydown",
          composing: false,
          ctrl: false,
          alt: false,
          shift: false,
          meta: false,
        });
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
    this.rect = centeredRect(grid, Math.min(110, grid.w - 2), Math.min(30, grid.h - 2));
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
        ? ["Enterで要約を生成。エージェント・モデル・専用セッションは設定で選択します。"]
        : this.mode === "sessions"
          ? this.sessions.map((r) => `${r.kind} · ${r.title} · ${r.cwd ?? ""}`)
          : this.users().map((m) => (m.at ? m.at + " " : "") + m.text.replace(/\s+/g, " "));
    const start = this.detail
      ? Math.min(this.scroll, Math.max(0, rows.length - area.h + 2))
      : Math.max(0, this.selected - area.h + 3);
    rows.slice(start, start + area.h - 2).forEach((text, i) => {
      if (!this.detail) this.hits.push({ y: area.y + i, index: start + i });
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
      "↑↓選択/スクロール・Enter表示/実行・n続き・Esc戻る",
      c.dim,
      c.bg,
      0,
      area.w,
    );
    return hiddenCursor();
  }
}
