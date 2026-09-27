import { rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { connect } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { FsAuthFile } from "../persist/AuthFile.js";
import { DefaultAuthService } from "../auth/AuthService.js";
import { DefaultOriginPolicy } from "../auth/OriginPolicy.js";
import { OriginRejectionLog } from "../auth/OriginRejectionLog.js";
import { DefaultLoginRateLimiter } from "../auth/LoginRateLimiter.js";
import { MemoryLogger } from "../log/Logger.js";
import { LOG_THROTTLE_MAX_LINES } from "../log/LogThrottle.js";
import { HttpServer } from "./HttpServer.js";
import { listenOnFreePort } from "../composeServerOnFreePort.js";

/** 本物のサーバを 0 番で待ち受けさせ、割り当てられたポートを OriginPolicy に渡す。 */
async function startServer(webDistDir: string, opts: { extraOrigins?: string[] } = {}) {
  const stateDir = await makeTempDir("soda-http-state-");
  const auth = new DefaultAuthService(new FsAuthFile(stateDir));
  await auth.initialize();
  const { token } = await auth.ensureToken();
  // ポートは待ち受けた後に決まる（listen(0)。20260926-load-flaky-tests の D3）。方針は検査のたびに opts.port を読む。
  const originOpts = { host: "127.0.0.1", port: 0, secure: false, extraOrigins: opts.extraOrigins ?? [] };
  const origins = new DefaultOriginPolicy(originOpts, { addresses: () => [], lanAddresses: () => [], hostnames: () => [] });
  const rateLimiter = new DefaultLoginRateLimiter();
  const logger = new MemoryLogger();
  const http = new HttpServer(auth, new OriginRejectionLog(logger, origins), rateLimiter, { webDistDir, logger });
  const port = await listenOnFreePort(http.server);
  originOpts.port = port;
  const baseUrl = `http://127.0.0.1:${port}`;
  return { baseUrl, port, token: token!, auth, stateDir, logger, close: () => new Promise<void>((r) => http.server.close(() => r())) };
}

/**
 * 生の request-target をそのまま送り、応答のステータス行を返す（`fetch`・`http.request` は `//` 等を正規化・拒否するので、
 * `node:net` で書く。D103）。`host` は Host ヘッダ（`fetch` は Host の上書きを無視する——禁止ヘッダ——ので、許可外の Host を
 * 送るときもこれを使う。D106）。
 */
function rawRequest(port: number, requestLine: string, headers: string[] = [], host = `127.0.0.1:${port}`): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    let data = "";
    socket.setEncoding("latin1");
    socket.on("data", (d: string) => (data += d));
    socket.on("error", () => undefined); // 相手が閉じた後の ECONNRESET 等。読めた分で判断する
    socket.on("close", () => resolve(data.split("\r\n")[0] ?? ""));
    socket.write([requestLine, `Host: ${host}`, ...headers, "Connection: close", "", ""].join("\r\n"));
  });
}

