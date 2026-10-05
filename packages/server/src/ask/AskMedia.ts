import { constants as fsc } from "node:fs";
import { open } from "node:fs/promises";
import { extname } from "node:path";
import {
  ASK_MEDIA_FILE_MAX,
  ASK_MEDIA_FILES_MAX,
  ASK_MEDIA_REF_PREFIX,
  RpcError,
  askByteLimits,
  type AskByteLimits,
  classifyMediaRef,
  type AskMediaFileKind,
  type AskMediaInfo,
  type AskSpec,
  type AskViewItem,
} from "@sodashitsu/protocol";
import {
  EXTENSION_KINDS,
  MIME_KINDS,
  isUtf8Text,
  sniffMedia,
  type SniffKind,
} from "./mediaSniff.js";

/**
 * 外部 URL の画像を取る口（`RemoteImageFetcher`。テストは偽のものを渡す）。失敗は投げる。
 * `onBytes` は、本文を受け取るたびに、その分のバイト数を知らせる（呼び出し側が質問の合計・サーバ全体の上限を超えたと見たら投げる。取得は止めて失敗にする）。
 */
export interface ImageFetcher {
  fetchImage(
    url: string,
    signal: AbortSignal,
    onBytes?: (n: number) => void,
  ): Promise<{ bytes: Buffer; contentType: string }>;
}

/** 保持する 1 つのメディア（`info.id` は質問の中の連番）。 */
export interface StoredMedia {
  info: AskMediaInfo;
  bytes: Buffer;
}

export interface Prepared {
  /** 配る定義（参照を `media:<id>` に付け替え、`view` を外したもの）。 */
  spec: AskSpec;
  view?: AskViewItem[];
  media: StoredMedia[];
  /** 取得に失敗して外した画像（外部 URL）の件数。 */
  warnings: number;
  /** 保持するバイトの合計。 */
  totalBytes: number;
}

export interface AskMediaOptions {
  fetcher: ImageFetcher;
  logger?: { info(msg: string, f?: Record<string, unknown>): void };
}

interface Loaded {
  kind: AskMediaFileKind;
  mime: string;
  bytes: Buffer;
}

/** 読む前に、確保するバイト数をサーバ全体へ予約する（超えるなら `ask_busy` を投げる）。予約は `prepare` が、数え終えた後か終わりに戻す。 */
type Reserve = (n: number, where: string) => void;

const VIEW_HTML = new Set([".html", ".htm"]);
const VIEW_MARKDOWN = new Set([".md", ".markdown"]);

/** 定義にメディア・成果物の参照があるか（無ければ `prepare` を呼ばず、同期で画面へ出せる）。 */
export function hasMediaRefs(spec: AskSpec): boolean {
  return (
    (spec.view?.length ?? 0) > 0 ||
    spec.questions.some((q) =>
      q.options.some((o) => o.image !== undefined || o.audio !== undefined),
    )
  );
}

const invalid = (where: string, why: string): RpcError =>
  new RpcError("invalid_ask_spec", `${where}: ${why}`);

/**
 * 質問の定義の参照（`image`・`audio`・`view`）を読んで保持する形にする（20261004-ask-media-popup の design「サーバ: `AskMedia`」）。
 * ローカルのファイル・`data:`・`view` の誤りと上限の超過は `invalid_ask_spec`（質問は出さない）。外部 URL の取得失敗はその画像だけ外して数える。
 */
export class AskMedia {
  /** `prepare` の最中に溜めているバイトの合計（全部の質問。取得中の分を含む）。サーバ全体の上限の判定に使う。 */
  private inflight = 0;
  /** `prepare` がこれから確保する分の予約（読み込みの前に足し、読み終えて `inflight` へ数えた後に戻す）。複数の `prepare` が同時に大きなファイルを確保して、サーバ全体の安全弁を超えないため。 */
  private reservedTotal = 0;

  constructor(private readonly opts: AskMediaOptions) {}

  /** 読み込みの前に予約している分（テスト・診断用。終わればゼロに戻る）。 */
  get reservedBytes(): number {
    return this.reservedTotal;
  }

