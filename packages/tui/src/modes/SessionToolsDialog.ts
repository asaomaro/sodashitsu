import type { KeyInput } from "@sodashitsu/client-core";
import type { AgentTodos, SessionNotes, SessionNote } from "@sodashitsu/protocol";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { Rect } from "../render/Screen.js";
import { charWidth, stringWidth } from "../render/width.js";
import { plainText } from "./SubagentList.js";
import { TextInput } from "./TextInput.js";
import { MultilineInput } from "./MultilineInput.js";
import { ScrollBar } from "./ScrollBar.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isEsc,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
export class SessionToolsDialog implements Overlay {
  private data: SessionNotes | null = null;
  private todos: AgentTodos | null = null;
  private selected: string | null = null;
  private title = new TextInput();
  private tags = new TextInput();
  private group = new TextInput();
  private search = new TextInput();
  private body = new MultilineInput();
  private baseline = this.draft();
  private focus = 0;
  private scroll = 0;
  private bodyScroll = 0;
  private bodyOffset = 0;
  private bodyManualScroll = false;
  private deleting = false;
  private busy = false;
  private dead = false;
  private error = "";
  private bodyRect: Rect | null = null;
  private hits: { rect: Rect; run: () => void }[] = [];
  private scrollbar = new ScrollBar();
  private bodyBar = new ScrollBar();
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private readonly mode: "notes" | "todos",
    private readonly paneId: string,
    private readonly ui: UiState,
    private readonly conn: RequestPort,
    private readonly redraw: () => void,
  ) {
    void this.load();
    if (mode === "todos") this.timer = setInterval(() => void this.load(), 5000);
  }
  private draft() {
    return JSON.stringify([this.title.value, this.tags.value, this.group.value, this.body.value]);
  }
  private dirty() {
    return this.draft() !== this.baseline;
  }
  private rows() {
    const q = this.search.value.toLocaleLowerCase();
    return (this.data?.notes ?? [])
      .filter(
        (n) =>
          !q ||
          [n.title, n.group, n.body, ...n.tags].some((s) => s.toLocaleLowerCase().includes(q)),
      )
      .sort((a, b) => a.group.localeCompare(b.group) || b.updatedAt - a.updatedAt);
  }
  private select(n: SessionNote | null) {
    if (this.dirty()) {
      this.error = "未保存です。Ctrl+Sで保存、Ctrl+Dで破棄してください。";
      return;
    }
    this.deleting = false;
    this.error = "";
    this.selected = n?.id ?? null;
    this.title.value = n?.title ?? "";
    this.tags.value = n?.tags.join(", ") ?? "";
    this.group.value = n?.group ?? "";
    this.body.set(n?.body ?? "");
    this.baseline = this.draft();
    this.bodyScroll = 0;
    this.bodyManualScroll = false;
  }
  private async load() {
    if (this.busy || this.dead) return;
    if (this.mode === "notes" && this.dirty()) {
      this.error = "未保存です。保存または破棄してから再読込してください。";
      return;
    }
    this.busy = true;
    this.error = "";
    try {
      if (this.mode === "notes") {
        const r = await this.conn.request("agent.notes", { paneId: this.paneId });
        if (!this.dead) {
          this.data = r;
          this.select(r.notes.find((n) => n.id === this.selected) ?? r.notes[0] ?? null);
        }
      } else {
        const r = await this.conn.request("agent.todos", { paneId: this.paneId });
        if (!this.dead) this.todos = r;
      }
    } catch {
      if (!this.dead)
        this.error = "取得できません。エージェントのセッションと記録を確認してください。";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private async save(remove = false) {
    const d = this.data,
      note = d?.notes.find((n) => n.id === this.selected);
    if (!d || this.busy || (remove && !note)) return;
    this.busy = true;
    this.error = "";
    try {
      const ref = { paneId: this.paneId, kind: d.kind, sessionId: d.sessionId };
      const r =
        remove && note
          ? await this.conn.request("agent.note_delete", {
              ...ref,
              id: note.id,
              revision: note.revision,
            })
          : await this.conn.request("agent.note_save", {
              ...ref,
              ...(note ? { id: note.id, revision: note.revision } : {}),
              title: this.title.value,
              body: this.body.value,
              group: this.group.value,
              tags: this.tags.value
                .split(/[,、]/)
                .map((s) => s.trim())
                .filter(Boolean),
            });
      if (!this.dead) {
        this.data = r;
        this.baseline = this.draft();
        this.select(
          remove
            ? (r.notes[0] ?? null)
            : (r.notes.find((n) => n.id === note?.id) ?? r.notes[r.notes.length - 1] ?? null),
        );
      }
    } catch {
      if (!this.dead)
        this.error =
          "保存できません。入力を控え、セッション切替・別画面での更新を確認してください。";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private confirmDelete() {
    if (this.deleting) {
      this.deleting = false;
      void this.save(true);
    } else {
      this.deleting = true;
      this.error = "削除するにはもう一度［削除］またはCtrl+X。取り消すには別の操作をしてください。";
    }
  }
  canLeave() {
    if (this.busy || this.dirty()) {
      this.ui.toast("未保存です。Ctrl+Sで保存、Ctrl+Dで破棄してください。");
      return false;
    }
    return true;
  }
  cancel() {
    if (this.canLeave()) this.ui.closeDialog();
  }
  dispose() {
    this.dead = true;
    if (this.timer) clearInterval(this.timer);
  }
  cancelInteraction() {
    this.scrollbar.cancel();
    this.bodyBar.cancel();
  }
  handleScrollMouse(ev: OverlayMouse) {
    return this.scrollbar.handleMouse(ev) || this.bodyBar.handleMouse(ev);
  }
  handleKey(k: KeyInput) {
    if (isEsc(k)) {
      this.cancel();
      return;
    }
    if (this.busy) return;
    if (!(k.ctrl && k.key === "x")) {
      if (this.deleting) this.error = "";
      this.deleting = false;
    }
    if (k.ctrl && k.key === "s") {
      if (this.mode === "notes") void this.save();
      return;
    }
    if (k.ctrl && k.key === "d") {
      this.baseline = this.draft();
      this.select(this.data?.notes.find((n) => n.id === this.selected) ?? null);
      this.error = "";
      return;
    }
    if (k.ctrl && k.key === "n") {
      this.select(null);
      this.focus = 2;
      return;
    }
    if (k.ctrl && k.key === "r") {
      void this.load();
      return;
    }
    if (k.ctrl && k.key === "x" && this.selected) {
      this.confirmDelete();
      return;
    }
    if (k.key === "Tab") {
      this.focus = (this.focus + (k.shift ? 5 : 1)) % 6;
      return;
    }
    if (this.mode === "todos") {
      if (k.key === "ArrowDown") this.scroll++;
      if (k.key === "ArrowUp") this.scroll = Math.max(0, this.scroll - 1);
      return;
    }
    if (this.focus === 0) {
      this.search.handleKey(k);
      this.scroll = 0;
    } else if (this.focus === 1) {
      const rows = this.rows(),
        index = Math.max(
          0,
          rows.findIndex((n) => n.id === this.selected),
        );
      if (k.key === "ArrowDown") this.select(rows[Math.min(rows.length - 1, index + 1)] ?? null);
      else if (k.key === "ArrowUp") this.select(rows[Math.max(0, index - 1)] ?? null);
      else if (k.key === "Enter") this.focus = 2;
    } else if (this.focus === 2) this.title.handleKey(k);
    else if (this.focus === 3) this.group.handleKey(k);
    else if (this.focus === 4) this.tags.handleKey(k);
    else {
      this.bodyManualScroll = false;
      this.body.key(k);
    }
  }
  handlePaste(text: string) {
    if (this.busy || this.mode !== "notes") return;
    if (this.focus === 5) {
      this.bodyManualScroll = false;
      this.body.insert(text);
    } else [this.search, this.search, this.title, this.group, this.tags][this.focus]?.insert(text);
  }
  handleMouse(ev: OverlayMouse) {
    if (this.handleScrollMouse(ev)) return true;
    if (ev.action === "wheel") {
      if (this.bodyRect && inside(this.bodyRect, ev.x, ev.y)) {
        this.bodyScroll = Math.max(0, this.bodyScroll + (ev.button === 64 ? -3 : 3));
        this.bodyManualScroll = true;
      } else this.scroll = Math.max(0, this.scroll + (ev.button === 64 ? -3 : 3));
      return true;
    }
    if (
      ev.action === "down" &&
      ev.button === 0 &&
      !this.busy &&
      this.bodyRect &&
      inside(this.bodyRect, ev.x, ev.y)
    ) {
      const lines = this.body.value.split("\n"),
        row = Math.min(lines.length - 1, this.bodyScroll + ev.y - this.bodyRect.y),
        chars = [...lines[row]!];
      let col = Math.min(this.bodyOffset, chars.length),
        width = 0;
      while (
        col < chars.length &&
        width + charWidth(chars[col]!.codePointAt(0)!) <= ev.x - this.bodyRect.x
      ) {
        width += charWidth(chars[col]!.codePointAt(0)!);
        col++;
      }
      this.body.cursor = lines.slice(0, row).reduce((n, line) => n + [...line].length + 1, 0) + col;
      this.focus = 5;
      this.bodyManualScroll = false;
      return true;
    }
    if (ev.action === "down" && ev.button === 0 && !this.busy)
      for (const hit of this.hits)
        if (inside(hit.rect, ev.x, ev.y)) {
          hit.run();
          break;
        }
    return true;
  }
  render({ grid, theme }: OverlayRenderContext) {
    const c = dialogColors(theme),
      r = drawBox(
        grid,
        centeredRect(grid, 110, 32),
        c,
        this.mode === "notes" ? "セッションのメモ" : "エージェントのToDo（参照専用）",
      );
    this.hits = [];
    grid.text(
      r.x,
      r.y,
      this.error ||
        (this.busy
          ? "処理中…"
          : this.mode === "notes"
            ? "Tab:欄移動 Ctrl+N:新規 Ctrl+S:保存 Ctrl+D:破棄 Ctrl+R:再読込"
            : "5秒ごとに更新 · Ctrl+R:再読込"),
      this.error ? c.warn : c.dim,
      c.bg,
      0,
      r.w,
    );
    const button = (x: number, y: number, text: string, run: () => void) => {
      grid.text(x, y, text, c.accent, c.bg, 0, r.w - (x - r.x));
      this.hits.push({ rect: { x, y, w: stringWidth(text), h: 1 }, run });
    };
    if (this.mode === "todos") {
      const rows =
        this.todos?.items.flatMap((n) => [
          (n.status === "completed"
            ? "✓ 完了 "
            : n.status === "in_progress"
              ? "▶ 進行中 "
              : "○ 未着手 ") + plainText(n.text),
          ...(n.description ? [plainText(n.description)] : []),
        ]) ?? [];
      grid.text(
        r.x,
        r.y + 1,
        `完了 ${this.todos?.items.filter((n) => n.status === "completed").length ?? 0} / ${this.todos?.items.length ?? 0}${this.todos?.partial ? " · 一部の記録" : ""}`,
        c.fg,
        c.bg,
        0,
        r.w,
      );
      if (!rows.length) rows.push("このセッションには記録されたToDoがありません。");
      const area = { x: r.x, y: r.y + 2, w: r.w, h: Math.max(0, r.h - 3) };
      this.scroll = Math.min(this.scroll, Math.max(0, rows.length - area.h));
      rows
        .slice(this.scroll, this.scroll + area.h)
        .forEach((line, i) =>
          grid.text(
            area.x,
            area.y + i,
            line,
            line.startsWith("✓")
              ? theme.ui("--soda-state-done")
              : line.startsWith("▶")
                ? theme.ui("--soda-state-working")
                : c.fg,
            c.bg,
            0,
            area.w - 1,
          ),
        );
      this.scrollbar.render(grid, area, rows.length, this.scroll, c, (value) => {
        this.scroll = value;
        this.redraw();
      });
      return hiddenCursor();
    }
    const lw = Math.min(30, Math.max(10, Math.floor(r.w * 0.28))),
      right = { x: r.x + lw + 1, y: r.y + 1, w: Math.max(0, r.w - lw - 1), h: r.h - 3 };
    let cursor = hiddenCursor();
    const field = (
      x: number,
      y: number,
      w: number,
      label: string,
      input: TextInput,
      index: number,
    ) => {
      const value = input.view(Math.max(0, w - stringWidth(label)));
      grid.text(
        x,
        y,
        label + plainText(value.text),
        this.focus === index ? c.accent : c.fg,
        c.bg,
        0,
        w,
      );
      if (this.focus === index && !this.busy && w > stringWidth(label))
        cursor = {
          visible: true,
          style: "bar",
          blink: true,
          x: x + stringWidth(label) + value.cursorCol,
          y,
        };
      this.hits.push({
        rect: { x, y, w, h: 1 },
        run: () => {
          this.focus = index;
        },
      });
    };
    field(r.x, r.y + 1, lw, "検索:", this.search, 0);
    const rows = this.rows(),
      area = { x: r.x, y: r.y + 2, w: lw, h: Math.max(0, r.h - 5) };
    const selectedIndex = rows.findIndex((n) => n.id === this.selected);
    if (this.focus === 1 && selectedIndex >= 0 && area.h > 0) {
      if (selectedIndex < this.scroll) this.scroll = selectedIndex;
      else if (selectedIndex >= this.scroll + area.h) this.scroll = selectedIndex - area.h + 1;
    }
    this.scroll = Math.min(this.scroll, Math.max(0, rows.length - area.h));
    rows.slice(this.scroll, this.scroll + area.h).forEach((n, i) => {
      grid.text(
        area.x,
        area.y + i,
        plainText(
          (n.group ? `[${n.group}] ` : "") +
            n.title +
            (n.tags.length ? " #" + n.tags.join(" #") : ""),
        ),
        n.id === this.selected ? c.accent : c.fg,
        c.bg,
        0,
        area.w - 1,
      );
      this.hits.push({
        rect: { x: area.x, y: area.y + i, w: area.w - 1, h: 1 },
        run: () => {
          this.select(n);
          this.focus = 1;
        },
      });
    });
    this.scrollbar.render(grid, area, rows.length, this.scroll, c, (value) => {
      this.scroll = value;
      this.redraw();
    });
    button(r.x, r.y + r.h - 2, "[新規]", () => {
      this.select(null);
      this.focus = 2;
    });
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) grid.text(r.x + lw, y, "│", c.border, c.bg);
    field(right.x, right.y, right.w, "タイトル:", this.title, 2);
    field(right.x, right.y + 1, right.w, "グループ:", this.group, 3);
    field(right.x, right.y + 2, right.w, "タグ:", this.tags, 4);
    const bodyArea = { x: right.x, y: right.y + 4, w: right.w, h: Math.max(0, right.h - 4) },
      lines = this.body.value.split("\n"),
      pos = this.body.position();
    if (this.focus === 5 && !this.bodyManualScroll && bodyArea.h > 0) {
      if (pos.row < this.bodyScroll) this.bodyScroll = pos.row;
      else if (pos.row >= this.bodyScroll + bodyArea.h) this.bodyScroll = pos.row - bodyArea.h + 1;
    }
    this.bodyRect = bodyArea;
    this.bodyScroll = Math.min(this.bodyScroll, Math.max(0, lines.length - bodyArea.h));
    const chars = [...(lines[pos.row] ?? "")];
    let offset = 0;
    if (this.focus === 5 && !this.bodyManualScroll) {
      let remainingWidth = stringWidth(chars.slice(0, pos.col).join(""));
      while (offset < pos.col && remainingWidth > Math.max(0, bodyArea.w - 2)) {
        remainingWidth -= charWidth(chars[offset]!.codePointAt(0)!);
        offset++;
      }
    }
    this.bodyOffset = offset;
    lines
      .slice(this.bodyScroll, this.bodyScroll + bodyArea.h)
      .forEach((line, i) =>
        grid.text(
          bodyArea.x,
          bodyArea.y + i,
          plainText([...line].slice(offset).join("")),
          c.fg,
          c.bg,
          0,
          bodyArea.w - 1,
        ),
      );
    this.hits.push({
      rect: bodyArea,
      run: () => {
        this.focus = 5;
      },
    });
    this.bodyBar.render(grid, bodyArea, lines.length, this.bodyScroll, c, (value) => {
      this.bodyManualScroll = true;
      this.bodyScroll = value;
      this.redraw();
    });
    const bottom = r.y + r.h - 1;
    button(right.x, bottom, "[保存]", () => void this.save());
    button(right.x + 9, bottom, "[削除]", () => this.confirmDelete());
    grid.text(
      right.x + 18,
      bottom,
      this.dirty() ? "未保存" : "保存済み",
      this.dirty() ? c.warn : c.dim,
      c.bg,
      0,
      Math.max(0, right.w - 18),
    );
    if (
      this.focus === 5 &&
      !this.bodyManualScroll &&
      bodyArea.h > 0 &&
      bodyArea.w >= 2 &&
      !this.busy
    )
      return {
        visible: true,
        style: "bar" as const,
        blink: true,
        x:
          bodyArea.x + Math.min(bodyArea.w - 2, stringWidth(chars.slice(offset, pos.col).join(""))),
        y: bodyArea.y + pos.row - this.bodyScroll,
      };
    return cursor;
  }
}
