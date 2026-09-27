import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryLogger } from "../log/Logger.js";
import { makeTempDir } from "../persist/atomicFile.js";
import type { HandoffHold, TerminalHost } from "../terminal/TerminalHost.js";
import {
  HandoffController,
  type HandoffControllerDeps,
  type HandoffReply,
} from "./HandoffController.js";
import { HANDOFF_FILE_NAME, parseHandoffManifest } from "./HandoffManifest.js";

/** 読み取りの停止だけを持つ偽の端末。 */
function fakeHost(
  pid: number,
  hold: HandoffHold | undefined | "never",
  calls: string[],
  name: string,
): TerminalHost {
  return {
    pid,
    holdForHandoff: () => {
      calls.push(`hold ${name}`);
      if (hold === "never") return new Promise<never>(() => undefined);
      return Promise.resolve(hold);
    },
    releaseHandoffHold: () => calls.push(`release ${name}`),
  } as unknown as TerminalHost;
}

describe("HandoffController", () => {
  let dir: string;
  afterEach(async () => rm(dir, { recursive: true, force: true }));

  async function setup(overrides: Partial<HandoffControllerDeps> = {}) {
    dir = await makeTempDir("soda-handoff-ctl-");
    const calls: string[] = [];
    const replies: HandoffReply[] = [];
    let execNonce: string | undefined;
    let manifestAtExec: string | undefined;
    const deps: HandoffControllerDeps = {
      stateDir: dir,
      logger: new MemoryLogger(),
      panes: () => [
        {
          paneId: "p1",
          host: fakeHost(501, { fd: 20, cols: 80, rows: 24, screen: "one" }, calls, "p1"),
        },
        { paneId: "p2", host: undefined }, // 起動に失敗した pane
        {
          paneId: "p3",
          host: fakeHost(503, { fd: 21, cols: 100, rows: 30, screen: "" }, calls, "p3"),
        },
      ],
      scrollbackEditors: () => [],
      boundPort: () => 7780,
      pausePollers: async () => void calls.push("pausePollers"),
      resumePollers: () => void calls.push("resumePollers"),
      flushSession: async () => void calls.push("flushSession"),
      closeClients: () => void calls.push("closeClients"),
      reopenClients: () => void calls.push("reopenClients"),
      flushLog: async () => void calls.push("flushLog"),
      preflight: async () => {
        calls.push("preflight");
        return { ok: true };
      },
      execve: (nonce) => {
        calls.push("execve");
        execNonce = nonce;
        manifestAtExec = existsSync(join(dir, HANDOFF_FILE_NAME)) ? "present" : "absent";
        throw new Error("simulated: execve failed");
      },
      platform: "linux",
      hasExecve: true,
      randomHex: (n) => "ab".repeat(n),
      now: () => new Date("2026-09-27T00:00:00.000Z"),
      ...overrides,
    };
    const controller = new HandoffController(deps);
    const request = () =>
      controller.request(async (r) => {
        calls.push(`reply ${r.ok ? "ok" : r.reason}`);
        replies.push(r);
      });
    return { controller, calls, replies, request, exec: () => ({ execNonce, manifestAtExec }) };
  }

  it("通る順: preflight → /ws を閉じる → poller を止める → 読み取りを止める → 保存 → handoff.json → 返事 → ログ → execve", async () => {
    let written: string | undefined;
    const { calls, replies, request } = await setup({
      execve: () => {
        calls.push("execve");
        written = existsSync(join(dir, HANDOFF_FILE_NAME)) ? "yes" : "no";
        throw new Error("simulated");
      },
    });
    await request();
    expect(calls.slice(0, 10)).toEqual([
      "preflight",
      "closeClients",
      "pausePollers",
      "hold p1",
      "hold p3",
      "flushSession",
      "reply ok",
      "flushLog",
      "execve",
      "release p1",
    ]);
    expect(written).toBe("yes");
    expect(replies[0]).toEqual({ ok: true, id: "abababababababab", panes: 2 });
  });

  it("handoff.json には pane の fd・pid・大きさ・画面と、nonce・自分の pid・ポートが入る", async () => {
    let manifest: string | undefined;
    const { request } = await setup({
      flushLog: async () => {
        manifest = await readFile(join(dir, HANDOFF_FILE_NAME), "utf8");
      },
    });
    await request();
    const m = parseHandoffManifest(manifest!);
    expect(m).toMatchObject({
      id: "abababababababab",
      nonce: "ab".repeat(16),
      pid: process.pid,
      port: 7780,
      createdAt: "2026-09-27T00:00:00.000Z",
      panes: [
        { paneId: "p1", fd: 20, pid: 501, cols: 80, rows: 24, screen: "one" },
        { paneId: "p3", fd: 21, pid: 503, cols: 100, rows: 30, screen: "" },
      ],
    });
  });

  it("execve が戻ったら元に戻す: 読み取り・poller・handoff.json・/ws（nonce は handoff.json と同じ値で渡す）", async () => {
    const { calls, replies, request, exec } = await setup();
    await request();
    expect(replies).toHaveLength(1); // 返事は ok の 1 回だけ
    expect(exec().execNonce).toBe("ab".repeat(16));
    expect(exec().manifestAtExec).toBe("present");
    expect(calls.slice(9)).toEqual(["release p1", "release p3", "resumePollers", "reopenClients"]);
    expect(existsSync(join(dir, HANDOFF_FILE_NAME))).toBe(false);
  });

  it("execve が失敗したら、その id の失敗を status に残す（CLI が待たずに知る）", async () => {
    const { controller, request } = await setup();
    await request();
    expect(controller.status().lastHandoff).toEqual({
      id: "abababababababab",
      adopted: 0,
      dropped: 2,
      at: "2026-09-27T00:00:00.000Z",
      error: "simulated: execve failed",
    });
  });

  it("preflight が通らなければ何も変えずに preflight_failed（AC4）", async () => {
    const { calls, replies, request } = await setup({
      preflight: async () => ({ ok: false, message: "new version cannot be loaded" }),
    });
    await request();
    expect(calls).toEqual(["reply preflight_failed"]);
    expect(replies[0]).toEqual({
      ok: false,
      reason: "preflight_failed",
      message: "new version cannot be loaded",
    });
  });

  it("preflight が投げても preflight_failed", async () => {
    const { replies, request } = await setup({
      preflight: async () => {
        throw new Error("boom");
      },
    });
    await request();
    expect(replies[0]).toMatchObject({ ok: false, reason: "preflight_failed", message: "boom" });
  });

  it("渡せない端末があれば、止めた分を戻して pane_unavailable", async () => {
    const calls: string[] = [];
    const { replies, request } = await setup({
      panes: () => [
        {
          paneId: "p1",
          host: fakeHost(501, { fd: 20, cols: 80, rows: 24, screen: "" }, calls, "p1"),
        },
        { paneId: "p3", host: fakeHost(503, undefined, calls, "p3") },
      ],
    });
    await request();
    expect(calls).toEqual(["hold p1", "hold p3", "release p1"]);
    expect(replies[0]).toMatchObject({ ok: false, reason: "pane_unavailable" });
    expect(existsSync(join(dir, HANDOFF_FILE_NAME))).toBe(false);
  });

  it("読み取りの停止が上限を過ぎたら pane_unavailable", async () => {
    const calls: string[] = [];
    const { replies, request } = await setup({
      holdTimeoutMs: 20,
      panes: () => [{ paneId: "p1", host: fakeHost(501, "never", calls, "p1") }],
    });
    await request();
    expect(replies[0]).toMatchObject({
      ok: false,
      reason: "pane_unavailable",
      message: expect.stringContaining("20ms"),
    });
  });

  it("時間切れの後で止まった端末も戻し、poller も戻す", async () => {
    const calls: string[] = [];
    let late: (h: HandoffHold) => void = () => undefined;
    const slow = {
      pid: 1,
      holdForHandoff: () => new Promise<HandoffHold>((r) => (late = r)),
      releaseHandoffHold: () => calls.push("release slow"),
    } as unknown as TerminalHost;
    const {
      replies,
      request,
      calls: ctlCalls,
    } = await setup({ holdTimeoutMs: 20, panes: () => [{ paneId: "p1", host: slow }] });
    await request();
    expect(replies).toHaveLength(1);
    expect(ctlCalls).toContain("resumePollers");
    late({ fd: 20, cols: 80, rows: 24, screen: "" });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(["release slow"]);
  });

  it("止める途中で失敗した端末は戻してから pane_unavailable（落ちない）", async () => {
    const calls: string[] = [];
    const broken = {
      pid: 1,
      holdForHandoff: () => Promise.reject(new Error("mirror gone")),
      releaseHandoffHold: () => calls.push("release broken"),
    } as unknown as TerminalHost;
    const { replies, request } = await setup({ panes: () => [{ paneId: "p1", host: broken }] });
    await request();
    expect(replies).toEqual([
      { ok: false, reason: "pane_unavailable", message: expect.stringContaining("mirror gone") },
    ]);
    expect(calls).toEqual(["release broken"]);
  });

  it("holdForHandoff を持たない端末は pane_unavailable", async () => {
    const { replies, request } = await setup({
      panes: () => [{ paneId: "p1", host: { pid: 1 } as unknown as TerminalHost }],
    });
    await request();
    expect(replies[0]).toMatchObject({ ok: false, reason: "pane_unavailable" });
  });

  it("poller を止められなければ prepare_failed で、戻す（返事は 1 回）", async () => {
    const { calls, replies, request } = await setup({
      pausePollers: async () => {
        throw new Error("monitor stuck");
      },
    });
    await request();
    expect(replies).toEqual([{ ok: false, reason: "prepare_failed", message: "monitor stuck" }]);
    expect(calls).toContain("resumePollers");
  });

  it("戻す手順の 1 つが投げても、残りを戻して返事をする", async () => {
    const { calls, replies, request } = await setup({
      resumePollers: () => {
        throw new Error("x");
      },
      flushSession: async () => {
        throw new Error("disk full");
      },
    });
    await request();
    expect(calls).toContain("release p3");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ ok: false, reason: "prepare_failed" });
  });

  it("返事の後で /ws を閉じる・ログの書き出しが投げても元に戻す（返事は ok の 1 回だけ）", async () => {
    const { calls, replies, request } = await setup({
      flushLog: async () => {
        throw new Error("log");
      },
    });
    await request();
    expect(replies).toEqual([{ ok: true, id: "abababababababab", panes: 2 }]);
    expect(calls).not.toContain("execve");
    expect(calls.slice(-4)).toEqual(["release p1", "release p3", "resumePollers", "reopenClients"]);
    expect(existsSync(join(dir, HANDOFF_FILE_NAME))).toBe(false);
  });

  it("保存に失敗したら元に戻して prepare_failed（handoff.json を残さない）", async () => {
    const { calls, replies, request } = await setup({
      flushSession: async () => {
        throw new Error("disk full");
      },
    });
    await request();
    expect(replies[0]).toMatchObject({
      ok: false,
      reason: "prepare_failed",
      message: expect.stringContaining("disk full"),
    });
    expect(calls).toContain("release p1");
    expect(calls).toContain("resumePollers");
    expect(calls).toContain("reopenClients"); // 閉じた /ws を戻す
    expect(existsSync(join(dir, HANDOFF_FILE_NAME))).toBe(false);
  });

  it("Windows・execve の無い Node では unsupported（何もしない）", async () => {
    for (const o of [{ platform: "win32" as const }, { hasExecve: false }]) {
      const { calls, replies, request } = await setup(o);
      await request();
      expect(calls).toEqual(["reply unsupported"]);
      expect(replies[0]).toMatchObject({ ok: false, reason: "unsupported" });
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("実行中にもう 1 つ来たら busy", async () => {
    let release: () => void = () => undefined;
    let calls = 0;
    const { replies, controller } = await setup({
      preflight: () =>
        calls++ === 0
          ? new Promise((r) => {
              release = () => r({ ok: false, message: "stop" });
            })
          : Promise.resolve({ ok: false, message: "second" }),
    });
    const got: HandoffReply[] = [];
    expect(controller.isBusy).toBe(false);
    await controller.waitIdle(); // 最中でなければすぐ
    const first = controller.request(async (r) => void replies.push(r));
    // 引き継ぎの最中は isBusy（止める指示を断る根拠）・waitIdle は終わるまで待つ（止め始めたサーバが待つ。20260927-session-stop）
    expect(controller.isBusy).toBe(true);
    let idle = false;
    const waiting = controller.waitIdle().then(() => {
      idle = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(idle).toBe(false);
    await controller.request(async (r) => void got.push(r));
    expect(got[0]).toMatchObject({ ok: false, reason: "busy" });
    release();
    await first;
    await waiting;
    expect(idle).toBe(true);
    expect(controller.isBusy).toBe(false);
    // 終わったらまた受け付ける
    const again: HandoffReply[] = [];
    await controller.request(async (r) => void again.push(r));
    expect(again[0]?.ok === false && again[0].reason).not.toBe("busy");
  });

  it("recordTaken の結果を status が答える", async () => {
    const { controller } = await setup();
    expect(controller.status()).toEqual({ lastHandoff: null });
    controller.recordTaken({ id: "abcd", adopted: 2, dropped: 1 });
    expect(controller.status()).toEqual({
      lastHandoff: { id: "abcd", adopted: 2, dropped: 1, at: "2026-09-27T00:00:00.000Z" },
    });
  });
});
