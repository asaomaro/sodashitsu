import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import WebSocket from "ws";
import { runPaneRead, runPaneRun, runPaneSplit } from "./commands/pane.js";
import { runLogin, runSnapshot, runWatch } from "./commands/session.js";
import { runWorkspaceCreate } from "./commands/workspace.js";
import { FsSessionStore } from "./session.js";

/**
 * `sodactl` の一巡を実サーバ・実 PTY で確認する（design.md「受け入れ基準との対応」・tasks.md T12）。
 * `@sodashitsu/server` の `composeServer`（`packages/e2e` と同じ土台）を使い、モックの WS サーバは作らない
 * ——本物の `AuthService`/`OriginPolicy`/実 PTY を経由させることが AC7・AC9 の検証そのものであるため
 * （tasks.md「テスト方針」）。
 */

/** `process.stdout.write` を差し替えて、そのテストの間に書かれたものをすべて集める。 */
function captureStdout(): { text(): string; restore(): void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    return true;
  });
  return { text: () => chunks.join(""), restore: () => spy.mockRestore() };
}

/** `deadlineMs` まで `check()` が true を返すまでポーリングする（PTY・イベントループの非同期性への対応）。 */
async function waitUntil(check: () => boolean, deadlineMs: number, stepMs = 150): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  if (!check()) throw new Error(`waitUntil: condition not met within ${deadlineMs}ms`);
}

