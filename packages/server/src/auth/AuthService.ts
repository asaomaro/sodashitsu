import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { AuthFile, AuthFileData } from "../persist/AuthFile.js";
import { emptyAuthFileData } from "../persist/AuthFile.js";
import type { Disposable } from "../util/Disposable.js";

const scrypt = promisify(scryptCb);

export const SESSION_COOKIE_NAME = "wtm_session";
const TOKEN_BYTES = 24;
const SESSION_ID_BYTES = 24;
const SCRYPT_KEYLEN = 32;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 日（design「永続化の形式」）
/** in-memory の延長を、この間隔より頻繁には auth.json へ書かない（毎リクエストの書き込みを避ける）。 */
const TOUCH_PERSIST_INTERVAL_MS = 5 * 60 * 1000;

/**
 * ログインの Cookie の名前（20260926-named-session-ui の design「Cookie」）。Cookie はポートで分かれない（RFC 6265 8.5）ので、同じホスト名の
 * 別ポートの session が同じ名前を使うと、片方にログインすると他方がログアウトされる。名前付き session は `wtm_session_<名前>` にする
 * （名前の文字——ASCII 英数字と `.` `_` `-`。`persist/namedSession.ts` `sessionNameProblem`——は Cookie の名前の token に収まる）。
 * 既定の session は今までどおり `wtm_session`（既存のログインを保つ）。
 */
export function sessionCookieName(sessionName: string | undefined): string {
  return sessionName === undefined ? SESSION_COOKIE_NAME : `${SESSION_COOKIE_NAME}_${sessionName}`;
}

export interface AuthServiceOptions {
  /** Cookie の名前（既定 `SESSION_COOKIE_NAME`。`sessionCookieName` で決める）。 */
  cookieName?: string;
}

export interface UpgradeRequestInfo {
  headers: Record<string, string | undefined>;
  remoteAddress: string;
}
export type AuthorizeUpgradeResult = { ok: true; sessionId: string } | { ok: false };
export type AuthorizeUpgrade = (req: UpgradeRequestInfo) => Promise<AuthorizeUpgradeResult>;

/**
 * token の検証・セッションの発行と失効・Cookie の解釈（architecture.md「AuthService」）。
 * `auth.session_revoked` は design の `ServerEvent`（クライアント向け）とは別物なので、
 * 専用の内部通知（`onSessionRevoked`）にする（コーディング時の判断。decisions.md に記録）。
 */
export interface AuthService {
  /** `auth.json` を読み込む。`verifySession` は同期なので、サーバの起動時に一度これを済ませておく（T22）。 */
  initialize(): Promise<void>;
  ensureToken(): Promise<{ created: boolean; token: string | undefined }>;
  resetToken(): Promise<string>;
  login(token: string): Promise<{ ok: true; sessionId: string } | { ok: false }>;
  logout(sessionId: string): Promise<void>;
  /** 高速な確認（ディスクへの書き込みはしない）。有効なら内部の最終利用時刻だけ延ばす。 */
  verifySession(sessionId: string | undefined): boolean;
  /** 延長の永続化（間隔を空けて呼ぶ想定。design「セッションの有効期間」）。 */
  persistTouchedSessions(): Promise<void>;
  parseSessionIdFromCookie(cookieHeader: string | undefined): string | undefined;
  buildSetCookieHeader(sessionId: string, secure: boolean): string;
  buildClearCookieHeader(secure: boolean): string;
  authorizeUpgrade: AuthorizeUpgrade;
  onSessionRevoked(cb: (sessionId: string) => void): Disposable;
}

interface SessionMemo {
  idHash: string;
  lastSeenAtMs: number;
  lastPersistedAtMs: number;
}

export class DefaultAuthService implements AuthService {
  private data: AuthFileData = emptyAuthFileData();
  private loaded = false;
  /** idHash → セッションの記録（in-memory）。 */
  private readonly sessions = new Map<string, SessionMemo>();
  /** 生のセッション id を覚えておく（失効の通知に使う。auth.json には idHash しか持たない）。 */
  private readonly liveSessionIds = new Map<string, string>(); // sessionId -> idHash
  private readonly revokedListeners = new Set<(sessionId: string) => void>();

  private readonly cookieName: string;

  constructor(
    private readonly file: AuthFile,
    opts: AuthServiceOptions = {},
  ) {
    this.cookieName = opts.cookieName ?? SESSION_COOKIE_NAME;
  }

  authorizeUpgrade: AuthorizeUpgrade = async (req) => {
    const sessionId = this.parseSessionIdFromCookie(req.headers["cookie"]);
    if (!sessionId || !this.verifySession(sessionId)) return { ok: false };
    return { ok: true, sessionId };
  };

  async initialize(): Promise<void> {
    await this.ensureLoaded();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const result = await this.file.load();
    this.data = result.kind === "ok" ? result.data : emptyAuthFileData();
    this.sessions.clear();
    const now = Date.now();
    for (const s of this.data.sessions) {
      this.sessions.set(s.idHash, { idHash: s.idHash, lastSeenAtMs: Date.parse(s.lastSeenAt) || now, lastPersistedAtMs: now });
    }
    this.loaded = true;
  }