describe("HttpServer — /api/login, /api/logout, /api/session", () => {
  let webDistDir: string;
  beforeEach(async () => {
    webDistDir = await makeTempDir("soda-http-dist-");
  });
  afterEach(async () => {
    await rm(webDistDir, { recursive: true, force: true });
  });

  it("rejects login with a bad Origin", async () => {
    const s = await startServer(webDistDir);
    try {
      const res = await fetch(`${s.baseUrl}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://evil.example", host: `127.0.0.1:1` },
        body: JSON.stringify({ token: s.token }),
      });
      expect(res.status).toBe(403);
      // 拒否したことを、接続元・Origin・Host・許可リストつきでログに残す（design「エラー処理 / 異常系」・D102）。
      const warn = s.logger.lines.find((l) => l.level === "warn" && l.msg === "origin rejected");
      expect(warn?.fields).toMatchObject({
        path: "/api/login",
        origin: "http://evil.example",
        host: `127.0.0.1:${s.port}`, // fetch は Host ヘッダの上書きを無視する（禁止ヘッダ）ので、実際の宛先になる
        allowed: expect.arrayContaining([`127.0.0.1:${s.port}`, `localhost:${s.port}`]),
      });
      expect(String(warn?.fields?.["remoteAddress"])).toMatch(/127\.0\.0\.1/);
      expect(String(warn?.fields?.["hint"])).toContain("--origin");
      // 認証の前に誰でも起こせるので、同じ相手・同じヘッダの繰り返しは間引く（OriginRejectionLog。D102）。
      const again = await fetch(`${s.baseUrl}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://evil.example" },
        body: JSON.stringify({ token: s.token }),
      });
      expect(again.status).toBe(403);
      expect(s.logger.lines.filter((l) => l.msg === "origin rejected")).toHaveLength(1);
    } finally {
      await s.close();
    }
  });

  it("logs in with the right token, sets a cookie, and /api/session then reports ok", async () => {
    const s = await startServer(webDistDir);
    try {
      const origin = s.baseUrl;
      const loginRes = await fetch(`${s.baseUrl}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: origin.replace("http://", "") },
        body: JSON.stringify({ token: s.token }),
      });
      expect(loginRes.status).toBe(204);
      const setCookie = loginRes.headers.get("set-cookie");
      expect(setCookie).toContain("soda_session=");
      expect(setCookie).toContain("HttpOnly");
      const cookie = setCookie!.split(";")[0]!;

      const sessionRes = await fetch(`${s.baseUrl}/api/session`, { headers: { cookie } });
      expect(sessionRes.status).toBe(204);

      const logoutRes = await fetch(`${s.baseUrl}/api/logout`, { method: "POST", headers: { cookie, origin, host: origin.replace("http://", "") } });
      expect(logoutRes.status).toBe(204);

      const afterLogout = await fetch(`${s.baseUrl}/api/session`, { headers: { cookie } });
      expect(afterLogout.status).toBe(401);
    } finally {
      await s.close();
    }
  });

  it("rejects login with a wrong token and returns 401", async () => {
    const s = await startServer(webDistDir);
    try {
      const origin = s.baseUrl;
      const res = await fetch(`${s.baseUrl}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: origin.replace("http://", "") },
        body: JSON.stringify({ token: "wrong" }),
      });
      expect(res.status).toBe(401);
    } finally {
      await s.close();
    }
  });

  it("adds security headers to every response", async () => {
    const s = await startServer(webDistDir);
    try {
      const res = await fetch(`${s.baseUrl}/api/session`);
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    } finally {
      await s.close();
    }
  });
});

