import type { KeyInput } from "@sodashitsu/client-core";
import type { UiState } from "../model/UiState.js";
import { ATTR } from "../render/color.js";
import type { CursorState, Grid, Rect } from "../render/Screen.js";
import { stringWidth, truncate } from "../render/width.js";
import type {
  Activation,
  ChoiceOption,
  Outcome,
  SettingItem,
  SettingsSection,
} from "../settings/items.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  drawButtons,
  hiddenCursor,
  inside,
  isDown,
  isEnter,
  isEsc,
  isUp,
  wrapText,
  type DialogColors,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import { TextInput } from "./TextInput.js";

/** 取り込み待ち・一覧・入力欄・確認（項目を押した後の続き）。 */
type Sub =
  | {
      kind: "choose";
      title: string;
      options: ChoiceOption[];
      pick(i: number): Outcome;
      selected: number;
    }
  | { kind: "edit"; title: string; input: TextInput; commit(text: string): Outcome }
  | { kind: "capture"; hint: string; accept: Extract<Activation, { kind: "capture" }>["accept"] }
  | { kind: "confirm"; title: string; yesLabel: string; yes(): Outcome; selected: 0 | 1 };

const SECTIONS_W = 18;

/**
 * 設定画面（`prefix+s`。20260927-cli-mode の design「設定画面（端末版）」）：左に節の一覧・右に項目の表。上下で項目、Enter/Space で
 * 切り替え・選択肢の一覧・入力欄・キーの取り込み待ち。Esc で節の一覧へ戻り、もう一度 Esc で閉じる（取り込み待ち・一覧・入力欄の中の Esc は
 * その取り消し）。変更は項目ごとに即座に反映（web と同じ。確定のボタンは無い）。
 */
export class SettingsDialog implements Overlay {
  private readonly sections: SettingsSection[];
  private section = 0;
  private item = 0;
  private itemScroll = 0;
  private focus: "sections" | "items" = "sections";
  private sub: Sub | null = null;
  private message = "";
  private rect: Rect | null = null;
  private areas: {
    sections: Rect;
    items: Rect;
    sub: Rect | null;
    subRows: { y: number; index: number }[];
    buttons: Rect[];
  } | null = null;

  constructor(
    private readonly ui: UiState,
    makeSections: (message: (text: string) => void) => SettingsSection[],
    private readonly requestRender: () => void = () => undefined,
  ) {
    this.sections = makeSections((text) => {
      this.message = text;
      this.requestRender();
    });
  }

  /** 今の節の項目（描くたびに今の設定から作り直す）。 */
  private items(): SettingItem[] {
    return this.sections[this.section]?.items() ?? [];
  }

  // --- キー ---

  handleKey(k: KeyInput): void {
    if (this.sub) return this.subKey(this.sub, k);
    if (this.focus === "sections") {
      if (isEsc(k)) return this.cancel();
      if (isDown(k)) this.moveSection(1);
      else if (isUp(k)) this.moveSection(-1);
      else if (
        isEnter(k) ||
        k.key === " " ||
        k.key === "ArrowRight" ||
        k.key === "Tab" ||
        k.key === "l"
      ) {
        this.focus = "items";
        this.item = this.firstSelectable(0, 1);
        this.message = "";
      }
      return;
    }
    if (isEsc(k) || k.key === "ArrowLeft" || (k.key === "Tab" && k.shift) || k.key === "h") {
      this.focus = "sections";
      this.message = "";
      return;
    }
    if (isDown(k)) this.moveItem(1);
    else if (isUp(k)) this.moveItem(-1);
    else if (k.key === "PageDown") this.moveItem(10);
    else if (k.key === "PageUp") this.moveItem(-10);
    else if (k.key === "Home") this.item = this.firstSelectable(0, 1);
    else if (k.key === "End") this.item = this.firstSelectable(this.items().length - 1, -1);
    else if (isEnter(k) || k.key === " ") this.activate(this.item);
  }

  handlePaste(text: string): void {
    if (this.sub?.kind === "edit") this.sub.input.insert(text);
  }

