import {
  IMAGE_CHUNK_BYTES,
  IMAGE_MAX_BYTES,
  isImageMimeType,
  isPastablePath,
  type ImageMimeType,
} from "@sodashitsu/protocol";
import type { InputHold } from "../net/InputGate.js";
import type { ConnectionPort } from "../net/ports.js";
import { errorCodeOf } from "../net/clientError.js";
import {
  canReadClipboardByKey,
  readClipboardForPaste,
  readClipboardImage,
  type ClipboardContent,
} from "./clipboard.js";

/**
 * 画像の送信の間に打ったキーを溜めておく時間（decisions D7・D14。base64 で約 21.3 MiB になる 16 MiB の画像を、約 1.1 MB/s 以上で送れる長さ。
 * 超えたらキーを先に流す——失われない）。
 */
export const IMAGE_HOLD_TIMEOUT_MS = 20_000;
/**
 * キー（Ctrl+V）から読むときの読み取りの上限（review ラウンド 1）。Chromium の許可の画面に答えないまま打ち続けても、この時間で画像無しとして
 * そのキーの列（`\x16`）を送り、後のキーを待たせ続けない。許可した後の読み取り（PNG への変換を含む）は通常これより十分に速い。
 */
export const IMAGE_KEY_READ_TIMEOUT_MS = 2_000;

/** `ImagePaster` が使う端末（xterm.js の `Terminal` の部分）。 */
export interface PasteTerminal {
  paste(text: string): void;
  readonly modes: { readonly bracketedPasteMode: boolean };
  readonly options: { readonly ignoreBracketedPasteMode?: boolean | undefined };
}

export interface ImagePasterClipboard {
  canReadByKey(): Promise<boolean>;
  readImage(): Promise<Blob | null>;
  readForPaste(): Promise<ClipboardContent>;
}

export interface ImagePasterOptions {
  conn: Pick<ConnectionPort, "request" | "sendInput">;
  input: { holdInput(paneId: string | null, opts?: { timeoutMs?: number }): InputHold };
  /** その pane の端末。無ければ（閉じた・作られていない）null。 */
  terminalOf(paneId: string): PasteTerminal | null;
  toast(message: string): void;
  /** pane がまだあるか（閉じた pane にはパスを貼らない。端末が LRU で捨てられただけの pane には貼る）。省略時は常に真。 */
  paneExists?(paneId: string): boolean;
  clipboard?: ImagePasterClipboard;
  holdTimeoutMs?: number;
  readTimeoutMs?: number;
}

const defaultClipboard: ImagePasterClipboard = {
  canReadByKey: () => canReadClipboardByKey(),
  readImage: () => readClipboardImage(),
  readForPaste: () => readClipboardForPaste(),
};

/** 失敗の文言（design「ブラウザ」の toast）。 */
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

/** その端末で貼り付けを bracketed paste で包むか（xterm.js の `paste` と同じ条件：モードが有効で、無視する設定でない）。 */
export function bracketedOf(term: PasteTerminal): boolean {
  return term.modes.bracketedPasteMode && term.options.ignoreBracketedPasteMode !== true;
}

/** パスを pane への入力の列にする（xterm.js の `paste` と同じ規則：`\r?\n` → `\r`、`bracketed` なら包む）。 */
export function pasteBytes(text: string, bracketed: boolean): string {
  const prepared = text.replace(/\r?\n/g, "\r");
  return bracketed ? `\x1b[200~${prepared}\x1b[201~` : prepared;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP)
    bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(bin);
}

/**
 * クリップボードの画像を pane へ貼り付ける係（20260927-clipboard-image-paste。herdr の `remote_image_paste`）。
 * 画像を `pane.image.*` で分けて送り（decisions D3）、サーバが返したパスを検査して（D4・`isPastablePath`）その pane へ入力する。
 * 送っている間にその pane へ打ったキーは `InputGate` で溜め、パス（画像が無ければそのキーの列）の後に流す。
 * **仕事は直列にする**——保持はきっかけの時点で作る（押した順に並ぶ）が、読み取り・送信は前の仕事が終わってから行う（同じ接続の `image_upload_busy` を作らない）。
 */
export class ImagePaster {
  private readonly clipboard: ImagePasterClipboard;
  private readonly holdTimeoutMs: number;
  private readonly readTimeoutMs: number;
  private queue: Promise<void> = Promise.resolve();
  /** マシンを切り替えるたびに進める（切り替えの前に始めた仕事を捨てる印）。 */
  private generation = 0;
  /** 始めてまだ終わっていない仕事（切り替えのときにその場で保持を捨てる）。 */
  private readonly pending = new Set<Job>();

  constructor(private readonly opts: ImagePasterOptions) {
    this.clipboard = opts.clipboard ?? defaultClipboard;
    this.holdTimeoutMs = opts.holdTimeoutMs ?? IMAGE_HOLD_TIMEOUT_MS;
    this.readTimeoutMs = opts.readTimeoutMs ?? IMAGE_KEY_READ_TIMEOUT_MS;
  }

  /**
   * マシンを切り替えた（20260927-multi-host-machines の切り替え。cross の点検）。pane の id はマシンをまたいで重なるので、切り替えの前に始めた仕事は
   * 次のマシンの同じ id の pane へ画像を送らず・パスを貼らず、溜めたキーも流さずに捨てる。
   */
  resetForMachineSwitch(): void {
    this.generation++;
    // 保持はその場で捨てる——列の番が来るまで残すと、読み取り（許可の画面）で止まっている間に次のマシンの同じ id の pane へ打った文字を拾い、
    // 時間切れで流すと前のマシンの文字が次のマシンへ届く（cross の点検 ラウンド 2）。後で列が `discard` をもう一度呼んでも何もしない。
    for (const job of this.pending) job.hold.discard();
    this.pending.clear();
  }

