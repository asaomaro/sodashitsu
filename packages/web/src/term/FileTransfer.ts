import {
  FILE_CHUNK_BYTES,
  FILE_MAX_BYTES,
  FILE_NAME_INPUT_MAX,
  FILE_RESOLVE_MAX_PATHS,
  fileUriToPath,
  isPastablePath,
  quotePathForShell,
  type FileInfoResult,
  type ResolvedFile,
} from "@sodashitsu/protocol";
import type { ConnectionPort, InputHold } from "@sodashitsu/client-core";
import { errorCodeOf } from "@sodashitsu/client-core";
import { bracketedOf, pasteBytes, type PasteTerminal } from "./ImagePaster.js";

/**
 * このブラウザとサーバの関係の設定（ブラウザごと）。`auto` はサーバが接続の両端のアドレスから判定する（`file.info` の `sameMachine`）。
 * 転送（`ssh -L`・コンテナのポートの公開等）の後ろでは判定が当たらないので、利用者が上書きできる。
 */
export type FileLocality = "auto" | "local" | "remote";

export function loadFileLocality(raw: unknown): FileLocality {
  return raw === "local" || raw === "remote" ? raw : "auto";
}

/** ファイルの送信の間に打ったキーを溜めておく時間（画像と同じ。超えたらキーを先に流す——失われない）。 */
export const FILE_HOLD_TIMEOUT_MS = 20_000;
/** `file.resolve` の答えを使い回す時間（リンクの判定はポインタが行をまたぐたびに起きる）。 */
export const FILE_RESOLVE_CACHE_MS = 3_000;
/** これ以上の大きさの送信・受信は、始めたことを toast で知らせる。 */
const NOTICE_BYTES = 8 * 1024 * 1024;

/** ドロップされた 1 つのファイル。 */
export interface DroppedFile {
  file: Blob & { readonly name: string };
  /** フォルダか（ブラウザは中身を渡さない。送れない）。 */
  directory: boolean;
}

/** ドロップの中身（`drop` イベントの間に同期で読み取ったもの——イベントの後は `DataTransfer` を読めない）。 */
export interface DropPayload {
  files: DroppedFile[];
  /** `file:` の URI（ブラウザ・ドラッグ元が渡したときだけ。Chromium は OS からのファイルのドラッグでは渡さない）。 */
  uris: string[];
  /** ファイルでないドロップの文字列（選択した文字のドラッグ等）。 */
  text: string;
}

/** ドラッグ中の中身が、端末に落とせる種類か（`dragover` では中身を読めないので種類だけを見る）。 */
export function acceptsDrop(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  const types = [...dt.types];
  return types.includes("Files") || types.includes("text/uri-list") || types.includes("text/plain");
}

/** ファイルのドラッグか（窓のどこに落としても、ブラウザにそのファイルを開かせない）。 */
export function isFileDrag(dt: DataTransfer | null): boolean {
  return dt !== null && [...dt.types].includes("Files");
}

/** `drop` イベントの `DataTransfer` を読み取る。 */
export function readDropPayload(dt: DataTransfer): DropPayload {
  const files: DroppedFile[] = [];
  const items = [...(dt.items ?? [])].filter((item) => item.kind === "file");
  if (items.length > 0) {
    for (const item of items) {
      const file = item.getAsFile();
      if (!file) continue;
      let directory = false;
      try {
        directory = item.webkitGetAsEntry?.()?.isDirectory === true;
      } catch {
        // 分からなければファイルとして扱う
      }
      files.push({ file, directory });
    }
  } else {
    for (const file of [...(dt.files ?? [])]) files.push({ file, directory: false });
  }
  // `text/uri-list` は行ごとの URI（`#` はコメント）。Firefox の `text/x-moz-url` は URI と題名が交互に並ぶ。
  const uriList = dt.getData("text/uri-list") || dt.getData("text/x-moz-url");
  const uris = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^file:/i.test(line));
  return { files, uris, text: files.length === 0 ? dt.getData("text/plain") : "" };
}

