import { describe, expect, it } from "vitest";
import { fakeIo } from "../testing/fakeIo.js";
import type { TuiTarget } from "../types.js";
import { TuiApp } from "./TuiApp.js";
import { RESTORE_SEQUENCE, TerminalModes } from "./terminalModes.js";

/** 接続しない（T1 の骨組みの確認用。login は呼ばれない前提）。 */
class BareApp extends TuiApp {
  protected override start(): void {}
}

const target: TuiTarget = {
  baseUrl: "http://127.0.0.1:1",
  origin: "http://127.0.0.1:1",
  login: () => Promise.reject(new Error("not used")),
  stateDir: "/nonexistent",
};

describe("TuiApp: 外側の端末のモード（AC3）", () => {
  it.each(["SIGINT", "SIGTERM", "SIGHUP"] as const)(
    "%s で終了コード 0・モードを戻して raw を外す",
    async (sig) => {
      const io = fakeIo();
      const running = new BareApp(target, io).run();
      expect(io.output()).toContain("\x1b[?1049h");
      expect(io.rawMode).toBe(true);
      io.signal(sig);
      expect(await running).toBe(0);
      expect(io.output().endsWith(RESTORE_SEQUENCE)).toBe(true);
      expect(io.rawMode).toBe(false);
      expect(io.listenerCount()).toBe(0);
    },
  );

  it("捕まえていない例外で終了コード 1・モードを戻してから理由を標準エラーへ", async () => {
    const io = fakeIo();
    const running = new BareApp(target, io).run();
    io.fatal(new Error("boom"));
    expect(await running).toBe(1);
    expect(io.output().endsWith(RESTORE_SEQUENCE)).toBe(true);
    expect(io.rawMode).toBe(false);
    expect(io.errors()).toContain("boom");
  });

  it("組み立ての途中の例外でも戻す", async () => {
    class Throwing extends TuiApp {
      protected override start(): void {
        throw new Error("start failed");
      }
    }
    const io = fakeIo();
    expect(await new Throwing(target, io).run()).toBe(1);
    expect(io.output().endsWith(RESTORE_SEQUENCE)).toBe(true);
    expect(io.errors()).toContain("start failed");
  });

  it("プロセスの exit（最後の砦）で戻す。2 度目は何も書かない", () => {
    const io = fakeIo();
    void new BareApp(target, io).run();
    io.exit();
    const after = io.output();
    expect(after.endsWith(RESTORE_SEQUENCE)).toBe(true);
    io.exit();
    expect(io.output()).toBe(after);
  });

  it("端末でなければ何も書かずに 1", async () => {
    const io = fakeIo({ isTTY: false });
    expect(await new BareApp(target, io).run()).toBe(1);
    expect(io.output()).toBe("");
    expect(io.errors()).toContain("terminal");
  });

  it("初回の知らせは代替画面に入る前に標準エラーへ", async () => {
    const io = fakeIo();
    const app = new BareApp({ ...target, startupNotice: "token: abc" }, io);
    const running = app.run();
    expect(io.errors()).toContain("token: abc");
    app.detach();
    expect(await running).toBe(0);
  });
});

describe("TerminalModes", () => {
  it("書けなくても（端末が閉じた）復元で投げない", () => {
    const io = fakeIo();
    const modes = new TerminalModes(io);
    modes.enable(true);
    io.write = () => {
      throw new Error("EIO");
    };
    expect(() => modes.restore()).not.toThrow();
    expect(io.rawMode).toBe(false);
  });
});
