import { randomBytes } from "node:crypto";
import { FILE_CHUNK_BYTES, FILE_MAX_BYTES, RpcError } from "@sodashitsu/protocol";
import type { Logger } from "../log/Logger.js";
import type { FileWriter } from "./FileStore.js";

/** 上限。テストで差し替える。 */
export interface FileUploadLimits {
  /** サーバ全体で同時に受け取り中の送信。 */
  maxActive: number;
  /** 続きが来なければ捨てるまでの時間。 */
  idleMs: number;
  /** begin からの合計の期限。 */
  maxTotalMs: number;
}

export const DEFAULT_FILE_UPLOAD_LIMITS: FileUploadLimits = {
  maxActive: 4,
  idleMs: 30_000,
  maxTotalMs: 30 * 60_000,
};

export interface FileUploadsClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

const realClock: FileUploadsClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface FileUploadsOptions {
  store: { create(name: string): Promise<FileWriter> };
  paneExists(paneId: string): boolean;
  clock?: FileUploadsClock;
  limits?: Partial<FileUploadLimits>;
  random?: () => string;
  logger?: Pick<Logger, "warn">;
}

interface Upload {
  id: string;
  clientId: string;
  paneId: string;
  size: number;
  received: number;
  writer: FileWriter;
  timer: unknown;
  startedAt: number;
  /** 書き込みの要求を処理している途中か（ブラウザは応答を待ってから次を送る。重なったら送信ごと捨てる）。 */
  busy: boolean;
  dropped: boolean;
  /** この送信の書き込みの列（捨てるときは、書いている途中の分が終わってから消す）。 */
  tail: Promise<void>;
}

/**
 * ドロップしたファイルの送信（`@sodashitsu/protocol` の `file.ts`）。`ImageUploads` と同じ形（接続ごとに 1 つ・分けて受け取る・時間切れ・切断で捨てる）だが、
 * 大きいのでメモリに溜めず、受け取りながら `store` のファイルへ書く。途中の失敗・時間切れ・切断・`cancel` では書きかけを消す。
 */
export class FileUploads {
  /** 接続 → 受け取り中の送信（接続ごとに 1 つ）。 */
  private readonly byClient = new Map<string, Upload>();
  /** ファイルを作っている途中の begin の接続（`maxActive` と「接続ごとに 1 つ」に数える）。 */
  private readonly opening = new Set<string>();
  /** ファイルを作っている途中に切断した接続（作り終えたら登録せずに消す）。 */
  private readonly goneWhileOpening = new Set<string>();
  private disposed = false;
  /** 終わっていない後始末・書き終え（`dispose` が待つ——状態ディレクトリのロックを放した後に書かない）。 */
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly clock: FileUploadsClock;
  private readonly limits: FileUploadLimits;
  private readonly random: () => string;

  constructor(private readonly opts: FileUploadsOptions) {
    this.clock = opts.clock ?? realClock;
    this.limits = { ...DEFAULT_FILE_UPLOAD_LIMITS, ...opts.limits };
    this.random = opts.random ?? (() => randomBytes(16).toString("hex"));
  }

  /** いま受け取り中の送信の数（テスト・診断用）。 */
  get activeCount(): number {
    return this.byClient.size;
  }

  async begin(clientId: string, p: { paneId: string; name: string; size: number }): Promise<{ uploadId: string }> {
    if (p.size > FILE_MAX_BYTES) throw new RpcError("file_too_large", `file is larger than ${FILE_MAX_BYTES} bytes`);
    if (!this.opts.paneExists(p.paneId)) throw new RpcError("not_found", `pane not found: ${p.paneId}`);
    if (this.byClient.has(clientId) || this.opening.has(clientId))
      throw new RpcError("file_upload_busy", "this connection is already uploading a file");
    if (this.disposed) throw new RpcError("file_upload_busy", "the server is shutting down");
    if (this.byClient.size + this.opening.size >= this.limits.maxActive)
      throw new RpcError("file_upload_busy", "too many files are being uploaded");
    this.opening.add(clientId);
    let writer: FileWriter;
    try {
      writer = await this.track(this.opts.store.create(p.name));
    } catch (err) {
      this.opts.logger?.warn("failed to create a dropped file", { clientId, error: String(err) });
      this.goneWhileOpening.delete(clientId);
      throw new RpcError("file_store_failed", "failed to store the file");
    } finally {
      this.opening.delete(clientId);
    }
    if (this.disposed) {
      await this.track(writer.abort());
      throw new RpcError("file_upload_busy", "the server is shutting down");
    }
    // ファイルを作っている間に切断した接続の送信は、登録せずに消す（続きは来ない）。
    if (this.goneWhileOpening.delete(clientId)) {
      await this.track(writer.abort());
      throw new RpcError("file_upload_expired", "the connection is gone");
    }
    const upload: Upload = {
      id: this.random(),
      clientId,
      paneId: p.paneId,
      size: p.size,
      received: 0,
      writer,
      timer: undefined,
      startedAt: this.clock.now(),
      busy: false,
      dropped: false,
      tail: Promise.resolve(),
    };
    this.byClient.set(clientId, upload);
    this.arm(upload);
    return { uploadId: upload.id };
  }

