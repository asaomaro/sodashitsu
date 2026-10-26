import {
  DesktopRichClipboardResult,
  encodeClipboardBundle,
  decodeClipboardBundle,
  clipboardPngSize,
  DESKTOP_CLIPBOARD_CHUNK_BYTES,
  DESKTOP_CLIPBOARD_PNG_BYTES,
  DESKTOP_CLIPBOARD_MARKUP_BYTES,
  DESKTOP_CLIPBOARD_TEXT_BYTES,
  type DesktopClipboardBundle,
  type DesktopRichClipboardRequest,
  type DesktopRichClipboardResult as Result,
} from "@sodashitsu/protocol";
const base64 = (bytes: Uint8Array) => {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
};
const bytes = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export class DesktopRichClipboardClient {
  private epoch = 0;
  private dead = false;
  private current:
    | {
        id: string;
        epoch: number;
        pending?: {
          resolve(value: Result): void;
          reject(error: Error): void;
          timer: ReturnType<typeof setTimeout>;
        };
      }
    | undefined;
  constructor(
    private send: (value: DesktopRichClipboardRequest) => boolean,
    private allowed: () => boolean,
  ) {}
  private active(c: NonNullable<DesktopRichClipboardClient["current"]>) {
    return !this.dead && this.allowed() && this.current === c && c.epoch === this.epoch;
  }
  private request(
    c: NonNullable<DesktopRichClipboardClient["current"]>,
    value: DesktopRichClipboardRequest,
  ): Promise<Result> {
    if (!this.active(c) || c.pending)
      return Promise.reject(Error("画像・書式のクリップボード共有は終了しました"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete c.pending;
        reject(Error("画像・書式の転送がタイムアウトしました"));
      }, 3000);
      c.pending = { resolve, reject, timer };
      if (!this.send(value)) {
        clearTimeout(timer);
        delete c.pending;
        reject(Error("クリップボードの転送経路が利用できません"));
      }
    });
  }
  receive(raw: unknown) {
    const m = DesktopRichClipboardResult.parse(raw),
      c = this.current;
    if (!c || !this.active(c) || c.id !== m.id) return;
    const pending = c.pending;
    if (!pending) throw Error("Unexpected clipboard result");
    clearTimeout(pending.timer);
    delete c.pending;
    if (!m.ok)
      pending.reject(
        Error("画像・書式を転送できませんでした。許可・容量・現地のコピー変更を確認してください"),
      );
    else pending.resolve(m);
  }
  private start() {
    if (this.dead || !this.allowed() || this.current)
      throw Error("クリップボードが転送中か許可されていません");
    return (this.current = { id: crypto.randomUUID(), epoch: this.epoch });
  }
  private finish(c: NonNullable<DesktopRichClipboardClient["current"]>, complete: boolean) {
    if (this.current !== c) return;
    this.current = undefined;
    if (!complete) this.send({ type: "clipboard_rich", id: c.id, operation: "cancel" });
  }
  async read(): Promise<DesktopClipboardBundle> {
    const c = this.start();
    let data: Uint8Array | undefined,
      complete = false;
    try {
      const result = await this.request(c, { type: "clipboard_rich", id: c.id, operation: "read" });
      if (!this.active(c) || result.stage !== "begin" || result.size === undefined)
        throw Error("Invalid clipboard begin");
      data = new Uint8Array(result.size);
      let offset = 0;
      while (offset < data.length) {
        const response = await this.request(c, {
          type: "clipboard_rich",
          id: c.id,
          operation: "pull",
          offset,
        });
        if (!this.active(c) || response.stage !== "chunk" || !response.data)
          throw Error("Invalid clipboard chunk");
        const chunk = bytes(response.data);
        if (response.offset !== offset + chunk.length || offset + chunk.length > data.length)
          throw Error("Invalid clipboard offset");
        data.set(chunk, offset);
        offset += chunk.length;
        chunk.fill(0);
      }
      const bundle = decodeClipboardBundle(data);
      complete = true;
      return bundle;
    } finally {
      data?.fill(0);
      this.finish(c, complete);
    }
  }
  async write(bundle: DesktopClipboardBundle) {
    const data = encodeClipboardBundle(bundle),
      c = this.start();
    let complete = false;
    try {
      let response = await this.request(c, {
        type: "clipboard_rich",
        id: c.id,
        operation: "begin",
        size: data.length,
      });
      if (!this.active(c) || response.stage !== "begin" || response.size !== data.length)
        throw Error("Invalid clipboard begin");
      for (let offset = 0; offset < data.length;) {
        const end = Math.min(offset + DESKTOP_CLIPBOARD_CHUNK_BYTES, data.length);
        response = await this.request(c, {
          type: "clipboard_rich",
          id: c.id,
          operation: "push",
          offset,
          data: base64(data.subarray(offset, end)),
        });
        if (!this.active(c) || response.stage !== "chunk" || response.offset !== end)
          throw Error("Invalid clipboard offset");
        offset = end;
      }
      response = await this.request(c, { type: "clipboard_rich", id: c.id, operation: "commit" });
      if (!this.active(c) || response.stage !== "done") throw Error("Invalid clipboard commit");
      complete = true;
    } finally {
      data.fill(0);
      this.finish(c, complete);
    }
  }
  cancel() {
    this.epoch++;
    const c = this.current;
    this.current = undefined;
    if (c?.pending) {
      clearTimeout(c.pending.timer);
      c.pending.reject(Error("画像・書式の転送を取り消しました"));
      delete c.pending;
    }
    if (c && !this.dead) this.send({ type: "clipboard_rich", id: c.id, operation: "cancel" });
  }
  stop() {
    if (this.dead) return;
    this.cancel();
    this.dead = true;
  }
}
export async function readRichClipboard(): Promise<DesktopClipboardBundle> {
  if (!navigator.clipboard?.read)
    throw Error("このブラウザは画像・書式の読み取りに対応していません");
  const items = await navigator.clipboard.read();
  if (items.length !== 1) throw Error("クリップボードは1項目ずつ転送してください");
  const item = items[0]!,
    bundle: DesktopClipboardBundle = {};
  for (const [mime, key, max] of [
    ["text/plain", "text", DESKTOP_CLIPBOARD_TEXT_BYTES],
    ["text/html", "html", DESKTOP_CLIPBOARD_MARKUP_BYTES],
    ["text/rtf", "rtf", DESKTOP_CLIPBOARD_MARKUP_BYTES],
    ["image/png", "png", DESKTOP_CLIPBOARD_PNG_BYTES],
  ] as const) {
    if (!item.types.includes(mime)) continue;
    const blob = await item.getType(mime);
    if (blob.size > max) throw Error("クリップボードの形式ごとの容量上限を超えています");
    if (key === "png" || key === "rtf") {
      const data = new Uint8Array(await blob.arrayBuffer());
      if (key === "png") clipboardPngSize(data);
      bundle[key] = base64(data);
      data.fill(0);
    } else bundle[key] = await blob.text();
  }
  encodeClipboardBundle(bundle);
  return bundle;
}
export async function writeRichClipboard(bundle: DesktopClipboardBundle) {
  encodeClipboardBundle(bundle);
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write)
    throw Error("このブラウザは画像・書式の書き込みに対応していません");
  const values: Record<string, Blob> = {},
    skipped: string[] = [];
  for (const [key, mime] of [
    ["text", "text/plain"],
    ["html", "text/html"],
    ["png", "image/png"],
    ["rtf", "text/rtf"],
  ] as const) {
    if (bundle[key] === undefined) continue;
    if (typeof ClipboardItem.supports === "function" && !ClipboardItem.supports(mime)) {
      skipped.push(mime);
      continue;
    }
    if (mime === "text/rtf" && typeof ClipboardItem.supports !== "function") {
      skipped.push(mime);
      continue;
    }
    values[mime] = new Blob([key === "png" || key === "rtf" ? bytes(bundle[key]!) : bundle[key]!], {
      type: mime,
    });
  }
  if (!Object.keys(values).length) throw Error("このブラウザで貼り付けられる形式がありません");
  await navigator.clipboard.write([new ClipboardItem(values)]);
  return skipped;
}
