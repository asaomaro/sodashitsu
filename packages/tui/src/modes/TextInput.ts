import type { KeyInput } from "@sodashitsu/client-core";
import { charWidth, stringWidth } from "../render/width.js";

/**
 * 1 行の入力欄（名前の変更・ブランチ名・絞り込み）。←→・Home/End・Backspace/Delete・Ctrl+A/E/U/K/W（readline と同じ）。
 * 貼り付けは改行を空白にして入れる（1 行の欄に改行を入れない）。
 */
export class TextInput {
  private chars: string[];
  cursor: number;

  constructor(initial = "") {
    this.chars = [...initial];
    this.cursor = this.chars.length;
  }

  get value(): string {
    return this.chars.join("");
  }

  set value(v: string) {
    this.chars = [...v];
    this.cursor = this.chars.length;
  }

  /** 入力欄として扱ったら true（Enter・Esc 等は呼び出し側が先に見る）。 */
  handleKey(k: KeyInput): boolean {
    if (k.ctrl && !k.alt) {
      switch (k.key) {
        case "a":
          this.cursor = 0;
          return true;
        case "e":
          this.cursor = this.chars.length;
          return true;
        case "u":
          this.chars.splice(0, this.cursor);
          this.cursor = 0;
          return true;
        case "k":
          this.chars.splice(this.cursor);
          return true;
        case "w": {
          let i = this.cursor;
          while (i > 0 && this.chars[i - 1] === " ") i--;
          while (i > 0 && this.chars[i - 1] !== " ") i--;
          this.chars.splice(i, this.cursor - i);
          this.cursor = i;
          return true;
        }
        case "h":
          return this.handleKey({ ...k, ctrl: false, key: "Backspace" });
        default:
          return false;
      }
    }
    switch (k.key) {
      case "ArrowLeft":
        this.cursor = Math.max(0, this.cursor - 1);
        return true;
      case "ArrowRight":
        this.cursor = Math.min(this.chars.length, this.cursor + 1);
        return true;
      case "Home":
        this.cursor = 0;
        return true;
      case "End":
        this.cursor = this.chars.length;
        return true;
      case "Backspace":
        if (this.cursor > 0) {
          this.chars.splice(this.cursor - 1, 1);
          this.cursor--;
        }
        return true;
      case "Delete":
        this.chars.splice(this.cursor, 1);
        return true;
      default:
        break;
    }
    if (!k.alt && !k.meta && [...k.key].length === 1 && k.key >= " ") {
      this.insert(k.key);
      return true;
    }
    return false;
  }

  insert(text: string): void {
    const add = [...text.replace(/[\r\n\t]+/g, " ")].filter((c) => c >= " ");
    this.chars.splice(this.cursor, 0, ...add);
    this.cursor += add.length;
  }

  /**
   * 幅 `width` の欄に見える部分と、その中のカーソルの桁（カーソルが見えるよう左を切る）。
   */
  view(width: number): { text: string; cursorCol: number } {
    if (width <= 0) return { text: "", cursorCol: 0 };
    let start = 0;
    const before = (): number => stringWidth(this.chars.slice(start, this.cursor).join(""));
    while (start < this.cursor && before() > width - 1) start++;
    let text = "";
    let w = 0;
    for (let i = start; i < this.chars.length; i++) {
      const cw = charWidth(this.chars[i]!.codePointAt(0)!);
      if (w + cw > width) break;
      text += this.chars[i];
      w += cw;
    }
    return { text, cursorCol: before() };
  }
}