  async chunk(clientId: string, p: { uploadId: string; offset: number; data: string }): Promise<void> {
    const upload = this.find(clientId, p.uploadId);
    if (upload.busy) return this.fail(upload, "overlapping requests");
    if (p.offset !== upload.received) return this.fail(upload, `chunk offset ${p.offset} != received ${upload.received}`);
    const bytes = Buffer.from(p.data, "base64");
    if (bytes.length === 0 || bytes.length > FILE_CHUNK_BYTES) return this.fail(upload, `chunk of ${bytes.length} bytes`);
    if (upload.received + bytes.length > upload.size) return this.fail(upload, "more bytes than declared");
    upload.busy = true;
    const write = upload.tail.then(() => upload.writer.write(bytes));
    upload.tail = write.catch(() => undefined);
    try {
      await this.track(write);
    } catch (err) {
      // 詳細（パス・errno）はサーバのログにだけ残す（ブラウザには code だけ）。
      this.opts.logger?.warn("failed to write a dropped file", { clientId, error: String(err) });
      this.drop(upload);
      throw new RpcError("file_store_failed", "failed to store the file");
    } finally {
      upload.busy = false;
    }
    if (upload.dropped) throw new RpcError("file_upload_expired", "unknown or expired upload");
    upload.received += bytes.length;
    this.arm(upload);
  }

  async commit(clientId: string, uploadId: string): Promise<{ path: string }> {
    const upload = this.find(clientId, uploadId);
    if (upload.busy) return this.fail(upload, "overlapping requests");
    if (upload.received !== upload.size) return this.fail(upload, `received ${upload.received} of ${upload.size} bytes`);
    if (!this.opts.paneExists(upload.paneId)) {
      this.drop(upload);
      throw new RpcError("not_found", `pane not found: ${upload.paneId}`);
    }
    this.unregister(upload); // 先に登録を外す（書き終えを待つ間に同じ接続が次のファイルを始められる）
    try {
      return { path: await this.track(upload.tail.then(() => upload.writer.finish())) };
    } catch (err) {
      this.opts.logger?.warn("failed to store a dropped file", { clientId, error: String(err) });
      throw new RpcError("file_store_failed", "failed to store the file");
    }
  }

  cancel(clientId: string, uploadId: string): void {
    const upload = this.byClient.get(clientId);
    if (upload && upload.id === uploadId) this.drop(upload);
  }

  onClientGone(clientId: string): void {
    const upload = this.byClient.get(clientId);
    if (upload) this.drop(upload);
    if (this.opening.has(clientId)) this.goneWhileOpening.add(clientId);
  }

  /** 受け取り中の送信を捨て、以後の begin を断り、書いている途中の分の後始末が終わるのを待つ（`composeServer` の `close`）。 */
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const upload of [...this.byClient.values()]) this.drop(upload);
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.inFlight.add(p);
    const done = (): void => void this.inFlight.delete(p);
    p.then(done, done);
    return p;
  }

  private find(clientId: string, uploadId: string): Upload {
    const upload = this.byClient.get(clientId);
    // 別の接続の id・知らない id・時間切れで捨てたものは同じ答え（他の接続の送信の有無を漏らさない）。
    if (!upload || upload.id !== uploadId) throw new RpcError("file_upload_expired", "unknown or expired upload");
    return upload;
  }

  private fail(upload: Upload, message: string): never {
    this.drop(upload);
    throw new RpcError("invalid_file", message);
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

  private unregister(upload: Upload): void {
    if (upload.timer !== undefined) this.clock.clearTimeout(upload.timer);
    upload.timer = undefined;
    if (this.byClient.get(upload.clientId) === upload) this.byClient.delete(upload.clientId);
  }

  /** 送信を捨てる：登録を外し、書いている途中の分が終わってから書きかけを消す。 */
  private drop(upload: Upload): void {
    this.unregister(upload);
    if (upload.dropped) return;
    upload.dropped = true;
    void this.track(upload.tail.then(() => upload.writer.abort()));
  }
}
