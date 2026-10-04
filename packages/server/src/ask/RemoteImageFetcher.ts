import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { ASK_MEDIA_FILE_MAX } from "@sodashitsu/protocol";
import type { ImageFetcher } from "./AskMedia.js";
import { sniffMedia } from "./mediaSniff.js";

/**
 * 外部 URL の画像をサーバが取る（20261004-ask-media-popup の design「サーバ: `RemoteImageFetcher`（SSRF 対策）」）。
 * pane のプログラムが指す URL なので信頼しない: https のみ・ポート 443 のみ・解決した**全部**のアドレスが公開アドレスであること・接続は検査したアドレスに固定
 * （DNS リバインディング対策）・リダイレクトは回数を数えて毎回検査し直す・Cookie などは付けない・時間とサイズに上限。
 */

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"]);
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export interface RemoteResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  /** 読むのをやめる（上限を超えたとき）。 */
  destroy(): void;
}

export interface RemoteRequestArgs {
  url: URL;
  /** 検査済みの接続先（`url.hostname` の名前解決はここでは使わない）。 */
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface RemoteImageFetcherOptions {
  /** 名前解決（全アドレス）。既定は `dns.lookup`。 */
  lookup?: (host: string) => Promise<{ address: string; family: number }[]>;
  /** 1 回の要求。既定は `https.request`（接続先を `address` に固定し、SNI・証明書の検証は元のホスト名）。 */
  request?: (args: RemoteRequestArgs) => Promise<RemoteResponse>;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  concurrency?: number;
  /** テスト用: 実物の要求が信用する CA の PEM（自己署名の証明書）。 */
  ca?: string;
}

// --- アドレスの検査 --------------------------------------------------------------------------

function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** IPv6 を 16 バイトにする（`::`・末尾の IPv4 表記に対応）。ゾーン ID つき・不正は null。 */
function parseIPv6(s: string): number[] | null {
  if (s.includes("%")) return null;
  let tail: number[] = [];
  let head = s;
  const lastColon = s.lastIndexOf(":");
  const v4 = lastColon >= 0 ? parseIPv4(s.slice(lastColon + 1)) : null;
  if (v4) {
    tail = v4;
    head = `${s.slice(0, lastColon + 1)}0:0`;
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const groups = (x: string): number[] | null => {
    if (x === "") return [];
    const out: number[] = [];
    for (const g of x.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const a = groups(halves[0]!);
  const b = halves.length === 2 ? groups(halves[1]!) : [];
  if (a === null || b === null) return null;
  const missing = 8 - a.length - b.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const words = halves.length === 2 ? [...a, ...Array<number>(missing).fill(0), ...b] : a;
  const bytes = words.flatMap((w) => [w >> 8, w & 0xff]);
  if (v4) bytes.splice(12, 4, ...tail);
  return bytes.length === 16 ? bytes : null;
}

function blockedV4(p: number[]): boolean {
  const [a, b, c] = p as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/**
 * 接続してはいけないアドレスか（ループバック・プライベート・リンクローカル・メタデータ・CGNAT・予約・マルチキャスト等。解釈できないものも拒否）。
 * IPv6 は、公開の単一宛先（`2000::/3`）から文書用・Teredo を除いたものだけ許し、IPv4 射影（`::ffff:a.b.c.d`）・6to4（`2002::/16`）は埋め込んだ IPv4 で判定する。
 */
export function isBlockedAddress(addr: string): boolean {
  const v4 = parseIPv4(addr);
  if (v4) return blockedV4(v4);
  const b = parseIPv6(addr);
  if (!b) return true;
  const mapped = b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
  if (mapped) return blockedV4(b.slice(12));
  if ((b[0]! & 0xe0) !== 0x20) return true; // 2000::/3 の外（::・::1・fc00::/7・fe80::/10・ff00::/8・64:ff9b::/96・IPv4 互換 等）
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true; // 2001:db8::/32（文書用）
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true; // 2001::/32（Teredo）
  if (b[0] === 0x20 && b[1] === 0x02) return blockedV4(b.slice(2, 6)); // 6to4
  return false;
}

// --- 実物の 1 回の要求 ---------------------------------------------------------------------

/**
 * 実物の 1 回の要求（`https.request`）を作る。`ca` はテストが自己署名の証明書を信用させるためだけの口（本番は使わない）。
 * 接続先は `address` に固定する（`lookup` が検査済みのアドレスを返す＝接続時に名前解決をやり直さない）。SNI・証明書の検証は元のホスト名（IP リテラルには SNI を付けない）。
 */
export function makeRealRequest(opts: { ca?: string } = {}): NonNullable<RemoteImageFetcherOptions["request"]> {
  return (args) =>
    new Promise((resolve, reject) => {
      const { url, address, family, headers, signal } = args;
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const req = httpsRequest(
        {
          protocol: "https:",
          hostname: host,
          port: url.port === "" ? 443 : Number(url.port), // `RemoteImageFetcher` が 443 以外を断った後なので、実際には 443
          path: `${url.pathname}${url.search}`,
          method: "GET",
          headers: { ...headers, Host: url.host },
          ...(isIP(host) === 0 ? { servername: host } : {}),
          ...(opts.ca !== undefined ? { ca: opts.ca } : {}),
          agent: false,
          signal,
          lookup: (_hostname, lookupOpts, cb) => {
            const wantsAll = (lookupOpts as { all?: boolean } | undefined)?.all === true;
            if (wantsAll) (cb as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
            else cb(null, address, family);
          },
        },
        (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: res, destroy: () => res.destroy() }),
      );
      req.on("error", reject);
      req.end();
    });
}

// --- 取得 ------------------------------------------------------------------------------------

export class RemoteImageFetcher implements ImageFetcher {
  private readonly lookup: NonNullable<RemoteImageFetcherOptions["lookup"]>;
  private readonly request: NonNullable<RemoteImageFetcherOptions["request"]>;
  private readonly maxRedirects: number;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly concurrency: number;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(opts: RemoteImageFetcherOptions = {}) {
    this.lookup = opts.lookup ?? ((host) => dnsLookup(host, { all: true, verbatim: true }));
    this.request = opts.request ?? makeRealRequest(opts.ca !== undefined ? { ca: opts.ca } : {});
    this.maxRedirects = opts.maxRedirects ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.maxBytes = opts.maxBytes ?? ASK_MEDIA_FILE_MAX;
    this.concurrency = opts.concurrency ?? 4;
  }

  async fetchImage(urlText: string, signal: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
    await this.acquire();
    try {
      const all = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
      all.throwIfAborted(); // 枠を待っている間に中止・時間切れになっていたら始めない
      return await this.run(urlText, all);
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active++;
      return;
    }
    await new Promise<void>((r) => this.waiting.push(r));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next(); // 枠を渡す（active は減らさない）
    else this.active--;
  }

  private async run(urlText: string, signal: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
    let url = new URL(urlText);
    for (let hop = 0; ; hop++) {
      const addrs = await this.resolve(url, signal);
      // 付けるのはこれだけ（Cookie・Authorization・Referer・Origin は付けない）。
      const headers = { Accept: "image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml", "User-Agent": "sodashitsu-ask", "Accept-Encoding": "identity" };
      // 検査を通ったアドレスを順に試す（IPv6 の経路が無い環境で IPv4 へ回る）。接続できなかったときだけ次へ。
      let res: RemoteResponse | undefined;
      let lastError: unknown;
      for (const a of addrs) {
        try {
          res = await this.request({ url, address: a.address, family: a.family, headers, signal });
          break;
        } catch (err) {
          lastError = err;
          signal.throwIfAborted();
        }
      }
      if (res === undefined) throw lastError instanceof Error ? lastError : new Error("connection failed");
      if (REDIRECT_STATUS.has(res.status)) {
        res.destroy();
        if (hop >= this.maxRedirects) throw new Error("too many redirects");
        const loc = first(res.headers["location"]);
        if (!loc) throw new Error("redirect without location");
        url = new URL(loc, url); // 次の周で https・ポート・アドレスを検査し直す
        continue;
      }
      if (res.status !== 200) {
        res.destroy();
        throw new Error(`unexpected status ${res.status}`);
      }
      const contentType = (first(res.headers["content-type"]) ?? "").split(";")[0]!.trim().toLowerCase();
      if (!ALLOWED_TYPES.has(contentType)) {
        res.destroy();
        throw new Error("unsupported content type");
      }
      const declared = Number(first(res.headers["content-length"]));
      if (Number.isFinite(declared) && declared > this.maxBytes) {
        res.destroy();
        throw new Error("too large");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > this.maxBytes) {
          res.destroy();
          throw new Error("too large");
        }
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      const sniffed = sniffMedia(bytes);
      if (sniffed === null || sniffed.media !== "image" || sniffed.mime !== contentType) throw new Error("content does not match the content type");
      return { bytes, contentType };
    }
  }

  /** 接続してよい先か検査し、接続してよいアドレスの一覧を返す（名前解決も時間の上限・中止の対象）。 */
  private async resolve(url: URL, signal: AbortSignal): Promise<{ address: string; family: 4 | 6 }[]> {
    if (url.protocol !== "https:") throw new Error("only https is allowed");
    if (url.username !== "" || url.password !== "") throw new Error("credentials in the URL are not allowed");
    if (url.port !== "" && url.port !== "443") throw new Error("only port 443 is allowed");
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
    if (host === "" || host === "localhost" || host.endsWith(".localhost")) throw new Error("blocked host");
    const literal = isIP(host);
    const addrs = literal !== 0 ? [{ address: host, family: literal }] : await raceAbort(this.lookup(host), signal);
    if (addrs.length === 0) throw new Error("host not found");
    for (const a of addrs) if (isBlockedAddress(a.address)) throw new Error("blocked address");
    return addrs.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** `signal` が中止されたら、`p` の結果を待たずに拒否する（名前解決のように中止できない処理に時間の上限を効かせる）。 */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason as Error);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => (signal.removeEventListener("abort", onAbort), resolve(v)),
      (e: unknown) => (signal.removeEventListener("abort", onAbort), reject(e as Error)),
    );
  });
}