  /** 画像を貼り付けるキーから。画像が無い・読めないときは `fallback`（そのキーの端末への列。null なら何も送らない）を送る。 */
  fromKey(paneId: string, fallback: string | null): void {
    const job = this.start(paneId);
    const first = fallback ?? undefined;
    this.enqueue(job, async () => {
      let blob: Blob | null = null;
      try {
        blob = await withTimeout(
          (async () =>
            (await this.clipboard.canReadByKey()) ? this.clipboard.readImage() : null)(),
          this.readTimeoutMs,
        );
      } catch {
        blob = null; // 読み取りが投げても、そのキーの列（Vim の Ctrl+V）は失わない
      }
      if (this.stale(job)) return job.hold.discard();
      if (!blob) return job.hold.cancel(first);
      await this.upload(job, blob);
    });
  }

  /** `Ctrl+Shift+V`・メニューの「貼り付け」：テキストがあれば今までどおり `term.paste`、無く画像があれば送る。 */
  pasteClipboard(paneId: string): void {
    const generation = this.generation;
    void this.clipboard.readForPaste().then(
      (content) => {
        if (!content || generation !== this.generation) return;
        if (content.kind === "text") {
          this.opts.terminalOf(paneId)?.paste(content.text);
          return;
        }
        this.pasteBlob(paneId, content.blob);
      },
      () => undefined,
    );
  }

  /** paste イベント等で見つけた画像を送る。 */
  pasteBlob(paneId: string, blob: Blob): void {
    const job = this.start(paneId);
    this.enqueue(job, () => this.upload(job, blob));
  }

  /** 仕事を始める：保持を作り、その時点の世代と bracketed paste の状態を控える（送り終えたときに端末が LRU で捨てられていても貼れるように）。 */
  private start(paneId: string): Job {
    let bracketed = false;
    try {
      const term = this.opts.terminalOf(paneId);
      bracketed = term ? bracketedOf(term) : false;
    } catch {
      // 端末を引けなくても仕事は始める（終わりにもう一度引く）
    }
    const job: Job = {
      paneId,
      generation: this.generation,
      hold: this.opts.input.holdInput(paneId, { timeoutMs: this.holdTimeoutMs }),
      bracketed,
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
        // 想定外の失敗（ここに来るのは読み取り・組み立ての例外）。溜めたキーは失わない（切り替えた後なら捨てる）。
        if (this.stale(job)) job.hold.discard();
        else job.hold.cancel();
      })
      .finally(() => this.pending.delete(job));
  }

  private async upload(job: Job, blob: Blob): Promise<void> {
    const { paneId, hold } = job;
    const mime = blob.type;
    if (!isImageMimeType(mime)) {
      this.opts.toast("対応していない画像の形式です（PNG・JPEG・GIF・WebP）");
      return hold.cancel();
    }
    if (blob.size > IMAGE_MAX_BYTES) {
      this.opts.toast("画像が大きすぎます（16MB まで）");
      return hold.cancel();
    }
    if (blob.size === 0) {
      this.opts.toast("画像が空です");
      return hold.cancel();
    }
    let uploadId: string | undefined;
    let path: string;
    try {
      ({ uploadId } = await this.opts.conn.request("pane.image.begin", {
        paneId,
        mime: mime as ImageMimeType,
        size: blob.size,
      }));
      for (let offset = 0; offset < blob.size; offset += IMAGE_CHUNK_BYTES) {
        if (this.stale(job)) return hold.discard(); // 切り替えた後は新しいマシンへ送らない（前の接続の送信はサーバが切断で捨てる）
        const bytes = new Uint8Array(
          await blob.slice(offset, offset + IMAGE_CHUNK_BYTES).arrayBuffer(),
        );
        await this.opts.conn.request("pane.image.chunk", {
          uploadId,
          offset,
          data: toBase64(bytes),
        });
      }
      if (this.stale(job)) return hold.discard();
      ({ path } = await this.opts.conn.request("pane.image.commit", { uploadId }));
    } catch (err) {
      if (this.stale(job)) return hold.discard();
      if (uploadId !== undefined)
        void this.opts.conn.request("pane.image.cancel", { uploadId }).catch(() => undefined);
      this.opts.toast(imageErrorMessage(err));
      return hold.cancel();
    }
    if (this.stale(job)) return hold.discard();
    if (typeof path !== "string" || !isPastablePath(path)) {
      this.opts.toast("サーバから返ったパスに使えない文字が含まれるため、貼り付けませんでした");
      return hold.cancel();
    }
    // pane が閉じた（溜めた分は閉じた pane 宛てで、サーバが捨てる）。端末が LRU で捨てられただけなら、控えた状態で貼る（cross の点検）。
    if (!(this.opts.paneExists?.(paneId) ?? true)) return hold.cancel();
    const term = this.opts.terminalOf(paneId);
    hold.cancel(pasteBytes(path, term ? bracketedOf(term) : job.bracketed));
  }
}

interface Job {
  paneId: string;
  generation: number;
  hold: InputHold;
  /** 仕事を始めたときの bracketed paste の状態（送り終えたときに端末が無ければこれを使う）。 */
  bracketed: boolean;
}

/** `ms` を過ぎても決まらなければ null（元の promise は放っておく——後で決まっても使わない）。 */
function withTimeout<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
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
