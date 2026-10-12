import { decodeRasterPng, encodeSixel } from "@sodashitsu/client-core/imageCodec";
import { KittyImages, kittyGraphicsSupported, type KittyPlacement } from "./kittyOutput.js";
type Env = Readonly<Record<string, string | undefined>>;
export type ImageProtocol = "kitty" | "sixel" | "iterm2";
export function terminalImageProtocol(env: Env): ImageProtocol | null {
  const choice = env["SODA_IMAGE_PROTOCOL"];
  if (choice === "off") return null;
  if (env["TMUX"]) return null;
  if (choice === "kitty" || choice === "sixel" || choice === "iterm2") return choice;
  if (kittyGraphicsSupported(env)) return "kitty";
  if (env["WT_SESSION"] || env["TERM_PROGRAM"] === "mlterm") return "sixel";
  if (env["TERM_PROGRAM"] === "iTerm.app") return "iterm2";
  return null;
}
/** Sixel/iTerm2はplacement削除がないため描画前の再描画とセットで使う。 */
export class TerminalImages {
  private kitty = new KittyImages();
  private shown = false;
  private cache = new Map<string, string>();
  private validation = new Map<string, boolean>();
  private cellW: number;
  private cellH: number;
  constructor(
    readonly protocol: ImageProtocol,
    env: Env,
  ) {
    const bounded = (v: string | undefined, fallback: number) => {
      const n = Number(v);
      return Number.isInteger(n) && n > 0 && n <= 128 ? n : fallback;
    };
    this.cellW = bounded(env["SODA_IMAGE_CELL_WIDTH"], 9);
    this.cellH = bounded(env["SODA_IMAGE_CELL_HEIGHT"], 17);
  }
  setCellSize(width: number, height: number) {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 128 ||
      height > 128
    )
      return;
    this.cellW = width;
    this.cellH = height;
    this.cache.clear();
  }
  canRender(base64: string): boolean {
    if (this.protocol === "kitty") return true;
    const cached = this.validation.get(base64);
    if (cached !== undefined) return cached;
    const remember = (valid: boolean) => {
      if (this.validation.size >= 8) this.validation.delete(this.validation.keys().next().value!);
      this.validation.set(base64, valid);
      return valid;
    };
    try {
      if (base64.length > 22 * 1024 * 1024) return false;
      decodeRasterPng(Buffer.from(base64, "base64"));
      return remember(true);
    } catch {
      return remember(false);
    }
  }
  get needsRepaint() {
    return this.protocol !== "kitty" && this.shown;
  }
  sync(placements: readonly KittyPlacement[], keep: ReadonlySet<string> = new Set()): string {
    if (this.protocol === "kitty") return this.kitty.sync(placements, keep);
    this.shown = placements.length > 0;
    const wanted = new Set<string>();
    let out = "";
    for (const p of placements) {
      const key = `${p.imageKey}:${p.cols}x${p.rows}`;
      wanted.add(key);
      let data = this.cache.get(key);
      try {
        if (!data) {
          if (p.base64.length > 22 * 1024 * 1024) continue;
          const r = decodeRasterPng(Buffer.from(p.base64, "base64"));
          data =
            this.protocol === "sixel"
              ? encodeSixel(r, p.cols * this.cellW, p.rows * this.cellH)
              : `\x1b]1337;File=inline=1;width=${p.cols};height=${p.rows};preserveAspectRatio=0:${p.base64}\x07`;
          if (this.cache.size < 8) this.cache.set(key, data);
        }
        out += `\x1b7\x1b[${p.y + 1};${p.x + 1}H${data}\x1b8`;
      } catch {
        /* 不正/非対応PNGは送信しない */
      }
    }
    for (const key of this.cache.keys()) if (!wanted.has(key)) this.cache.delete(key);
    return out;
  }
  forget() {
    this.kitty.forget();
  }
  clear() {
    this.cache.clear();
    const used = this.shown;
    this.shown = false;
    return this.protocol === "kitty" ? this.kitty.clear() : used ? "\x1b[2J" : "";
  }
}
