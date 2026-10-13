import type { KeyInput } from "@sodashitsu/client-core";
/** Plain text editor, preserving line breaks and Unicode code points. */
export class MultilineInput {
  value = "";
  cursor = 0;
  set(text: string) {
    this.value = text;
    this.cursor = [...text].length;
  }
  insert(text: string) {
    const chars = [...this.value];
    const clean = text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
    const add = [...clean].slice(0, Math.max(0, 200_000 - chars.length));
    chars.splice(this.cursor, 0, ...add);
    this.cursor += add.length;
    this.value = chars.join("");
  }
  position() {
    const before = [...this.value].slice(0, this.cursor).join("").split("\n");
    return { row: before.length - 1, col: [...before[before.length - 1]!].length };
  }
  key(k: KeyInput) {
    const chars = [...this.value],
      p = this.position(),
      lines = this.value.split("\n");
    const start = this.cursor - p.col;
    if (k.ctrl && k.key === "a") this.cursor = start;
    else if (k.ctrl && k.key === "e") this.cursor = start + [...lines[p.row]!].length;
    else if (k.ctrl || k.alt || k.meta) return false;
    else if (k.key === "ArrowLeft") this.cursor = Math.max(0, this.cursor - 1);
    else if (k.key === "ArrowRight") this.cursor = Math.min(chars.length, this.cursor + 1);
    else if (k.key === "Home") this.cursor = start;
    else if (k.key === "End") this.cursor = start + [...lines[p.row]!].length;
    else if (k.key === "ArrowUp" && p.row > 0)
      this.cursor =
        start - [...lines[p.row - 1]!].length - 1 + Math.min(p.col, [...lines[p.row - 1]!].length);
    else if (k.key === "ArrowDown" && p.row < lines.length - 1)
      this.cursor =
        start + [...lines[p.row]!].length + 1 + Math.min(p.col, [...lines[p.row + 1]!].length);
    else if (k.key === "Backspace") {
      if (this.cursor > 0) {
        chars.splice(--this.cursor, 1);
        this.value = chars.join("");
      }
    } else if (k.key === "Delete") {
      chars.splice(this.cursor, 1);
      this.value = chars.join("");
    } else if (k.key === "Enter") this.insert("\n");
    else if ([...k.key].length === 1) this.insert(k.key);
    else return false;
    return true;
  }
}
