import {
  IMAGE_CHUNK_BYTES,
  IMAGE_MAX_BYTES,
  isImageMimeType,
  isPastablePath,
  type ImageMimeType,
} from "@sodashitsu/protocol";
import { errorCodeOf, type InputHold } from "@sodashitsu/client-core";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { ClipboardImage } from "../clipboard.js";

/** 画像を送る間、打った文字を溜めておく上限（web と同じ）。 */
export const IMAGE_HOLD_TIMEOUT_MS = 20_000;
/** キー（Ctrl+V）で画像を読む待ちの上限（読めなければそのキーを端末へ）。 */
export const IMAGE_KEY_READ_TIMEOUT_MS = 2_000;
/** 読むのに時間がかかっていると知らせるまでの時間。 */
const SLOW_READ_MS = 400;

export interface ImagePasterDeps {
  conn: RequestPort;
  input: { holdInput(paneId: string | null, opts?: { timeoutMs?: number }): InputHold };
  /** 手元のクリップボードの画像（無ければ null）。 */
  readImage(): Promise<ClipboardImage | null>;
  /** 手元のクリップボードの文字（読めなければ null）。 */
  readText(): Promise<string | null>;
  /** pane がブラケットペーストを有効にしているか（headless がまだ無い pane は null）。 */
  bracketed(paneId: string): boolean | null;
  paneExists(paneId: string): boolean;
  /** 文字を pane へ貼る（ブラケットペーストに合わせて包む）。 */
  pasteText(paneId: string, text: string): void;
  toast(message: string): void;
  /** 読むのに時間がかかっているときの知らせ（出して、消す関数を返す）。 */
  status?(message: string): () => void;
  holdTimeoutMs?: number;
  readTimeoutMs?: number;
}

/** 失敗の知らせ（web の `imageErrorMessage` と同じ文）。 */
export function imageErrorMessage(err: unknown): string {
  switch (errorCodeOf(err)) {
    case "image_too_large":
      return "画像が大きすぎます（16MB まで）";
    case "invalid_image":
    case "invalid_params":
      return "画像の形式が正しくないため送れませんでした";
    case "image_upload_busy":
      return "ほかの画像を送っている最中です。少し待ってからもう一度貼り付けてください";
    case "image_upload_rate_limited":
      return "画像の貼り付けが多すぎます。1 分ほど待ってください";
    case "image_upload_expired":
      return "画像の送信が途中で切れました。もう一度貼り付けてください";
    case "image_store_failed":
      return "サーバに画像を保存できませんでした。サーバのログを確かめてください";
    case "not_found":
      return "画像を送れませんでした（pane が閉じられたか、サーバ／マシンの版が古く画像の貼り付けに対応していません）";
    default:
      return "画像を送れませんでした";
  }
}

/** 貼り付けの列（改行は CR、ブラケットペーストなら包む。web の `pasteBytes`）。 */
export function pasteBytes(text: string, bracketed: boolean): string {
  const prepared = text.replace(/\r?\n/g, "\r");
  return bracketed ? `\x1b[200~${prepared}\x1b[201~` : prepared;
}

interface Job {
  paneId: string;
  generation: number;
  hold: InputHold;
  bracketed: boolean;
}

/**
 * 画像の貼り付け（herdr の `remote_image_paste`。web の `term/ImagePaster.ts` と同じ手順：手元のクリップボードの画像を `pane.image.begin/chunk/commit`
 * でサーバへ送り、返ったパスをその pane へ貼る。送る間の打鍵は溜めて、パスの後に流す）。1 枚ずつ順に送る。マシンを切り替えたら途中のものは捨てる。
 */
export class ImagePaster {
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  private readonly pending = new Set<Job>();

  constructor(private readonly deps: ImagePasterDeps) {}

  resetForMachineSwitch(): void {
    this.generation++;
    for (const job of this.pending) job.hold.discard();
    this.pending.clear();
  }

