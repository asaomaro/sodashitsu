import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { FsAuthFile } from "../persist/AuthFile.js";
import { DefaultAuthService, SESSION_COOKIE_NAME, sessionCookieName } from "./AuthService.js";

describe("DefaultAuthService", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-authsvc-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeService() {
    return new DefaultAuthService(new FsAuthFile(dir));
  }

  it("ensureToken creates a token only once", async () => {
    const auth = makeService();
    const first = await auth.ensureToken();
    expect(first.created).toBe(true);
    expect(first.token).toBeTruthy();
    const second = await auth.ensureToken();
    expect(second.created).toBe(false);
    expect(second.token).toBeUndefined();
  });

  it("login succeeds with the right token and fails with a wrong one", async () => {
    const auth = makeService();
    const { token } = await auth.ensureToken();
    const ok = await auth.login(token!);
    expect(ok.ok).toBe(true);
    const bad = await auth.login("wrong-token");
    expect(bad.ok).toBe(false);
  });

  it("verifySession is true for a session from login, false for an unknown one", async () => {
    const auth = makeService();
    const { token } = await auth.ensureToken();
    const result = await auth.login(token!);
    if (!result.ok) throw new Error("unreachable");
    expect(auth.verifySession(result.sessionId)).toBe(true);
    expect(auth.verifySession("not-a-real-session")).toBe(false);
    expect(auth.verifySession(undefined)).toBe(false);
  });

  it("logout invalidates the session and notifies onSessionRevoked", async () => {
    const auth = makeService();
    const { token } = await auth.ensureToken();
    const result = await auth.login(token!);
    if (!result.ok) throw new Error("unreachable");
    const revoked: string[] = [];
    auth.onSessionRevoked((id) => revoked.push(id));
    await auth.logout(result.sessionId);
    expect(auth.verifySession(result.sessionId)).toBe(false);
    expect(revoked).toEqual([result.sessionId]);
  });

  it("知らないセッションの logout では auth.json を書き直さない（認証前の誰でも呼べる。D103）", async () => {
    const auth = makeService();
    await auth.ensureToken();
    const authPath = join(dir, "auth.json");
    const before = { content: await readFile(authPath, "utf8"), mtimeMs: (await stat(authPath)).mtimeMs };
    await new Promise((r) => setTimeout(r, 20)); // mtime の分解能より空ける
    await auth.logout("no-such-session");
    expect(await readFile(authPath, "utf8")).toBe(before.content);
    expect((await stat(authPath)).mtimeMs).toBe(before.mtimeMs);
  });

  it("resetToken invalidates all live sessions and issues a new token", async () => {
    const auth = makeService();
    const { token } = await auth.ensureToken();
    const a = await auth.login(token!);
    const b = await auth.login(token!);
    if (!a.ok || !b.ok) throw new Error("unreachable");
    const revoked: string[] = [];
    auth.onSessionRevoked((id) => revoked.push(id));

    const newToken = await auth.resetToken();
    expect(newToken).not.toBe(token);
    expect(auth.verifySession(a.sessionId)).toBe(false);
    expect(auth.verifySession(b.sessionId)).toBe(false);
    expect(revoked.sort()).toEqual([a.sessionId, b.sessionId].sort());

    // 古い token ではもうログインできない
    expect((await auth.login(token!)).ok).toBe(false);
    expect((await auth.login(newToken)).ok).toBe(true);
  });

  it("cookie round-trip: build then parse recovers the session id", async () => {
    const auth = makeService();
    const header = auth.buildSetCookieHeader("abc123", false);
    expect(header).toContain(`${SESSION_COOKIE_NAME}=abc123`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).not.toContain("Secure");
    const parsed = auth.parseSessionIdFromCookie(`other=1; ${SESSION_COOKIE_NAME}=abc123; more=2`);
    expect(parsed).toBe("abc123");
  });

  it("Cookie の値の % の並びが壊れていても投げず、セッション無しとして扱う（認証前の誰でも送れる。D103）", async () => {
    const auth = makeService();
    expect(auth.parseSessionIdFromCookie(`${SESSION_COOKIE_NAME}=%E0%A4%A`)).toBeUndefined();
    expect(auth.parseSessionIdFromCookie(`${SESSION_COOKIE_NAME}=%`)).toBeUndefined();
    expect(await auth.authorizeUpgrade({ headers: { cookie: `${SESSION_COOKIE_NAME}=%` }, remoteAddress: "127.0.0.1" })).toEqual({ ok: false });
    expect(auth.parseSessionIdFromCookie(`${SESSION_COOKIE_NAME}=a%2Bb`)).toBe("a+b"); // 正しい % の並びは今までどおり解く
  });

  it("cookie header includes Secure when requested", async () => {
    const auth = makeService();
    expect(auth.buildSetCookieHeader("x", true)).toContain("Secure");
    expect(auth.buildClearCookieHeader(true)).toContain("Secure");
    expect(auth.buildClearCookieHeader(true)).toContain("Max-Age=0");
  });

  it("authorizeUpgrade reads the cookie header and checks the session", async () => {
    const auth = makeService();
    const { token } = await auth.ensureToken();
    const result = await auth.login(token!);
    if (!result.ok) throw new Error("unreachable");

    const ok = await auth.authorizeUpgrade({ headers: { cookie: `${SESSION_COOKIE_NAME}=${result.sessionId}` }, remoteAddress: "127.0.0.1" });
    expect(ok).toEqual({ ok: true, sessionId: result.sessionId });

    const missing = await auth.authorizeUpgrade({ headers: {}, remoteAddress: "127.0.0.1" });
    expect(missing).toEqual({ ok: false });
  });

  it("persists sessions across a new AuthService instance reading the same file", async () => {
    const first = makeService();
    const { token } = await first.ensureToken();
    const result = await first.login(token!);
    if (!result.ok) throw new Error("unreachable");

    const second = makeService();
    await second.initialize(); // 実運用では main.ts が起動時に呼ぶ（verifySession は同期なので先に読み込む）
    expect(second.verifySession(result.sessionId)).toBe(true);
  });
});

