import { randomBytes } from "node:crypto";
import {
  IMAGE_CHUNK_BYTES,
  IMAGE_MAX_BYTES,
  matchesImageMagic,
  RpcError,
  type ImageMimeType,
} from "@wtm/protocol";
import type { Logger } from "../log/Logger.js";

/** 上限（decisions D7）。テストで差し替える。 */
export interface ImageUploadLimits {
  /** サーバ全体で同時に受け取り中の送信（1 つ 16 MiB まで → メモリ 64 MiB まで）。 */
  maxActive: number;
  /** 接続ごとの、直近の窓に受け付けた begin の数。 */
  perClientPerWindow: number;
  /** サーバ全体の、直近の窓に受け付けた begin の数。 */
  globalPerWindow: number;
  windowMs: number;
  /** 続きが来なければ捨てるまでの時間。 */
  idleMs: number;
  /** begin からの合計の期限（小さな片を少しずつ送り続けて同時数の枠を占め続けさせない。review ラウンド 1）。 */
  maxTotalMs: number;
}

export const DEFAULT_IMAGE_UPLOAD_LIMITS: ImageUploadLimits = {
  maxActive: 4,
  perClientPerWindow: 20,
  globalPerWindow: 60,
  windowMs: 60_000,
  idleMs: 30_000,
  maxTotalMs: 5 * 60_000,
};

export interface ImageUploadsClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

const realClock: ImageUploadsClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface ImageUploadsOptions {
  store: { save(mime: ImageMimeType, data: Uint8Array): Promise<string> };
  paneExists(paneId: string): boolean;
  clock?: ImageUploadsClock;
  limits?: Partial<ImageUploadLimits>;
  random?: () => string;
  logger?: Pick<Logger, "warn">;
}

interface Upload {
  id: string;
  clientId: string;
  paneId: string;
  mime: ImageMimeType;
  size: number;
  received: number;
  chunks: Buffer[];
  timer: unknown;
  startedAt: number;
}

/**
 * クリップボードの画像の送信（20260927-clipboard-image-paste。design「サーバ（送信の状態）」）。ブラウザは `/ws` の 1 通の上限（4 MiB）のため画像を
 * 768 KiB ずつ分けて送る（decisions D3）。ここは接続ごとの受け取り中の状態・検査・上限（同時・頻度・時間切れ）を持ち、揃ったら `store` に書いてパスを返す。
 * 途中の失敗・時間切れ・切断・`cancel` では捨て、ファイルを作らない。
 */
export class ImageUploads {
  /** 接続 → 受け取り中の送信（接続ごとに 1 つ）。 */
  private readonly byClient = new Map<string, Upload>();
  private readonly clientBegins = new Map<string, number[]>();
  private globalBegins: number[] = [];
  /** 保存を待っている画像の数（受け取り中と合わせて `maxActive` に数える——保存が遅い間もメモリを 4 枚分で止める。T3 の独立点検）。 */
  private saving = 0;
  private disposed = false;
  /** 書いている途中の保存（`dispose` が終わるのを待つ——止めた後〔状態ディレクトリのロックを放した後〕に書き終わらないように）。 */
  private readonly inFlight = new Set<Promise<string>>();
  private readonly clock: ImageUploadsClock;
  private readonly limits: ImageUploadLimits;
  private readonly random: () => string;

  constructor(private readonly opts: ImageUploadsOptions) {
    this.clock = opts.clock ?? realClock;
    this.limits = { ...DEFAULT_IMAGE_UPLOAD_LIMITS, ...opts.limits };
    this.random = opts.random ?? (() => randomBytes(16).toString("hex"));
  }

  /** いま受け取り中の送信の数（テスト・診断用）。 */
  get activeCount(): number {
    return this.byClient.size;
  }

  /** 保存を待っている数（テスト・診断用）。 */
  get savingCount(): number {
    return this.saving;
  }

  begin(
    clientId: string,
    p: { paneId: string; mime: ImageMimeType; size: number },
  ): { uploadId: string } {
    if (p.size > IMAGE_MAX_BYTES)
      throw new RpcError("image_too_large", `image is larger than ${IMAGE_MAX_BYTES} bytes`);
    if (!this.opts.paneExists(p.paneId))
      throw new RpcError("not_found", `pane not found: ${p.paneId}`);
    if (this.byClient.has(clientId))
      throw new RpcError("image_upload_busy", "this connection is already uploading an image");
    if (this.disposed) throw new RpcError("image_upload_busy", "the server is shutting down");
    if (this.byClient.size + this.saving >= this.limits.maxActive)
      throw new RpcError("image_upload_busy", "too many images are being uploaded");
    const now = this.clock.now();
    const since = now - this.limits.windowMs;
    const mine = (this.clientBegins.get(clientId) ?? []).filter((t) => t > since);
    this.globalBegins = this.globalBegins.filter((t) => t > since);
    if (
      mine.length >= this.limits.perClientPerWindow ||
      this.globalBegins.length >= this.limits.globalPerWindow
    ) {
      this.clientBegins.set(clientId, mine);
      throw new RpcError("image_upload_rate_limited", "too many images in a short time");
    }
    mine.push(now);
    this.clientBegins.set(clientId, mine);
    this.globalBegins.push(now);
    const upload: Upload = {
      id: this.random(),
      clientId,
      paneId: p.paneId,
      mime: p.mime,
      size: p.size,
      received: 0,
      chunks: [],
      timer: undefined,
      startedAt: now,
    };
    this.byClient.set(clientId, upload);
    this.arm(upload);
    return { uploadId: upload.id };
  }

