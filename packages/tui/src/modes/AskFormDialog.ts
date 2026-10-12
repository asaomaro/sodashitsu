import { ScrollBar } from "./ScrollBar.js";
import {
  initialAskState,
  collectAsk,
  askCommentable,
  type AskPending,
  type AskFormState,
  type AskQuestion,
} from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import { TextInput } from "./TextInput.js";
import { safeText } from "./document.js";
import { stringWidth } from "../render/width.js";
import {
  centeredRect,
  drawBox,
  dialogColors,
  hiddenCursor,
  inside,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import type { Rect } from "../render/Screen.js";
type Row = {
  key: string;
  text: string;
  input?: TextInput;
  set?: (value: string) => void;
  act?: (direction: number) => void;
  rank?: (direction: number) => void;
};
/** テキストの質問6種類を共有の回答モデルで扱う。リサイズ時に入力状態を作り直さない。 */
export class AskFormDialog implements Overlay {
  private state: AskFormState;
  private inputs = new Map<string, TextInput>();
  private selected = 0;
  private readonly scrollbar = new ScrollBar();
  handleScrollMouse(ev: OverlayMouse) {
    return this.scrollbar.handleMouse(ev);
  }
  cancelInteraction() {
    this.scrollbar.cancel();
  }
  private scroll = 0;
  private rect: Rect | null = null;
  private hits: { rect: Rect; index: number }[] = [];
  private error = "";
  private busy = false;
  private dead = false;
  constructor(
    private ask: AskPending,
    private origin: string,
    private answer: (body: ReturnType<typeof collectAsk>) => Promise<void>,
    private close: () => Promise<void>,
    private redraw: () => void,
  ) {
    this.state = initialAskState(ask.spec);
    // 質問IDは外部の値。特殊なキーも辞書の自分の項目として保持する。
    for (const key of [
      "picked",
      "otherPicked",
      "otherText",
      "text",
      "comments",
      "order",
      "rowPick",
    ] as const) {
      const record = Object.assign(Object.create(null), this.state[key] ?? {});
      Object.assign(this.state, { [key]: record });
    }
    for (const q of ask.spec.questions) {
      if (q.type === "text" || q.type === "edit")
        this.state.text[q.id] =
          q.type === "edit" ? (q.text ?? "") : typeof q.default === "string" ? q.default : "";
    }
  }
  private rows(): Row[] {
    const spec = this.ask.spec,
      rows: Row[] = [
        {
          key: "intro",
          text: spec.intro ?? "Tab/↑↓ 移動 · Space/←→ 選択 · Ctrl+Enter 送信 · Alt+Enter 最大化",
        },
      ];
    const collected = collectAsk(spec, this.state);
    const field = (key: string, text: string, value: string, set: (s: string) => void) => {
      let input = this.inputs.get(key);
      if (!input) {
        input = new TextInput(value);
        this.inputs.set(key, input);
      }
      rows.push({ key, text, input, set });
    };
    for (const q of spec.questions) {
      if (!collected.visible.includes(q.id)) continue;
      const id = q.id,
        prefix = "q:" + id + ":";
      rows.push({ key: prefix + "heading", text: `${q.label}${q.required ? " *" : ""}` });
      if (q.help) rows.push({ key: prefix + "help", text: q.help });
      if (q.type === "text" || q.type === "edit")
        field(prefix + "text", "回答", this.state.text[id] ?? "", (s) => {
          this.state.text[id] = s;
        });
      else if (q.type === "rank") {
        const order = this.state.order![id] ?? q.options.map((o) => o.value);
        this.state.order![id] = order;
        order.forEach((value, index) =>
          rows.push({
            key: prefix + "rank:" + value,
            text: `${index + 1}. ${q.options.find((o) => o.value === value)?.label ?? value} (Ctrl+↑↓ 並べ替え)`,
            rank: (direction) => {
              const other = Math.max(0, Math.min(order.length - 1, index + direction));
              [order[index], order[other]] = [order[other]!, order[index]!];
              this.selected += other - index;
            },
          }),
        );
      } else if (q.type === "table") {
        const values = q.options.map((o) => o.value);
        const picks = this.state.rowPick![id] ?? Object.create(null);
        this.state.rowPick![id] = picks;
        for (const row of Array.isArray(q.rows) ? q.rows : []) {
          if (!Object.hasOwn(picks, row.value))
            Object.defineProperty(picks, row.value, {
              value: row.default ?? (typeof q.default === "string" ? q.default : values[0]) ?? "",
              writable: true,
              enumerable: true,
              configurable: true,
            });
          rows.push({
            key: prefix + "row:" + row.value,
            text: `${row.label}: ${q.options.find((o) => o.value === picks[row.value])?.label ?? "—"} ◀▶`,
            act: (d) => {
              picks[row.value] =
                values[(values.indexOf(picks[row.value]) + d + values.length) % values.length] ??
                "";
            },
          });
        }
      } else {
        for (const o of q.options) {
          const picked = this.state.picked[id] ?? [];
          rows.push({
            key: prefix + "option:" + o.value,
            text: `${picked.includes(o.value) ? (q.type === "multi" ? "[✓]" : "(●)") : q.type === "multi" ? "[ ]" : "( )"} ${o.label}${o.desc ? " · " + o.desc : ""}`,
            act: () => {
              if (q.type === "single") this.state.otherPicked[id] = false;
              this.state.picked[id] =
                q.type === "single"
                  ? [o.value]
                  : picked.includes(o.value)
                    ? picked.filter((v) => v !== o.value)
                    : [...picked, o.value];
            },
          });
        }
        if (q.allowOther) {
          rows.push({
            key: prefix + "other",
            text: `${this.state.otherPicked[id] ? "[✓]" : "[ ]"} ${q.otherLabel ?? "その他"}`,
            act: () => {
              this.state.otherPicked[id] = !this.state.otherPicked[id];
              if (q.type === "single" && this.state.otherPicked[id]) this.state.picked[id] = [];
            },
          });
          if (this.state.otherPicked[id])
            field(prefix + "other-text", "自由入力", this.state.otherText[id] ?? "", (s) => {
              this.state.otherText[id] = s;
            });
        }
      }
      if (askCommentable(spec, q))
        field(prefix + "comment", "補足（任意）", this.state.comments?.[id] ?? "", (s) => {
          this.state.comments![id] = s;
        });
    }
    if (spec.note)
      field("note", "全体への補足", this.state.note, (s) => {
        this.state.note = s;
      });
    rows.push(
      {
        key: "submit",
        text: `[ ${spec.submit} ]`,
        act: () => {
          void this.submit();
        },
      },
      {
        key: "cancel",
        text: "[ キャンセル ]",
        act: () => {
          this.cancel();
        },
      },
    );
    return rows;
  }
  private editText(row: Row, text: string) {
    if (!row.input) return;
    const chars = [...row.input.value],
      cursor = row.input.cursor;
    const clean = text
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "")
      .replace(/\r\n?/g, "\n");
    chars.splice(cursor, 0, ...clean);
    row.input.value = chars.join("");
    row.input.cursor = cursor + [...clean].length;
    row.set?.(row.input.value);
  }
  handleKey(k: KeyInput) {
    this.scrollbar.cancel();
    if (this.busy) return;
    if (k.key === "Escape") {
      this.cancel();
      return;
    }
    if (k.ctrl && k.key === "Enter") {
      void this.submit();
      return;
    }
    const rows = this.rows(),
      row = rows[this.selected];
    if (k.ctrl && (k.key === "ArrowUp" || k.key === "ArrowDown") && row?.rank)
      row.rank(k.key === "ArrowUp" ? -1 : 1);
    else if (k.key === "Tab" || k.key === "ArrowDown" || k.key === "ArrowUp")
      this.selected =
        (this.selected + (k.shift || k.key === "ArrowUp" ? -1 : 1) + rows.length) % rows.length;
    else if (row?.input) {
      if (k.key === "Enter") this.editText(row, "\n");
      else {
        row.input.handleKey(k);
        row.set?.(row.input.value);
      }
    } else if (
      k.key === " " ||
      k.key === "Enter" ||
      k.key === "ArrowRight" ||
      k.key === "ArrowLeft"
    )
      row?.act?.(k.key === "ArrowLeft" ? -1 : 1);
    this.redraw();
  }
  handlePaste(text: string) {
    const row = this.rows()[this.selected];
    if (!this.busy && row) this.editText(row, text);
    this.redraw();
  }
  handleMouse(e: OverlayMouse) {
    if (this.handleScrollMouse(e)) return true;
    if (!inside(this.rect, e.x, e.y)) return false;
    if (this.busy) return true;
    if (e.action === "wheel")
      this.handleKey({
        key: e.button === 64 ? "ArrowUp" : "ArrowDown",
        code: "",
        type: "keydown",
        composing: false,
        ctrl: false,
        alt: false,
        meta: false,
        shift: false,
      });
    if (e.action === "down" && e.button === 0) {
      const h = this.hits.find((h) => inside(h.rect, e.x, e.y));
      if (h) {
        this.selected = h.index;
        this.rows()[h.index]?.act?.(1);
        this.redraw();
      }
    }
    return true;
  }
  private async submit() {
    const body = collectAsk(this.ask.spec, this.state);
    if (body.lacking.length) {
      this.error =
        "未回答の質問があります: " +
        body.lacking
          .map((id) => this.ask.spec.questions.find((q) => q.id === id)?.label ?? id)
          .join("、");
      this.redraw();
      return;
    }
    await this.perform(() => this.answer(body));
  }
  private async perform(fn: () => Promise<void>) {
    if (this.busy || this.dead) return;
    this.busy = true;
    this.error = "";
    this.redraw();
    try {
      await fn();
    } catch {
      if (!this.dead) this.error = "送信できません。接続を確認して再試行してください。";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  cancel() {
    void this.perform(this.close);
  }
  canLeave() {
    return !this.busy;
  }
  dispose() {
    this.dead = true;
  }
  render({ grid, theme }: OverlayRenderContext) {
    this.rect = centeredRect(grid, grid.w - 2, grid.h - 2);
    const c = dialogColors(theme),
      body = drawBox(grid, this.rect, c, safeText(this.origin + " · " + this.ask.spec.title));
    body.w = Math.max(0, body.w - 1);
    const rows = this.rows();
    this.selected = Math.min(this.selected, rows.length - 1);
    const height = Math.max(1, body.h - 2);
    if (this.selected < this.scroll) this.scroll = this.selected;
    if (this.selected >= this.scroll + height) this.scroll = this.selected - height + 1;
    this.hits = [];
    let cursor = hiddenCursor();
    rows.slice(this.scroll, this.scroll + height).forEach((row, i) => {
      const index = this.scroll + i,
        y = body.y + i,
        bg = index === this.selected ? c.active : c.bg;
      const prefix = row.text + ": ";
      const prefixWidth = Math.min(stringWidth(prefix), Math.max(0, body.w - 1));
      const displayed = row.input
        ? new TextInput(row.input.value.replace(/\n/g, "↵").replace(/\t/g, "→"))
        : null;
      if (displayed && row.input) displayed.cursor = row.input.cursor;
      const field = displayed?.view(Math.max(1, body.w - prefixWidth));
      grid.text(
        body.x,
        y,
        safeText(row.input ? prefix : row.text),
        c.fg,
        bg,
        0,
        row.input ? prefixWidth : body.w,
      );
      if (field)
        grid.text(body.x + prefixWidth, y, safeText(field.text), c.fg, bg, 0, body.w - prefixWidth);
      this.hits.push({ index, rect: { x: body.x, y, w: body.w, h: 1 } });
      if (index === this.selected && field && !this.busy)
        cursor = { ...cursor, x: body.x + prefixWidth + field.cursorCol, y, visible: true };
    });
    grid.text(
      body.x,
      body.y + body.h - 2,
      safeText(this.busy ? "送信中…" : this.error),
      c.warn,
      c.bg,
      0,
      body.w,
    );
    grid.text(
      body.x,
      body.y + body.h - 1,
      "Ctrl+Enter 決定 · Alt+Enter 最大化/復元 · Alt+矢印 サイズ · Esc キャンセル",
      c.dim,
      c.bg,
      0,
      body.w,
    );
    this.scrollbar.render(
      grid,
      { ...body, w: body.w + 1, h: height },
      rows.length,
      this.scroll,
      c,
      (offset) => {
        this.scroll = offset;
        this.selected = Math.max(offset, Math.min(this.selected, offset + height - 1));
      },
    );
    return cursor;
  }
}