  /** いま `prepare` が読み込み・取得で溜めているバイト数（テスト・診断用）。 */
  get inflightBytes(): number {
    return this.inflight;
  }

  /**
   * `serverHeld` は、画面へ出して保持している質問のメディアの合計（サーバ全体の上限 `ASK_MEDIA_SERVER_MAX` の判定に、取得中の分と足す）。
   * `unlimited`（ローカル起動。`AskService` が決める）のとき、大きさの上限は外れて安全弁（`askByteLimits(true)`）だけになる。個数は変わらない。外部 URL の画像は常に `ASK_MEDIA_FILE_MAX`。
   * 外部 URL は受け取るたびに質問の合計とサーバ全体へ足し、超えたら残りの取得を中止して失敗にする（合計を、全部取り終えてから判定しない）。
   */
  async prepare(
    spec: AskSpec,
    signal: AbortSignal,
    serverHeld: () => number = () => 0,
    unlimited = false,
  ): Promise<Prepared> {
    const lim = askByteLimits(unlimited);
    interface Slot {
      where: string;
      remote: boolean;
      load(): Promise<Loaded | null>;
      result?: Promise<Loaded | null>;
    }
    const slots = new Map<string, Slot>(); // 重複を 1 つにまとめる（キー: 種類+参照）。挿入順が id の順
    const claim = (
      key: string,
      where: string,
      remote: boolean,
      load: () => Promise<Loaded | null>,
    ): Slot => {
      let slot = slots.get(key);
      if (slot === undefined) {
        if (slots.size >= ASK_MEDIA_FILES_MAX)
          throw invalid(where, `more than ${ASK_MEDIA_FILES_MAX} media files in one question`);
        slot = { where, remote, load };
        slots.set(key, slot);
      }
      return slot;
    };

    // 1. 走査（定義の順）。配る定義の写しを作り、参照の付け替え先を控える。
    const out = structuredClone(spec);
    delete out.view;
    const bindings: { slot: Slot; set(v: string | undefined): void }[] = [];
    for (const [qi, q] of out.questions.entries()) {
      for (const [oi, o] of q.options.entries()) {
        for (const kind of ["image", "audio"] as const) {
          const ref = o[kind];
          if (ref === undefined) continue;
          const where = `questions[${qi}].options[${oi}].${kind}`;
          const type = classifyMediaRef(ref, kind);
          if (type === null || ref.startsWith(ASK_MEDIA_REF_PREFIX))
            throw invalid(where, "unsupported reference");
          const slot = claim(`${kind}:${ref}`, where, type === "https", () =>
            type === "https"
              ? this.loadRemote(ref, fetchSignal, charge, refund)
              : this.loadLocalOrData(type, ref, kind, where, remaining, lim, reserve),
          );
          bindings.push({
            slot,
            set: (v) => {
              if (v === undefined) delete o[kind];
              else o[kind] = v;
            },
          });
        }
      }
    }
    const viewSlots: { title: string; slot: Slot }[] = [];
    for (const [i, v] of (spec.view ?? []).entries()) {
      const where = `view[${i}]`;
      if (v.text !== undefined) {
        const bytes = Buffer.from(v.text, "utf8");
        if (bytes.length > lim.text) throw invalid(where, `text is larger than ${lim.text} bytes`);
        viewSlots.push({
          title: v.title,
          slot: claim(`viewtext:${i}`, where, false, async () => ({
            kind: "text",
            mime: "text/plain; charset=utf-8",
            bytes,
          })),
        });
      } else {
        const file = v.file!;
        const raw = v.raw === true;
        viewSlots.push({
          title: v.title,
          slot: claim(`view:${raw ? 1 : 0}:${file}`, where, false, () =>
            this.loadView(file, raw, where, remaining, lim, reserve),
          ),
        });
      }
    }

    // 2. 読む。外部 URL は先に並べて取り始め、ローカルは 1 つずつ読む（読む前の大きさ・読んだ後の大きさで合計を先に断つ）。
    // 溜めたバイトは、読んだ・受け取った時点で質問の合計（`total`）とサーバ全体（`this.inflight`）へ足す。超えたら誤りを投げ、残りの取得を中止する。
    let total = 0;
    let mine = 0; // この `prepare` が `this.inflight` へ足した分（終わりに戻す）
    let fatal: RpcError | undefined;
    let done = false; // `prepare` が終わった後に、中止された取得が遅れて知らせてきても、数に足さない・戻さない
    const remaining = (): number => lim.total - total;
    const abortFetches = new AbortController();
    const fetchSignal = AbortSignal.any([signal, abortFetches.signal]);
    const charge = (n: number, where: string): void => {
      if (done) throw new Error("aborted");
      total += n;
      mine += n;
      this.inflight += n;
      if (fatal !== undefined) throw fatal;
      if (total > lim.total)
        fatal = invalid(where, `the media in one question are larger than ${lim.total} bytes in total`);
      else if (serverHeld() + this.inflight > lim.server)
        fatal = new RpcError("ask_busy", "too much media is waiting for an answer");
      if (fatal !== undefined) {
        abortFetches.abort();
        throw fatal;
      }
    };
    let reserved = 0; // この `prepare` が `this.reservedTotal` へ足している分
    const reserve: Reserve = (n, where) => {
      if (done) throw new Error("aborted");
      if (serverHeld() + this.inflight + this.reservedTotal + n > lim.server)
        throw new RpcError("ask_busy", `too much media is waiting for an answer (${where})`);
      this.reservedTotal += n;
      reserved += n;
    };
    const releaseReserved = (): void => {
      this.reservedTotal -= reserved;
      reserved = 0;
    };
    const refund = (n: number): void => {
      if (done) return;
      total -= n;
      mine -= n;
      this.inflight -= n;
    };
    for (const slot of slots.values())
      if (slot.remote) (slot.result = slot.load()).catch(() => undefined);
    try {
      for (const slot of slots.values()) {
        if (signal.aborted) throw new Error("aborted");
        if (fatal !== undefined) throw fatal;
        if (slot.remote) continue;
        slot.result = slot.load();
        let loaded: Loaded | null;
        try {
          loaded = await slot.result;
        } catch (e) {
          releaseReserved();
          throw e;
        }
        try {
          if (loaded) charge(loaded.bytes.length, slot.where);
        } finally {
          releaseReserved(); // 読み終えて実際の分を数えたので、予約は戻す
        }
      }
      for (const slot of slots.values()) {
        if (!slot.remote) continue;
        await slot.result!; // 受け取った分は取得の途中で数えている（超えたらここで誤りが投げられる）
        if (fatal !== undefined) throw fatal;
      }
    } finally {
      abortFetches.abort(); // 終わったもの以外の取得を止める（先に投げられた誤りで、残りが溜め続けない）
      for (const slot of slots.values()) slot.result?.catch(() => undefined); // 先に投げられた誤りで、残りの reject を未処理にしない
      done = true;
      releaseReserved();
      this.inflight -= mine; // 保持は `AskService` が `totalBytes` で数え直す
    }
    if (signal.aborted) throw new Error("aborted");

    // 3. 保持する形にする（id は初めて使われた順。失敗した外部 URL は id を持たない）。
    const ids = new Map<Slot, number>();
    const media: StoredMedia[] = [];
    let warnings = 0;
    for (const slot of slots.values()) {
      const loaded = await slot.result!;
      if (loaded === null) {
        warnings++;
        continue;
      }
      const id = media.length;
      ids.set(slot, id);
      media.push({
        info: { id, kind: loaded.kind, mime: loaded.mime, bytes: loaded.bytes.length },
        bytes: loaded.bytes,
      });
    }
    for (const b of bindings) {
      const id = ids.get(b.slot);
      b.set(id === undefined ? undefined : `${ASK_MEDIA_REF_PREFIX}${id}`);
    }
    // 警告は、参照ごとではなく失敗した画像（重複をまとめた後）の数。
    const prepared: Prepared = {
      spec: out,
      media,
      warnings,
      totalBytes: media.reduce((n, m) => n + m.bytes.length, 0),
    };
    if (viewSlots.length > 0) {
      prepared.view = viewSlots.map(({ title, slot }) => {
        const id = ids.get(slot)!;
        return { title, kind: media[id]!.info.kind as AskViewItem["kind"], media: id };
      });
    }
    return prepared;
  }