  chunk(clientId: string, p: { uploadId: string; offset: number; data: string }): void {
    const upload = this.find(clientId, p.uploadId);
    if (p.offset !== upload.received)
      return this.fail(upload, `chunk offset ${p.offset} != received ${upload.received}`);
    const bytes = Buffer.from(p.data, "base64");
    if (bytes.length === 0 || bytes.length > IMAGE_CHUNK_BYTES)
      return this.fail(upload, `chunk of ${bytes.length} bytes`);
    if (upload.received + bytes.length > upload.size)
      return this.fail(upload, "more bytes than declared");
    if (upload.received === 0 && !matchesImageMagic(upload.mime, bytes))
      return this.fail(upload, `not a ${upload.mime}`);
    upload.chunks.push(bytes);
    upload.received += bytes.length;
    this.arm(upload);
  }

  async commit(clientId: string, uploadId: string): Promise<{ path: string }> {
    const upload = this.find(clientId, uploadId);
    const chunks = upload.chunks;
    this.drop(upload); // 先に登録を外す（保存を待つ間に同じ接続が次の画像を始められる。失敗でも捨てる）
    if (upload.received !== upload.size)
      throw new RpcError("invalid_image", `received ${upload.received} of ${upload.size} bytes`);
    const data = Buffer.concat(chunks, upload.size);
    if (!matchesImageMagic(upload.mime, data))
      throw new RpcError("invalid_image", `not a ${upload.mime}`);
    if (!this.opts.paneExists(upload.paneId))
      throw new RpcError("not_found", `pane not found: ${upload.paneId}`);
    this.saving++;
    const saving = this.opts.store.save(upload.mime, data);
    this.inFlight.add(saving);
    try {
      return { path: await saving };
    } catch (err) {
      // 詳細（パス・errno）はサーバのログにだけ残す（ブラウザには code だけ）。
      this.opts.logger?.warn("failed to store a clipboard image", { clientId, error: String(err) });
      throw new RpcError("image_store_failed", "failed to store the image");
    } finally {
      this.saving--;
      this.inFlight.delete(saving);
    }
  }

  cancel(clientId: string, uploadId: string): void {
    const upload = this.byClient.get(clientId);
    if (upload && upload.id === uploadId) this.drop(upload);
  }

  onClientGone(clientId: string): void {
    const upload = this.byClient.get(clientId);
    if (upload) this.drop(upload);
    this.clientBegins.delete(clientId);
  }

  /** 受け取り中の送信を捨て、以後の begin を断り、書いている途中の保存が終わるのを待つ（`composeServer` の `close`）。 */
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const upload of [...this.byClient.values()]) this.drop(upload);
    await Promise.allSettled([...this.inFlight]);
  }

  private find(clientId: string, uploadId: string): Upload {
    const upload = this.byClient.get(clientId);
    // 別の接続の id・知らない id・時間切れで捨てたものは同じ答え（他の接続の送信の有無を漏らさない）。
    if (!upload || upload.id !== uploadId)
      throw new RpcError("image_upload_expired", "unknown or expired upload");
    return upload;
  }

  private fail(upload: Upload, message: string): never {
    this.drop(upload);
    throw new RpcError("invalid_image", message);
  }

  private arm(upload: Upload): void {
    if (upload.timer !== undefined) this.clock.clearTimeout(upload.timer);
    // 続きを待つのは idleMs まで、ただし begin からの合計の期限を越えない。
    const remaining = upload.startedAt + this.limits.maxTotalMs - this.clock.now();
    upload.timer = this.clock.setTimeout(
      () => {
        if (this.byClient.get(upload.clientId) === upload) this.drop(upload);
      },
      Math.max(0, Math.min(this.limits.idleMs, remaining)),
    );
  }

  private drop(upload: Upload): void {
    if (upload.timer !== undefined) this.clock.clearTimeout(upload.timer);
    upload.timer = undefined;
    upload.chunks = [];
    if (this.byClient.get(upload.clientId) === upload) this.byClient.delete(upload.clientId);
  }
}
