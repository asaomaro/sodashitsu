import { ScrollBar } from "./ScrollBar.js";
import { statuslineRows } from "./statusline.js";
import type { KeyInput } from "@sodashitsu/client-core";
import { checkDisplayAction, type DisplayInfo } from "@sodashitsu/protocol";
import type { DisplayModel } from "../model/DisplayModel.js";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { stringWidth } from "../render/width.js";
import type { Rect } from "../render/Screen.js";
import { MarkdownView, safeText, wrapSpans, type DocumentRow } from "./document.js";
import { simpleForm, formData, type FormControl, type FormDocument } from "./simpleForm.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isEsc,
  isEnter,
  isDown,
  isUp,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";

export class DisplayDialog implements Overlay {
  private readonly markdown = new MarkdownView();
  private id: string | null;
  private info: DisplayInfo | null = null;
  private text = "";
  private form: FormDocument | null = null;
  private selected = 0;
  private focus = 0;
  private revealFocus = true;
  private readonly scrollbar = new ScrollBar();
  handleScrollMouse(ev: OverlayMouse) {
    return this.scrollbar.handleMouse(ev);
  }
  cancelInteraction() {
    this.scrollbar.cancel();
  }
  private manualScroll = false;
  private scroll = 0;
  private busy = false;
  private dead = false;
  private removed = false;
  private error = "";
  private rect: Rect | null = null;
  private hits: { y: number; control?: FormControl; index?: number }[] = [];
  private attempted = "";
  constructor(
    private readonly paneId: string,
    id: string | undefined,
    private readonly displays: DisplayModel,
    private readonly conn: RequestPort,
    private readonly ui: UiState,
    private readonly redraw: () => void,
    private readonly openBuiltin?: (info: DisplayInfo) => boolean,
    private readonly onClose?: () => void,
    private readonly include?: (info: DisplayInfo) => boolean,
  ) {
    this.id = id ?? null;
  }
  private list() {
    return [...this.displays.infos.values()].filter(
      (d) => d.paneId === this.paneId || this.include?.(d),
    );
  }
  private controls() {
    return this.form?.controls.filter((c) => !c.disabled && c.type !== "hidden") ?? [];
  }
  private async load() {
    if (!this.id || this.busy) return;
    this.busy = true;
    this.error = "";
    const id = this.id;
    const info = this.displays.infos.get(id);
    this.attempted = id + ":" + info?.rev;
    try {
      if (!info) throw new Error("closed");
      if (!["text", "markdown", "html"].includes(info.format)) {
        this.info = info;
        this.text = "この形式は端末版では表示できません: " + info.format;
        this.form = null;
        return;
      }
      const r = await this.displays.content(id);
      if (!this.dead && id === this.id && r) {
        this.info = r.info;
        this.text = r.text;
        this.form = r.info.format === "html" ? simpleForm(r.text) : null;
        if (
          r.info.source?.type === "builtin" &&
          r.info.source.id === "workspace" &&
          statuslineRows(r.text, 1) !== null
        )
          this.form = null;
        this.focus = 0;
        this.revealFocus = true;
        this.scroll = 0;
      } else this.attempted = "";
    } catch {
      if (!this.dead) this.error = "本文を取得できません。rで再試行してください。";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private async submit(button: FormControl) {
    if (this.busy || !this.form || !this.info || !button.action || button.disabled) return;
    if (!this.displays.connected || this.displays.infos.get(this.info.id)?.rev !== this.info.rev) {
      this.error = "表示が更新・切断されています。再表示してから回答してください。";
      return;
    }
    const data = formData(this.form, button);
    if (!data) {
      this.error = "必須の入力欄を確認してください。";
      return;
    }
    const checked = checkDisplayAction({ action: button.action, data });
    if (!checked.ok) {
      this.error = "回答が送信上限を超えています。入力を短くしてください。";
      return;
    }
    const context = this.ui.dialogContext;
    this.busy = true;
    this.error = "";
    this.redraw();
    try {
      await this.conn.request("display.action", {
        id: this.info.id,
        rev: this.info.rev,
        action: button.action,
        data,
      });
      if (!this.dead) {
        this.error = "送信しました。";
        if (!button.direct) {
          if (this.onClose) this.onClose();
          else if (context !== null && this.ui.dialogContext === context) this.ui.closeDialog();
        }
      }
    } catch {
      if (!this.dead) this.error = "送信できません。接続と表示の更新を確認してください。";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private activate(c: FormControl) {
    if (c.disabled) return;
    if (c.type === "button") void this.submit(c);
    if (c.type === "checkbox") c.checked = !c.checked;
    if (c.type === "radio") {
      this.form?.controls
        .filter((x) => x.type === "radio" && x.form === c.form && x.name === c.name)
        .forEach((x) => (x.checked = false));
      c.checked = true;
    }
    if (c.type === "select" && c.options.length) {
      const i = c.options.findIndex((o) => o.value === c.value);
      c.value = c.options[(i + 1) % c.options.length]!.value;
    }
  }
  handleKey(k: KeyInput) {
    this.scrollbar.cancel();
    this.manualScroll = false;
    if (isEsc(k)) {
      if (this.onClose) {
        this.onClose();
        return;
      }
      if (this.id) {
        this.id = null;
        this.info = null;
        this.form = null;
        this.scroll = 0;
      } else this.cancel();
      return;
    }
    if (!this.id) {
      const count = this.list().length;
      if (isDown(k)) this.selected = Math.min(Math.max(0, count - 1), this.selected + 1);
      else if (isUp(k)) this.selected = Math.max(0, this.selected - 1);
      else if (isEnter(k) || k.key === " ") {
        const selected = this.list()[this.selected];
        if (selected && this.openBuiltin?.(selected)) return;
        this.id = selected?.id ?? null;
        void this.load();
      }
      return;
    }
    const controls = this.controls();
    const c = controls[this.focus];
    if (k.key === "Tab") {
      this.focus =
        (this.focus + (k.shift ? -1 : 1) + controls.length) % Math.max(1, controls.length);
      this.revealFocus = true;
      return;
    }
    if (c && (c.type === "text" || c.type === "password")) {
      if (isEnter(k)) {
        const button = controls.find((x) => x.type === "button" && x.form === c.form && !x.direct);
        if (button) void this.submit(button);
        return;
      }
      this.revealFocus = true;
      c.input.handleKey(k);
      if ([...c.input.value].length > c.max)
        c.input.value = [...c.input.value].slice(0, c.max).join("");
      return;
    }
    if (c && (isEnter(k) || k.key === " ")) {
      this.activate(c);
      return;
    }
    if (c?.type === "select" && (k.key === "ArrowLeft" || k.key === "ArrowRight")) {
      const n = c.options.length;
      if (n) {
        const i = c.options.findIndex((o) => o.value === c.value);
        c.value = c.options[(i + (k.key === "ArrowLeft" ? -1 : 1) + n) % n]!.value;
      }
      return;
    }
    if (k.key === "r") {
      this.attempted = "";
      void this.load();
    } else if (isUp(k)) this.scroll = Math.max(0, this.scroll - 1);
    else if (isDown(k)) this.scroll++;
    else if (k.key === "PageDown") this.scroll += 10;
    else if (k.key === "PageUp") this.scroll = Math.max(0, this.scroll - 10);
  }
  handlePaste(text: string) {
    const c = this.controls()[this.focus];
    if (c && (c.type === "text" || c.type === "password")) {
      this.revealFocus = true;
      c.input.insert(safeText(text));
      if ([...c.input.value].length > c.max)
        c.input.value = [...c.input.value].slice(0, c.max).join("");
    }
  }
  handleMouse(ev: OverlayMouse) {
    if (this.handleScrollMouse(ev)) return true;
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "wheel") {
      this.scroll = Math.max(0, this.scroll + (ev.button === 65 ? 3 : -3));
      return true;
    }
    if (ev.action === "down" && ev.button === 0) {
      const hit = this.hits.find((h) => h.y === ev.y);
      if (hit?.control && !hit.control.disabled) {
        this.revealFocus = true;
        this.focus = this.controls().indexOf(hit.control);
        this.activate(hit.control);
      } else if (hit?.index !== undefined) {
        this.selected = hit.index;
        this.id = this.list()[hit.index]?.id ?? null;
        void this.load();
      }
    }
    return true;
  }
  cancel() {
    if (this.onClose) this.onClose();
    else this.ui.closeDialog();
  }
  dispose() {
    this.dead = true;
  }
  render({ grid, theme, embedded = false, showTitle = true }: OverlayRenderContext) {
    this.hits = [];
    this.rect = embedded
      ? { x: 0, y: 0, w: grid.w, h: grid.h }
      : centeredRect(grid, grid.w - 2, grid.h - 2);
    const colors = dialogColors(theme);
    const area = embedded
      ? this.rect
      : drawBox(
          grid,
          this.rect,
          colors,
          showTitle ? (this.info?.title ?? "表示ウィンドウ") : undefined,
        );
    if (embedded && area.h < 2 && this.error) {
      this.ui.toast(this.error);
      this.error = "";
    }
    area.w = Math.max(0, area.w - 1);
    const height = Math.max(0, area.h - (embedded ? (this.error ? 1 : 0) : 2));
    let rows: DocumentRow[] = [];
    const controlsAt = new Map<number, FormControl>();
    if (this.id) {
      const current = this.displays.infos.get(this.id);
      if (!current && this.displays.connected && this.displays.ready) {
        if (!this.removed) {
          this.removed = true;
          this.cancel();
        }
        return hiddenCursor();
      }
      if (current) this.removed = false;
      if (!current || !this.displays.connected) {
        this.form = null;
        this.info = null;
        this.attempted = "";
        rows = [
          [{ text: "表示は閉じられたか、接続が切れています。Escで一覧へ戻ります。", attrs: 0 }],
        ];
      } else {
        if (this.attempted !== this.id + ":" + current.rev && !this.busy) void this.load();
        const colored =
          this.info?.source?.type === "builtin" &&
          this.info.source.id === "workspace" &&
          this.info.format === "html"
            ? statuslineRows(this.text, area.w)
            : null;
        if (colored) rows = colored;
        else if (this.form) {
          for (const line of this.form.lines) {
            if ("text" in line) rows.push(...wrapSpans([{ text: line.text, attrs: 0 }], area.w));
            else {
              const c = line.control;
              controlsAt.set(rows.length, c);
              const mark =
                c.type === "checkbox"
                  ? c.checked
                    ? "[x]"
                    : "[ ]"
                  : c.type === "radio"
                    ? c.checked
                      ? "(●)"
                      : "( )"
                    : "";
              const value =
                c.type === "button"
                  ? "[ " + c.label + " ]"
                  : c.type === "text"
                    ? c.input.view(Math.max(1, area.w - stringWidth(c.label) - 3)).text
                    : c.type === "password"
                      ? "•".repeat(Math.min(c.input.value.length, 30))
                      : c.type === "select"
                        ? (c.options.find((o) => o.value === c.value)?.label ?? "") + " ▾"
                        : mark;
              rows.push([
                { text: safeText(c.type === "button" ? value : c.label + ": " + value), attrs: 0 },
              ]);
            }
          }
        } else
          rows =
            this.info?.format === "markdown"
              ? this.markdown.render(this.text, area.w)
              : wrapSpans([{ text: safeText(this.text), attrs: 0 }], area.w);
      }
    } else rows = this.list().map((d) => [{ text: d.title + " · " + d.format, attrs: 0 }]);
    if (this.form && this.revealFocus) {
      this.revealFocus = false;
      const focused = this.controls()[this.focus];
      const index = [...controlsAt].find(([, c]) => c === focused)?.[0];
      if (index !== undefined) {
        if (index < this.scroll) this.scroll = index;
        if (index >= this.scroll + height) this.scroll = index - height + 1;
      }
    }
    this.scroll = Math.min(Math.max(0, this.scroll), Math.max(0, rows.length - height));
    if (!this.id && !this.manualScroll) this.scroll = Math.max(0, this.selected - height + 1);
    const cursor = hiddenCursor();
    rows.slice(this.scroll, this.scroll + height).forEach((row, i) => {
      const index = this.scroll + i;
      const c = controlsAt.get(index);
      const on = c ? this.controls()[this.focus] === c : !this.id && index === this.selected;
      let x = area.x;
      for (const s of row) {
        grid.text(
          x,
          area.y + i,
          s.text,
          c?.disabled ? colors.dim : (s.fg ?? colors.fg),
          on ? colors.active : colors.bg,
          s.attrs,
          Math.max(0, area.x + area.w - x),
        );
        x += stringWidth(s.text);
      }
      this.hits.push({ y: area.y + i, ...(c ? { control: c } : !this.id ? { index } : {}) });
      if (on && c && (c.type === "text" || c.type === "password")) {
        const col =
          c.type === "password"
            ? Math.min(c.input.cursor, 30)
            : c.input.view(Math.max(1, area.w - stringWidth(c.label) - 3)).cursorCol;
        cursor.x = Math.min(area.x + area.w - 1, area.x + stringWidth(c.label) + 2 + col);
        cursor.y = area.y + i;
        cursor.visible = true;
      }
    });
    this.scrollbar.render(
      grid,
      { ...area, w: area.w + 1, h: height },
      rows.length,
      this.scroll,
      colors,
      (offset) => {
        this.scroll = offset;
        this.manualScroll = true;
        this.revealFocus = false;
      },
    );
    if (embedded) {
      if (this.error && area.h >= 2)
        grid.text(area.x, area.y + height, this.error, colors.warn, colors.bg, 0, area.w);
      return cursor;
    }
    grid.text(
      area.x,
      area.y + height,
      this.busy ? "処理中…" : this.error,
      colors.dim,
      colors.bg,
      0,
      area.w,
    );
    grid.text(
      area.x,
      area.y + height + 1,
      this.form
        ? "Tab欄移動・Enter送信・Alt+矢印サイズ・Esc戻る"
        : "↑↓選択/スクロール・Enter開く・Alt+矢印サイズ・Esc戻る",
      colors.dim,
      colors.bg,
      0,
      area.w,
    );
    return cursor;
  }
}