  private async loadLocalOrData(
    type: "path" | "data",
    ref: string,
    kind: "image" | "audio",
    where: string,
    remaining: () => number,
    lim: AskByteLimits,
    reserve: Reserve,
  ): Promise<Loaded> {
    if (type === "data") return this.loadData(ref, kind, where, lim);
    const ext = extname(ref).toLowerCase();
    const allowed = EXTENSION_KINDS[ext];
    if (allowed === undefined) throw invalid(where, "unsupported file extension");
    const bytes = await readRegularFile(ref, lim.file, where, remaining(), lim.total, reserve);
    const sniffed = sniffMedia(bytes);
    if (sniffed === null || !allowed.includes(sniffed.kind))
      throw invalid(where, "the file content does not match its extension");
    if (sniffed.media !== kind)
      throw invalid(where, `the file is not ${kind === "image" ? "an image" : "audio"}`);
    return { kind: sniffed.media, mime: sniffed.mime, bytes };
  }

  private loadData(ref: string, kind: "image" | "audio", where: string, lim: AskByteLimits): Loaded {
    const m = /^data:([a-z0-9.+/-]+);base64,(.*)$/s.exec(ref);
    if (!m) throw invalid(where, "malformed data: URI");
    const allowed: SniffKind[] | undefined = MIME_KINDS[m[1]!];
    if (allowed === undefined) throw invalid(where, "unsupported data: MIME type");
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > lim.file) throw invalid(where, `the data: URI is larger than ${lim.file} bytes`);
    const sniffed = sniffMedia(bytes);
    if (sniffed === null || !allowed.includes(sniffed.kind) || sniffed.media !== kind)
      throw invalid(where, "the data: URI content does not match its MIME type");
    return { kind: sniffed.media, mime: sniffed.mime, bytes };
  }

  private async loadRemote(
    url: string,
    signal: AbortSignal,
    charge: (n: number, where: string) => void,
    refund: (n: number) => void,
  ): Promise<Loaded | null> {
    // 取得の宛先はホスト名だけをログに残す（URL の全文・パス・クエリは残さない。pane のプロセスが、サーバの権限で外へ通信させられた跡を追えるように）。
    this.opts.logger?.info("ask remote image fetch", { host: new URL(url).hostname });
    let counted = 0; // この取得で質問の合計へ足した分
    const count = (n: number): void => {
      counted += n;
      charge(n, "remote image");
    };
    try {
      const got = await this.opts.fetcher.fetchImage(url, signal, count);
      if (got.bytes.length > counted) count(got.bytes.length - counted); // 受け取りを知らせない取得器の分
      if (got.bytes.length > ASK_MEDIA_FILE_MAX) throw new Error("too large");
      const sniffed = sniffMedia(got.bytes);
      if (sniffed === null || sniffed.media !== "image") throw new Error("not an image");
      return { kind: "image", mime: sniffed.mime, bytes: got.bytes };
    } catch (e) {
      if (e instanceof RpcError) throw e; // 合計の上限の超過は、画像を外す扱いにせず質問ごとの誤り
      refund(counted); // 失敗した取得の分は戻す（画像なしで出す）
      this.opts.logger?.info("ask remote image failed"); // 宛先・理由は書かない（定義の中身）
      return null;
    }
  }

  private async loadView(
    file: string,
    raw: boolean,
    where: string,
    remaining: () => number,
    lim: AskByteLimits,
    reserve: Reserve,
  ): Promise<Loaded> {
    const ext = extname(file).toLowerCase();
    if (EXTENSION_KINDS[ext] !== undefined && sniffKindsAreImage(ext)) {
      const bytes = await readRegularFile(file, lim.file, where, remaining(), lim.total, reserve);
      const sniffed = sniffMedia(bytes);
      if (sniffed === null || !EXTENSION_KINDS[ext]!.includes(sniffed.kind))
        throw invalid(where, "the file content does not match its extension");
      return { kind: "image", mime: sniffed.mime, bytes };
    }
    if (VIEW_HTML.has(ext)) {
      const bytes = await readRegularFile(file, lim.file, where, remaining(), lim.total, reserve);
      if (!isUtf8Text(bytes)) throw invalid(where, "the file is not UTF-8 text");
      return { kind: "html", mime: "text/html; charset=utf-8", bytes };
    }
    const bytes = await readRegularFile(file, lim.text, where, remaining(), lim.total, reserve);
    if (!isUtf8Text(bytes))
      throw invalid(
        where,
        "the file is not UTF-8 text (pass an HTML file, an image or a UTF-8 text file)",
      );
    if (VIEW_MARKDOWN.has(ext) && !raw)
      return { kind: "markdown", mime: "text/markdown; charset=utf-8", bytes };
    return { kind: "text", mime: "text/plain; charset=utf-8", bytes };
  }
}