export interface FileTransferOptions {
  conn: Pick<ConnectionPort, "request">;
  input: { holdInput(paneId: string | null, opts?: { timeoutMs?: number }): InputHold };
  /** その pane の端末。無ければ（閉じた・作られていない）null。 */
  terminalOf(paneId: string): PasteTerminal | null;
  toast(message: string): void;
  /** pane がまだあるか。省略時は常に真。 */
  paneExists?(paneId: string): boolean;
  /** 設定。 */
  locality(): FileLocality;
  /** ローカルのサーバを向いているか（保存した SSH のマシンを開いている間は、設定に関わらず別のマシンとして扱う）。 */
  isLocalMachine(): boolean;
  /** pane のマシンのシェルの種類（パスの引用の仕方）。 */
  hostOs(): "posix" | "windows";
  /** pane のマシンのホスト名（`file:` の URI のホスト名と比べる。分からなければ、ホスト名つきの URI は扱わない）。 */
  hostname?(): string | undefined;
  /** 受け取ったファイルをブラウザのダウンロードにする。省略時は {@link saveBlobAsDownload}。 */
  saveBlob?(blob: Blob, name: string): void;
  holdTimeoutMs?: number;
  now?: () => number;
}

/** 失敗の文言。 */
export function fileErrorMessage(err: unknown): string {
  switch (errorCodeOf(err)) {
    case "file_not_found":
      return "ファイルが見つかりませんでした";
    case "file_unreadable":
      return "ファイルを読めませんでした（権限が無いか、通常のファイルではありません）";
    case "file_too_large":
      return "ファイルが大きすぎます（256MB まで）";
    case "file_open_unavailable":
      return "サーバのマシンにファイルを開く手段がありません";
    case "file_open_refused":
      return "実行できる種類のファイルは、サーバのマシンのアプリでは開きません";
    case "file_open_failed":
      return "サーバのマシンでファイルを開けませんでした";
    case "invalid_file":
    case "invalid_params":
      return "ファイルを送れませんでした（送った内容をサーバが受け付けませんでした）";
    case "file_upload_busy":
      return "ほかのファイルを送っている最中です。少し待ってからやり直してください";
    case "file_upload_expired":
      return "ファイルの送信が途中で切れました。もう一度やり直してください";
    case "file_store_failed":
      return "サーバにファイルを保存できませんでした。サーバのログを確かめてください";
    case "not_found":
      return "ファイルを扱えませんでした（pane が閉じられたか、サーバ／マシンの版が古くファイルのリンク・ドロップに対応していません）";
    default:
      return "ファイルを扱えませんでした";
  }
}

/** ブラウザのダウンロードにする（`<a download>`。開くのはブラウザのダウンロードの一覧から——同じオリジンの画面としては開かない）。 */
export function saveBlobAsDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) bin += String.fromCharCode(...bytes.subarray(i, i + STEP));
  return btoa(bin);
}

function fromBase64(data: string): Uint8Array<ArrayBuffer> {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function baseName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1) || "file";
}

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * 端末のファイルのリンクとドロップの係。ブラウザ版はローカルのファイルに直接触れないので、サーバ越しに扱う。
 * - **リンク**: サーバと同じマシンのブラウザなら、サーバのマシンの既定のアプリで開く（`file.open`。ふつうの端末と同じ）。別のマシンのブラウザなら、
 *   分けて受け取って（`file.read`）ブラウザのダウンロードにする。同じマシンでも開く手段が無ければ（画面の無いサーバ・コンテナ）ダウンロードにする。
 * - **ドロップ**: 同じマシンで元のパスが分かれば（ドラッグ元が `file:` の URI を渡し、サーバで実在を確かめられたとき）、そのパスを pane へ貼る。
 *   そうでなければ（別のマシン、または Chromium のように元のパスを渡さないブラウザ）、分けて送って（`file.upload.*`）サーバに置いた先のパスを貼る。
 * 同じマシンかどうかは、設定（{@link FileLocality}）と `file.info` から決める（{@link isLocal}）。
 */
export class FileTransfer {
  private readonly holdTimeoutMs: number;
  private readonly now: () => number;
  /** `file.info` の答え（undefined＝まだ聞いていない、null＝サーバが `file.*` に対応していない）。 */
  private info: FileInfoResult | null | undefined;
  /** `file.info` の答えを待つ（聞いている途中のクリック・ドロップは、答えが届いてから扱いを決める）。 */
  private infoReady: Promise<void> = Promise.resolve();
  private queue: Promise<void> = Promise.resolve();
  /** マシンを切り替えるたびに進める（切り替えの前に始めた仕事を捨てる印）。 */
  private generation = 0;
  private readonly pendingHolds = new Set<InputHold>();
  private readonly resolveCache = new Map<string, { at: number; file: Promise<ResolvedFile | null> }>();
  /** 受け取っている途中のパス（同じリンクを続けて押しても 2 度受け取らない）。 */
  private readonly downloading = new Set<string>();

