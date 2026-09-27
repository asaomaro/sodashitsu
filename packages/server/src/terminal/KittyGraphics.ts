import { inflateSync } from "node:zlib";
import { CELL_PIXELS } from "./cellPixels.js";
import { encodePng, isPng, pngSize } from "./png.js";

/**
 * PTY の出力に含まれる Kitty graphics（APC `G`）を解釈し、ブラウザ（`@xterm/addon-image` 0.9.0）が描ける iTerm2 形式
 * （OSC 1337 `File=`）へ作り直す（20260926-kitty-graphics design「振る舞いの詳細」1〜3・decisions D1）。
 *
 * - `text` はミラーとブラウザの両方へ同じ文字列で渡す（Kitty の APC 以外。連結すれば元の出力のまま）。
 * - `image` はブラウザへ `client`（画像の指示＋カーソル移動）、ミラーへ `mirror`（同じだけのカーソル移動）を渡す。
 * - `response` は PTY への応答（ミラーがそれより前の出力を処理し終えた後に書く。decisions D6）。
 *
 * pane の出力は信頼できないものとして扱う: ファイル・共有メモリの転送は開かない（中身をパスとして解釈しない）、
 * 上限を超えたものは捨てる、ブラウザへ埋め込むのはここで作り直した base64 と数値だけ。**投げない**（呼び出し元は PTY の
 * `onData` で、投げると出力が止まる）。
 */

export type TranslatedSegment =
  | { kind: "text"; text: string }
  | { kind: "image"; client: string; mirror: string }
  | { kind: "response"; data: string };

export interface KittyLimits {
  /** APC 1 つの長さ（文字数）。 */
  maxApcBytes: number;
  /** 1 回の送信（分割送信の合計）の復号後の中身のバイト数。 */
  maxPayloadBytes: number;
  /** 画像の画素数。 */
  maxPixels: number;
  /** 画像の 1 辺の画素数。 */
  maxSide: number;
  /** `o=z` の展開後の大きさ。 */
  maxRawBytes: number;
  /** 表示の箱（セル数×基準のセルの画素）の画素数。 */
  maxBoxPixels: number;
  /** 表示の箱の 1 辺のセル数。 */
  maxBoxCells: number;
  /** 保存する画像（PNG のバイト数）の合計。 */
  maxStoredBytes: number;
  /** 保存する画像の枚数。 */
  maxStoredImages: number;
  /**
   * ブラウザへ送る PNG のバイト数。base64 にすると 4/3 倍になり、配信が購読者を stale にする閾値（2MB。`OutputFanout.ts`）を
   * 1 枚で超えると画像が捨てられるので、その手前に抑える（decisions D5）。
   */
  maxPngBytes: number;
}

const MiB = 1024 * 1024;

/** decisions D5。 */
export const DEFAULT_KITTY_LIMITS: Readonly<KittyLimits> = Object.freeze({
  maxApcBytes: 16 * MiB,
  maxPayloadBytes: 16 * MiB,
  maxPixels: 4_194_304,
  maxSide: 8192,
  maxRawBytes: 16 * MiB,
  maxBoxPixels: 4_194_304,
  maxBoxCells: 1000,
  maxStoredBytes: 32 * MiB,
  maxStoredImages: 64,
  maxPngBytes: 1_310_720,
});

const ESC = "\x1b";
const APC_START = "\x1b_G";
const CAN = "\x18";
const STRING_END = /[\x18\x1a\x1b]/g;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const CONTROL_PAIR = /^([A-Za-z])=(-?\d{1,10}|[A-Za-z])$/;
/** `I`（画像の番号）で送られた画像に振る id の始まり（クライアントが `i` で使う小さな値と重ならないように）。 */
const ASSIGNED_ID_BASE = 0x8000_0000;

type Control = Map<string, number | string>;

interface KittyImage {
  png: Uint8Array;
  width: number;
  height: number;
}