  private subKey(sub: Sub, k: KeyInput): void {
    switch (sub.kind) {
      case "capture":
        // 修飾の無い Esc だけが取り消し（ほかは取り込む。ctrl+[ 等も割り当ての候補）。
        if (k.key === "Escape" && !k.ctrl && !k.alt && !k.shift && !k.meta) {
          this.sub = null;
          this.message = "";
          return;
        }
        {
          const r = sub.accept(k);
          if (r.wait === true) {
            if (r.message) this.message = r.message;
            return;
          }
          this.sub = null;
          this.apply(r.outcome);
        }
        return;
      case "choose": {
        if (isEsc(k)) {
          this.sub = null;
          return;
        }
        if (isEnter(k) || k.key === " ") return this.pick(sub, sub.selected);
        const step = isDown(k) ? 1 : isUp(k) ? -1 : 0;
        if (step !== 0) sub.selected = nextSelectable(sub.options, sub.selected, step);
        return;
      }
      case "edit":
        if (isEsc(k)) {
          this.sub = null;
          return;
        }
        if (isEnter(k)) {
          this.sub = null;
          this.apply(sub.commit(sub.input.value));
          return;
        }
        sub.input.handleKey(k);
        return;
      case "confirm":
        if (isEsc(k) || k.key === "n") {
          this.sub = null;
          return;
        }
        if (
          k.key === "ArrowLeft" ||
          k.key === "ArrowRight" ||
          k.key === "Tab" ||
          k.key === "h" ||
          k.key === "l"
        )
          sub.selected = sub.selected === 0 ? 1 : 0;
        else if (k.key === "y") this.confirm(sub, 1);
        else if (isEnter(k) || k.key === " ") this.confirm(sub, sub.selected);
        return;
    }
  }

  private pick(sub: Extract<Sub, { kind: "choose" }>, index: number): void {
    if (sub.options[index]?.heading) return;
    this.sub = null;
    this.apply(sub.pick(index));
  }

  private confirm(sub: Extract<Sub, { kind: "confirm" }>, choice: 0 | 1): void {
    this.sub = null;
    if (choice === 1) this.apply(sub.yes());
  }

  private moveSection(step: number): void {
    const n = this.sections.length;
    this.section = (this.section + step + n) % n;
    this.item = 0;
    this.itemScroll = 0;
    this.message = "";
  }

  private moveItem(step: number): void {
    const items = this.items();
    if (items.length === 0) return;
    const dir = step > 0 ? 1 : -1;
    let i = this.item;
    for (let n = Math.abs(step); n > 0; n--) {
      const next = this.firstSelectable(i + dir, dir, true);
      if (next === i || next < 0 || next >= items.length) break;
      i = next;
    }
    this.item = i;
    this.message = "";
  }

  /** `from` から `dir` の向きに最初の見出しでない項目（無ければ今のまま）。 */
  private firstSelectable(from: number, dir: 1 | -1, keep = false): number {
    const items = this.items();
    for (let i = from; i >= 0 && i < items.length; i += dir) if (!items[i]!.heading) return i;
    return keep ? this.item : Math.max(0, Math.min(from, items.length - 1));
  }

  private activate(index: number): void {
    const item = this.items()[index];
    if (!item || item.heading || item.disabled || !item.activate) return;
    this.message = "";
    this.apply(item.activate());
  }

  /** 項目が返した続きに従う。 */
  private apply(o: Outcome): void {
    if (o === undefined) return;
    if (typeof o === "string") {
      this.message = o;
      return;
    }
    this.sub = toSub(o);
    if (o.kind === "capture") this.message = "";
  }

  cancel(): void {
    this.ui.closeDialog();
  }

