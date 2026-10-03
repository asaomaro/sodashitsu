import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runAgentPrompt, runAgentSendKeys } from "./commands/agent.js";
import { runPaneRun } from "./commands/pane.js";
import { FsSessionStore } from "./session.js";

/**
 * `sodactl agent prompt --wait` / `agent send-keys` を、実サーバ・実 PTY・実際の検出の上の偽のエージェントで確かめる
 * （20260926-agent-prompt-send-keys requirements AC13）。偽のエージェントは node のスクリプトを argv[0]=claude で起動し
 * （検出は argv[0] で行う）、bracketed paste を有効にして、受け取ったバイト列と時刻を記録する。Enter（CR）を受けたら
 * OSC タイトルを claude の working（braille 接頭辞）にし、`WORKING_MS` 後に idle（✳）へ戻す。
 */

/** 偽のエージェントが working でいる時間。検出は 500ms 周期で /proc の走査を待つので、負荷下でも取りこぼさない長さにする。 */
const WORKING_MS = 4000;

const FAKE_AGENT = `
import { appendFileSync } from "node:fs";
const log = process.argv[2];
const title = (t) => process.stdout.write("\\u001b]0;" + t + "\\u0007");
process.stdin.setRawMode(true);
process.stdout.write("\\u001b[?2004h");
title("\\u2733 fake");
process.stdout.write("fake agent ready\\r\\n");
process.stdin.on("data", (buf) => {
  appendFileSync(log, JSON.stringify({ t: Date.now(), hex: buf.toString("hex") }) + "\\n");
  if (buf.includes(0x0d)) {
    title("\\u2802 fake");
    setTimeout(() => title("\\u2733 fake"), ${WORKING_MS});
  }
});
`;

function captureStdout(): { text(): string; restore(): void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk),
    );
    return true;
  });
  return { text: () => chunks.join(""), restore: () => spy.mockRestore() };
}

interface Received {
  t: number;
  bytes: Buffer;
}

async function readReceived(logPath: string): Promise<Received[]> {
  const raw = await readFile(logPath, "utf8").catch(() => "");
  return raw
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as { t: number; hex: string })
    .map((r) => ({ t: r.t, bytes: Buffer.from(r.hex, "hex") }));
}

describe("sodactl agent prompt / send-keys integration（偽のエージェント・実 PTY・実際の検出）", () => {
  let server: ComposedServer;
  let dir: string;
  let store: FsSessionStore;
  let url: string;
  let paneId: string;
  let logPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "sodactl-prompt-it-"));
    server = await composeServerOnFreePort({
      host: "127.0.0.1",
      stateDir: join(dir, "state"),
      origin: [],
    });
    if (!server.freshToken) throw new Error("expected a freshly generated token");
    url = `http://${server.options.host}:${server.options.port}`;
    store = new FsSessionStore(join(dir, "session.json"));
    paneId = server.session.snapshot().panes[0]!.id;

    const script = join(dir, "fake-agent.mjs");
    logPath = join(dir, "received.jsonl");
    await writeFile(script, FAKE_AGENT);
    // シバンを経由すると argv[0] がインタプリタ名に書き換わるので、bash の exec -a で argv[0] を claude にする。
    const command = `exec bash -c 'exec -a claude "$0" "$@"' ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} ${JSON.stringify(logPath)}`;
    const out = captureStdout();
    try {
      await runPaneRun(
        { kind: "pane-run", opts: { url, token: server.freshToken, urlExplicit: false }, paneId, command },
        store,
      );
    } finally {
      out.restore();
    }
    // 検出（3 秒の猶予の後、500ms 周期）で claude の idle になるのを待つ。
    await vi.waitFor(
      () => {
        const a = server.session.getPane(paneId)?.agent;
        expect(a?.kind).toBe("claude");
        expect(a?.state).toBe("idle");
      },
      { timeout: 30_000, interval: 200 },
    );
  }, 60_000);

  afterAll(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const opts = () => ({ url, token: undefined, urlExplicit: false });

  it("複数行の本文を 1 つの貼り付けとして届け、300ms 後の Enter で確定し、working を経て idle/done で返る（AC13）", async () => {
    const text = "first line\nsecond line";
    const out = captureStdout();
    try {
      await runAgentPrompt(
        {
          kind: "agent-prompt",
          opts: opts(),
          paneId,
          text,
          wait: true,
          until: [],
          timeoutMs: 30_000,
        },
        store,
      );
    } finally {
      out.restore();
    }
    const returnedAt = Date.now();
    const result = JSON.parse(out.text()) as { agent: { status: string; kind: string } };
    expect(result.agent.kind).toBe("claude");
    expect(["idle", "done"]).toContain(result.agent.status);

    const received = await readReceived(logPath);
    const enterAt = received.findIndex((r) => r.bytes.includes(0x0d));
    expect(enterAt).toBeGreaterThan(0);
    const beforeEnter = Buffer.concat(received.slice(0, enterAt).map((r) => r.bytes)).toString(
      "utf8",
    );
    const trace = JSON.stringify(received.map((r) => ({ t: r.t, s: r.bytes.toString("utf8") })));
    expect(beforeEnter, trace).toBe(`\u001b[200~${text}\u001b[201~`);
    // Enter は貼り付けとは別の読み取りで、間を置いて届く（負荷で偽のエージェントの読み取りが 300ms 以上止まると
    // 1 回にまとまって落ちうる——そのときは trace で切り分ける）。
    expect(received[enterAt]!.bytes.toString("utf8"), trace).toBe("\r");
    expect(received[enterAt]!.t - received[enterAt - 1]!.t, trace).toBeGreaterThanOrEqual(250);
    // Enter の直後の idle では返らず、working を経て idle に戻った後で返った（活動の確認が効いている）。
    expect(returnedAt - received[enterAt]!.t).toBeGreaterThanOrEqual(WORKING_MS - 1000);
  }, 60_000);

  it("send-keys はキーを符号化して届ける（AC10）", async () => {
    const before = (await readReceived(logPath)).length;
    const out = captureStdout();
    try {
      await runAgentSendKeys(
        { kind: "agent-send-keys", opts: opts(), paneId, keys: ["esc", "up", "C-c"] },
        store,
      );
    } finally {
      out.restore();
    }
    expect(JSON.parse(out.text())).toEqual({ ok: true, paneId });
    await vi.waitFor(
      async () => {
        const after = (await readReceived(logPath)).slice(before);
        expect(Buffer.concat(after.map((r) => r.bytes)).toString("utf8")).toBe(
          "\u001b\u001b[A\u0003",
        );
      },
      { timeout: 10_000, interval: 100 },
    );
  }, 30_000);
});
