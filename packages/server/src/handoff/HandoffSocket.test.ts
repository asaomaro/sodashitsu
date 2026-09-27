import { rm, stat, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryLogger } from "../log/Logger.js";
import { makeTempDir } from "../persist/atomicFile.js";
import type { HandoffReply } from "./HandoffController.js";
import { type HandoffSocket, handoffSocketPathFor, startHandoffSocket } from "./HandoffSocket.js";

function ask(path: string, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = connect(path);
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (c: string) => (buf += c));
    sock.on("end", () => resolve(buf));
    sock.on("error", reject);
    sock.write(line);
  });
}

describe.skipIf(process.platform === "win32")("startHandoffSocket", () => {
  let dir: string;
  let socket: HandoffSocket | undefined;
  afterEach(async () => {
    await socket?.close();
    socket = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  async function start(reply: HandoffReply) {
    dir = await makeTempDir("soda-handoff-sock-");
    const requests: number[] = [];
    const stops: number[] = [];
    socket = await startHandoffSocket(
      handoffSocketPathFor(dir),
      {
        request: async (send) => {
          requests.push(1);
          await send(reply);
        },
        status: () => ({ lastHandoff: { id: "ab", adopted: 1, dropped: 0, at: "t" } }),
        stop: async (send) => {
          stops.push(1);
          await send({ ok: true, pid: 4242, alreadyStopping: false });
        },
      },
      new MemoryLogger(),
    );
    return { requests, stops };
  }

  it("状態ディレクトリの handoff.sock を 0600 で待ち受ける", async () => {
    await start({ ok: true, id: "ab", panes: 1 });
    const st = await stat(join(dir, "handoff.sock"));
    expect(st.isSocket()).toBe(true);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it("handoff は返事を 1 行返す・status は結果を返す・それ以外は bad_request", async () => {
    const { requests } = await start({ ok: false, reason: "preflight_failed", message: "m" });
    const path = handoffSocketPathFor(dir);
    expect(JSON.parse(await ask(path, '{"op":"handoff"}\n'))).toEqual({
      ok: false,
      reason: "preflight_failed",
      message: "m",
    });
    expect(requests).toHaveLength(1);
    expect(JSON.parse(await ask(path, '{"op":"status"}\n'))).toEqual({
      lastHandoff: { id: "ab", adopted: 1, dropped: 0, at: "t" },
    });
    expect(JSON.parse(await ask(path, '{"op":"reboot"}\n'))).toMatchObject({
      ok: false,
      reason: "bad_request",
    });
    expect(JSON.parse(await ask(path, "not json\n"))).toMatchObject({
      ok: false,
      reason: "bad_request",
    });
    expect(requests).toHaveLength(1);
  });

  it("stop は止める指示の返事を 1 行返す（20260927-session-stop）", async () => {
    const { requests, stops } = await start({ ok: true, id: "ab", panes: 0 });
    const path = handoffSocketPathFor(dir);
    expect(JSON.parse(await ask(path, '{"op":"stop"}\n'))).toEqual({
      ok: true,
      pid: 4242,
      alreadyStopping: false,
    });
    expect(stops).toHaveLength(1);
    expect(requests).toHaveLength(0);
    // 未知の op の案内に stop が載る
    expect(JSON.parse(await ask(path, '{"op":"reboot"}\n'))).toMatchObject({
      reason: "bad_request",
      message: expect.stringContaining('{"op":"stop"}'),
    });
    expect(stops).toHaveLength(1);
  });

  it("残っていたファイル（execve の前の古い版の socket の残り）を消して待ち受け直す", async () => {
    dir = await makeTempDir("soda-handoff-sock-");
    const path = handoffSocketPathFor(dir);
    await writeFile(path, ""); // 誰も待ち受けていない残り
    socket = await startHandoffSocket(
      path,
      {
        request: async () => undefined,
        status: () => ({ lastHandoff: null }),
        stop: async () => undefined,
      },
      new MemoryLogger(),
    );
    expect(JSON.parse(await ask(path, '{"op":"status"}\n'))).toEqual({ lastHandoff: null });
  });

  it("改行を含んでも、上限を超える行は読まない", async () => {
    const { requests } = await start({ ok: true, id: "ab", panes: 0 });
    const out = await ask(
      handoffSocketPathFor(dir),
      `{"op":"handoff","pad":"${"x".repeat(5000)}"}\n`,
    ).catch(() => "");
    expect(out).toBe("");
    expect(requests).toHaveLength(0);
  });

  it("改行の無い長すぎる入力は切る", async () => {
    const { requests } = await start({ ok: true, id: "ab", panes: 0 });
    const out = await ask(handoffSocketPathFor(dir), "x".repeat(5000)).catch(() => "");
    expect(out).toBe("");
    expect(requests).toHaveLength(0);
  });
});
