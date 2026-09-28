/**
 * pane の出力の中の画像（サーバが Kitty graphics を作り直した iTerm2 形式 `OSC 1337 ; File=inline=1;…;width=<桁>;height=<行>… : <base64> BEL`。
 * server の `terminal/KittyGraphics.ts`）。ブラウザの `@xterm/addon-image` は画像を描いた後にカーソルを画像の高さの分だけ下げる（IND）が、
 * 端末版の headless には addon が無いので、同じだけ IND を足してサーバのミラー（`mirror` の列）と画面の並びをそろえる（`InlineImageFilter`）。
 * 画像そのものは `PaneTerminal` が OSC の処理で位置を覚える（`parseInlineImage`）。
 */

/** OSC 1337 File= の中身（`File=` の後）から、置く大きさ（セル）と PNG の base64。読めなければ null。 */
export function parseInlineImage(
  data: string,
): { cols: number; rows: number; base64: string } | null {
  if (!data.startsWith("File=")) return null;
  const colon = data.indexOf(":");
  if (colon < 0) return null;
  const args = new Map<string, string>();
  for (const kv of data.slice(5, colon).split(";")) {
    const eq = kv.indexOf("=");
    if (eq > 0) args.set(kv.slice(0, eq), kv.slice(eq + 1));
  }
  if (args.get("inline") !== "1") return null;
  const cols = Number(args.get("width"));
  const rows = Number(args.get("height"));
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return null;
  const base64 = data.slice(colon + 1);
  if (!/^[A-Za-z0-9+/=]*$/.test(base64) || base64 === "") return null;
  return { cols: Math.min(cols, 1000), rows: Math.min(rows, 1000), base64 };
}

const HEAD = "\x1b]1337;File=";
const HEAD_BYTES = Uint8Array.from([...HEAD].map((c) => c.charCodeAt(0)));
const BEL = 0x07;
const ESC = 0x1b;
/** 1 つの OSC の長さの上限（サーバの上限 2MB の base64 と見出し）。超えたらそろえるのをやめて素通しに戻す。 */
const MAX_OSC = 4 * 1024 * 1024;

/**
 * 出力の流れに、画像の OSC の直後だけ IND（`ESC D`）を高さ-1 回足す（読みで割れた OSC も跨いで追う）。ほかのバイトはそのまま。
 */
export class InlineImageFilter {
  /** 見出しの何バイト目まで一致したか（0 は OSC の外）。 */
  private matched = 0;
  /** OSC の中（見出しの後）で、`:` までの引数を集めている。 */
  private inside = false;
  private header = "";
  private rows = 0;
  private length = 0;
  private sawEsc = false;

  feed(chunk: Uint8Array): Uint8Array {
    const out: number[] = [];
    let changed = false;
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i]!;
      out.push(b);
      if (!this.inside) {
        if (b === HEAD_BYTES[this.matched]) {
          this.matched++;
          if (this.matched === HEAD_BYTES.length) {
            this.inside = true;
            this.matched = 0;
            this.header = "";
            this.rows = 0;
            this.length = 0;
            this.sawEsc = false;
          }
        } else this.matched = b === HEAD_BYTES[0] ? 1 : 0;
        continue;
      }
      this.length++;
      if (this.rows === 0) {
        if (b === 0x3a /* : */) {
          const m = /(?:^|;)height=(\d+)/.exec(this.header);
          this.rows = m ? Number(m[1]) : -1;
        } else if (this.header.length < 512) this.header += String.fromCharCode(b);
      }
      // 終わり：BEL・ST（ESC \）は画像として受けた（IND を足す）。ESC とほかの文字・CAN・SUB は xterm が OSC を捨てる（足さない）。
      let end: "image" | "abort" | null = null;
      if (this.sawEsc) {
        this.sawEsc = false;
        end = b === 0x5c ? "image" : "abort";
        // その ESC は次の列の頭（ESC ] 1337;File= … の画像が続けて来ることもあるので、見出しの一致を ESC から数え直す）。
        if (end === "abort") this.matched = b === HEAD_BYTES[1] ? 2 : b === HEAD_BYTES[0] ? 1 : 0;
      } else if (b === BEL) end = "image";
      else if (b === ESC) this.sawEsc = true;
      else if (b === 0x18 || b === 0x1a) end = "abort";
      if (end === null && this.length > MAX_OSC) end = "abort";
      if (end !== null) {
        this.inside = false;
        if (end === "image" && this.rows > 1) {
          for (let k = 1; k < Math.min(this.rows, 1000); k++) out.push(ESC, 0x44 /* D */);
          changed = true;
        }
      }
    }
    return changed ? Uint8Array.from(out) : chunk;
  }
}
