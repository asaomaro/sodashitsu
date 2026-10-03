import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerEvent } from "@sodashitsu/protocol";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { runPaneAttach, type AttachTerminal } from "./commands/attach.js";
import { FsSessionStore } from "./session.js";
import { withSession } from "./withSession.js";
import { connect, type SodaClient } from "./wsClient.js";

/**
 * `sodactl pane attach` を実サーバ・実 PTY の上で、偽の手元の端末から確かめる（20260926-pane-direct-connect）。
 * 実物の端末（raw モード）での確認は smoke（`smoke.ts`）が node-pty の上で行う。
 */

interface TestTerminal extends AttachTerminal {
  text(): string;
  cols: number;
  rows: number;
  type(text: string): void;
  resizeTo(cols: number, rows: number): void;
}

function testTerminal(cols: number, rows: number): TestTerminal {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let out = "";
  let inputCb: ((b: Uint8Array) => void) | null = null;
  let resizeCb: (() => void) | null = null;
  const term: TestTerminal = {
    isTTY: true,
    cols,
    rows,
    size: () => ({ cols: term.cols, rows: term.rows }),
    setRawMode: () => undefined,
    write: (data) => {
      out += typeof data === "string" ? data : dec.decode(data, { stream: true });
    },
    onInput: (cb) => {
      inputCb = cb;
      return () => (inputCb = null);
    },
    onResize: (cb) => {
      resizeCb = cb;
      return () => (resizeCb = null);
    },
    onSignal: () => () => undefined,
    text: () => out,
    type: (t) => inputCb?.(enc.encode(t)),
    resizeTo: (c, r) => {
      term.cols = c;
      term.rows = r;
      resizeCb?.();
    },
  };
  return term;
}

/**
 * 手元の端末が直結の画面に入ったか（代替画面に入る列を書いた＝打鍵と大きさの購読を始めた。`runPaneAttach` は両者を
 * 同じ同期区間で行う）。これより前の打鍵は届かない。
 */
async function waitEntered(term: TestTerminal): Promise<void> {
  await vi.waitFor(() => expect(term.text()).toContain("\x1b[?1049h"), { timeout: 10_000 });
}