  /** 画像を貼るキー（既定 Ctrl+V）。画像が無ければそのキーの列（`fallback`。prefix の後なら null＝何も送らない）を送る。 */
  fromKey(paneId: string, fallback: string | null): void {
    const job = this.start(paneId);
    this.enqueue(job, async () => {
      let image: ClipboardImage | null = null;
      // 0.4 秒を過ぎても読めていなければ知らせる（Windows・WSL の PowerShell は数秒かかる。黙って待たせない）。
      let dismiss: (() => void) | null = null;
      const slow = setTimeout(() => {
        dismiss = this.deps.status?.("クリップボードの画像を読んでいます…") ?? null;
      }, SLOW_READ_MS);
      slow.unref?.();
      try {
        image = await withTimeout(
          this.deps.readImage(),
          this.deps.readTimeoutMs ?? IMAGE_KEY_READ_TIMEOUT_MS,
        );
      } catch {
        image = null; // 読めなくても、そのキーの列（Vim の Ctrl+V）は失わない
      } finally {
        clearTimeout(slow);
        (dismiss as (() => void) | null)?.();
      }
      if (this.stale(job)) return job.hold.discard();
      if (!image) return job.hold.cancel(fallback ?? undefined);
      await this.upload(job, image);
    });
  }

  /** メニューの「貼り付け」：画像があれば画像を、無ければ文字を貼る（web の `pasteClipboard`）。読めなければ null を返す。 */
  async pasteClipboard(paneId: string): Promise<"image" | "text" | "empty" | "unavailable"> {
    const generation = this.generation;
    const image = await this.deps.readImage().catch(() => null);
    if (generation !== this.generation) return "empty";
    if (image) {
      const job = this.start(paneId);
      this.enqueue(job, () => this.upload(job, image));
      return "image";
    }
    const text = await this.deps.readText().catch(() => null);
    if (text === null) return "unavailable";
    if (text === "" || generation !== this.generation) return "empty";
    this.deps.pasteText(paneId, text);
    return "text";
  }

  private start(paneId: string): Job {
    const job: Job = {
      paneId,
      generation: this.generation,
      hold: this.deps.input.holdInput(paneId, {
        timeoutMs: this.deps.holdTimeoutMs ?? IMAGE_HOLD_TIMEOUT_MS,
      }),
      bracketed: this.deps.bracketed(paneId) ?? false,
    };
    this.pending.add(job);
    return job;
  }

  private stale(job: Job): boolean {
    return job.generation !== this.generation;
  }

  private enqueue(job: Job, work: () => Promise<void>): void {
    this.queue = this.queue
      .then(() => (this.stale(job) ? job.hold.discard() : work()))
      .catch(() => {
        if (this.stale(job)) job.hold.discard();
        else job.hold.cancel();
      })
      .finally(() => this.pending.delete(job));
  }

  private async upload(job: Job, image: ClipboardImage): Promise<void> {
    const { paneId, hold } = job;
    const { mime, bytes } = image;
    if (!isImageMimeType(mime)) {
      this.deps.toast("対応していない画像の形式です（PNG・JPEG・GIF・WebP）");
      return hold.cancel();
    }
    if (bytes.length > IMAGE_MAX_BYTES) {
      this.deps.toast("画像が大きすぎます（16MB まで）");
      return hold.cancel();
    }
    if (bytes.length === 0) {
      this.deps.toast("画像が空です");
      return hold.cancel();
    }
    let uploadId: string | undefined;
    let path: string;
    try {
      ({ uploadId } = await this.deps.conn.request("pane.image.begin", {
        paneId,
        mime: mime as ImageMimeType,
        size: bytes.length,
      }));
      for (let offset = 0; offset < bytes.length; offset += IMAGE_CHUNK_BYTES) {
        if (this.stale(job)) return hold.discard();
        await this.deps.conn.request("pane.image.chunk", {
          uploadId,
          offset,
          data: bytes.subarray(offset, offset + IMAGE_CHUNK_BYTES).toString("base64"),
        });
      }
      if (this.stale(job)) return hold.discard();
      ({ path } = await this.deps.conn.request("pane.image.commit", { uploadId }));
    } catch (err) {
      if (this.stale(job)) return hold.discard();
      if (uploadId !== undefined)
        void this.deps.conn.request("pane.image.cancel", { uploadId }).catch(() => undefined);
      this.deps.toast(imageErrorMessage(err));
      return hold.cancel();
    }
    if (this.stale(job)) return hold.discard();
    if (typeof path !== "string" || !isPastablePath(path)) {
      this.deps.toast("サーバから返ったパスに使えない文字が含まれるため、貼り付けませんでした");
      return hold.cancel();
    }
    if (!this.deps.paneExists(paneId)) return hold.cancel();
    // 今の pane のモードで包む（送る間に変わりうる。headless が無ければ始めたときのモード）。
    hold.cancel(pasteBytes(path, this.deps.bracketed(paneId) ?? job.bracketed));
  }
}

function withTimeout<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    timer.unref?.();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
