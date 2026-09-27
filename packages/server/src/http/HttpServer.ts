import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServerType, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import type { AuthService } from "../auth/AuthService.js";
import type { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import type { LoginRateLimiter } from "../auth/LoginRateLimiter.js";
import type { Logger } from "../log/Logger.js";
import { LogThrottle } from "../log/LogThrottle.js";
import { requestPathname } from "../util/net.js";

export interface HttpServerOptions {
  webDistDir: string;
  /** TLS の PEM の中身（main.ts がファイルから読んで渡す。パスではない）。両方揃えば HTTPS。 */
  cert?: string | undefined;
  key?: string | undefined;
  logger: Logger;
}

const SECURITY_HEADERS: Record<string, string> = {
  // style-src に 'unsafe-inline' が要る：xterm.js の DOM レンダラーが実行時に <style> 要素とインラインの
  // style 属性でテーマの色を書き込む（03-web-desktop T2 で実物のブラウザに読み込ませて確認。CSP のリスク）。
  // xterm.js は任意の外部入力を CSS として書き込まない（テーマの色は固定の設定値）ので、他のディレクティブ
  // （default-src・connect-src 等）は絞ったまま、style-src だけを緩める。
  "Content-Security-Policy":
    "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const MAX_BODY_BYTES = 64 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const NOT_BUILT_PAGE = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>soda</title></head>
<body><p>Web UI はまだビルドされていません（packages/web/dist が見つかりません）。</p></body></html>`;

/** 静的配信・認証 API・セキュリティヘッダ・TLS（architecture.md「HttpServer」・design.md「HTTP」）。 */
export class HttpServer {
  readonly server: HttpServerType;
  readonly secure: boolean;
  /** 想定外の失敗の error 行の間引き（認証前の誰でもリクエストを送れるので、1 リクエストごとに 1 行を書かせない。D103）。 */
  private readonly failureLog = new LogThrottle();

  constructor(
    private readonly auth: AuthService,
    /**
     * Origin/Host の検査と拒否のログ（`OriginPolicy` を持つ。`WsServerWs` と同じ実体を渡し、間引きの状態を共有する。
     * 必須——省けたころは、省くと `extraOrigins` の無い別の実体を黙って作っていた。D102・D103）。
     */
    private readonly originGate: OriginRejectionLog,
    private readonly rateLimiter: LoginRateLimiter,
    private readonly opts: HttpServerOptions,
  ) {
    this.secure = Boolean(opts.cert && opts.key);
    const listener = (req: IncomingMessage, res: ServerResponse): void => {
      this.handle(req, res).catch((err: unknown) => {
        const allowed = this.failureLog.take();
        if (allowed) {
          opts.logger.error("http request failed", { error: String(err), ...(allowed.suppressed > 0 ? { suppressed: allowed.suppressed } : {}) });
        }
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end("internal error");
        }
      });
    };
    this.server = this.secure ? createHttpsServer({ cert: opts.cert, key: opts.key }, listener) : createHttpServer(listener);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const pathname = requestPathname(req.url);
    if (pathname === undefined) {
      // 解釈できない request-target（`*`・authority-form 等。`//`・`/\` はただの経路として下へ進む）は、誰でも送れる入力の
      // 誤りなので 400 で返し、ログに書かない（D103。以前は `//` 等で `new URL` の例外が想定外の失敗として 1 リクエストごとに
      // error 行になっていた）。
      res.statusCode = 400;
      res.end();
      return;
    }
    if (req.method === "POST" && pathname === "/api/login") return this.handleLogin(req, res);
    if (req.method === "POST" && pathname === "/api/logout") return this.handleLogout(req, res);
    if (req.method === "GET" && pathname === "/api/session") return this.handleSession(req, res);
    return this.handleStatic(req, res, pathname);
  }

  private clientIp(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? "unknown";
  }

  private async handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = this.clientIp(req);
    if (this.rateLimiter.isBlocked(ip)) {
      res.statusCode = 429;
      res.end();
      return;
    }
    // Origin/Host の検査 → 拒否なら間引いてログに残し 403（`OriginRejectionLog.admit`。`/ws` と共通。D102・D103）。
    const rejection = { path: "/api/login", remoteAddress: ip, origin: req.headers.origin, host: req.headers.host };
    const admitted = this.originGate.admit(rejection, () => {
      res.statusCode = 403;
      res.end();
    });
    if (!admitted) return;
    const body = await readJsonBody(req).catch(() => null);
    const token = body && typeof body === "object" && "token" in body ? String((body as { token: unknown }).token) : "";
    if (!token) {
      res.statusCode = 400;
      res.end();
      return;
    }
    const result = await this.auth.login(token);
    if (!result.ok) {
      this.rateLimiter.registerFailure(ip);
      res.statusCode = 401;
      res.end();
      return;
    }
    res.setHeader("Set-Cookie", this.auth.buildSetCookieHeader(result.sessionId, this.secure));
    res.statusCode = 204;
    res.end();
  }

  private async handleLogout(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = this.auth.parseSessionIdFromCookie(req.headers.cookie);
    if (sessionId) await this.auth.logout(sessionId);
    res.setHeader("Set-Cookie", this.auth.buildClearCookieHeader(this.secure));
    res.statusCode = 204;
    res.end();
  }

  /**
   * Cookie が無効なら 401。**有効でも Host（Origin が付いていれば Origin も）が許可外なら 403**（記録は `/ws` と同じく
   * `OriginRejectionLog`）。有効で許可内なら 204（D106）。
   * - 以前は Host/Origin を見ずに 204 を返していたので、有効な Cookie のまま許可外の宛先で開く（`--origin` を付けずに
   *   再起動した・転送した名前で開いた）と、`/ws` は 403 なのにここは 204 で、ブラウザは理由を示さず再接続を続けた。
   * - ブラウザは同じオリジンの GET に Origin を付けないので、Host で見る（`OriginRejectionLog.admitGet`）。
   * - **Cookie の確認を先にする**：Web はここが 401 のときだけログイン画面を出し、ログインの POST が 403 の理由を示す（D105）。
   *   Cookie の無いブラウザにまで 403 を返すと、許可外の宛先で開いた最初の訪問がログイン画面に届かず理由も出ない。
   *   Cookie の無い相手（DNS rebinding のページ等）に返すのは今までどおり 401 だけで、何も漏らさない。
   * - 他の経路：`/api/login`・`/ws` は Origin と Host で見る（`admit`）。静的ファイルは見ない（ログイン画面を出す必要があり、
   *   秘密を含まない）。`POST /api/logout` も見ない（その Cookie のセッションを消すだけで、許可外の宛先からでもログアウト
   *   できてよい）。
   */
  private handleSession(req: IncomingMessage, res: ServerResponse): void {
    const sessionId = this.auth.parseSessionIdFromCookie(req.headers.cookie);
    if (!this.auth.verifySession(sessionId)) {
      res.statusCode = 401;
      res.end();
      return;
    }
    const rejection = { path: "/api/session", remoteAddress: this.clientIp(req), origin: req.headers.origin, host: req.headers.host };
    const admitted = this.originGate.admitGet(rejection, () => {
      res.statusCode = 403;
      res.end();
    });
    if (!admitted) return;
    res.statusCode = 204;
    res.end();
  }

  private async handleStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const distRoot = resolve(this.opts.webDistDir);
    const rootStat = await stat(distRoot).catch(() => null);
    if (!rootStat) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(NOT_BUILT_PAGE);
      return;
    }

    const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const resolved = resolve(distRoot, normalize(relPath));
    // ディレクトリ・トラバーサル対策：解決したパスが配信ルートの外へ出ていないことを確かめる。
    if (!resolved.startsWith(distRoot + sep) && resolved !== distRoot) {
      res.statusCode = 400;
      res.end();
      return;
    }
    const filePath = (await stat(resolved).catch(() => null))?.isFile() ? resolved : join(distRoot, "index.html");
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const contents = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream");
    res.end(contents);
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejectPromise(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        rejectPromise(err);
      }
    });
    req.on("error", rejectPromise);
  });
}