/** 出力の中に、印だけの行（コマンドを打った行ではなく実行された結果の行）があるか。 */
function hasOutputLine(text: string, marker: string): boolean {
  return text
    .split(/\r?\n/)
    .some((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim() === marker);
}

describe("sodactl pane attach integration（実サーバ・実 PTY・偽の手元の端末）", () => {
  let server: ComposedServer;
  let dir: string;
  let store: FsSessionStore;
  let url: string;
  let cookie: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "sodactl-attach-it-"));
    server = await composeServerOnFreePort({
      host: "127.0.0.1",
      stateDir: join(dir, "state"),
      origin: [],
    });
    if (!server.freshToken) throw new Error("expected a freshly generated token");
    url = `http://${server.options.host}:${server.options.port}`;
    store = new FsSessionStore(join(dir, "session.json"));
    await withSession({ url, token: server.freshToken, urlExplicit: false }, store, (c) =>
      c.hello(),
    ); // セッションをキャッシュする
    cookie = (await store.get(url))!;
  }, 30_000);

  afterAll(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const opts = () => ({ url, token: undefined, urlExplicit: false });
  const attachCmd = (paneId: string, takeover = false) => ({
    kind: "pane-attach" as const,
    opts: opts(),
    paneId,
    takeover,
  });

  /** ブラウザの代わり（デスクトップとして hello し、表示の大きさを送り、購読する）。 */
  async function desktop(
    paneId: string,
    cols: number,
    rows: number,
  ): Promise<{ client: SodaClient; events: ServerEvent[]; output(): string }> {
    const client = await connect(url, cookie);
    const events: ServerEvent[] = [];
    client.onEvent((e) => events.push(e));
    let out = "";
    const dec = new TextDecoder();
    client.onOutput((p, chunk) => {
      if (p === paneId) out += dec.decode(chunk, { stream: true });
    });
    await client.request("client.hello", { protocol: 1, kind: "desktop" });
    const pane = server.session.getPane(paneId)!;
    const tab = server.session.getTab(pane.tabId)!;
    await client.request("client.view", {
      workspaceId: tab.workspaceId,
      tabId: tab.id,
      visible: [{ paneId, cols, rows }],
    });
    await client.request("pane.subscribe", { paneId, scrollbackLines: 0 });
    return { client, events, output: () => out };
  }

  async function newPane(): Promise<string> {
    const first = server.session.snapshot().panes[0]!.id;
    const res = await withSession(opts(), store, async (c) => {
      await c.hello();
      return c.request("pane.split", { paneId: first, direction: "down" });
    });
    return res.pane.id;
  }

  const sizeOf = (paneId: string) => {
    const p = server.session.getPane(paneId);
    return p ? { cols: p.cols, rows: p.rows } : null;
  };

  it("画面と出力が手元に届き、打鍵が pane に届き、大きさは直結に揃い、ブラウザは表示と入力を続けられる。切り離すと pane は残りブラウザの大きさへ戻る（AC1・AC2・AC3・AC4・AC6・AC10・AC11）", async () => {
    const paneId = await newPane();
    const browser = await desktop(paneId, 70, 20);
    await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 70, rows: 20 }), {
      timeout: 10_000,
    });
    // 直結より前に出ていた中身（見えている画面）が SNAPSHOT で手元に届くことを見るための印。
    const before = `BEFORE_${Date.now()}`;
    browser.client.sendInput(paneId, new TextEncoder().encode(`echo ${before}\r`));
    await vi.waitFor(() => expect(hasOutputLine(browser.output(), before)).toBe(true), {
      timeout: 10_000,
    });

    const term = testTerminal(100, 30);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const running = runPaneAttach(attachCmd(paneId), store, term);
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 100, rows: 30 }), {
        timeout: 10_000,
      });
      await vi.waitFor(() =>
        expect(browser.events).toContainEqual({
          event: "pane.attach_changed",
          data: { paneId, clientId: expect.any(String) },
        }),
      );
      await waitEntered(term);
      // 打鍵より前に、直結前の画面が届いている（AC1）。
      await vi.waitFor(() => expect(term.text()).toContain(before), { timeout: 10_000 });
      // pane の中から見た端末の大きさが手元の大きさ（stty size は「行 列」）。
      term.type("stty size\r");
      await vi.waitFor(() => expect(hasOutputLine(term.text(), "30 100")).toBe(true), {
        timeout: 10_000,
      });
      // 端末への問い合わせ（DA1）は手元に書かない——答えるのはサーバのミラーだけ（D8）。
      const queried = `QUERIED_${Date.now()}`;
      // ミラーの答え（pane への入力）を read で読み捨てる（残すと次のコマンドの行に混ざる）。時間を区切らないので、
      // QUERIED が出ればミラーが答えたことも分かる。
      term.type(`printf '\\033[c'; read -rs -d c; echo ${queried}\r`);
      await vi.waitFor(() => expect(hasOutputLine(term.text(), queried)).toBe(true), {
        timeout: 10_000,
      });
      expect(term.text()).not.toContain("\x1b[c");

      const marker = `ATTACH_${Date.now()}`;
      term.type(`echo ${marker}\r`);
      await vi.waitFor(() => expect(hasOutputLine(term.text(), marker)).toBe(true), {
        timeout: 10_000,
      });
      await vi.waitFor(() => expect(hasOutputLine(browser.output(), marker)).toBe(true), {
        timeout: 10_000,
      });

      const fromBrowser = `BROWSER_${Date.now()}`;
      browser.client.sendInput(paneId, new TextEncoder().encode(`echo ${fromBrowser}\r`));
      await vi.waitFor(() => expect(hasOutputLine(term.text(), fromBrowser)).toBe(true), {
        timeout: 10_000,
      });

      // ブラウザが表示の大きさを送り直しても、直結中の pane の大きさは変わらない。
      const pane = server.session.getPane(paneId)!;
      const tab = server.session.getTab(pane.tabId)!;
      await browser.client.request("client.view", {
        workspaceId: tab.workspaceId,
        tabId: tab.id,
        visible: [{ paneId, cols: 60, rows: 18 }],
      });
      expect(sizeOf(paneId)).toEqual({ cols: 100, rows: 30 });

      term.resizeTo(90, 25);
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 90, rows: 25 }), {
        timeout: 10_000,
      });

      term.type("\x02q");
      await running;
      expect(server.session.getPane(paneId)).toBeDefined();
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 60, rows: 18 }), {
        timeout: 10_000,
      });
      // 別のソケット（ブラウザ）への知らせは、直結側の応答より後に届きうる。
      await vi.waitFor(() =>
        expect(browser.events.filter((e) => e.event === "pane.attach_changed").at(-1)).toEqual({
          event: "pane.attach_changed",
          data: { paneId, clientId: null },
        }),
      );
      expect(stderr).toHaveBeenCalledWith(`sodactl: detached from ${paneId}\n`);
    } finally {
      stderr.mockRestore();
      browser.client.close();
    }
  }, 60_000);

  it("直結中の pane への takeover 無しの直結は pane_attached で拒まれ、--takeover なら奪えて前の直結は attach_taken_over で終わる（AC8・AC9）", async () => {
    const paneId = await newPane();
    const first = testTerminal(100, 30);
    const firstRun = runPaneAttach(attachCmd(paneId), store, first);
    firstRun.catch(() => undefined);
    await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 100, rows: 30 }), {
      timeout: 10_000,
    });
    await waitEntered(first);

    const refused = testTerminal(80, 24);
    await expect(runPaneAttach(attachCmd(paneId), store, refused)).rejects.toMatchObject({
      code: "pane_attached",
      message: expect.stringContaining("--takeover"),
    });
    expect(refused.text()).toBe("");
    expect(sizeOf(paneId)).toEqual({ cols: 100, rows: 30 });

    // 前の直結はまだ続いている（打鍵が届く）。
    const marker = `STILL_${Date.now()}`;
    first.type(`echo ${marker}\r`);
    await vi.waitFor(() => expect(hasOutputLine(first.text(), marker)).toBe(true), {
      timeout: 10_000,
    });

    const second = testTerminal(81, 23);
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const secondRun = runPaneAttach(attachCmd(paneId, true), store, second);
      await expect(firstRun).rejects.toMatchObject({ code: "attach_taken_over" });
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 81, rows: 23 }), {
        timeout: 10_000,
      });
      await waitEntered(second);
      second.type("\x02q");
      await secondRun;
    } finally {
      stderr.mockRestore();
    }
  }, 60_000);

  it("直結中の pane のプロセスが終わると pane_closed で終わる（AC13）", async () => {
    const paneId = await newPane();
    const term = testTerminal(100, 30);
    const running = runPaneAttach(attachCmd(paneId), store, term);
    await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 100, rows: 30 }), {
      timeout: 10_000,
    });
    await waitEntered(term);

    term.type("exit\r");

    await expect(running).rejects.toMatchObject({ code: "pane_closed" });
  }, 60_000);

  it("直結の方式は /ws の認証と Origin の検査の上にだけある: Cookie 無しは 401、偽の Origin は 403 で upgrade の段階で拒まれる（AC12）", async () => {
    const wsUrl = url.replace(/^http/, "ws") + "/ws";
    const status = (headers: Record<string, string>): Promise<number | undefined> =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl, { headers });
        ws.once("open", () => {
          ws.close();
          reject(new Error("upgrade unexpectedly succeeded"));
        });
        ws.once("unexpected-response", (_req, res) => {
          ws.once("error", () => undefined);
          ws.terminate();
          resolve(res.statusCode);
        });
        ws.once("error", reject);
      });
    const host = new URL(url).host;

    expect(await status({ origin: url, host })).toBe(401);
    expect(await status({ origin: "http://evil.example", host, cookie })).toBe(403);
  }, 30_000);
});
