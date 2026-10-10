import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { connect as netConnect, type Socket } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { PANE_OP_ASK_OPEN, type PaneSocketResponse } from "@sodashitsu/protocol";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { paneSocketPathFor } from "../config.js";
import { makeTempDir } from "../persist/atomicFile.js";

/**
 * ログイン不要の受け口（`pane.sock`）を、実物の `composeServer` の配線ごと確かめる（20261003-sodactl-ask-socket の T7）。
 * 質問を出す側（sodactl 役）は、状態ディレクトリの `pane.sock` へ 1 行の JSON を送るだけ——**cookie も token も送らない**（送る場所が無い。
 * `/api/login` も呼ばない）。画面の役は `/ws` のクライアント（`ask.integration.test.ts` と同じ作り。こちらはログインする）。
 */
vi.setConfig({ testTimeout: 30_000 });

/** 画面の役（`/ws`。`ask.integration.test.ts` の `Client` と同じ）。 */
class Browser {
  private seq = 0;
  readonly events: { event: string; data: Record<string, unknown> }[] = [];
  private readonly pending = new Map<
    string,
    (m: { result?: unknown; error?: { code: string } }) => void
  >();
  constructor(readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(String(data)) as {
        id?: string;
        result?: unknown;
        error?: { code: string };
        event?: string;
        data?: Record<string, unknown>;
      };
      if (msg.id !== undefined) this.pending.get(msg.id)?.(msg);
      else if (msg.event !== undefined)
        this.events.push({ event: msg.event, data: msg.data ?? {} });
    });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) =>
        m.error
          ? reject(Object.assign(new Error(m.error.code), { code: m.error.code }))
          : resolve(m.result as T),
      );
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  /** `count` 個目（1 始まり）のそのイベントを待つ。 */
  async waitForEvent(name: string, count = 1): Promise<Record<string, unknown>> {
    return vi.waitFor(
      () => {
        const found = this.events.filter((x) => x.event === name);
        if (found.length < count) throw new Error(`waiting for ${name} #${count}`);
        return found[count - 1]!.data;
      },
      { timeout: 5000, interval: 20 },
    );
  }
}

async function connectWs(
  server: ComposedServer,
  kind: "desktop" | "mobile" | "external",
): Promise<Browser> {
  const port = server.options.port;
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
    body: JSON.stringify({ token: server.freshToken }),
  });
  expect(res.status).toBe(204);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { origin, host: `127.0.0.1:${port}`, cookie },
    });
    w.once("open", () => resolve(w));
    w.once("error", reject);
  });
  const c = new Browser(ws);
  await c.request("client.hello", { protocol: 1, kind });
  return c;
}

/** 受け口への 1 本の接続（sodactl 役）。受け口が書いたものを溜め、接続が閉じたら `closed` が解決する。 */
interface PaneConn {
  sock: Socket;
  closed: Promise<string>;
}

/**
 * 受け口へ繋いで要求の 1 行を送る。**認証の情報は何も送らない**（unix socket に cookie・token を載せる場所は無く、行の中身は `v`・`op`・`paneId`・`params` だけ）。
 * sodactl と同じく `write` で送り、返事を読むまで `end` しない（受け口は相手の EOF を取り消しとして扱う）。
 */
function send(
  path: string,
  req: { op: string; paneId: string; params?: Record<string, unknown> },
): Promise<PaneConn> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = netConnect(path);
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => (buf += chunk));
    const closed = new Promise<string>((res) => sock.on("close", () => res(buf)));
    sock.once("error", reject);
    sock.once("connect", () => {
      sock.off("error", reject);
      sock.on("error", () => undefined); // 受け口が先に切ったときの EPIPE・ECONNRESET は `close` で見る
      sock.write(`${JSON.stringify({ v: 1, ...req })}\n`);
      resolve({ sock, closed });
    });
  });
}

function parseReply(raw: string): PaneSocketResponse {
  expect(raw.endsWith("\n"), `reply: ${JSON.stringify(raw)}`).toBe(true);
  expect(raw.indexOf("\n")).toBe(raw.length - 1); // 返事は 1 行だけ
  return JSON.parse(raw) as PaneSocketResponse;
}

/** 1 行送って、返事の 1 行を返す。 */
async function call(
  path: string,
  op: string,
  paneId: string,
  params?: Record<string, unknown>,
): Promise<PaneSocketResponse> {
  const c = await send(path, { op, paneId, ...(params ? { params } : {}) });
  return parseReply(await c.closed);
}