/** 正しい token でログインし、Cookie（`soda_session=…`）を返す。 */
async function loginCookie(s: { baseUrl: string; token: string }): Promise<string> {
  const res = await fetch(`${s.baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: s.baseUrl },
    body: JSON.stringify({ token: s.token }),
  });
  expect(res.status).toBe(204);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

/**
 * D106（統合 review ラウンド1 の should）：有効な Cookie のまま Host/Origin だけが許可外になると（`--origin` を付けずに再起動
 * した・転送した名前で開いた）、`/ws` は 403 なのに `/api/session` は 204 を返し、Web は理由を示さず再接続を続けた。
 * ブラウザは同じオリジンの GET に Origin を付けないので、Host で見る（Origin が付いていればそれも見る）。
 */
describe("HttpServer — /api/session の Host/Origin の検査（D106）", () => {
  let webDistDir: string;
  beforeEach(async () => {
    webDistDir = await makeTempDir("soda-http-dist-session-");
  });
  afterEach(async () => {
    await rm(webDistDir, { recursive: true, force: true });
  });

  it("有効な Cookie でも、許可外の Host なら 403 で、origin rejected を（/ws・/api/login と同じく間引いて）書く", async () => {
    const s = await startServer(webDistDir);
    try {
      const cookie = await loginCookie(s);
      const badHost = `soda.example:${s.port}`;
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`], badHost)).toBe("HTTP/1.1 403 Forbidden");
      const warns = () => s.logger.lines.filter((l) => l.level === "warn" && l.msg === "origin rejected");
      expect(warns()).toHaveLength(1);
      expect(warns()[0]?.fields).toMatchObject({
        path: "/api/session",
        host: badHost,
        allowed: expect.arrayContaining([`127.0.0.1:${s.port}`, `localhost:${s.port}`]),
      });
      expect(warns()[0]?.fields?.["origin"]).toBeUndefined(); // 同じオリジンの GET なので Origin は無い
      expect(String(warns()[0]?.fields?.["hint"])).toContain("--origin");
      // 同じ相手・同じヘッダの繰り返しは間引く（応答は 403 のまま）。
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`], badHost)).toBe("HTTP/1.1 403 Forbidden");
      expect(warns()).toHaveLength(1);
    } finally {
      await s.close();
    }
  });

  it("有効な Cookie と許可内の Host なら 204（Origin の無い、ブラウザの同じオリジンの GET）", async () => {
    const s = await startServer(webDistDir);
    try {
      const cookie = await loginCookie(s);
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`])).toBe("HTTP/1.1 204 No Content");
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`], `localhost:${s.port}`)).toBe("HTTP/1.1 204 No Content");
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`], `LOCALHOST:${s.port}`)).toBe("HTTP/1.1 204 No Content");
      expect(s.logger.lines).toEqual([]);
    } finally {
      await s.close();
    }
  });

  it("Origin が付いていれば Origin も見る：許可外なら Host が許可内でも 403、同じオリジンなら 204", async () => {
    const s = await startServer(webDistDir);
    try {
      const cookie = await loginCookie(s);
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`, "Origin: http://evil.example"])).toBe("HTTP/1.1 403 Forbidden");
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`, `Origin: ${s.baseUrl}`])).toBe("HTTP/1.1 204 No Content");
      expect(s.logger.lines.filter((l) => l.msg === "origin rejected").map((l) => l.fields?.["origin"])).toEqual(["http://evil.example"]);
    } finally {
      await s.close();
    }
  });

  it("--origin で足した Origin のホストは許す（ポート付きは host:port、既定ポートはポート無し）", async () => {
    const s = await startServer(webDistDir, { extraOrigins: ["https://box.tailnet.ts.net:7780", "https://soda.example.com"] });
    try {
      const cookie = await loginCookie(s);
      const session = (host: string, headers: string[] = []) => rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`, ...headers], host);
      expect(await session("box.tailnet.ts.net:7780")).toBe("HTTP/1.1 204 No Content");
      expect(await session("soda.example.com")).toBe("HTTP/1.1 204 No Content");
      expect(await session("soda.example.com:443")).toBe("HTTP/1.1 204 No Content"); // 既定ポートを付けた Host（nginx の $host:$server_port）
      // ポートが違えば別の宛先（--origin に無い）。
      expect(await session("box.tailnet.ts.net")).toBe("HTTP/1.1 403 Forbidden");
      expect(await session("soda.example.com:8443")).toBe("HTTP/1.1 403 Forbidden");
      // Origin が --origin のものなら、Host を問わない（`/ws`・`/api/login` と同じ。前段のプロキシが Host を書き換える構成）。
      expect(await session(`127.0.0.1:${s.port}`, ["Origin: https://soda.example.com"])).toBe("HTTP/1.1 204 No Content");
    } finally {
      await s.close();
    }
  });

  it("Cookie が無い・無効なら、Host が許可外でも 401 のまま（ログイン画面を出すため。D105）で、ログにも書かない", async () => {
    const s = await startServer(webDistDir);
    try {
      const badHost = `soda.example:${s.port}`;
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [], badHost)).toBe("HTTP/1.1 401 Unauthorized");
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", ["Cookie: soda_session=unknown"], badHost)).toBe("HTTP/1.1 401 Unauthorized");
      expect(s.logger.lines).toEqual([]);
    } finally {
      await s.close();
    }
  });

  it("静的ファイル（ログイン画面）と POST /api/logout は Host を見ない", async () => {
    await writeFile(join(webDistDir, "index.html"), "<html>index</html>");
    const s = await startServer(webDistDir);
    try {
      const cookie = await loginCookie(s);
      const badHost = `soda.example:${s.port}`;
      expect(await rawRequest(s.port, "GET / HTTP/1.1", [], badHost)).toBe("HTTP/1.1 200 OK");
      expect(await rawRequest(s.port, "POST /api/logout HTTP/1.1", [`Cookie: ${cookie}`, "Content-Length: 0"], badHost)).toBe("HTTP/1.1 204 No Content");
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1", [`Cookie: ${cookie}`])).toBe("HTTP/1.1 401 Unauthorized"); // ログアウトは効いた
    } finally {
      await s.close();
    }
  });
});

describe("HttpServer — static files", () => {
  it("serves a placeholder page when packages/web/dist does not exist", async () => {
    const missingDir = join(await makeTempDir("soda-http-missing-"), "does-not-exist");
    const s = await startServer(missingDir);
    try {
      const res = await fetch(`${s.baseUrl}/`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("ビルドされていません");
    } finally {
      await s.close();
    }
  });

  it("serves a built file and falls back to index.html for unknown paths (SPA routing)", async () => {
    const dir = await makeTempDir("soda-http-dist2-");
    await writeFile(join(dir, "index.html"), "<html>index</html>");
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets", "app.js"), "console.log('hi')");
    const s = await startServer(dir);
    try {
      const index = await fetch(`${s.baseUrl}/`);
      expect(await index.text()).toBe("<html>index</html>");

      const asset = await fetch(`${s.baseUrl}/assets/app.js`);
      expect(asset.headers.get("content-type")).toContain("text/javascript");
      expect(await asset.text()).toBe("console.log('hi')");

      const spaRoute = await fetch(`${s.baseUrl}/workspace/w1`);
      expect(await spaRoute.text()).toBe("<html>index</html>");
    } finally {
      await s.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses a path that tries to escape the dist directory", async () => {
    const dir = await makeTempDir("soda-http-dist3-");
    await writeFile(join(dir, "index.html"), "<html>index</html>");
    const s = await startServer(dir);
    try {
      const res = await fetch(`${s.baseUrl}/..%2f..%2fetc%2fpasswd`);
      expect([400, 404, 200]).toContain(res.status); // ブラウザ/undici が正規化する場合もあるが、少なくとも中身が漏れないこと
      const text = await res.text();
      expect(text).not.toContain("root:");
    } finally {
      await s.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("HttpServer — 認証前の誰でも送れる不正な入力で error 行を書かせない（D103）", () => {
  let webDistDir: string;
  beforeEach(async () => {
    webDistDir = await makeTempDir("soda-http-dist-bad-");
  });
  afterEach(async () => {
    await rm(webDistDir, { recursive: true, force: true });
  });

  it("//・///・/\\・//foo は（例外にならず）ただの経路として SPA を返し、ログに何も書かない（//host/… を別のホストの /… として扱わない。D103）", async () => {
    await writeFile(join(webDistDir, "index.html"), "<html>index</html>");
    const s = await startServer(webDistDir);
    try {
      // 利用者が https://host//foo と打つとブラウザは //foo を送る。以前（D103 の最初の形）は 400、その前は new URL の例外で 500。
      for (const target of ["//", "///", "/\\", "//foo", "//evil.example/api/session"]) {
        expect(await rawRequest(s.port, `GET ${target} HTTP/1.1`), target).toBe("HTTP/1.1 200 OK");
      }
      // //evil.example/api/login はログインの経路ではない（静的配信へ回る。204/401/403 にならない）。
      expect(await rawRequest(s.port, "POST //evil.example/api/login HTTP/1.1", ["Content-Length: 0"])).toBe("HTTP/1.1 200 OK");
      expect(s.logger.lines).toEqual([]);
      // 正しい request-target は今までどおり（origin-form・absolute-form）。
      expect(await rawRequest(s.port, "GET /api/session HTTP/1.1")).toBe("HTTP/1.1 401 Unauthorized");
      expect(await rawRequest(s.port, `GET http://127.0.0.1:${s.port}/api/session HTTP/1.1`)).toBe("HTTP/1.1 401 Unauthorized");
    } finally {
      await s.close();
    }
  });

  it("解釈できない request-target（* 等）は 400 で返し、ログに何も書かない", async () => {
    const s = await startServer(webDistDir);
    try {
      expect(await rawRequest(s.port, "OPTIONS * HTTP/1.1")).toBe("HTTP/1.1 400 Bad Request");
      expect(await rawRequest(s.port, "GET * HTTP/1.1")).toBe("HTTP/1.1 400 Bad Request");
      expect(s.logger.lines).toEqual([]);
    } finally {
      await s.close();
    }
  });

  it("Cookie の % の並びが壊れていても /api/session は 401・/api/logout は 204 で、error 行を書かない", async () => {
    const s = await startServer(webDistDir);
    try {
      const cookie = "soda_session=%E0%A4%A";
      expect((await fetch(`${s.baseUrl}/api/session`, { headers: { cookie } })).status).toBe(401);
      expect((await fetch(`${s.baseUrl}/api/logout`, { method: "POST", headers: { cookie } })).status).toBe(204);
      expect(s.logger.lines.filter((l) => l.level === "error")).toEqual([]);
    } finally {
      await s.close();
    }
  });

  it("想定外の失敗（500）の error 行も、窓ごとに上限の行数までに間引く", async () => {
    await mkdir(join(webDistDir, "index.html")); // index.html がディレクトリ → 読み込みが EISDIR で失敗する
    const s = await startServer(webDistDir);
    try {
      for (let i = 0; i < LOG_THROTTLE_MAX_LINES + 5; i++) {
        expect(await rawRequest(s.port, "GET / HTTP/1.1")).toBe("HTTP/1.1 500 Internal Server Error");
      }
      const errors = s.logger.lines.filter((l) => l.level === "error" && l.msg === "http request failed");
      expect(errors).toHaveLength(LOG_THROTTLE_MAX_LINES);
    } finally {
      await s.close();
    }
  });
});