  constructor(private readonly opts: FileTransferOptions) {
    this.holdTimeoutMs = opts.holdTimeoutMs ?? FILE_HOLD_TIMEOUT_MS;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 新しい接続が開いた：この接続から見たサーバを聞く（古いサーバ・マシンは `file.*` を持たない——リンクもドロップも扱わない）。 */
  onOpened(): void {
    const generation = this.generation;
    this.infoReady = this.opts.conn.request("file.info", {}).then(
      (info) => {
        if (generation === this.generation) this.info = info;
      },
      () => {
        if (generation === this.generation) this.info = null;
      },
    );
  }

  /** マシンを切り替えた。pane の id・パスはマシンごとなので、切り替えの前に始めた仕事を捨てる。 */
  resetForMachineSwitch(): void {
    this.generation++;
    this.info = undefined;
    this.resolveCache.clear();
    for (const hold of this.pendingHolds) hold.discard();
    this.pendingHolds.clear();
  }

  /** このブラウザを、サーバと同じマシンにあるものとして扱うか。 */
  isLocal(): boolean {
    if (!this.opts.isLocalMachine()) return false;
    const locality = this.opts.locality();
    return locality === "local" || (locality === "auto" && this.info?.sameMachine === true);
  }

  /** パスを確かめる（`paths` と同じ並び）。答えは短い間使い回す。サーバが対応していなければ全部 null。 */
  async resolve(paneId: string, paths: readonly string[]): Promise<(ResolvedFile | null)[]> {
    if (this.info === null) return paths.map(() => null);
    const now = this.now();
    for (const [key, entry] of this.resolveCache) if (now - entry.at > FILE_RESOLVE_CACHE_MS) this.resolveCache.delete(key);
    const missing = [...new Set(paths.filter((p) => !this.resolveCache.has(`${paneId}\n${p}`)))].slice(0, FILE_RESOLVE_MAX_PATHS);
    if (missing.length > 0) {
      const request = this.opts.conn.request("file.resolve", { paneId, paths: missing });
      missing.forEach((path, i) => {
        const key = `${paneId}\n${path}`;
        const file = request.then(
          (r) => r.files[i] ?? null,
          () => {
            this.resolveCache.delete(key); // 確かめられなかった答えは覚えない
            return null;
          },
        );
        this.resolveCache.set(key, { at: now, file });
      });
    }
    return Promise.all(paths.map((p) => this.resolveCache.get(`${paneId}\n${p}`)?.file ?? null));
  }

  /** OSC 8 の `file:` のリンクが押された。 */
  openUri(paneId: string, uri: string): void {
    const path = fileUriToPath(uri, this.opts.hostname?.());
    if (path === null) return;
    const generation = this.generation;
    void this.resolve(paneId, [path]).then(([file]) => {
      if (generation !== this.generation) return;
      if (file) this.open(file);
      else this.opts.toast("ファイルが見つかりませんでした");
    });
  }

  /** 実在を確かめたパスのリンクが押された。 */
  open(file: ResolvedFile): void {
    const generation = this.generation;
    void this.infoReady.then(() => {
      if (generation === this.generation) this.openNow(file);
    });
  }

  private openNow(file: ResolvedFile): void {
    const generation = this.generation;
    if (!this.isLocal()) return void this.download(file);
    // 「自動」で、サーバに開く手段が無いと分かっていれば（画面の無いサーバ・コンテナ）、聞かずにダウンロードにする。
    if (this.opts.locality() === "auto" && this.info?.canOpen === false) return void this.download(file);
    this.opts.conn.request("file.open", { path: file.path }).then(
      () => undefined,
      (err: unknown) => {
        if (generation !== this.generation) return;
        if (errorCodeOf(err) === "file_open_unavailable" && file.kind === "file") return void this.download(file);
        this.opts.toast(fileErrorMessage(err));
      },
    );
  }

  /** ファイルを分けて受け取り、ブラウザのダウンロードにする。 */
  async download(file: ResolvedFile): Promise<void> {
    const name = baseName(file.path);
    if (file.kind === "dir") return this.opts.toast("フォルダはダウンロードできません");
    if (file.size > FILE_MAX_BYTES) return this.opts.toast("ファイルが大きすぎます（256MB まで）");
    if (this.downloading.has(file.path)) return;
    const generation = this.generation;
    this.downloading.add(file.path);
    try {
      if (file.size >= NOTICE_BYTES) this.opts.toast(`ダウンロードしています: ${name}（${formatBytes(file.size)}）`);
      const parts: Uint8Array<ArrayBuffer>[] = [];
      let offset = 0;
      let first: { size: number; mtimeMs: number } | undefined;
      for (;;) {
        const chunk = await this.opts.conn.request("file.read", { path: file.path, offset });
        if (generation !== this.generation) return;
        first ??= chunk;
        if (chunk.size !== first.size || chunk.mtimeMs !== first.mtimeMs) return this.opts.toast("受け取っている間にファイルが変わったため、ダウンロードをやめました");
        const bytes = fromBase64(chunk.data);
        // サーバ（中継先のマシンを含む）の答えは信用しない——確かめた大きさと違う・1 片が大きすぎる・終わりを越える答えで、際限なく受け取らない。
        if (chunk.size !== file.size || bytes.length > FILE_CHUNK_BYTES || offset + bytes.length > file.size)
          return this.opts.toast("受け取っている間にファイルが変わったため、ダウンロードをやめました");
        parts.push(bytes);
        offset += bytes.length;
        if (offset >= chunk.size) break;
        if (bytes.length === 0) return this.opts.toast("受け取っている間にファイルが変わったため、ダウンロードをやめました");
      }
      (this.opts.saveBlob ?? saveBlobAsDownload)(new Blob(parts), name);
    } catch (err) {
      if (generation === this.generation) this.opts.toast(fileErrorMessage(err));
    } finally {
      this.downloading.delete(file.path);
    }
  }

  /**
   * pane へのドロップ。元のパスが分かればそのパスを、分からなければサーバへ送って置いた先のパスを、ふつうの端末と同じく
   * 引用して空白で区切って貼る。送っている間にその pane へ打ったキーは溜め、パスの後に流す。ファイルでないドロップ（文字）はそのまま貼る。
   */
  drop(paneId: string, payload: DropPayload): void {
    if (payload.files.length === 0 && payload.uris.length === 0 && payload.text === "") return;
    let bracketed = false;
    try {
      const term = this.opts.terminalOf(paneId);
      bracketed = term ? bracketedOf(term) : false;
    } catch {
      // 端末を引けなくても仕事は始める（終わりにもう一度引く）
    }
    const job: Job = { paneId, generation: this.generation, hold: this.opts.input.holdInput(paneId, { timeoutMs: this.holdTimeoutMs }), bracketed };
    this.pendingHolds.add(job.hold);
    this.queue = this.queue
      .then(() => (this.stale(job) ? job.hold.discard() : this.runDrop(job, payload)))
      .catch(() => {
        // 想定外の失敗。溜めたキーは失わない（切り替えた後なら捨てる）。
        if (this.stale(job)) job.hold.discard();
        else job.hold.cancel();
      })
      .finally(() => this.pendingHolds.delete(job.hold));
  }

  private stale(job: Job): boolean {
    return job.generation !== this.generation;
  }

  private async runDrop(job: Job, payload: DropPayload): Promise<void> {
    const { paneId, hold } = job;
    // 文字のドロップ。ESC は落とす（bracketed paste の終わりの印を混ぜて、貼り付けの外へ打鍵を出させない）。
    if (payload.files.length === 0 && payload.uris.length === 0) return this.paste(job, payload.text.split("\x1b").join(""));
    await this.infoReady;
    if (this.stale(job)) return hold.discard();
    const local = await this.localPaths(job, payload);
    if (this.stale(job)) return hold.discard();
    if (local) return this.pastePaths(job, local);
    if (payload.files.length === 0) {
      this.opts.toast("ドロップされたパスをサーバで確かめられなかったため、貼り付けませんでした");
      return hold.cancel();
    }
    const sendable = payload.files.filter((f) => !f.directory);
    if (sendable.length < payload.files.length) this.opts.toast("フォルダは送れません（ブラウザが中身を渡さないため）");
    const tooLarge = sendable.find((f) => f.file.size > FILE_MAX_BYTES);
    if (tooLarge) {
      this.opts.toast(`ファイルが大きすぎます（256MB まで）: ${tooLarge.file.name}`);
      return hold.cancel();
    }
    if (sendable.length === 0) return hold.cancel();
    const total = sendable.reduce((sum, f) => sum + f.file.size, 0);
    if (total >= NOTICE_BYTES) this.opts.toast(`サーバへ送っています: ${sendable.length} 件（${formatBytes(total)}）`);
    const paths: string[] = [];
    for (const { file } of sendable) {
      let uploadId: string | undefined;
      try {
        ({ uploadId } = await this.opts.conn.request("file.upload.begin", { paneId, name: file.name.slice(-FILE_NAME_INPUT_MAX) || "file", size: file.size }));
        for (let offset = 0; offset < file.size; offset += FILE_CHUNK_BYTES) {
          if (this.stale(job)) return hold.discard(); // 切り替えた後は新しいマシンへ送らない（前の接続の送信はサーバが切断で捨てる）
          const bytes = new Uint8Array(await file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer());
          await this.opts.conn.request("file.upload.chunk", { uploadId, offset, data: toBase64(bytes) });
        }
        if (this.stale(job)) return hold.discard();
        paths.push((await this.opts.conn.request("file.upload.commit", { uploadId })).path);
      } catch (err) {
        if (this.stale(job)) return hold.discard();
        if (uploadId !== undefined) void this.opts.conn.request("file.upload.cancel", { uploadId }).catch(() => undefined);
        this.opts.toast(fileErrorMessage(err));
        // 送り終えた分があれば、その分のパスは貼る（サーバには置いてある）。
        if (paths.length === 0) return hold.cancel();
        break;
      }
    }
    if (this.stale(job)) return hold.discard();
    this.pastePaths(job, paths);
  }

  /**
   * ドロップの元のパス（同じマシンで、ドラッグ元が `file:` の URI を渡し、その全部がサーバで実在したときだけ）。ファイルの中身も渡されていれば
   * 大きさが合うことも確かめる。使えなければ null（送る側へ回す）。
   */
  private async localPaths(job: Job, payload: DropPayload): Promise<string[] | null> {
    if (!this.isLocal() || payload.uris.length === 0) return null;
    const paths = payload.uris.map((uri) => fileUriToPath(uri, this.opts.hostname?.()));
    if (paths.some((p) => p === null) || paths.length > FILE_RESOLVE_MAX_PATHS) return null;
    if (payload.files.length > 0 && payload.files.length !== paths.length) return null;
    let files: (ResolvedFile | null)[];
    try {
      ({ files } = await this.opts.conn.request("file.resolve", { paneId: job.paneId, paths: paths as string[] }));
    } catch {
      return null;
    }
    const out: string[] = [];
    for (const [i, file] of files.entries()) {
      if (!file) return null;
      const dropped = payload.files[i];
      if (dropped && !dropped.directory && (file.kind !== "file" || file.size !== dropped.file.size)) return null;
      out.push(file.path);
    }
    return out.length === paths.length ? out : null;
  }

  private pastePaths(job: Job, paths: readonly string[]): void {
    if (paths.some((p) => typeof p !== "string" || !isPastablePath(p))) {
      this.opts.toast("サーバから返ったパスに使えない文字が含まれるため、貼り付けませんでした");
      return job.hold.cancel();
    }
    const os = this.opts.hostOs();
    // ふつうの端末と同じく、続けて打てるように後ろに空白を 1 つ置く。
    this.paste(job, paths.map((p) => `${quotePathForShell(p, os)} `).join(""));
  }

  private paste(job: Job, text: string): void {
    // pane が閉じた（溜めた分は閉じた pane 宛てで、サーバが捨てる）。端末が LRU で捨てられただけなら、控えた状態で貼る。
    if (text === "" || !(this.opts.paneExists?.(job.paneId) ?? true)) return job.hold.cancel();
    const term = this.opts.terminalOf(job.paneId);
    job.hold.cancel(pasteBytes(text, term ? bracketedOf(term) : job.bracketed));
  }
}

interface Job {
  paneId: string;
  generation: number;
  hold: InputHold;
  /** 仕事を始めたときの bracketed paste の状態（終えたときに端末が無ければこれを使う）。 */
  bracketed: boolean;
}