const SPEC = {
  title: "SECRET-TITLE",
  questions: [
    {
      id: "SECRET-ID",
      label: "SECRET-LABEL",
      default: "SECRET-OPT",
      options: ["SECRET-OPT", "other"],
      allowOther: true,
    },
  ],
};
const ASK = { spec: SPEC, timeoutMs: 20_000 };

describe.skipIf(process.platform === "win32")(
  "pane.sock の ask.open（実物のサーバ。ログインなし。20261003-sodactl-ask-socket）",
  () => {
    const cleanups: (() => Promise<unknown> | unknown)[] = [];
    afterEach(async () => {
      for (const fn of cleanups.splice(0).reverse()) await fn();
    });

    async function start() {
      const stateDir = await makeTempDir("soda-psock-");
      cleanups.push(() =>
        rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
      cleanups.push(() => server.close());
      const paneId = server.session.snapshot().panes[0]!.id;
      const sockPath = join(stateDir, "pane.sock");
      const open = async (kind: "desktop" | "mobile" | "external") => {
        const c = await connectWs(server, kind);
        cleanups.push(() => c.ws.close());
        return c;
      };
      /** 購読済みの画面。 */
      const browser = async () => {
        const b = await open("desktop");
        await b.request("ask.subscribe", {});
        return b;
      };
      return { server, stateDir, paneId, sockPath, open, browser };
    }

    // 実物の pane の環境（`SODA_PANE_SOCKET`）がこのパスであることは `packages/cli/src/paneEnv.integration.test.ts` が見ている。
    it("受け口は状態ディレクトリの pane.sock（0600）で、paneSocketPathFor のパスと同じ。止めるとファイルが消える（AC5）", async () => {
      const { server, stateDir, sockPath } = await start();
      expect(paneSocketPathFor(stateDir)).toBe(sockPath);
      const st = await stat(sockPath);
      expect(st.isSocket()).toBe(true);
      expect(st.mode & 0o777).toBe(0o600);
      await server.close();
      expect(existsSync(sockPath)).toBe(false);
    });

    it("ログインなしで質問を出し、画面が答えると answered が返る。/ws のイベントは id だけ（AC1）", async () => {
      const { paneId, sockPath, browser } = await start();
      const b = await browser();
      const conn = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      const opened = await b.waitForEvent("ask.opened");
      expect(opened).toEqual({ askId: expect.any(String), paneId });
      const askId = opened["askId"] as string;
      // 画面が受け取る定義は `/ws` の経路と同じ（名乗った pane と正規化した定義）
      expect(await b.request("ask.get", { askId })).toMatchObject({
        askId,
        paneId,
        spec: { title: "SECRET-TITLE" },
      });
      await b.request("ask.answer", {
        askId,
        answers: { "SECRET-ID": "自由" },
        custom: ["SECRET-ID"],
        note: "SECRET-NOTE",
      });
      expect(parseReply(await conn.closed)).toEqual({
        ok: true,
        result: {
          status: "answered",
          answers: { "SECRET-ID": "自由" },
          custom: ["SECRET-ID"],
          note: "SECRET-NOTE",
        },
      });
      expect(await b.waitForEvent("ask.closed")).toEqual({ askId, paneId });
      for (const e of b.events.filter((x) => x.event.startsWith("ask.")))
        expect(JSON.stringify(e)).not.toContain("SECRET");
    });

    it("画面が comments つきで答えると、結果に comments が出る（20261004-ask-form-comments）", async () => {
      const { paneId, sockPath, browser } = await start();
      const b = await browser();
      const conn = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      const askId = (await b.waitForEvent("ask.opened"))["askId"] as string;
      await b.request("ask.answer", { askId, answers: { "SECRET-ID": "自由" }, custom: ["SECRET-ID"], comments: { "SECRET-ID": " 金曜は避けたい " } });
      expect(parseReply(await conn.closed)).toEqual({
        ok: true,
        result: { status: "answered", answers: { "SECRET-ID": "自由" }, custom: ["SECRET-ID"], comments: { "SECRET-ID": "金曜は避けたい" } },
      });
    });

    it("画面が取り消すと cancelled、期限が来ると timeout（AC2）", async () => {
      const { paneId, sockPath, browser } = await start();
      const b = await browser();
      const first = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      const askId = (await b.waitForEvent("ask.opened"))["askId"] as string;
      await b.request("ask.cancel", { askId });
      expect(parseReply(await first.closed)).toEqual({ ok: true, result: { status: "cancelled" } });

      // 期限は受け口の経路でもサーバ（`AskService`）が数える。誰も答えなければ `timeout`（下限の 1 秒）。
      const second = await send(sockPath, {
        op: PANE_OP_ASK_OPEN,
        paneId,
        params: { spec: SPEC, timeoutMs: 1000 },
      });
      const askId2 = (await b.waitForEvent("ask.opened", 2))["askId"] as string;
      expect(parseReply(await second.closed)).toEqual({ ok: true, result: { status: "timeout" } });
      expect(await b.waitForEvent("ask.closed", 2)).toEqual({ askId: askId2, paneId });
    });

    it("質問を出せる画面が居なければ、待たずに unavailable（AC2）", async () => {
      const { paneId, sockPath, open } = await start();
      expect(await call(sockPath, PANE_OP_ASK_OPEN, paneId, ASK)).toEqual({
        ok: true,
        result: { status: "unavailable", reason: expect.any(String) },
      });
      await open("desktop"); // 端末版の形（hello しただけで ask.subscribe しない）でも同じ
      expect(await call(sockPath, PANE_OP_ASK_OPEN, paneId, ASK)).toMatchObject({
        ok: true,
        result: { status: "unavailable" },
      });
    });

    it("「1 つの pane に同時に 1 つ」は /ws の質問と合わせて数える: どちらの経路が先でも 2 つめは ask_busy（AC4）", async () => {
      const { paneId, sockPath, open, browser } = await start();
      const b = await browser();
      const cli = await open("external");
      // `/ws` が先
      void cli.request("ask.open", { paneId, ...ASK }).catch(() => undefined);
      const askId = (await b.waitForEvent("ask.opened"))["askId"] as string;
      expect(await call(sockPath, PANE_OP_ASK_OPEN, paneId, ASK)).toMatchObject({
        ok: false,
        error: { code: "ask_busy" },
      });
      await b.request("ask.cancel", { askId });
      await b.waitForEvent("ask.closed");
      // 受け口が先
      const conn = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      await b.waitForEvent("ask.opened", 2);
      await expect(cli.request("ask.open", { paneId, ...ASK })).rejects.toMatchObject({
        code: "ask_busy",
      });
      expect(await call(sockPath, PANE_OP_ASK_OPEN, paneId, ASK)).toMatchObject({
        ok: false,
        error: { code: "ask_busy" },
      });
      conn.sock.destroy();
    });

    it("実在しない pane は not_found。引数・定義の誤りは invalid_params・invalid_ask_spec（質問は出ない）", async () => {
      const { paneId, sockPath, browser } = await start();
      const b = await browser();
      expect(await call(sockPath, PANE_OP_ASK_OPEN, "p99", ASK)).toEqual({
        ok: false,
        error: { code: "not_found", message: "pane not found: p99" },
      });
      // `/ws` と同じ schema（`timeoutMs` の範囲・`spec` の型）。`paneId` は共通の欄から渡るので、引数には要らない
      expect(
        await call(sockPath, PANE_OP_ASK_OPEN, paneId, { spec: SPEC, timeoutMs: 1 }),
      ).toMatchObject({ ok: false, error: { code: "invalid_params" } });
      expect(await call(sockPath, PANE_OP_ASK_OPEN, paneId, { timeoutMs: 20_000 })).toMatchObject({
        ok: false,
        error: { code: "invalid_params" },
      });
      expect(
        await call(sockPath, PANE_OP_ASK_OPEN, paneId, {
          spec: { questions: [] },
          timeoutMs: 20_000,
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_ask_spec" },
      });
      // `/ws` は順に届くので、往復の後なら、出ていた質問の `ask.opened` も届いている
      expect(await b.request("ask.subscribe", {})).toEqual({ asks: [] });
      expect(b.events.filter((e) => e.event === "ask.opened")).toEqual([]);
      // 断った後も、同じ pane に質問を出せる（断った要求が枠を持ったままになっていない）
      const conn = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      expect(await b.waitForEvent("ask.opened")).toMatchObject({ paneId });
      conn.sock.destroy();
    });

    it("返事を待っている接続を閉じると質問が閉じ、/ws に ask.closed が配られる。同じ pane にまた出せる（AC6）", async () => {
      const { paneId, sockPath, browser } = await start();
      const b = await browser();
      const conn = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      const askId = (await b.waitForEvent("ask.opened"))["askId"] as string;
      conn.sock.destroy(); // sodactl が Ctrl+C・kill で終わった
      expect(await b.waitForEvent("ask.closed")).toEqual({ askId, paneId });
      await expect(b.request("ask.get", { askId })).rejects.toMatchObject({ code: "ask_closed" });
      expect(await b.request("ask.subscribe", {})).toEqual({ asks: [] });
      const again = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      expect(await b.waitForEvent("ask.opened", 2)).toMatchObject({ paneId });
      again.sock.destroy();
    });

    it("/ws の方式は通さない: pane.write・workspace.create 等は unknown_op で、pane の画面と workspace の数が変わらない（AC3）", async () => {
      const { server, stateDir, paneId, sockPath, open } = await start();
      const before = server.session.snapshot();
      const host = server.terminals.get(paneId)!;
      // 画面の文字列に頼らない確かめ: 書かれていれば、シェルがこのファイルを作る（絶対パス。pane の作業フォルダに依らない）
      const marker = join(stateDir, "pane-socket-leak-marker");
      // `/ws` に実在する方式の名前（`workspace.create`・`pane.rename`・`agent.send_keys`）と、実在しない名前（`pane.write`）のどちらも同じ
      for (const [op, params] of [
        ["pane.write", { data: "echo PANE-SOCKET-LEAK-1\n" }],
        ["pane.write", { data: `touch '${marker}'\n` }],
        ["agent.send_keys", { paneId, keys: ["echo PANE-SOCKET-LEAK-2", "Enter"] }],
        ["workspace.create", {}],
        ["pane.rename", { paneId, label: "PANE-SOCKET-LEAK-3" }],
        ["ask.subscribe", {}],
        ["agent.fork", { paneId, target: { kind: "same" } }], // 20261009-agent-fork（A3）
        ["agent.fork_preview", { paneId }],
        ["agent.usage", { paneId }], // 20261010-agent-usage（ログイン済みの `/ws` だけ）
      ] as const) {
        expect(await call(sockPath, op, paneId, params), op).toEqual({
          ok: false,
          error: { code: "unknown_op", message: `unknown op: ${op}` },
        });
      }
      const after = server.session.snapshot();
      expect(after.workspaces).toHaveLength(before.workspaces.length);
      // pane の中身（ラベル・場所の記録・大きさ・タブ・エージェントなど）が変わらない。`title`・`busy`・`cwd` は、シェル自身が起動の後に決める値（プロンプトの
      // タイトル・前面のジョブ・場所）で、判定の周期（0.5〜1 秒）で入ってくる。負荷が高いと、`before` の写しの後に入って、「受け口が書き換えた」と見間違える。
      // 受け口が変えうるもの（`pane.rename` のラベルなど）は、これらを除いても、すべて比べている。
      const stable = (panes: typeof before.panes) =>
        panes.map((p) => {
          const c: Record<string, unknown> = { ...p };
          for (const k of ["title", "busy", "cwd"]) delete c[k];
          return c;
        });
      expect(stable(after.panes)).toEqual(stable(before.panes));
      // 後から pane へ実際に書いたものが画面に出た時点で、受け口へ送った文字列は出ていない（書かれていれば、こちらより先に出る）
      host.write("echo PANE-SOCKET-$((40+2))-DIRECT\n");
      await vi.waitFor(() => expect(host.mirror.plainText()).toContain("PANE-SOCKET-42-DIRECT"), {
        timeout: 10_000,
        interval: 20,
      });
      expect(host.mirror.plainText()).not.toContain("PANE-SOCKET-LEAK");
      // 同じ pane のシェルは、あとから送った DIRECT を実行済み。先に送られた touch が実行されていれば、ファイルが出来ている
      expect(existsSync(marker)).toBe(false);
      // 同じ名前は `/ws`（ログイン済み）では通る——受け口が断ったのは名前の誤りではない
      const cli = await open("external");
      await cli.request("workspace.create", {});
      expect(server.session.snapshot().workspaces).toHaveLength(before.workspaces.length + 1);
    });

    it("別の状態ディレクトリのサーバにしか無い pane は not_found（受け口は session ごと。AC10）", async () => {
      const a = await start();
      const b = await start();
      expect(a.sockPath).not.toBe(b.sockPath);
      const bb = await b.browser();
      const ab = await a.browser();
      // b にだけ pane を足す
      const cli = await b.open("external");
      const created = await cli.request<{ pane: { id: string } }>("workspace.create", {});
      const onlyInB = created.pane.id;
      expect(a.server.session.getPane(onlyInB)).toBeUndefined();
      expect(await call(a.sockPath, PANE_OP_ASK_OPEN, onlyInB, ASK)).toEqual({
        ok: false,
        error: { code: "not_found", message: `pane not found: ${onlyInB}` },
      });
      // どちらのサーバにも質問は出ていない（`/ws` は順に届くので、往復の後なら、出ていた質問の `ask.opened` も届いている）
      expect(await ab.request("ask.subscribe", {})).toEqual({ asks: [] });
      expect(await bb.request("ask.subscribe", {})).toEqual({ asks: [] }); // a の受け口への要求は b に届かない
      expect(ab.events.filter((e) => e.event === "ask.opened")).toEqual([]);
      expect(bb.events.filter((e) => e.event === "ask.opened")).toEqual([]);
      // b の受け口なら出せる
      const conn = await send(b.sockPath, { op: PANE_OP_ASK_OPEN, paneId: onlyInB, params: ASK });
      expect(await bb.waitForEvent("ask.opened")).toMatchObject({ paneId: onlyInB });
      conn.sock.destroy();
    });

    it("サーバを止めると、待っている接続は返事なしで閉じる（質問は取り消し）", async () => {
      const { server, paneId, sockPath, browser } = await start();
      const b = await browser();
      const conn = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      await b.waitForEvent("ask.opened");
      await server.close();
      expect(await conn.closed).toBe("");
    });

    it("受け口を置けなくても warn を出して起動を続ける。/ws は使え、止めた後にロックと一時ディレクトリが残らない", async () => {
      const stateDir = await makeTempDir("soda-psock-");
      cleanups.push(() =>
        rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      // `pane.sock` の場所に空でないディレクトリを置く（socket を rename で置き換えられない）
      const sockPath = paneSocketPathFor(stateDir)!;
      await mkdir(sockPath);
      await writeFile(join(sockPath, "keep"), "x");
      const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
      cleanups.push(() => server.close());
      // 起動は成功していて、`/ws` はログインして使える
      const c = await connectWs(server, "desktop");
      cleanups.push(() => c.ws.close());
      expect(await c.request("ask.subscribe", {})).toEqual({ asks: [] });
      // 受け口は立っていない（置いたディレクトリのまま）
      expect((await stat(sockPath)).isDirectory()).toBe(true);
      await (server.logger as unknown as { flush(): Promise<void> }).flush();
      expect(await readFile(join(stateDir, "server.log"), "utf8")).toContain(
        "cannot start the pane socket",
      );
      await server.close();
      const left = await readdir(stateDir);
      expect(left).toContain("pane.sock"); // 置いたディレクトリには触らない
      expect(left).not.toContain("soda.lock");
      expect(left.filter((n) => n.startsWith(".p-"))).toEqual([]);
    });

    it("server.log に定義・回答・補足の文字列が出ない（操作の名前・pane・接続・結果の code だけ）", async () => {
      const { server, stateDir, paneId, sockPath, browser } = await start();
      const b = await browser();
      const conn = await send(sockPath, { op: PANE_OP_ASK_OPEN, paneId, params: ASK });
      const askId = (await b.waitForEvent("ask.opened"))["askId"] as string;
      // 断られる要求（定義の誤り・引数の誤り・知らない操作・実在しない pane）にも中身を載せる
      expect(
        await call(sockPath, PANE_OP_ASK_OPEN, paneId, {
          spec: { questions: [{ id: "SECRET-BAD", label: "SECRET-BAD", options: [] }] },
          timeoutMs: 20_000,
        }),
      ).toMatchObject({ ok: false });
      expect(
        await call(sockPath, PANE_OP_ASK_OPEN, paneId, {
          spec: "SECRET-NOT-AN-OBJECT",
          timeoutMs: 20_000,
        }),
      ).toMatchObject({ ok: false, error: { code: "invalid_params" } });
      expect(await call(sockPath, "pane.write", paneId, { data: "SECRET-DATA" })).toMatchObject({
        ok: false,
        error: { code: "unknown_op" },
      });
      expect(
        await call(sockPath, PANE_OP_ASK_OPEN, "p99", { spec: SPEC, timeoutMs: 20_000 }),
      ).toMatchObject({ ok: false, error: { code: "not_found" } });
      await b.request("ask.answer", {
        askId,
        answers: { "SECRET-ID": "SECRET-OPT" },
        note: "SECRET-NOTE",
      });
      expect(parseReply(await conn.closed)).toMatchObject({
        ok: true,
        result: { status: "answered" },
      });
      await (server.logger as unknown as { flush(): Promise<void> }).flush();
      const log = await readFile(join(stateDir, "server.log"), "utf8");
      // 受け口の記録そのものは出ている（中身が無いことを、記録が無いことと取り違えない）
      expect(log).toContain("pane socket: request");
      expect(log).toMatch(
        /"op":"ask\.open","paneId":"[^"]+","connId":"pane-socket:\d+","code":"ok"/,
      );
      expect(log).toContain('"code":"unknown_op"');
      expect(log).toContain("ask opened");
      expect(log).not.toContain("SECRET");
    });
  },
);