interface Pending {
  control: Control;
  parts: Uint8Array[];
  bytes: number;
  /** 上限を超えた（中身は捨てた。完了時に EFBIG で答える）。 */
  tooLarge: boolean;
  /** base64 でない中身があった。 */
  badBase64: boolean;
}

type State = "ground" | "apc" | "apcEsc" | "discard" | "discardEsc";

class CommandError extends Error {}

export class KittyGraphicsTranslator {
  private readonly limits: KittyLimits;
  private readonly cell: { width: number; height: number };
  private state: State = "ground";
  /** `ground` で前の出力が `ESC` / `ESC _` で終わった（decisions D7）。 */
  private tail = "";
  private apcParts: string[] = [];
  private apcLength = 0;
  private pending: Pending | null = null;
  private readonly images = new Map<number, KittyImage>();
  private storedBytes = 0;
  private readonly numberToId = new Map<number, number>();
  private nextAssignedId = ASSIGNED_ID_BASE;

  constructor(
    opts: { limits?: Partial<KittyLimits>; cell?: { width: number; height: number } } = {},
  ) {
    this.limits = { ...DEFAULT_KITTY_LIMITS, ...opts.limits };
    this.cell = opts.cell ?? CELL_PIXELS;
  }

  process(input: string): TranslatedSegment[] {
    const out: TranslatedSegment[] = [];
    if (input === "") return out; // 空の出力で途中の状態（割れた ESC 等）を崩さない
    let chunk = input;
    let pos = 0;

    if (this.state === "ground" && this.tail !== "") {
      const need = APC_START.length - this.tail.length;
      const probe = this.tail + chunk.slice(0, need);
      if (probe === APC_START) {
        // 前の出力で流した `ESC` / `ESC _` を CAN で打ち消してから Kitty として読む（decisions D7）。
        out.push({ kind: "text", text: CAN });
        pos = need;
        this.tail = "";
        this.enterApc();
      } else if (chunk.length < need && APC_START.startsWith(probe)) {
        if (chunk !== "") out.push({ kind: "text", text: chunk });
        this.tail = probe;
        return out;
      } else {
        this.tail = "";
      }
    } else if (this.state === "apcEsc" || this.state === "discardEsc") {
      if (chunk.startsWith("\\")) {
        if (this.state === "apcEsc") this.finishApc(out);
        this.state = "ground";
        pos = 1;
      } else {
        // `ESC` の後が `\` でない: APC を捨て、その `ESC` から読み直す（xterm.js の parser と同じく新しい列の始まり）。
        this.dropApc();
        this.state = "ground";
        chunk = ESC + chunk;
      }
    }

    while (pos < chunk.length) {
      if (this.state === "ground") {
        const at = chunk.indexOf(APC_START, pos);
        if (at < 0) {
          const rest = pos === 0 ? chunk : chunk.slice(pos);
          out.push({ kind: "text", text: rest });
          if (rest.endsWith(ESC + "_")) this.tail = ESC + "_";
          else if (rest.endsWith(ESC)) this.tail = ESC;
          return out;
        }
        if (at > pos) out.push({ kind: "text", text: chunk.slice(pos, at) });
        pos = at + APC_START.length;
        this.enterApc();
        continue;
      }

      // apc / discard: 次の ESC・CAN・SUB を探す。
      STRING_END.lastIndex = pos;
      const m = STRING_END.exec(chunk);
      const end = m ? m.index : chunk.length;
      if (this.state === "apc" && end > pos) {
        this.apcParts.push(chunk.slice(pos, end));
        this.apcLength += end - pos;
        if (this.apcLength > this.limits.maxApcBytes) {
          // 長すぎる APC は ST まで読み捨てる。途中の分割送信も捨てる。
          this.dropApc();
          this.pending = null;
          this.state = "discard";
        }
      }
      if (!m) return out;
      const ch = chunk[end];
      if (ch !== ESC) {
        // CAN・SUB: APC を取り消す。CAN・SUB 自体は通常の出力として読む。
        this.dropApc();
        this.state = "ground";
        pos = end;
        continue;
      }
      if (end + 1 >= chunk.length) {
        this.state = this.state === "apc" ? "apcEsc" : "discardEsc";
        return out;
      }
      if (chunk[end + 1] === "\\") {
        if (this.state === "apc") this.finishApc(out);
        this.state = "ground";
        pos = end + 2;
      } else {
        this.dropApc();
        this.state = "ground";
        pos = end;
      }
    }
    return out;
  }