/** 20260926-named-session-ui（AC8・AC9）。 */
describe("名前付き session の Cookie の名前", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-authsvc-cookie-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("既定の session は soda_session のまま、名前付きは soda_session_<名前>（互いに異なる）", () => {
    expect(SESSION_COOKIE_NAME).toBe("soda_session");
    expect(sessionCookieName(undefined)).toBe("soda_session");
    expect(sessionCookieName("work")).toBe("soda_session_work");
    expect(new Set([sessionCookieName(undefined), sessionCookieName("work"), sessionCookieName("lan"), sessionCookieName("A.b-c_1")]).size).toBe(4);
  });

  it("名前付き session の Set-Cookie・消す Cookie はその名前を使う", () => {
    const auth = new DefaultAuthService(new FsAuthFile(dir), { cookieName: sessionCookieName("work") });
    expect(auth.buildSetCookieHeader("abc", false).startsWith("soda_session_work=abc;")).toBe(true);
    expect(auth.buildClearCookieHeader(false).startsWith("soda_session_work=;")).toBe(true);
  });

  it("自分の名前の Cookie だけを読む（別の session の Cookie だけなら未ログイン）", async () => {
    const work = new DefaultAuthService(new FsAuthFile(dir), { cookieName: sessionCookieName("work") });
    const { token } = await work.ensureToken();
    const login = await work.login(token!);
    if (!login.ok) throw new Error("unreachable");
    const id = login.sessionId;
    // 既定の session・別の名前付き session の Cookie に同じ値が入っていても読まない
    expect(work.parseSessionIdFromCookie(`soda_session=${id}`)).toBeUndefined();
    expect(work.parseSessionIdFromCookie(`soda_session_lan=${id}; soda_session_workx=${id}`)).toBeUndefined();
    expect(await work.authorizeUpgrade({ headers: { cookie: `soda_session=${id}` }, remoteAddress: "127.0.0.1" })).toEqual({ ok: false });
    // 同じホストの全 Cookie が届いても（ブラウザはポートを問わず送る）、自分の名前のものを選ぶ
    expect(work.parseSessionIdFromCookie(`soda_session=other; soda_session_work=${id}; soda_session_lan=x`)).toBe(id);
    expect(await work.authorizeUpgrade({ headers: { cookie: `soda_session=other; soda_session_work=${id}` }, remoteAddress: "127.0.0.1" })).toEqual({ ok: true, sessionId: id });
  });

  it("既定の session は名前付き session の Cookie を読まない", () => {
    const def = new DefaultAuthService(new FsAuthFile(dir));
    expect(def.parseSessionIdFromCookie("soda_session_work=abc")).toBeUndefined();
    expect(def.parseSessionIdFromCookie("soda_session_work=abc; soda_session=def")).toBe("def");
  });
});

// 20260927-cli-mode の 02 の review：期限の切れたセッションを捨てる（引数なしの soda は起動のたびにセッションを作る）。
describe("DefaultAuthService — 期限の切れたセッションの掃除", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-authsvc-prune-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const DAY = 24 * 60 * 60 * 1000;
  const iso = (msAgo: number): string => new Date(Date.now() - msAgo).toISOString();

  async function seed(sessions: { idHash: string; lastSeenAt: string }[]): Promise<void> {
    await new FsAuthFile(dir).save({
      schema: 1,
      token: null,
      sessions: sessions.map((s) => ({ ...s, createdAt: s.lastSeenAt })),
    });
  }
  const saved = async (): Promise<string[]> =>
    (JSON.parse(await readFile(join(dir, "auth.json"), "utf8")) as { sessions: { idHash: string }[] }).sessions.map((s) => s.idHash);

  it("読み込みのときに、最後に使ってから 14 日を過ぎたセッションを auth.json から捨てる（期限の内側は残す）", async () => {
    await seed([
      { idHash: "old", lastSeenAt: iso(15 * DAY) },
      { idHash: "fresh", lastSeenAt: iso(1 * DAY) },
    ]);
    await new DefaultAuthService(new FsAuthFile(dir)).initialize();
    expect(await saved()).toEqual(["fresh"]);
  });

  it("セッションを発行するときにも、期限の切れたものを捨ててから保存する（発行のたびに増え続けない）", async () => {
    await seed([{ idHash: "fresh", lastSeenAt: iso(1 * DAY) }]);
    const auth = new DefaultAuthService(new FsAuthFile(dir));
    await auth.initialize();
    // 読み込んだ後に期限が切れた（時計を進める代わりに、読み込み済みのメモリの最後の使用を古くする）
    (auth as unknown as { sessions: Map<string, { lastSeenAtMs: number }> }).sessions.get("fresh")!.lastSeenAtMs = Date.now() - 15 * DAY;
    const id = await auth.issueSession();
    const hashes = await saved();
    expect(hashes).toHaveLength(1);
    expect(hashes).not.toContain("fresh");
    expect(auth.verifySession(id)).toBe(true);
  });
});

