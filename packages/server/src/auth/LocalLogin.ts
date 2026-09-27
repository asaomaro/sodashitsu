import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../persist/atomicFile.js";

/**
 * 手元からのログイン（20260927-cli-mode の design「server」・decisions D2）。引数なしの `soda`（端末版）が token を打たずに手元の `soda serve` へ繋ぐための口。
 *
 * - サーバは起動ごとに 32 バイトの乱数の秘密を作り、状態ディレクトリの `local-auth.json`（0600。`{secret, pid, createdAt}`）に書く。止めるとき消す。
 * - `POST /api/local-login {secret}` は (1) 同じマシンからの接続（要求のソケットの `remoteAddress` と `localAddress` が同じ）、(2) 秘密の一致（定数時間の比較）
 *   のときだけ、通常の session cookie を出す（`HttpServer`）。
 * - 信頼の根拠は「状態ディレクトリを読めるのは同じ利用者だけ」（0600。Windows では `%LOCALAPPDATA%` の既定の ACL）。秘密を知っていても別のマシンからは通らない。
 */
export const LOCAL_AUTH_FILE_NAME = "local-auth.json";
const SECRET_BYTES = 32;

export function localAuthPath(stateDir: string): string {
  return join(stateDir, LOCAL_AUTH_FILE_NAME);
}

export interface LocalAuthRecord {
  secret: string;
  /** 書いたサーバの pid（端末版は、起動した子・ロックの持ち主と一致するかで「今のサーバの秘密か」を確かめる）。 */
  pid: number;
  createdAt: string;
}

/** 形を確かめる（合わなければ undefined）。 */
export function parseLocalAuth(raw: string): LocalAuthRecord | undefined {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as Record<string, unknown>;
  if (typeof r["secret"] !== "string" || r["secret"].length === 0) return undefined;
  if (typeof r["pid"] !== "number" || !Number.isSafeInteger(r["pid"]) || r["pid"] <= 0)
    return undefined;
  return {
    secret: r["secret"],
    pid: r["pid"],
    createdAt: typeof r["createdAt"] === "string" ? r["createdAt"] : "",
  };
}

/** 無い・読めない・形が合わないなら undefined。投げない（端末版の準備完了の待ちで繰り返し読む）。 */
export async function readLocalAuth(stateDir: string): Promise<LocalAuthRecord | undefined> {
  const raw = await readFile(localAuthPath(stateDir), "utf8").catch(() => undefined);
  return raw === undefined ? undefined : parseLocalAuth(raw);
}

/**
 * IPv4-mapped IPv6（`::ffff:127.0.0.1`）を IPv4 に直し、ゾーン（`%eth0`）を落として小文字にする。デュアルスタックの待ち受けでは同じ接続の片側だけが
 * mapped の形で見えることがある（`::` で待ち受けて IPv4 で繋いだ等）ので、比べる前に揃える。
 */
export function normalizeAddress(addr: string): string {
  let a = addr.trim().toLowerCase();
  const zone = a.indexOf("%");
  if (zone !== -1) a = a.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  return mapped ? mapped[1]! : a;
}

/** 同じマシンからの接続か（相手のアドレスが、こちらが受けたアドレスと同じ）。どちらかが分からなければ false。 */
export function isSameMachine(
  remoteAddress: string | undefined,
  localAddress: string | undefined,
): boolean {
  if (remoteAddress === undefined || localAddress === undefined) return false;
  const remote = normalizeAddress(remoteAddress);
  return remote !== "" && remote === normalizeAddress(localAddress);
}

/** `HttpServer` が使う照合の口（テストで差し替えられるよう最小にする）。 */
export interface LocalLoginVerifier {
  verify(secret: string): boolean;
}

export class LocalLogin implements LocalLoginVerifier {
  /** 書いた秘密（base64url の文字列の UTF-8）。 */
  private secret: Buffer | undefined;
  private written = false;

  constructor(
    private readonly stateDir: string,
    private readonly pid: number = process.pid,
  ) {}

  /** 新しい秘密を作って書く（状態ディレクトリのロックを取った後）。書けなければ投げる（呼び出し側がログに残して続ける）。 */
  async start(): Promise<void> {
    const secret = randomBytes(SECRET_BYTES).toString("base64url");
    this.secret = Buffer.from(secret, "utf8");
    const record: LocalAuthRecord = { secret, pid: this.pid, createdAt: new Date().toISOString() };
    await writeFileAtomic(localAuthPath(this.stateDir), `${JSON.stringify(record, null, 2)}\n`);
    this.written = true;
  }

  /** 秘密の照合（定数時間。書いた文字列〔base64url〕とそのまま比べる）。`start()` の前・`stop()` の後は常に false。 */
  verify(secret: string): boolean {
    if (this.secret === undefined) return false;
    const given = Buffer.from(secret, "utf8");
    // 長さの違いで早く返しても、秘密の長さ（固定）しか漏れない。
    if (given.length !== this.secret.length) return false;
    return timingSafeEqual(given, this.secret);
  }

  /** 秘密を捨て、書いたファイルを消す（止めるとき）。消せなくても投げない（次の起動が作り直す）。 */
  async stop(): Promise<void> {
    this.secret = undefined;
    if (!this.written) return;
    this.written = false;
    await rm(localAuthPath(this.stateDir), { force: true }).catch(() => undefined);
  }
}