  dispose(): void {
    this.dropApc();
    this.pending = null;
    this.images.clear();
    this.numberToId.clear();
    this.storedBytes = 0;
  }

  private enterApc(): void {
    this.state = "apc";
    this.apcParts = [];
    this.apcLength = 0;
  }

  private dropApc(): void {
    this.apcParts = [];
    this.apcLength = 0;
  }

  private finishApc(out: TranslatedSegment[]): void {
    const body = this.apcParts.join("");
    this.dropApc();
    try {
      this.handleApc(body, out);
    } catch {
      // 想定外の例外でも出力は止めない（その APC を捨てる）。
    }
  }

  private handleApc(body: string, out: TranslatedSegment[]): void {
    const semi = body.indexOf(";");
    const control = parseControl(semi < 0 ? body : body.slice(0, semi));
    if (!control) return; // 形の誤り（応答しない）
    const payload = semi < 0 ? "" : body.slice(semi + 1);

    const continuation =
      this.pending !== null && [...control.keys()].every((k) => k === "m" || k === "q");
    if (!continuation) this.pending = null; // 新しいコマンドが来たら途中の分割送信は捨てる

    const more = control.get("m") === 1;
    if (continuation || more) {
      const pending =
        this.pending ??
        (this.pending = { control, parts: [], bytes: 0, tooLarge: false, badBase64: false });
      this.appendPayload(pending, payload);
      if (more) return;
      this.pending = null;
      this.execute(pending, out);
      return;
    }
    const single: Pending = { control, parts: [], bytes: 0, tooLarge: false, badBase64: false };
    this.appendPayload(single, payload);
    this.execute(single, out);
  }

  private appendPayload(pending: Pending, payload: string): void {
    if (pending.tooLarge || pending.badBase64 || payload === "") return;
    if (!BASE64.test(payload)) {
      pending.badBase64 = true;
      pending.parts = [];
      return;
    }
    const bytes = Buffer.from(payload, "base64");
    if (pending.bytes + bytes.length > this.limits.maxPayloadBytes) {
      pending.tooLarge = true;
      pending.parts = [];
      return;
    }
    pending.parts.push(bytes);
    pending.bytes += bytes.length;
  }

  private execute(pending: Pending, out: TranslatedSegment[]): void {
    const c = pending.control;
    const action = str(c, "a") ?? "t";
    const quiet = num(c, "q") ?? 0;
    const id = positive(num(c, "i"));
    const number = positive(num(c, "I"));

    const respond = (message: string, imageId: number | undefined = id): void => {
      if (id === undefined && number === undefined) return;
      if (message === "OK" ? quiet >= 1 : quiet >= 2) return;
      const ids = [
        ...(imageId !== undefined ? [`i=${imageId}`] : []),
        ...(number !== undefined ? [`I=${number}`] : []),
      ].join(",");
      out.push({ kind: "response", data: `\x1b_G${ids};${message}\x1b\\` });
    };

    if (id !== undefined && number !== undefined) {
      respond("EINVAL:cannot specify both i and I keys");
      return;
    }

    try {
      switch (action) {
        case "d":
          this.delete(c, id, number);
          return;
        case "q":
        case "t":
        case "T": {
          if ((str(c, "t") ?? "d") !== "d")
            throw new CommandError("EINVAL:unsupported transmission medium");
          if (pending.tooLarge) throw new CommandError("EFBIG:image data too large");
          if (pending.badBase64) throw new CommandError("EINVAL:invalid base64 data");
          const data = Buffer.concat(pending.parts);
          if (action === "q" && data.length === 0) {
            respond("OK");
            return;
          }
          const image = this.buildImage(c, data);
          if (action === "q") {
            respond("OK");
            return;
          }
          let imageId = id;
          if (number !== undefined) imageId = this.nextAssignedId++;
          if (imageId !== undefined && this.store(imageId, image) && number !== undefined)
            this.numberToId.set(number, imageId);
          if (action === "T") this.display(c, image, out);
          respond("OK", imageId);
          return;
        }
        case "p": {
          const imageId = id ?? (number !== undefined ? this.numberToId.get(number) : undefined);
          const image = imageId !== undefined ? this.images.get(imageId) : undefined;
          if (!image) throw new CommandError("ENOENT:image not found");
          this.display(c, image, out);
          respond("OK", imageId);
          return;
        }
        default:
          throw new CommandError("EINVAL:unsupported action");
      }
    } catch (err) {
      respond(err instanceof CommandError ? err.message : "EINVAL:internal error");
    }
  }

