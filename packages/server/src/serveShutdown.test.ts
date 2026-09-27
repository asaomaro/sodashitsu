import { describe, expect, it } from "vitest";
import { createShutdown, type ShutdownDeps } from "./serveShutdown.js";

/** `wtm serve` の停止の手順（20260927-session-stop の T3）。 */
function setup(opts: { closeFails?: boolean; startup?: Promise<void> } = {}) {
  const events: string[] = [];
  let resolveExit: (code: number) => void = () => undefined;
  const exited = new Promise<number>((r) => (resolveExit = r));
  const deps: ShutdownDeps = {
    close: async () => {
      events.push("close");
      if (opts.closeFails) throw new Error("boom");
    },
    startup: () => opts.startup,
    showTokenIfUnshown: () => events.push("token"),
    log: (line) => events.push(`log:${line}`),
    error: (line) => events.push(`error:${line}`),
    exit: (code) => {
      events.push(`exit:${code}`);
      resolveExit(code);
    },
  };
  return { events, exited, shutdown: createShutdown(deps) };
}

describe("createShutdown", () => {
  it("止める指示はシグナルと同じ手順（token → close → 終了コード 0）を通る", async () => {
    const a = setup();
    a.shutdown.stopRequest();
    expect(await a.exited).toBe(0);
    expect(a.events).toEqual([
      "token",
      "log:wtm: stop requested (wtm session stop), shutting down",
      "token",
      "close",
      "exit:0",
    ]);

    const b = setup();
    b.shutdown.signal("SIGTERM");
    expect(await b.exited).toBe(0);
    expect(b.events).toEqual([
      "token",
      "log:wtm: received SIGTERM, shutting down",
      "token",
      "close",
      "exit:0",
    ]);
  });

  it("止める指示の 2 回目・シグナルの後の止める指示は何もしない（停止を打ち切らない。AC7）", async () => {
    const a = setup();
    a.shutdown.stopRequest();
    a.shutdown.stopRequest();
    expect(a.shutdown.shuttingDown).toBe(true);
    expect(await a.exited).toBe(0);
    a.shutdown.stopRequest(); // 閉じ終えた後に届いても同じ
    expect(a.events.filter((e) => e === "close")).toHaveLength(1);
    expect(a.events.filter((e) => e.startsWith("exit:"))).toEqual(["exit:0"]);

    const b = setup();
    b.shutdown.signal("SIGINT");
    b.shutdown.stopRequest();
    expect(await b.exited).toBe(0);
    expect(b.events.filter((e) => e === "close")).toHaveLength(1);
    expect(b.events.filter((e) => e.startsWith("exit:"))).toEqual(["exit:0"]);
  });

  it("止まる途中のシグナルは待たずに終わる（止める指示で始まった停止も同じ。decisions D6）", async () => {
    let release: () => void = () => undefined;
    const startup = new Promise<void>((r) => (release = r));
    const a = setup({ startup });
    a.shutdown.stopRequest();
    a.shutdown.signal("SIGINT");
    expect(a.events).toContain("error:wtm: received SIGINT again, exiting without waiting");
    expect(a.events).toContain("exit:1");
    expect(a.events).not.toContain("close");
    release();
    await a.exited; // 偽の依存の後続（close・exit）を次のテストへ漏らさない
  });

  it("シグナルの 2 回目は待たずに終わる（以前からの挙動）", async () => {
    let release: () => void = () => undefined;
    const startup = new Promise<void>((r) => (release = r));
    const a = setup({ startup });
    a.shutdown.signal("SIGINT");
    a.shutdown.signal("SIGTERM");
    expect(a.events).toEqual([
      "token",
      "log:wtm: received SIGINT, shutting down",
      "token",
      "error:wtm: received SIGTERM again, exiting without waiting",
      "exit:1",
    ]);
    release();
    await new Promise((r) => setTimeout(r, 10));
  });

  it("起動の途中なら起動を終えてから閉じる", async () => {
    let release: () => void = () => undefined;
    const startup = new Promise<void>((r) => (release = r));
    const a = setup({ startup });
    a.shutdown.stopRequest();
    await new Promise((r) => setTimeout(r, 10));
    expect(a.events).not.toContain("close");
    release();
    expect(await a.exited).toBe(0);
    expect(a.events).toContain("close");
  });

  it("close が投げたら終了コード 1", async () => {
    const a = setup({ closeFails: true });
    a.shutdown.stopRequest();
    expect(await a.exited).toBe(1);
    expect(a.events).toContain("error:wtm: error during shutdown");
  });
});
