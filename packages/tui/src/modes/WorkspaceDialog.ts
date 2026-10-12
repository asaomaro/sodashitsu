import {
  BUILTIN_WORKSPACE_KEY,
  BUILTIN_TERMINAL_VIEWS,
  type BuiltinViewId,
  type WorkspaceToolsParams,
} from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { TextInput } from "./TextInput.js";
import { safeText } from "./document.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isEsc,
  isEnter,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import { paletteColor } from "../render/color.js";
import type { Rect } from "../render/Screen.js";
const WORKSPACE_VIEWS = BUILTIN_TERMINAL_VIEWS.filter((v) => v.id !== "statusline");
export class WorkspaceDialog implements Overlay {
  private context: { workspaceId: string | undefined; folder: string | undefined };
  private mode: "picker" | "placement" | "files" | "file" | "git-graph" | "git-diff" = "picker";
  private selected = 0;
  private scroll = 0;
  private error = "";
  private busy = false;
  private dead = false;
  private rect: Rect | null = null;
  private contentRect: Rect | null = null;
  private viewId: (typeof WORKSPACE_VIEWS)[number]["id"] = "files";
  private entries: { label: string; path: string; directory?: boolean; line?: number }[] = [];
  private directory = "";
  private path = "";
  private version = "";
  private text = "";
  private original = "";
  private lines: TextInput[] = [];
  private row = 0;
  private editing = false;
  private eol = "\n";
  private prompt: "path" | "search" | "grep" | "commit" | "diff-path" | null = null;
  private input = new TextInput();
  private staged = false;
  private commit = "";
  private discard = false;
  constructor(
    private readonly tabId: string,
    private readonly paneId: string | undefined,
    private readonly model: SessionModel,
    private readonly ui: UiState,
    private readonly conn: RequestPort,
    private readonly redraw: () => void,
    kind?: BuiltinViewId,
    private readonly onClose?: () => void,
  ) {
    this.context = {
      workspaceId: this.workspaceId(),
      folder: this.model.workspaces.get(this.workspaceId() ?? "")?.projectDir,
    };
    if (kind && kind !== "development" && kind !== "statusline") {
      this.mode = kind;
      void this.refresh();
    }
  }
  private workspaceId() {
    return this.model.tabs.get(this.tabId)?.workspaceId;
  }
  private async call(
    operation: WorkspaceToolsParams["operation"],
    extra: Partial<WorkspaceToolsParams> = {},
  ) {
    const workspaceId = this.workspaceId();
    if (!workspaceId) throw new Error("タブが閉じられました");
    if (
      workspaceId !== this.context.workspaceId ||
      this.model.workspaces.get(workspaceId)?.projectDir !== this.context.folder
    )
      throw new Error("PJフォルダが変更されました。内容を控え、ビューを開き直してください");
    return this.conn.request("workspace.tools", {
      ...(this.context.folder ? { expectedFolder: this.context.folder } : {}),
      workspaceId,
      operation,
      path: "",
      ...extra,
    });
  }
  private async perform(work: () => Promise<void>) {
    if (this.busy || this.dead) return;
    this.busy = true;
    this.error = "";
    try {
      await work();
    } catch (e) {
      this.error = e instanceof Error ? e.message : "操作に失敗しました";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private refresh() {
    return this.perform(async () => {
      if (this.mode === "files") {
        const r = await this.call("list", { path: this.directory });
        this.entries = (
          this.directory
            ? [
                {
                  label: "▴ ..",
                  path: this.directory.split("/").slice(0, -1).join("/"),
                  directory: true,
                },
              ]
            : []
        ).concat(
          (r.entries ?? []).map((e) => ({
            label: `${e.directory ? "▸" : "·"} ${e.name}${e.link ? " ↗" : ""}`,
            path: e.path,
            directory: e.directory,
          })),
        );
        this.selected = 0;
      }
      if (this.mode === "git-graph") {
        this.text = (await this.call("git-log")).text ?? "";
        this.selected = 0;
      }
      if (this.mode === "git-diff") {
        this.text =
          (
            await this.call("git-diff", {
              path: this.path,
              staged: this.staged,
              ...(this.commit ? { commit: this.commit } : {}),
            })
          ).text ?? "変更はありません";
      }
    });
  }
  private read(path: string, line = 1) {
    if (this.dirty()) {
      this.error = "先にCtrl+Sで保存してください";
      return Promise.resolve();
    }
    return this.perform(async () => {
      const r = await this.call("read", { path });
      this.path = path;
      this.text = this.original = r.text ?? "";
      this.version = r.version ?? "";
      this.eol = this.text.includes("\r\n") ? "\r\n" : "\n";
      this.lines = this.text.split(this.eol).map((l) => new TextInput(l));
      this.row = Math.max(0, Math.min(this.lines.length - 1, line - 1));
      this.selected = this.row;
      this.scroll = this.row;
      this.mode = "file";
      this.editing = false;
      this.discard = false;
    });
  }
  canLeave() {
    if (this.mode === "file" && this.dirty()) {
      this.error = "未保存の変更があります。Ctrl+Sで保存してください";
      this.redraw();
      return false;
    }
    return true;
  }
  private dirty() {
    return this.lines.map((l) => l.value).join(this.eol) !== this.original;
  }
  private save() {
    return this.perform(async () => {
      const content = this.lines.map((l) => l.value).join(this.eol);
      const r = await this.call("write", { path: this.path, content, version: this.version });
      this.version = r.version ?? "";
      this.original = content;
      this.text = content;
      this.error = "保存しました";
    });
  }
  private choose() {
    if (this.mode === "picker") {
      this.viewId = WORKSPACE_VIEWS[this.selected]!.id;
      this.mode = "placement";
      this.selected = 0;
      return;
    }
    if (this.mode === "placement") {
      const def = WORKSPACE_VIEWS.find((v) => v.id === this.viewId)!;
      void this.perform(async () => {
        await this.conn.request("tab.add_view", {
          tabId: this.tabId,
          extensionKey: BUILTIN_WORKSPACE_KEY,
          viewId: def.id,
          target: this.paneId ? "pane" : "tab",
          ...(this.paneId ? { paneId: this.paneId } : {}),
          placement: def.placements[this.selected]!,
        });
        this.mode = def.id;
        this.selected = 0;
      }).then(() => this.refresh());
      return;
    }
    if (this.mode === "files") {
      const entry = this.entries[this.selected];
      if (!entry) return;
      if (entry.directory) {
        this.directory = entry.path;
        void this.refresh();
      } else void this.read(entry.path, entry.line);
      return;
    }
    if (this.mode === "git-graph") {
      const hash = this.text.split("\n")[this.selected]?.match(/\b[a-f0-9]{40,64}\b/)?.[0];
      if (hash) {
        this.commit = hash;
        this.path = "";
        this.mode = "git-diff";
        void this.refresh();
      }
    }
  }
  handleKey(k: KeyInput) {
    if (this.busy) return;
    if (this.prompt) {
      if (isEsc(k)) {
        this.prompt = null;
        return;
      }
      if (isEnter(k)) {
        const type = this.prompt,
          value = this.input.value;
        this.prompt = null;
        if (type === "path") void this.read(value);
        else if (type === "diff-path") {
          this.path = value;
          this.mode = "git-diff";
          void this.refresh();
        } else if (type === "commit") {
          this.commit = value;
          this.path = "";
          this.mode = "git-diff";
          void this.refresh();
        } else
          void this.perform(async () => {
            const r = await this.call("search", { query: value, grep: type === "grep" });
            this.entries = (r.matches ?? []).map((m) => ({
              label: `${m.path}${m.line ? ":" + m.line : ""}${m.text ? " " + m.text : ""}`,
              path: m.path,
              ...(m.line ? { line: m.line } : {}),
            }));
            this.mode = "files";
            this.selected = 0;
            this.scroll = 0;
            if (r.truncated) this.error = "検索上限に達しました。検索語を絞ってください";
          });
        return;
      }
      this.input.handleKey(k);
      return;
    }
    if (k.ctrl && k.key === "s" && this.mode === "file") {
      void this.save();
      return;
    }
    if (this.editing) {
      if (isEsc(k)) {
        this.editing = false;
        return;
      }
      const line = this.lines[this.row]!;
      if (k.key === "ArrowUp" || k.key === "ArrowDown") {
        const col = line.cursor;
        this.row = Math.max(
          0,
          Math.min(this.lines.length - 1, this.row + (k.key === "ArrowUp" ? -1 : 1)),
        );
        this.lines[this.row]!.cursor = Math.min(col, [...this.lines[this.row]!.value].length);
        return;
      }
      if (isEnter(k)) {
        const chars = [...line.value],
          tail = chars.splice(line.cursor).join("");
        line.value = chars.join("");
        const next = new TextInput(tail);
        next.cursor = 0;
        this.lines.splice(++this.row, 0, next);
        return;
      }
      if (k.key === "Backspace" && line.cursor === 0 && this.row > 0) {
        const prev = this.lines[this.row - 1]!,
          col = [...prev.value].length;
        prev.value += line.value;
        prev.cursor = col;
        this.lines.splice(this.row--, 1);
        return;
      }
      if (
        k.key === "Delete" &&
        line.cursor === [...line.value].length &&
        this.row < this.lines.length - 1
      ) {
        const col = line.cursor;
        line.value += this.lines[this.row + 1]!.value;
        line.cursor = col;
        this.lines.splice(this.row + 1, 1);
        return;
      }
      if (k.key === "Tab") {
        line.insert("  ");
        return;
      }
      line.handleKey(k);
      return;
    }
    if (isEsc(k)) {
      if (this.onClose) {
        this.onClose();
        return;
      }
      if (this.mode === "file" && this.dirty() && !this.discard) {
        this.discard = true;
        this.error = "未保存の変更があります。Ctrl+Sで保存、もう一度Escで破棄";
        return;
      }
      return this.cancel();
    }
    if (isEnter(k)) {
      this.choose();
      return;
    }
    if (
      this.mode === "file" &&
      this.dirty() &&
      (["p", "/", "f", "c", "d", "r"].includes(k.key) || (k.ctrl && k.key === "g"))
    ) {
      this.error = "先にCtrl+Sで保存してください（Escを二度押すと破棄して閉じます）";
      return;
    }
    if (
      k.key === "/" ||
      (k.ctrl && k.key === "g") ||
      k.key === "p" ||
      k.key === "c" ||
      k.key === "d"
    ) {
      this.prompt = k.ctrl
        ? "grep"
        : k.key === "/"
          ? "search"
          : k.key === "c"
            ? "commit"
            : k.key === "d"
              ? "diff-path"
              : "path";
      this.input = new TextInput(k.key === "p" ? this.path : "");
      return;
    }
    if (k.key === "e" && this.mode === "file") {
      this.editing = true;
      return;
    }
    if (k.key === "s" && this.mode === "git-diff") {
      this.staged = !this.staged;
      this.commit = "";
      void this.refresh();
      return;
    }
    if (k.key === "f") {
      if (this.mode === "file" && this.dirty()) {
        this.error = "先にCtrl+Sで保存してください";
        return;
      }
      this.mode = "files";
      this.path = "";
      this.commit = "";
      void this.refresh();
      return;
    }
    if (k.key === "r") {
      void this.refresh();
      return;
    }
    if (k.key === "ArrowDown" || k.key === "j") this.selected++;
    if (k.key === "ArrowUp" || k.key === "k") this.selected = Math.max(0, this.selected - 1);
    if (k.key === "PageDown") this.selected += 10;
    if (k.key === "PageUp") this.selected = Math.max(0, this.selected - 10);
  }
  handlePaste(text: string) {
    if (this.prompt) this.input.insert(text.slice(0, 4096));
    else if (this.editing) {
      const line = this.lines[this.row]!,
        chars = [...line.value],
        left = chars.slice(0, line.cursor).join(""),
        right = chars.slice(line.cursor).join("");
      const parts = text
        .slice(0, 512 * 1024)
        .replace(/\r\n/g, "\n")
        .split("\n");
      const added = parts.map(
        (s, i) => new TextInput((i === 0 ? left : "") + s + (i === parts.length - 1 ? right : "")),
      );
      this.lines.splice(this.row, 1, ...added);
      this.row += added.length - 1;
      this.lines[this.row]!.cursor =
        [...parts.at(-1)!].length + (parts.length === 1 ? [...left].length : 0);
    }
  }
  handleMouse(e: OverlayMouse) {
    if (!inside(this.rect, e.x, e.y)) return false;
    if (e.action === "down" && e.button === 0 && inside(this.contentRect, e.x, e.y)) {
      this.selected = this.scroll + e.y - this.contentRect!.y;
      this.choose();
    }
    if (e.action === "wheel")
      this.selected = Math.max(0, this.selected + (e.button === 0 ? -3 : 3));
    return true;
  }
  cancel() {
    if (this.onClose) {
      this.onClose();
      return;
    }
    if (this.mode === "file" && this.dirty() && !this.discard) {
      this.discard = true;
      this.error = "未保存の変更があります。Ctrl+Sで保存、もう一度Escで破棄";
      this.redraw();
      return;
    }
    this.ui.closeDialog();
  }
  dispose() {
    this.dead = true;
  }
  render({ grid, theme, embedded = false, showTitle = true }: OverlayRenderContext) {
    const c = dialogColors(theme),
      r = embedded
        ? { x: 0, y: 0, w: grid.w, h: grid.h }
        : centeredRect(grid, Math.max(1, grid.w - 2), Math.max(1, grid.h - 2));
    this.rect = r;
    const area = embedded
      ? r
      : drawBox(
          grid,
          r,
          c,
          showTitle
            ? `${this.paneId ? "このペイン" : "タブ全体"} · ${this.mode === "picker" ? "ビューを追加" : this.mode === "placement" ? "配置を選択" : this.path || this.directory || this.mode}`
            : undefined,
        );
    const content =
      this.mode === "picker"
        ? WORKSPACE_VIEWS.map((v) => v.title)
        : this.mode === "placement"
          ? [...WORKSPACE_VIEWS.find((v) => v.id === this.viewId)!.placements]
          : this.mode === "files"
            ? this.entries.map((e) => e.label)
            : this.mode === "file"
              ? this.lines.map((l) => l.value)
              : this.text.split("\n");
    const top = !embedded || area.h >= 4 || ((this.busy || this.error) && area.h >= 2) ? 1 : 0;
    const footer = !embedded || area.h >= 4 || (this.prompt && area.h >= 2) ? 1 : 0;
    const height = Math.max(0, area.h - (embedded ? top + footer : 3));
    this.contentRect = { x: area.x, y: area.y + top, w: area.w, h: height };
    this.selected = Math.min(Math.max(0, content.length - 1), this.selected);
    const focus = this.editing ? this.row : this.selected;
    this.scroll = Math.max(0, Math.min(this.scroll, focus));
    if (focus >= this.scroll + height) this.scroll = focus - height + 1;
    if (top) grid.text(area.x, area.y, this.busy ? "読込中…" : this.error, c.warn, c.bg, 0, area.w);
    for (let i = 0; i < height; i++) {
      const n = this.scroll + i,
        line = content[n] ?? "";
      grid.text(
        area.x,
        area.y + top + i,
        safeText(line),
        this.mode === "git-diff"
          ? line.startsWith("+") && !line.startsWith("+++")
            ? paletteColor(2)
            : line.startsWith("-") && !line.startsWith("---")
              ? paletteColor(1)
              : line.startsWith("@@")
                ? paletteColor(6)
                : c.fg
          : this.mode === "git-graph"
            ? line.includes("*")
              ? paletteColor(6)
              : paletteColor(5)
            : c.fg,
        n === focus ? c.active : c.bg,
        0,
        area.w,
      );
    }
    if (footer)
      grid.text(
        area.x,
        area.y + area.h - 1,
        this.prompt
          ? `${this.prompt}: ${this.input.view(Math.max(1, area.w - 8)).text}`
          : this.editing
            ? "編集: Ctrl+S 保存 · Esc 閲覧 · Alt+矢印 リサイズ"
            : "Enter 開く · / 名前検索 · Ctrl+G Grep · p パス · e 編集 · s ステージ · d 差分パス · c コミット · f 一覧 · Esc 閉じる",
        c.dim,
        c.bg,
        0,
        area.w,
      );
    if (this.editing) {
      const field = this.lines[this.row]!.view(Math.max(1, area.w));
      grid.text(
        area.x,
        area.y + top + this.row - this.scroll,
        safeText(field.text),
        c.fg,
        c.active,
        0,
        area.w,
      );
      return {
        x: area.x + field.cursorCol,
        y: area.y + top + this.row - this.scroll,
        visible: true,
        style: "bar" as const,
        blink: true,
      };
    }
    return hiddenCursor();
  }
}