  async ensureToken(): Promise<{ created: boolean; token: string | undefined }> {
    await this.ensureLoaded();
    if (this.data.token) return { created: false, token: undefined };
    const token = await this.issueAndStoreToken();
    return { created: true, token };
  }

  async resetToken(): Promise<string> {
    await this.ensureLoaded();
    const revokedSessionIds = [...this.liveSessionIds.entries()];
    this.sessions.clear();
    this.liveSessionIds.clear();
    this.data = { ...this.data, sessions: [] };
    const token = await this.issueAndStoreToken();
    for (const [sessionId] of revokedSessionIds) this.emitRevoked(sessionId);
    return token;
  }

  private async issueAndStoreToken(): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const salt = randomBytes(16);
    const hash = (await scrypt(token, salt, SCRYPT_KEYLEN)) as Buffer;
    this.data = { ...this.data, token: { salt: salt.toString("hex"), hash: hash.toString("hex"), createdAt: new Date().toISOString() } };
    await this.file.save(this.data);
    return token;
  }

  async login(token: string): Promise<{ ok: true; sessionId: string } | { ok: false }> {
    await this.ensureLoaded();
    if (!this.data.token) return { ok: false };
    const salt = Buffer.from(this.data.token.salt, "hex");
    const expected = Buffer.from(this.data.token.hash, "hex");
    const actual = (await scrypt(token, salt, SCRYPT_KEYLEN)) as Buffer;
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false };

    const sessionId = randomBytes(SESSION_ID_BYTES).toString("base64url");
    const idHash = sha256Hex(sessionId);
    const now = Date.now();
    this.sessions.set(idHash, { idHash, lastSeenAtMs: now, lastPersistedAtMs: now });
    this.liveSessionIds.set(sessionId, idHash);
    this.data = {
      ...this.data,
      sessions: [...this.data.sessions, { idHash, createdAt: new Date(now).toISOString(), lastSeenAt: new Date(now).toISOString() }],
    };
    await this.file.save(this.data);
    return { ok: true, sessionId };
  }

  async logout(sessionId: string): Promise<void> {
    await this.ensureLoaded();
    const idHash = sha256Hex(sessionId);
    this.sessions.delete(idHash);
    this.liveSessionIds.delete(sessionId);
    // 知らないセッション（`/api/logout` は認証前の誰でも任意の Cookie で呼べる）では auth.json を書き直さない（D103。
    // 以前は 1 リクエストごとに書き直していた）。
    if (this.data.sessions.some((s) => s.idHash === idHash)) {
      this.data = { ...this.data, sessions: this.data.sessions.filter((s) => s.idHash !== idHash) };
      await this.file.save(this.data);
    }
    this.emitRevoked(sessionId);
  }

  verifySession(sessionId: string | undefined): boolean {
    if (!sessionId) return false;
    const idHash = sha256Hex(sessionId);
    const memo = this.sessions.get(idHash);
    if (!memo) return false;
    const now = Date.now();
    if (now - memo.lastSeenAtMs > SESSION_TTL_MS) {
      this.sessions.delete(idHash);
      this.liveSessionIds.delete(sessionId); // レビュー指摘：logout/resetToken だけが消していて、自然失効では漏れていた
      return false;
    }
    memo.lastSeenAtMs = now;
    if (!this.liveSessionIds.has(sessionId)) this.liveSessionIds.set(sessionId, idHash);
    return true;
  }

  async persistTouchedSessions(): Promise<void> {
    if (!this.loaded) return;
    const now = Date.now();
    let changed = false;
    const byHash = new Map(this.data.sessions.map((s) => [s.idHash, s] as const));
    for (const memo of this.sessions.values()) {
      if (now - memo.lastPersistedAtMs < TOUCH_PERSIST_INTERVAL_MS) continue;
      const existing = byHash.get(memo.idHash);
      if (!existing) continue;
      byHash.set(memo.idHash, { ...existing, lastSeenAt: new Date(memo.lastSeenAtMs).toISOString() });
      memo.lastPersistedAtMs = now;
      changed = true;
    }
    if (!changed) return;
    this.data = { ...this.data, sessions: [...byHash.values()] };
    await this.file.save(this.data);
  }

  parseSessionIdFromCookie(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return undefined;
    for (const part of cookieHeader.split(";")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const name = part.slice(0, eq).trim();
      if (name !== this.cookieName) continue;
      // 認証前の誰でも任意の Cookie を送れる。`%` の並びが壊れた値（`%E0%A4%A` 等）で `decodeURIComponent` が投げると、
      // `/api/session`・`/api/logout`・`/ws` の想定外の失敗（error 行）になっていたので、セッション無しとして扱う（D103）。
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  buildSetCookieHeader(sessionId: string, secure: boolean): string {
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    const parts = [`${this.cookieName}=${encodeURIComponent(sessionId)}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
    if (secure) parts.push("Secure");
    return parts.join("; ");
  }

  buildClearCookieHeader(secure: boolean): string {
    const parts = [`${this.cookieName}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];
    if (secure) parts.push("Secure");
    return parts.join("; ");
  }

  onSessionRevoked(cb: (sessionId: string) => void): Disposable {
    this.revokedListeners.add(cb);
    return { dispose: () => this.revokedListeners.delete(cb) };
  }

  private emitRevoked(sessionId: string): void {
    for (const fn of [...this.revokedListeners]) fn(sessionId);
  }
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