function sniffKindsAreImage(ext: string): boolean {
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"].includes(ext);
}

/**
 * 通常のファイルだけを `max` バイトまで読む。開いた後の `fstat` で種類と大きさを確かめる（FIFO・デバイス・ディレクトリは拒否。FIFO で固まらないよう非ブロックで開く）。
 * シンボリックリンクは辿る（pane のシェルと同じ権限で読めるもの）。
 */
async function readRegularFile(
  path: string,
  max: number,
  where: string,
  remaining: number,
  totalMax: number,
  reserve: Reserve,
): Promise<Buffer> {
  let fh;
  try {
    // 非ブロック（FIFO で固まらない）・制御端末にしない（`/dev/tty` 系を開いても端末を取らない）。
    fh = await open(path, fsc.O_RDONLY | (fsc.O_NONBLOCK ?? 0) | (fsc.O_NOCTTY ?? 0));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw invalid(
      where,
      code === "ENOENT" || code === "ENOTDIR"
        ? "file not found"
        : code === "EACCES" || code === "EPERM"
          ? "file is not readable"
          : "cannot open the file",
    );
  }
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw invalid(where, "not a regular file");
    if (st.size > max) throw invalid(where, `the file is larger than ${max} bytes`);
    if (st.size > remaining)
      throw invalid(
        where,
        `the media in one question are larger than ${totalMax} bytes in total`,
      ); // 読む前に断つ
    const limit = Math.min(max, remaining);
    // `st.size` が 0 のファイル（`/proc` 配下など）は大きさが当てにならないので、上限 +1 まで読んで確かめる。
    const cap = st.size === 0 ? limit + 1 : Math.min(st.size, limit) + 1;
    reserve(cap, where); // 確保する前に、サーバ全体の安全弁を超えないか見て予約する（超えるなら読まずに `ask_busy`）
    // 大きさが分かるファイルは 1 つの Buffer へ直に読む（ローカル起動の大きなファイルで、片の配列と連結の二重のメモリを使わない）。
    // 大きさが 0 と出るもの（`/proc` 配下など）は、上限を超えない範囲で片に分けて読む。
    let n = 0;
    let out: Buffer;
    if (st.size > 0) {
      const buf = Buffer.allocUnsafe(cap);
      while (n < cap) {
        const { bytesRead } = await fh.read(buf, n, Math.min(cap - n, 8 * 1024 * 1024), null);
        if (bytesRead === 0) break;
        n += bytesRead;
      }
      out = buf.subarray(0, n);
    } else {
      const chunks: Buffer[] = [];
      while (n < cap) {
        const buf = Buffer.allocUnsafe(Math.min(cap - n, 1024 * 1024));
        const { bytesRead } = await fh.read(buf, 0, buf.length, null);
        if (bytesRead === 0) break;
        chunks.push(buf.subarray(0, bytesRead));
        n += bytesRead;
      }
      out = Buffer.concat(chunks, n);
    }
    if (n > limit)
      throw invalid(
        where,
        n > max
          ? `the file is larger than ${max} bytes`
          : `the media in one question are larger than ${totalMax} bytes in total`,
      );
    return out;
  } finally {
    await fh.close();
  }
}
