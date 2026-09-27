import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@wtm/protocol";
import { makeTempDir } from "./persist/atomicFile.js";
import { composeServerOnFreePort } from "./composeServerOnFreePort.js";

/**
 * 独自コマンド（20260927-custom-command-keys）を、組み立てた実物のサーバ（実 PTY・実シェル）で通す：状態ディレクトリの commands.json が一覧になり
 * （コマンドの文字列は載らない）、popup の端末へ購読・入力が届き、接続を切ると止まる。裏での実行は作業場所・環境で走る。
 */
describe.skipIf(process.platform === "win32")("composeServer — 独自コマンド（integration）", () => {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function start(commands: unknown, opts: { session?: string } = {}) {
    const base = await makeTempDir("wtm-compose-cmd-");
    cleanups.push(() => rm(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const stateDir = opts.session ? join(base, "sessions", opts.session) : base;
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const file = join(stateDir, "commands.json");
    await writeFile(file, JSON.stringify({ commands }), { mode: 0o600 });
    await chmod(file, 0o600);
    const server = await composeServerOnFreePort({
      host: "127.0.0.1",
      stateDir: base,
      origin: [],
      ...(opts.session ? { session: opts.session } : {}),
    });
    cleanups.push(() => server.close());
    const port = server.options.port;
    const origin = `http://127.0.0.1:${port}`;
    const loginRes = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token: server.freshToken }),
    });
    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0]!;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { cookie, origin, host: `127.0.0.1:${port}` },
    });
    const messages: { text?: unknown; frame?: ReturnType<typeof decodeFrame> }[] = [];
    ws.on("message", (data: Buffer, isBinary: boolean) => {
      messages.push(
        isBinary
          ? { frame: decodeFrame(new Uint8Array(data)) }
          : { text: JSON.parse(data.toString("utf8")) },
      );
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    cleanups.push(async () => ws.close());
    let n = 0;
    const request = async (
      method: string,
      params: unknown,
    ): Promise<{ result?: unknown; error?: { code: string } }> => {
      const id = `r${++n}`;
      ws.send(JSON.stringify({ id, method, params }));
      let found: { result?: unknown; error?: { code: string } } | undefined;
      await vi.waitFor(
        () => {
          found = messages
            .map(
              (m) =>
                m.text as { id?: string; result?: unknown; error?: { code: string } } | undefined,
            )
            .find((t) => t?.id === id);
          expect(found).toBeDefined();
        },
        { timeout: 10_000 },
      );
      return found!;
    };
    await request("client.hello", { protocol: 1, kind: "desktop" });
    const paneId = server.session.snapshot().panes[0]!.id;
    return { server, ws, messages, request, paneId, stateDir };
  }

  it("commands.json が一覧になり（文字列は載らない）、popup の端末へ購読・入力が届き、接続を切ると止まる（AC1・AC4・AC5）", async () => {
    const { server, ws, messages, request, paneId } = await start([
      {
        id: "cat",
        type: "popup",
        command: "cat # SECRET-TOKEN",
        description: "cat を開く",
        width: "50%",
      },
    ]);
    const list = await request("command.list", {});
    expect(list.result).toEqual({
      commands: [{ id: "cat", type: "popup", description: "cat を開く", width: "50%" }],
      problem: null,
    });
    expect(JSON.stringify(list.result)).not.toContain("SECRET");

    const run = (await request("command.run", { commandId: "cat", paneId, cols: 60, rows: 10 }))
      .result as { popupId: string; cols: number; rows: number };
    expect(run).toMatchObject({ type: "popup", cols: 60, rows: 10 });
    expect(server.session.getPane(run.popupId)).toBeUndefined(); // モデルに入らない
    const sub = await request("pane.subscribe", { paneId: run.popupId, scrollbackLines: 100 });
    expect(sub.result).toEqual({ cols: 60, rows: 10 });
    ws.send(encodeInputFrame(run.popupId, new TextEncoder().encode("popup-marker\n")));
    await vi.waitFor(
      () => {
        const out = messages
          .filter((m) => m.frame?.type === FRAME_TYPE.OUTPUT && m.frame.paneId === run.popupId)
          .map((m) => new TextDecoder().decode((m.frame as { chunk: Uint8Array }).chunk))
          .join("");
        expect(out).toContain("popup-marker");
      },
      { timeout: 10_000 },
    );
    expect(server.terminals.get(run.popupId)).toBeDefined();
    ws.close();
    await vi.waitFor(() => expect(server.terminals.get(run.popupId)).toBeUndefined(), {
      timeout: 10_000,
    });
  }, 30_000);

  it("popup のコマンドが終わると command.popup_closed が終了コードつきで届く（AC5・AC-I1）", async () => {
    const { messages, request, paneId } = await start([
      { id: "quit", type: "popup", command: "exit 3" },
    ]);
    const run = (await request("command.run", { commandId: "quit", paneId, cols: 40, rows: 5 }))
      .result as { popupId: string };
    await vi.waitFor(
      () =>
        expect(messages.map((m) => m.text)).toContainEqual({
          event: "command.popup_closed",
          data: { popupId: run.popupId, exitCode: 3 },
        }),
      { timeout: 10_000 },
    );
  }, 30_000);

  it("shell は pane の場所で裏に走り、WTM_ACTIVE_*・WTM_COMMAND_ID が入る（AC7・AC10）", async () => {
    const outDir = await makeTempDir("wtm-compose-cmd-out-");
    cleanups.push(() => rm(outDir, { recursive: true, force: true }));
    const out = join(outDir, "out.txt");
    const { server, request, paneId } = await start([
      {
        id: "note",
        type: "shell",
        command: `printf "%s|%s|%s" "$WTM_COMMAND_ID" "$WTM_ACTIVE_PANE_ID" "\${WTM_PANE_ID-unset}" > '${out}'`,
      },
    ]);
    expect((await request("command.run", { commandId: "note", paneId })).result).toEqual({
      type: "shell",
    });
    await vi.waitFor(async () => expect(await readFile(out, "utf8")).toBe(`note|${paneId}|unset`), {
      timeout: 10_000,
    });
    expect(server.session.snapshot().panes).toHaveLength(1);
  }, 30_000);

  it("サーバを止めると、つながったままの接続の popup も止まる（AC5）", async () => {
    const { server, request, paneId } = await start([{ id: "cat", type: "popup", command: "cat" }]);
    const run = (await request("command.run", { commandId: "cat", paneId, cols: 40, rows: 5 }))
      .result as { popupId: string };
    expect(server.terminals.get(run.popupId)).toBeDefined();
    await server.close();
    expect(server.terminals.get(run.popupId)).toBeUndefined();
  }, 30_000);

  it("名前付き session はその session の状態ディレクトリの commands.json を読む（AC1）", async () => {
    const { request } = await start([{ id: "only-here", type: "shell", command: "true" }], {
      session: "work",
    });
    expect(
      ((await request("command.list", {})).result as { commands: { id: string }[] }).commands.map(
        (c) => c.id,
      ),
    ).toEqual(["only-here"]);
  }, 30_000);

  it("command.reload で読み直し、採れなければ 0 件と理由を返す（AC2・AC15）", async () => {
    const { request, stateDir } = await start([{ id: "a", type: "shell", command: "true" }]);
    await writeFile(
      join(stateDir, "commands.json"),
      JSON.stringify({ commands: [{ id: "a", type: "shell", command: "true", env: {} }] }),
    );
    const r = (await request("command.reload", {})).result as {
      commands: unknown[];
      problem: string;
    };
    expect(r.commands).toEqual([]);
    expect(r.problem).toMatch(/知らない項目/);
    expect((await request("command.run", { commandId: "a", paneId: "p1" })).error?.code).toBe(
      "command_not_found",
    );
  }, 30_000);
});