describe("sodactl main integration（実サーバ・実 PTY）", () => {
  let server: ComposedServer;
  let stateDir: string;
  let sessionDir: string;
  let store: FsSessionStore;
  let port: number;
  let token: string;
  let url: string;
  let paneId: string;
  let workspaceId: string;

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "sodactl-it-state-"));
    server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    port = server.options.port;
    if (!server.freshToken) throw new Error("expected a freshly generated token");
    token = server.freshToken;
    url = `http://127.0.0.1:${port}`;
    sessionDir = await mkdtemp(join(tmpdir(), "sodactl-it-session-"));
    store = new FsSessionStore(join(sessionDir, "session.json"));
  }, 30_000);

  afterAll(async () => {
    await server.close();
    await rm(stateDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  });

  it("workspace create: 初回は --token でログインし、セッションをキャッシュする（AC1, AC7）", async () => {
    const out = captureStdout();
    await runWorkspaceCreate({ kind: "workspace-create", opts: { url, token }, cwd: process.cwd(), label: "cli-it" }, store);
    out.restore();

    const result = JSON.parse(out.text()) as { workspace: { id: string }; tab: { id: string }; pane: { id: string } };
    expect(result.workspace.id).toBeTruthy();
    expect(result.tab.id).toBeTruthy();
    expect(result.pane.id).toBeTruthy();
    workspaceId = result.workspace.id;
    paneId = result.pane.id;

    expect(await store.get(url)).toBeTruthy();
  }, 10_000); // ログイン（scrypt）と実 PTY の起動。負荷の下で最大 4.4 秒（20260926-load-flaky-tests の D5）

  it("2回目以降はキャッシュ済みセッションを再利用し、/api/login を呼ばない（AC5, AC7）", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = captureStdout();
    await runSnapshot({ kind: "snapshot", opts: { url, token: undefined } }, store);
    out.restore();
    fetchSpy.mockRestore();

    const loginCalls = fetchSpy.mock.calls.filter(([reqUrl]) => String(reqUrl).includes("/api/login"));
    expect(loginCalls).toHaveLength(0);

    const snap = JSON.parse(out.text()) as { workspaces: { id: string }[] };
    expect(snap.workspaces.some((w) => w.id === workspaceId)).toBe(true);
  });

  it("pane split で新しい pane を作る（AC2）", async () => {
    const out = captureStdout();
    await runPaneSplit({ kind: "pane-split", opts: { url, token: undefined }, target: { kind: "id", paneId }, direction: "right", ratio: undefined }, store);
    out.restore();

    const result = JSON.parse(out.text()) as { pane: { id: string } };
    expect(result.pane.id).toBeTruthy();
    expect(result.pane.id).not.toBe(paneId);
  });

  it("pane run → pane read: 実 PTY への echo の往復を確認する（AC3, AC4）", async () => {
    const marker = `sodactl-it-${Date.now()}`;
    const runOut = captureStdout();
    await runPaneRun({ kind: "pane-run", opts: { url, token: undefined }, paneId, command: `echo ${marker}` }, store);
    runOut.restore();
    expect(JSON.parse(runOut.text())).toEqual({ ok: true, paneId });

    // `pane read` を短い間隔で呼び直し、SNAPSHOT に marker が現れるまで待つ（実 PTY・シェルの実行完了待ち。
    // `waitUntil` は同期の条件しか取れないため、非同期 RPC を含むこのポーリングは専用の関数で回す）。
    let seenText = "";
    async function pollForMarker(): Promise<void> {
      const deadline = Date.now() + 8_000;
      for (;;) {
        const out = captureStdout();
        await runPaneRead({ kind: "pane-read", opts: { url, token: undefined }, paneId, follow: false, raw: false, timeoutMs: 3_000 }, store);
        out.restore();
        seenText = out.text();
        if (seenText.includes(marker)) return;
        if (Date.now() > deadline) throw new Error(`marker not observed within timeout; last read: ${JSON.stringify(seenText)}`);
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await pollForMarker();
    expect(seenText).toContain(marker);
  }, 20_000);

  it("pane read --follow: 以後の OUTPUT を継続的に受け取る（AC4）", async () => {
    // `--follow` は design のとおり明示的な終了手段を持たない（Ctrl-C 相当が無いと終わらない）。
    // 接続を張ったままだと、後続のテストで起きる無関係な OUTPUT まで拾って `process.stdout.write` を
    // 呼び続け、他のテストの `captureStdout()` の捕捉内容を汚染しうる（実機の一式実行〔`pnpm -s test`〕で
    // 実際に別テストの `JSON.parse` が失敗する形で再現した）。このテストだけ**専用の使い捨てサーバ**を
    // 立て、確認が終わったらサーバごと閉じて接続を確実に切ってから次のテストへ進む。
    const dedicatedStateDir = await mkdtemp(join(tmpdir(), "sodactl-it-follow-state-"));
    const dedicatedServer = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: dedicatedStateDir, origin: [] });
    try {
      if (!dedicatedServer.freshToken) throw new Error("expected a freshly generated token");
      const dedicatedUrl = `http://${dedicatedServer.options.host}:${dedicatedServer.options.port}`;
      const createOut = captureStdout();
      await runWorkspaceCreate({ kind: "workspace-create", opts: { url: dedicatedUrl, token: dedicatedServer.freshToken }, cwd: process.cwd(), label: "follow-it" }, store);
      createOut.restore();
      const followPaneId = (JSON.parse(createOut.text()) as { pane: { id: string } }).pane.id;

      const marker = `sodactl-follow-${Date.now()}`;
      const out = captureStdout();
      const followPromise = runPaneRead(
        { kind: "pane-read", opts: { url: dedicatedUrl, token: undefined }, paneId: followPaneId, follow: true, raw: false, timeoutMs: 5_000 },
        store,
      ).catch(() => undefined);

      // 最初の SNAPSHOT が届く（=購読が成立した）まで待ってから入力を送る。
      await waitUntil(() => out.text().length > 0, 5_000);

      await runPaneRun({ kind: "pane-run", opts: { url: dedicatedUrl, token: undefined }, paneId: followPaneId, command: `echo ${marker}` }, store);
      await waitUntil(() => out.text().includes(marker), 8_000);

      out.restore();
      await dedicatedServer.close();
      await followPromise; // サーバを閉じたことで切断され、ここで確実に解決する（後始末の完了を待つ）。
    } finally {
      await dedicatedServer.close().catch(() => undefined);
      await rm(dedicatedStateDir, { recursive: true, force: true });
    }
  }, 20_000);

  it("watch: 別クライアントが起こした workspace.created イベントを受け取る（AC6）", async () => {
    // 上の「pane read --follow」と同じ理由（後続テストへの汚染を避ける）で専用サーバを使う。
    const dedicatedStateDir = await mkdtemp(join(tmpdir(), "sodactl-it-watch-state-"));
    const dedicatedServer = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: dedicatedStateDir, origin: [] });
    try {
      if (!dedicatedServer.freshToken) throw new Error("expected a freshly generated token");
      const dedicatedUrl = `http://${dedicatedServer.options.host}:${dedicatedServer.options.port}`;

      const out = captureStdout();
      const watchPromise = runWatch({ kind: "watch", opts: { url: dedicatedUrl, token: dedicatedServer.freshToken }, json: true }, store).catch(() => undefined);

      // watch 接続が実際にイベントを受け取れる状態になるまでの時間は、システム負荷（一式実行時は特に）に
      // 左右される。固定の待ち時間ではなく、「workspace を作る → イベントが見えるまで確かめる」を
      // 見えるまで繰り返すことで、タイミングに依存しない確認にする
      // （`withSession` は呼び出しごとに新しい WS 接続を開くので、これは watch とは別のクライアント）。
      const deadline = Date.now() + 10_000;
      let seenCreatedEvent = false;
      let attempt = 0;
      while (Date.now() < deadline && !seenCreatedEvent) {
        // `token` は毎回渡す（キャッシュがあればそちらが優先されるので害は無く、watch 接続側の
        // ログイン完了を待たずに済む——ここで無認証エラーになると retry 自体が働かない）。
        await runWorkspaceCreate(
          { kind: "workspace-create", opts: { url: dedicatedUrl, token: dedicatedServer.freshToken }, cwd: process.cwd(), label: `watch-target-${attempt++}` },
          store,
        );
        if (out.text().includes("workspace.created")) {
          seenCreatedEvent = true;
        } else {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      if (!seenCreatedEvent) throw new Error(`workspace.created not observed within timeout; captured: ${JSON.stringify(out.text())}`);
      out.restore();
      await dedicatedServer.close();
      await watchPromise;
    } finally {
      await dedicatedServer.close().catch(() => undefined);
      await rm(dedicatedStateDir, { recursive: true, force: true });
    }
  }, 35_000); // 専用の実サーバの起動＋中の締め切り 10 秒。負荷の下で 15 秒の上限で落ちた（20260926-load-flaky-tests の D5）

  it("login コマンド: --token で明示ログインし、別のセッションキャッシュへ書き込む（AC7 の前提）", async () => {
    const otherDir = await mkdtemp(join(tmpdir(), "sodactl-it-session2-"));
    try {
      const otherStore = new FsSessionStore(join(otherDir, "session.json"));
      const out = captureStdout();
      await runLogin({ kind: "login", opts: { url, token } }, otherStore);
      out.restore();

      expect(JSON.parse(out.text())).toEqual({ ok: true });
      expect(await otherStore.get(url)).toBeTruthy();
    } finally {
      await rm(otherDir, { recursive: true, force: true });
    }
  });

  /**
   * AC9: `/ws` の Origin 拒否が、この work のあとも既存どおり効くことを確かめる（decisions.md 参照）。
   *
   * `sodactl` の `connect()` は接続先 `--url` からそのまま Origin ヘッダを組み立てるため、**構造的に
   * 誤った Origin を作れない**（D3：Origin をこの CLI 用に緩めていないことの裏返し）。そのため
   * `connect()` 自身を偽の Origin で誤動作させることはできない——この事実そのものが安全側の設計であり、
   * `connect()` の 403 分類ロジック（`statusCode` を持つ `Error` にする。`onUnexpectedResponse`）は
   * `packages/cli/src/output.test.ts`（`classify` の `statusCode=403 → forbidden` のケース）で単体テスト
   * 済み。ここでは、**サーバ側の Origin 拒否そのものが本 work の変更で壊れていないこと**を、
   * `packages/server/src/ws/WsGateway.integration.test.ts`「rejects the upgrade with a mismatched Origin」
   * と同じ手法（`ws` の生クライアントで Origin ヘッダだけを偽装する）で確認する。
   */
  it("Origin ヘッダが許可リストに無い接続は、この work の後も既存どおり 403 で拒否される（AC9）", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { cookie: (await store.get(url))!, origin: "http://evil.example", host: `127.0.0.1:${port}` },
    });
    const rejected = await new Promise<boolean>((resolve) => {
      ws.once("open", () => resolve(false));
      ws.once("error", () => resolve(true));
      ws.once("unexpected-response", (_req, res) => {
        expect(res.statusCode).toBe(403);
        resolve(true);
      });
    });
    expect(rejected).toBe(true);
  });
});