  // --- マウス ---

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) {
      // 一覧・入力欄・確認の外を押したらそれだけ閉じる（設定画面は閉じない）。
      if (this.sub && ev.action === "down") {
        this.sub = null;
        return true;
      }
      return false;
    }
    const a = this.areas;
    if (!a) return true;
    if (this.sub) {
      if (ev.action === "down" && ev.button === 0) {
        if (a.sub && !inside(a.sub, ev.x, ev.y)) {
          this.sub = null;
          return true;
        }
        const sub = this.sub;
        if (sub.kind === "choose") {
          const row = a.subRows.find((r) => r.y === ev.y);
          if (row) this.pick(sub, row.index);
        } else if (sub.kind === "confirm") {
          const b = a.buttons.findIndex((r) => inside(r, ev.x, ev.y));
          if (b >= 0) this.confirm(sub, b === 0 ? 0 : 1);
        }
      } else if (ev.action === "wheel" && this.sub.kind === "choose")
        this.sub.selected = nextSelectable(
          this.sub.options,
          this.sub.selected,
          ev.button === 65 ? 1 : -1,
        );
      return true;
    }
    if (ev.action === "wheel") {
      if (inside(a.items, ev.x, ev.y)) this.moveItem(ev.button === 65 ? 3 : -3);
      else if (inside(a.sections, ev.x, ev.y)) this.moveSection(ev.button === 65 ? 1 : -1);
      return true;
    }
    if (ev.action !== "down" || ev.button !== 0) return true;
    if (inside(a.sections, ev.x, ev.y)) {
      const i = ev.y - a.sections.y;
      if (i >= 0 && i < this.sections.length) {
        if (i !== this.section) {
          this.section = i;
          this.item = 0;
          this.itemScroll = 0;
        }
        this.focus = "sections";
        this.message = "";
      }
    } else if (inside(a.items, ev.x, ev.y)) {
      const i = this.itemScroll + (ev.y - a.items.y);
      const item = this.items()[i];
      if (item && !item.heading) {
        this.focus = "items";
        this.item = i;
        this.activate(i);
      }
    }
    return true;
  }

  // --- 描く ---

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const r = centeredRect(grid, Math.min(110, grid.w - 2), grid.h - 2);
    this.rect = r;
    const inner = drawBox(grid, r, c, "設定");
    // 下の 3 行：選んでいる項目の説明（2 行）と結果の知らせ（1 行）。
    const footH = inner.h >= 8 ? 3 : 1;
    const bodyH = Math.max(1, inner.h - footH - 1);
    const secW = Math.min(SECTIONS_W, Math.max(8, Math.floor(inner.w / 4)));
    const sections: Rect = { x: inner.x, y: inner.y, w: secW, h: bodyH };
    const items: Rect = {
      x: inner.x + secW + 2,
      y: inner.y,
      w: Math.max(1, inner.w - secW - 2),
      h: bodyH,
    };
    for (let y = inner.y; y < inner.y + bodyH; y++)
      grid.set(inner.x + secW, y, "│", 1, c.border, c.bg);

    this.sections.forEach((s, i) => {
      if (i >= bodyH) return;
      const on = i === this.section;
      const bg = on ? (this.focus === "sections" ? c.accent : c.active) : c.bg;
      const fg = on && this.focus === "sections" ? c.accentFg : c.fg;
      grid.fill({ x: sections.x, y: sections.y + i, w: secW, h: 1 }, fg, bg);
      grid.text(
        sections.x + 1,
        sections.y + i,
        truncate(s.label, secW - 1),
        fg,
        bg,
        on ? ATTR.bold : 0,
      );
    });

    const list = this.items();
    if (this.item >= list.length) this.item = Math.max(0, list.length - 1);
    if (list[this.item]?.heading) this.item = this.firstSelectable(this.item, 1);
    if (this.item < this.itemScroll) this.itemScroll = this.item;
    if (this.item >= this.itemScroll + bodyH) this.itemScroll = this.item - bodyH + 1;
    // 見出しは選べないので、先頭の項目を選んでいる間は上の見出しも見せる。
    while (
      this.itemScroll > 0 &&
      list[this.itemScroll - 1]?.heading &&
      this.item - (this.itemScroll - 1) < bodyH
    )
      this.itemScroll--;
    const valueW = Math.min(40, Math.floor(items.w / 2));
    for (let i = 0; i < bodyH; i++) {
      const it = list[this.itemScroll + i];
      if (!it) break;
      const y = items.y + i;
      const on = this.itemScroll + i === this.item && this.focus === "items";
      if (it.heading) {
        grid.text(items.x, y, truncate(it.label, items.w), c.dim, c.bg, ATTR.bold);
        continue;
      }
      const bg = on ? c.accent : c.bg;
      const fg = on ? c.accentFg : it.disabled ? c.dim : c.fg;
      grid.fill({ x: items.x, y, w: items.w, h: 1 }, fg, bg);
      const labelRoom = it.value !== undefined ? items.w - valueW - 1 : items.w;
      grid.text(items.x + 1, y, truncate(it.label, labelRoom - 1), fg, bg, 0);
      if (it.value !== undefined) {
        const v = truncate(it.value, valueW);
        grid.text(items.x + items.w - stringWidth(v) - 1, y, v, fg, bg, it.toggle ? ATTR.bold : 0);
      }
    }
    if (this.itemScroll > 0) grid.set(items.x + items.w - 1, items.y, "↑", 1, c.dim, c.bg);
    if (this.itemScroll + bodyH < list.length)
      grid.set(items.x + items.w - 1, items.y + bodyH - 1, "↓", 1, c.dim, c.bg);

    // 下：説明と知らせ（知らせは警告の色）。
    const footY = inner.y + bodyH + 1;
    for (let x = inner.x; x < inner.x + inner.w; x++)
      grid.set(x, footY - 1, "─", 1, c.border, c.bg);
    const note =
      this.focus === "items"
        ? (list[this.item]?.note ?? "")
        : "↑↓ で節・Enter で項目へ・Esc で閉じる";
    const noteLines = footH > 1 ? wrapText(note, inner.w).slice(0, footH - 1) : [];
    noteLines.forEach((line, i) => grid.text(inner.x, footY + i, line, c.dim, c.bg, 0, inner.w));
    if (this.message)
      grid.text(
        inner.x,
        footY + footH - 1,
        truncate(this.message, inner.w),
        c.warn,
        c.bg,
        0,
        inner.w,
      );

    this.areas = { sections, items, sub: null, subRows: [], buttons: [] };
    return this.sub ? this.renderSub(grid, this.sub, c, r) : hiddenCursor();
  }

  private renderSub(grid: Grid, sub: Sub, c: DialogColors, outer: Rect): CursorState {
    const a = this.areas!;
    switch (sub.kind) {
      case "choose": {
        const w = Math.min(
          outer.w - 4,
          Math.max(
            24,
            stringWidth(sub.title) + 6,
            ...sub.options.map((o) => stringWidth(o.label) + 6),
          ),
        );
        const h = Math.min(outer.h - 2, sub.options.length + 2);
        const r = centeredRect(grid, w, h);
        const inner = drawBox(grid, r, c, sub.title);
        a.sub = r;
        const rows = inner.h;
        let top = 0;
        if (sub.selected >= rows) top = sub.selected - rows + 1;
        for (let i = 0; i < rows && top + i < sub.options.length; i++) {
          const o = sub.options[top + i]!;
          const y = inner.y + i;
          if (o.heading) {
            grid.text(inner.x, y, truncate(o.label, inner.w), c.dim, c.bg, ATTR.bold);
            continue;
          }
          const on = top + i === sub.selected;
          const bg = on ? c.active : c.bg;
          grid.fill({ x: inner.x, y, w: inner.w, h: 1 }, c.fg, bg);
          grid.text(inner.x, y, o.current ? "●" : " ", c.fg, bg);
          grid.text(inner.x + 2, y, truncate(o.label, inner.w - 2), c.fg, bg, on ? ATTR.bold : 0);
          a.subRows.push({ y, index: top + i });
        }
        return hiddenCursor();
      }
      case "edit": {
        const w = Math.min(outer.w - 4, Math.max(40, stringWidth(sub.title) + 6));
        const r = centeredRect(grid, w, 5);
        const inner = drawBox(grid, r, c, sub.title);
        a.sub = r;
        const view = sub.input.view(inner.w);
        grid.fill({ x: inner.x, y: inner.y, w: inner.w, h: 1 }, c.fg, c.active);
        grid.text(inner.x, inner.y, view.text, c.fg, c.active);
        grid.text(
          inner.x,
          inner.y + 2,
          truncate("Enter で確定・Esc で取り消し", inner.w),
          c.dim,
          c.bg,
        );
        return {
          x: inner.x + view.cursorCol,
          y: inner.y,
          visible: true,
          style: "bar",
          blink: true,
        };
      }
      case "capture": {
        const lines = wrapText(sub.hint, Math.min(outer.w - 8, 60));
        const w = Math.min(outer.w - 4, Math.max(...lines.map((l) => stringWidth(l))) + 4);
        const r = centeredRect(grid, w, lines.length + 2);
        const inner = drawBox(grid, r, c, "キーの取り込み");
        a.sub = r;
        lines.forEach((l, i) => grid.text(inner.x, inner.y + i, l, c.fg, c.bg, 0, inner.w));
        return hiddenCursor();
      }
      case "confirm": {
        const lines = wrapText(sub.title, Math.min(outer.w - 8, 60));
        const w = Math.min(outer.w - 4, Math.max(30, ...lines.map((l) => stringWidth(l) + 4)));
        const r = centeredRect(grid, w, lines.length + 4);
        const inner = drawBox(grid, r, c, "確認");
        a.sub = r;
        lines.forEach((l, i) => grid.text(inner.x, inner.y + i, l, c.fg, c.bg, 0, inner.w));
        a.buttons = drawButtons(
          grid,
          inner.x,
          inner.y + lines.length + 1,
          ["やめる", sub.yesLabel],
          sub.selected,
          c,
        );
        return hiddenCursor();
      }
    }
  }
}

function toSub(a: Activation): Sub {
  switch (a.kind) {
    case "choose": {
      const cur = a.options.findIndex((o) => o.current && !o.heading);
      return { ...a, selected: cur >= 0 ? cur : nextSelectable(a.options, -1, 1) };
    }
    case "edit":
      return { kind: "edit", title: a.title, input: new TextInput(a.initial), commit: a.commit };
    case "capture":
      return { kind: "capture", hint: a.hint, accept: a.accept };
    case "confirm":
      // 取り消せない操作が多いので、安全側（やめる）を選んで開く（web と同じ）。
      return { ...a, selected: 0 };
  }
}

function nextSelectable(options: ChoiceOption[], from: number, dir: 1 | -1): number {
  const n = options.length;
  if (n === 0) return 0;
  for (let step = 1; step <= n; step++) {
    const i = (((from + dir * step) % n) + n) % n;
    if (!options[i]!.heading) return i;
  }
  return Math.max(0, from);
}
