import { randomUUID } from "node:crypto";
import { pngSize, PNG_LIMIT } from "./png.js";
export interface OcrState {
  provider: "agent" | "local";
  revision: number;
  status: "idle" | "loading" | "ready" | "recognizing" | "stopping" | "done" | "error";
  enabled: boolean;
  imageId: string | null;
  width: number;
  height: number;
  text: string;
  message: string;
}
export interface OcrOptions {
  changed(state: OcrState): void;
  input(
    owner: number,
    source: "file" | "clipboard",
    signal: AbortSignal,
  ): Promise<Uint8Array | null>;
  crop(
    bytes: Uint8Array,
    rect: { x: number; y: number; width: number; height: number },
  ): Uint8Array;
  run(
    bytes: Uint8Array,
    executable: string,
    language: string,
    signal: AbortSignal,
  ): Promise<string>;
  agent?: (bytes: Uint8Array, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}
/** Pixels are ephemeral and owned by one current bubble; cancellation retains the physical I/O slot. */
export class Ocr {
  private state: OcrState = {
    provider: "local",
    revision: 0,
    status: "idle",
    enabled: false,
    imageId: null,
    width: 0,
    height: 0,
    text: "",
    message: "画像を確認してから認識します。",
  };
  private bytes: Uint8Array | null = null;
  private owner: number | null = null;
  private executable = "";
  private language = "jpn+eng";
  private generation = 0;
  private busy = false;
  private active: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private expires = 0;
  constructor(private readonly options: OcrOptions) {}
  snapshot(): OcrState {
    return { ...this.state };
  }
  configure(enabled: boolean, executable: string, language: string, provider: "agent" | "local" = "local"): void {
    if (!enabled || executable !== this.executable || language !== this.language || provider !== this.state.provider) this.discard();
    this.state.provider = provider;
    this.executable = executable;
    this.language = language;
    this.state.enabled = enabled;
    this.publish();
  }
  discard(owner?: number): void {
    if (owner !== undefined && this.owner !== owner) return;
    ++this.generation;
    this.active?.abort();
    this.active = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.bytes = null;
    this.owner = null;
    this.expires = 0;
    this.state = {
      ...this.state,
      status: this.busy ? "stopping" : "idle",
      imageId: null,
      width: 0,
      height: 0,
      text: "",
      message: "画像と認識結果を破棄しました。",
    };
    this.publish();
  }
  captured(owner: number, bytes: Uint8Array) {
    this.available();
    pngSize(bytes);
    this.discard();
    return this.replace(bytes, owner);
  }
  async input(
    owner: number,
    source: "file" | "clipboard",
  ): Promise<{ state: OcrState; uri: string } | null> {
    this.available();
    this.discard();
    this.owner = owner;
    this.busy = true;
    const generation = this.generation;
    const controller = new AbortController();
    this.active = controller;
    const expires = this.now() + 300_000;
    this.timer = setTimeout(() => this.discard(owner), 300_000);
    this.state.status = "loading";
    this.state.message = "画像を読み込んでいます。";
    this.publish();
    try {
      const bytes = await this.options.input(owner, source, controller.signal);
      if (generation !== this.generation) return null;
      if (this.now() >= expires) throw Error("画像の選択が制限時間を超えました。");
      if (!bytes) {
        this.discard(owner);
        return null;
      }
      return this.replace(bytes, owner);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      return null;
    } finally {
      this.finish(controller);
    }
  }
  crop(
    owner: number,
    imageId: string,
    rect: { x: number; y: number; width: number; height: number },
  ): { state: OcrState; uri: string } {
    this.image(owner, imageId);
    this.available();
    if (
      !Object.values(rect).every(Number.isSafeInteger) ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.width < 1 ||
      rect.height < 1 ||
      rect.x + rect.width > this.state.width ||
      rect.y + rect.height > this.state.height
    )
      throw Error("切り出す範囲を確認してください。");
    const generation = this.generation;
    const bytes = this.options.crop(this.bytes!, rect);
    this.image(owner, imageId);
    if (generation !== this.generation) throw Error("対象の画像が変更されました。");
    return this.replace(bytes, owner);
  }
  async run(owner: number, imageId: string): Promise<void> {
    this.image(owner, imageId);
    this.available();
    if (this.state.provider === "local" && !this.executable) throw Error("設定にTesseract実行ファイルの絶対パスを入力してください。");
    this.busy = true;
    const generation = this.generation;
    const controller = new AbortController();
    this.active = controller;
    this.state.status = "recognizing";
    this.state.text = "";
    this.state.message = this.state.provider === "agent" ? "画像を専用エージェントへ送っています。" : "このPCのTesseractで認識しています。";
    this.publish();
    try {
      const provider = this.state.provider;
      if (provider === "agent" && !this.options.agent) throw Error("画像のエージェント連携は利用できません");
      const text = provider === "agent" ? (await this.options.agent!(this.bytes!, controller.signal), "") : await this.options.run(
        this.bytes!,
        this.executable,
        this.language,
        controller.signal,
      );
      if (generation !== this.generation) return;
      this.image(owner, imageId);
      if (text.length > 65_536) throw Error("認識結果が長すぎます。");
      this.state.status = "done";
      this.state.text = text;
      this.state.message = provider === "agent" ? "画像を専用エージェントへ送りました。結果は吹き出しの会話で確認してください。" : "認識できました。確認してから会話やメモへ渡してください。";
      this.publish();
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      this.finish(controller);
    }
  }
  private replace(bytes: Uint8Array, owner: number): { state: OcrState; uri: string } {
    if (bytes.byteLength > PNG_LIMIT) throw Error("画像が大きすぎます。");
    const size = pngSize(bytes);
    this.bytes = Uint8Array.from(bytes);
    this.owner = owner;
    if (this.timer) clearTimeout(this.timer);
    this.expires = this.now() + 300_000;
    this.timer = setTimeout(() => this.discard(owner), 300_000);
    this.state = {
      ...this.state,
      status: "ready",
      imageId: randomUUID(),
      ...size,
      text: "",
      message: "画像と範囲を確認し、「文字を認識」を押してください。",
    };
    this.publish();
    return {
      state: this.snapshot(),
      uri: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
    };
  }
  private available(): void {
    if (!this.state.enabled) throw Error("設定でOCRを有効にしてください。");
    if (this.busy) throw Error("前の画像処理が完了するまでお待ちください。");
  }
  private image(owner: number, imageId: string): void {
    if (this.expires && this.now() >= this.expires) this.discard();
    if (this.owner !== owner || this.state.imageId !== imageId || !this.bytes)
      throw Error("対象の画像が変更されたか期限が切れました。");
  }
  private fail(error: unknown): void {
    this.state.status = "error";
    this.state.text = "";
    this.state.message =
      error instanceof Error ? error.message.slice(0, 1000) : "認識できませんでした。";
    this.publish();
  }
  private finish(controller: AbortController): void {
    if (this.active === controller) this.active = null;
    this.busy = false;
    if (!this.bytes && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.state.status === "stopping") {
      this.state.status = "idle";
      this.publish();
    }
  }
  private now(): number {
    return this.options.now?.() ?? performance.now();
  }
  private publish(): void {
    ++this.state.revision;
    this.options.changed(this.snapshot());
  }
}