  private buildImage(c: Control, data: Uint8Array): KittyImage {
    const format = num(c, "f") ?? 32;
    const compression = str(c, "o");
    if (compression !== undefined && compression !== "z")
      throw new CommandError("EINVAL:unsupported compression");
    let bytes = data;
    if (compression === "z") {
      const limit = format === 100 ? this.limits.maxPayloadBytes : this.limits.maxRawBytes;
      try {
        bytes = inflateSync(data, { maxOutputLength: limit });
      } catch {
        throw new CommandError("EINVAL:decompression failed");
      }
    }
    if (format === 100) {
      const size = pngSize(bytes);
      if (!size || !isPng(bytes)) throw new CommandError("EINVAL:invalid png");
      this.checkPixels(size.width, size.height);
      return this.checkPng({ png: bytes, width: size.width, height: size.height });
    }
    if (format === 24 || format === 32) {
      const width = positive(num(c, "s"));
      const height = positive(num(c, "v"));
      if (width === undefined || height === undefined)
        throw new CommandError("EINVAL:width and height required for raw pixel data");
      this.checkPixels(width, height);
      const channels = format === 32 ? 4 : 3;
      if (bytes.length < width * height * channels)
        throw new CommandError("EINVAL:insufficient pixel data");
      return this.checkPng({ png: encodePng(bytes, width, height, channels), width, height });
    }
    throw new CommandError("EINVAL:unsupported format");
  }

  private checkPng(image: KittyImage): KittyImage {
    if (image.png.byteLength > this.limits.maxPngBytes)
      throw new CommandError("EFBIG:image too large to transfer");
    return image;
  }

  private checkPixels(width: number, height: number): void {
    if (width < 1 || height < 1) throw new CommandError("EINVAL:invalid image size");
    if (
      width > this.limits.maxSide ||
      height > this.limits.maxSide ||
      width * height > this.limits.maxPixels
    ) {
      throw new CommandError("EFBIG:image too large");
    }
  }

  private display(c: Control, image: KittyImage, out: TranslatedSegment[]): void {
    if (num(c, "U") === 1) throw new CommandError("EINVAL:unicode placeholders not supported");
    const { cols, rows } = this.placement(c, image);
    const move = num(c, "C") === 1 ? (rows > 1 ? `\x1b[${rows - 1}A` : "") : `\x1b[${cols}C`;
    const b64 = Buffer.from(image.png.buffer, image.png.byteOffset, image.png.byteLength).toString(
      "base64",
    );
    const client = `\x1b]1337;File=inline=1;size=${image.png.byteLength};width=${cols};height=${rows};preserveAspectRatio=0:${b64}\x07${move}`;
    // ミラーの行送りは IND（`ESC D`）。LF は LNM（`CSI 20 h`）で x を 0 に戻すが、ブラウザの addon は各行の後に x を画像の左端の列へ戻すので、
    // x を変えない IND でそろえる（スクロールは LF と同じ）。
    out.push({ kind: "image", client, mirror: "\x1bD".repeat(rows - 1) + move });
  }

