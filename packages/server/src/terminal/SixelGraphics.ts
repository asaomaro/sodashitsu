import { decodeSixel, encodeRasterPng } from "@sodashitsu/client-core/imageCodec";
import type { TranslatedSegment } from "./KittyGraphics.js";
import { CELL_PIXELS } from "./cellPixels.js";
/** SixelのDCSだけをPNG/OSC1337へ変換する。分割入力・中止・上限を追い、他のDCSはそのまま流す。 */
export class SixelGraphicsTranslator {
  private state: "ground" | "esc" | "dcs" | "dcsEsc" | "discard" | "discardEsc" = "ground";
  private data = "";
  private escEmitted = false;
  process(chunk: string): TranslatedSegment[] {
    const out: TranslatedSegment[] = [],
      text: string[] = [];
    const flush = () => {
      if (text.length) {
        out.push({ kind: "text", text: text.join("") });
        text.length = 0;
      }
    };
    const finish = () => {
      const m = /^([\d;]*)q([\s\S]*)$/.exec(this.data);
      if (!m) {
        text.push("\x1bP" + this.data + "\x1b\\");
        return;
      }
      try {
        const r = decodeSixel(m[2]!, m[1]!.split(";")[1] === "1");
        const png = encodeRasterPng(r);
        if (png.length > 1_310_720) throw new Error("Sixel PNG limit");
        const cols = Math.ceil(r.width / CELL_PIXELS.width),
          rows = Math.ceil(r.height / CELL_PIXELS.height);
        flush();
        out.push({
          kind: "image",
          client: `\x1b]1337;File=inline=1;size=${png.length};width=${cols};height=${rows};preserveAspectRatio=0:${Buffer.from(png).toString("base64")}\x07`,
          mirror: "\x1bD".repeat(rows - 1),
        });
      } catch {
        /* invalid/oversized graphic is discarded */
      }
    };
    for (const c of chunk) {
      if (this.state === "ground") {
        if (c === "\x90") {
          this.state = "dcs";
          this.data = "";
        } else if (c === "\x1b") {
          this.state = "esc";
          this.escEmitted = false;
        } else text.push(c);
      } else if (this.state === "esc") {
        if (c === "P") {
          if (this.escEmitted) text.push("\x18");
          this.escEmitted = false;
          this.state = "dcs";
          this.data = "";
        } else {
          if (!this.escEmitted) text.push("\x1b");
          this.escEmitted = false;
          if (c === "\x1b") this.state = "esc";
          else {
            text.push(c);
            this.state = "ground";
          }
        }
      } else if (this.state === "dcs" || this.state === "discard") {
        if (c === "\x9c") {
          if (this.state === "dcs") finish();
          this.data = "";
          this.state = "ground";
        } else if (c === "\x18" || c === "\x1a") {
          this.data = "";
          this.state = "ground";
          text.push(c);
        } else if (c === "\x1b") this.state = this.state === "dcs" ? "dcsEsc" : "discardEsc";
        else if (this.state === "dcs") {
          this.data += c;
          if (this.data.length > 8 * 1024 * 1024) {
            this.data = "";
            this.state = "discard";
          }
        }
      } else {
        if (c === "\\") {
          if (this.state === "dcsEsc") finish();
          this.data = "";
          this.state = "ground";
        } else {
          this.data = "";
          this.state = c === "\x1b" ? "esc" : "ground";
          this.escEmitted = false;
          text.push("\x18");
          if (c !== "\x1b") text.push("\x1b" + c);
        }
      }
    }
    if (this.state === "esc" && !this.escEmitted) {
      text.push("\x1b");
      this.escEmitted = true;
    }
    flush();
    return out;
  }
}
