import { WriteStream } from "node:tty";
import { describe, expect, it } from "vitest";
import { AdoptedPtyProcess } from "./AdoptedPtyProcess.js";
import { NodePtyBackend } from "./NodePtyBackend.js";
import { nodePtyNative } from "./nodePtyNative.js";
import { restartHandleReading, stopHandleReading } from "./socketReading.js";

async function until(cond: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("stopHandleReading / restartHandleReading", () => {
  it("handle の無い stream では false（何もしない）", () => {
    let paused = false;
    expect(
      stopHandleReading({ pause: () => (paused = true), read: () => null, _handle: null }),
    ).toBe(false);
    expect(paused).toBe(false);
    expect(() => restartHandleReading({ pause: () => undefined, read: () => null })).not.toThrow();
  });
});

describe.skipIf(process.platform === "win32")("holdReading / releaseReading（実物の PTY）", () => {
  it("node-pty: 止めている間は出力が届かず、戻すと続きが届く", async () => {
    const backend = new NodePtyBackend();
    const p = backend.spawn({
      shell: "/bin/sh",
      args: ["-c", "read x; echo after-$x; sleep 5"],
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24,
    });
    try {
      let got = "";
      p.onData((c) => (got += c));
      expect(p.holdReading?.()).toBe(true);
      p.write("go\n");
      await new Promise((r) => setTimeout(r, 300));
      expect(got).not.toContain("after-go");
      p.releaseReading?.();
      p.resume();
      await until(() => got.includes("after-go"), "output after release");
    } finally {
      p.kill();
    }
  });

  it("AdoptedPtyProcess: 止めている間は出力が届かず、戻すと続きが届く", async () => {
    const { master, slave } = nodePtyNative().open(80, 24);
    const proc = new AdoptedPtyProcess(master, 1, {
      readExitStatus: () => undefined,
      kill: () => undefined,
      exitPollMs: 0,
    });
    const out = new WriteStream(slave);
    try {
      let got = "";
      proc.onData((c) => (got += c));
      expect(proc.holdReading()).toBe(true);
      out.write("held-line\n");
      await new Promise((r) => setTimeout(r, 200));
      expect(got).not.toContain("held-line");
      // 読み取り済みの buffer にも溜まっていない（カーネルの PTY に残っている＝execve をまたいでも失われない）
      expect(
        (proc as unknown as { stream: { readableLength: number } }).stream.readableLength,
      ).toBe(0);
      proc.releaseReading();
      proc.resume();
      await until(() => got.includes("held-line"), "output after release");
    } finally {
      proc.kill();
      out.destroy();
    }
  });
});