  /** 表示のセル数（design「振る舞いの詳細」3 の表）。 */
  private placement(c: Control, image: KittyImage): { cols: number; rows: number } {
    const cw = this.cell.width;
    const ch = this.cell.height;
    const wantCols = positive(num(c, "c"));
    const wantRows = positive(num(c, "r"));
    let cols: number;
    let rows: number;
    if (wantCols !== undefined && wantRows !== undefined) {
      cols = wantCols;
      rows = wantRows;
    } else if (wantCols !== undefined) {
      cols = wantCols;
      rows = Math.max(1, Math.ceil((wantCols * cw * image.height) / (image.width * ch)));
    } else if (wantRows !== undefined) {
      rows = wantRows;
      cols = Math.max(1, Math.ceil((wantRows * ch * image.width) / (image.height * cw)));
    } else {
      cols = Math.max(1, Math.ceil(image.width / cw));
      rows = Math.max(1, Math.ceil(image.height / ch));
    }
    if (
      cols > this.limits.maxBoxCells ||
      rows > this.limits.maxBoxCells ||
      cols * cw * rows * ch > this.limits.maxBoxPixels
    ) {
      throw new CommandError("EFBIG:placement too large");
    }
    return { cols, rows };
  }

  /** 保存する（保存できたら true）。 */
  private store(imageId: number, image: KittyImage): boolean {
    this.forget(imageId);
    if (image.png.byteLength > this.limits.maxStoredBytes) return false;
    while (
      this.images.size > 0 &&
      (this.storedBytes + image.png.byteLength > this.limits.maxStoredBytes ||
        this.images.size + 1 > this.limits.maxStoredImages)
    ) {
      const oldest = this.images.keys().next().value as number;
      this.forget(oldest);
    }
    this.images.set(imageId, image);
    this.storedBytes += image.png.byteLength;
    return true;
  }

  private forget(imageId: number): void {
    const image = this.images.get(imageId);
    if (!image) return;
    this.images.delete(imageId);
    this.storedBytes -= image.png.byteLength;
    // 番号の対応表も同じだけ縮める（画像を捨てても対応が残ると、番号を変えて送り続ける出力で表が際限なく伸びる）。
    for (const [number, mapped] of this.numberToId)
      if (mapped === imageId) this.numberToId.delete(number);
  }

  /** `a=d`。表示は消せない（decisions D1）。大文字（`A`・`I`）の指定だけ、保存した画像を捨てる。応答しない。 */
  private delete(c: Control, id: number | undefined, number: number | undefined): void {
    const target = str(c, "d") ?? "a";
    if (target === "A") {
      this.images.clear();
      this.numberToId.clear();
      this.storedBytes = 0;
    } else if (target === "I") {
      const imageId = id ?? (number !== undefined ? this.numberToId.get(number) : undefined);
      if (imageId !== undefined) this.forget(imageId);
    }
  }
}

function parseControl(text: string): Control | null {
  const control: Control = new Map();
  if (text === "") return control;
  for (const pair of text.split(",")) {
    const m = CONTROL_PAIR.exec(pair);
    if (!m) return null;
    const value = m[2]!;
    const n = /^-?\d/.test(value) ? Number(value) : value;
    if (typeof n === "number" && (n < -0x8000_0000 || n > 0xffff_ffff)) return null;
    control.set(m[1]!, n);
  }
  return control;
}

function num(c: Control, key: string): number | undefined {
  const v = c.get(key);
  return typeof v === "number" ? v : undefined;
}

function str(c: Control, key: string): string | undefined {
  const v = c.get(key);
  return typeof v === "string" ? v : undefined;
}

function positive(n: number | undefined): number | undefined {
  return n !== undefined && n > 0 ? n : undefined;
}
