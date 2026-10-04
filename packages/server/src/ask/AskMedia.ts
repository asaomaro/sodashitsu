import { constants as fsc } from "node:fs";
import { open } from "node:fs/promises";
import { extname } from "node:path";
import {
  ASK_MEDIA_FILE_MAX,
  ASK_MEDIA_FILES_MAX,
  ASK_MEDIA_REF_PREFIX,
  ASK_MEDIA_TEXT_MAX,
  ASK_MEDIA_TOTAL_MAX,
  RpcError,
  classifyMediaRef,
  type AskMediaFileKind,
  type AskMediaInfo,
  type AskSpec,
  type AskViewItem,
} from "@sodashitsu/protocol";
import { EXTENSION_KINDS, MIME_KINDS, isUtf8Text, sniffMedia, type SniffKind } from "./mediaSniff.js";

/** 外部 URL の画像を取る口（`RemoteImageFetcher`。テストは偽のものを渡す）。失敗は投げる。 */
export interface ImageFetcher {
  fetchImage(url: string, signal: AbortSignal): Promise<{ bytes: Buffer; contentType: string }>;
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

const VIEW_HTML = new Set([".html", ".htm"]);
const VIEW_MARKDOWN = new Set([".md", ".markdown"]);

/** 定義にメディア・成果物の参照があるか（無ければ `prepare` を呼ばず、同期で画面へ出せる）。 */
export function hasMediaRefs(spec: AskSpec): boolean {
  return (spec.view?.length ?? 0) > 0 || spec.questions.some((q) => q.options.some((o) => o.image !== undefined || o.audio !== undefined));
}

const invalid = (where: string, why: string): RpcError => new RpcError("invalid_ask_spec", `${where}: ${why}`);

/**
 * 質問の定義の参照（`image`・`audio`・`view`）を読んで保持する形にする（20261004-ask-media-popup の design「サーバ: `AskMedia`」）。
 * ローカルのファイル・`data:`・`view` の誤りと上限の超過は `invalid_ask_spec`（質問は出さない）。外部 URL の取得失敗はその画像だけ外して数える。
 */
export class AskMedia {
  constructor(private readonly opts: AskMediaOptions) {}

  async prepare(spec: AskSpec, signal: AbortSignal): Promise<Prepared> {
    interface Slot {
      where: string;
      remote: boolean;
      load(): Promise<Loaded | null>;
      result?: Promise<Loaded | null>;
    }
    const slots = new Map<string, Slot>(); // 重複を 1 つにまとめる（キー: 種類+参照）。挿入順が id の順
    const claim = (key: string, where: string, remote: boolean, load: () => Promise<Loaded | null>): Slot => {
      let slot = slots.get(key);
      if (slot === undefined) {
        if (slots.size >= ASK_MEDIA_FILES_MAX) throw invalid(where, `more than ${ASK_MEDIA_FILES_MAX} media files in one question`);
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
          if (type === null || ref.startsWith(ASK_MEDIA_REF_PREFIX)) throw invalid(where, "unsupported reference");
          const slot = claim(`${kind}:${ref}`, where, type === "https", () =>
            type === "https" ? this.loadRemote(ref, signal) : this.loadLocalOrData(type, ref, kind, where),
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
        if (bytes.length > ASK_MEDIA_TEXT_MAX) throw invalid(where, `text is larger than ${ASK_MEDIA_TEXT_MAX} bytes`);
        viewSlots.push({ title: v.title, slot: claim(`viewtext:${i}`, where, false, async () => ({ kind: "text", mime: "text/plain; charset=utf-8", bytes })) });
      } else {
        const file = v.file!;
        const raw = v.raw === true;
        viewSlots.push({ title: v.title, slot: claim(`view:${raw ? 1 : 0}:${file}`, where, false, () => this.loadView(file, raw, where)) });
      }
    }

    // 2. 読む。外部 URL は先に並べて取り始め、ローカルは 1 つずつ読む（読む前の大きさ・読んだ後の大きさで合計を先に断つ）。
    let total = 0;
    const account = (n: number, where: string): void => {
      total += n;
      if (total > ASK_MEDIA_TOTAL_MAX) throw invalid(where, `the media in one question are larger than ${ASK_MEDIA_TOTAL_MAX} bytes in total`);
    };
    for (const slot of slots.values()) if (slot.remote) (slot.result = slot.load()).catch(() => undefined);
    try {
      for (const slot of slots.values()) {
        if (signal.aborted) throw new Error("aborted");
        if (slot.remote) continue;
        slot.result = slot.load();
        const loaded = await slot.result;
        if (loaded) account(loaded.bytes.length, slot.where);
      }
      for (const slot of slots.values()) {
        if (!slot.remote) continue;
        const loaded = await slot.result!;
        if (loaded) account(loaded.bytes.length, slot.where);
      }
    } finally {
      for (const slot of slots.values()) slot.result?.catch(() => undefined); // 先に投げられた誤りで、残りの reject を未処理にしない
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
      media.push({ info: { id, kind: loaded.kind, mime: loaded.mime, bytes: loaded.bytes.length }, bytes: loaded.bytes });
    }
    for (const b of bindings) {
      const id = ids.get(b.slot);
      b.set(id === undefined ? undefined : `${ASK_MEDIA_REF_PREFIX}${id}`);
    }
    // 警告は、参照ごとではなく失敗した画像（重複をまとめた後）の数。
    const prepared: Prepared = { spec: out, media, warnings, totalBytes: media.reduce((n, m) => n + m.bytes.length, 0) };
    if (viewSlots.length > 0) {
      prepared.view = viewSlots.map(({ title, slot }) => {
        const id = ids.get(slot)!;
        return { title, kind: media[id]!.info.kind as AskViewItem["kind"], media: id };
      });
    }
    return prepared;
  }

  private async loadLocalOrData(type: "path" | "data", ref: string, kind: "image" | "audio", where: string): Promise<Loaded> {
    if (type === "data") return this.loadData(ref, kind, where);
    const ext = extname(ref).toLowerCase();
    const allowed = EXTENSION_KINDS[ext];
    if (allowed === undefined) throw invalid(where, "unsupported file extension");
    const bytes = await readRegularFile(ref, ASK_MEDIA_FILE_MAX, where);
    const sniffed = sniffMedia(bytes);
    if (sniffed === null || !allowed.includes(sniffed.kind)) throw invalid(where, "the file content does not match its extension");
    if (sniffed.media !== kind) throw invalid(where, `the file is not ${kind === "image" ? "an image" : "audio"}`);
    return { kind: sniffed.media, mime: sniffed.mime, bytes };
  }

  private loadData(ref: string, kind: "image" | "audio", where: string): Loaded {
    const m = /^data:([a-z0-9.+/-]+);base64,(.*)$/s.exec(ref);
    if (!m) throw invalid(where, "malformed data: URI");
    const allowed: SniffKind[] | undefined = MIME_KINDS[m[1]!];
    if (allowed === undefined) throw invalid(where, "unsupported data: MIME type");
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > ASK_MEDIA_FILE_MAX) throw invalid(where, `the data: URI is larger than ${ASK_MEDIA_FILE_MAX} bytes`);
    const sniffed = sniffMedia(bytes);
    if (sniffed === null || !allowed.includes(sniffed.kind) || sniffed.media !== kind) throw invalid(where, "the data: URI content does not match its MIME type");
    return { kind: sniffed.media, mime: sniffed.mime, bytes };
  }

  private async loadRemote(url: string, signal: AbortSignal): Promise<Loaded | null> {
    try {
      const got = await this.opts.fetcher.fetchImage(url, signal);
      if (got.bytes.length > ASK_MEDIA_FILE_MAX) return null;
      const sniffed = sniffMedia(got.bytes);
      if (sniffed === null || sniffed.media !== "image") return null;
      return { kind: "image", mime: sniffed.mime, bytes: got.bytes };
    } catch {
      this.opts.logger?.info("ask remote image failed"); // 宛先・理由は書かない（定義の中身）
      return null;
    }
  }

  private async loadView(file: string, raw: boolean, where: string): Promise<Loaded> {
    const ext = extname(file).toLowerCase();
    if (EXTENSION_KINDS[ext] !== undefined && sniffKindsAreImage(ext)) {
      const bytes = await readRegularFile(file, ASK_MEDIA_FILE_MAX, where);
      const sniffed = sniffMedia(bytes);
      if (sniffed === null || !EXTENSION_KINDS[ext]!.includes(sniffed.kind)) throw invalid(where, "the file content does not match its extension");
      return { kind: "image", mime: sniffed.mime, bytes };
    }
    if (VIEW_HTML.has(ext)) {
      const bytes = await readRegularFile(file, ASK_MEDIA_FILE_MAX, where);
      if (!isUtf8Text(bytes)) throw invalid(where, "the file is not UTF-8 text");
      return { kind: "html", mime: "text/html; charset=utf-8", bytes };
    }
    const bytes = await readRegularFile(file, ASK_MEDIA_TEXT_MAX, where);
    if (!isUtf8Text(bytes)) throw invalid(where, "the file is not UTF-8 text (pass an HTML file, an image or a UTF-8 text file)");
    if (VIEW_MARKDOWN.has(ext) && !raw) return { kind: "markdown", mime: "text/markdown; charset=utf-8", bytes };
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
async function readRegularFile(path: string, max: number, where: string): Promise<Buffer> {
  let fh;
  try {
    fh = await open(path, fsc.O_RDONLY | (fsc.O_NONBLOCK ?? 0));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw invalid(where, code === "ENOENT" || code === "ENOTDIR" ? "file not found" : code === "EACCES" || code === "EPERM" ? "file is not readable" : "cannot open the file");
  }
  try {
    const st = await fh.stat();
    if (!st.isFile()) throw invalid(where, "not a regular file");
    if (st.size > max) throw invalid(where, `the file is larger than ${max} bytes`);
    const buf = Buffer.allocUnsafe(Math.min(st.size, max) + 1);
    let n = 0;
    while (n < buf.length) {
      const { bytesRead } = await fh.read(buf, n, buf.length - n, n);
      if (bytesRead === 0) break;
      n += bytesRead;
    }
    if (n > max) throw invalid(where, `the file is larger than ${max} bytes`);
    return buf.subarray(0, n);
  } finally {
    await fh.close();
  }
}
