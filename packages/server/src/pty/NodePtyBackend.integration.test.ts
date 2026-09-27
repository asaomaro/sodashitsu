import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { NodePtyBackend } from "./NodePtyBackend.js";

// Linux 上で実物のシェルを起動する結合テスト（T6「テスト方針」）。
describe.skipIf(process.platform === "win32")("NodePtyBackend (integration)", () => {
  it("spawns a shell, echoes input, and reports exit", async () => {
    const backend = new NodePtyBackend();
    const pty = backend.spawn({
      shell: "/bin/sh",
      args: ["-c", "cat"], // 入力をそのまま返す
      cwd: process.cwd(),
      env: { ...process.env, PS1: "" } as Record<string, string>,
      cols: 80,
      rows: 24,
    });

    const chunks: string[] = [];
    const onData = pty.onData((c) => chunks.push(c));
    pty.write("hello-pty\n");

    await waitFor(() => chunks.join("").includes("hello-pty"), 3000);
    expect(chunks.join("")).toContain("hello-pty");
    onData.dispose();

    const exitPromise = new Promise<{ exitCode: number }>((resolve) => {
      pty.onExit((e) => resolve(e));
    });
    pty.kill();
    const exit = await exitPromise;
    expect(typeof exit.exitCode).toBe("number");
  });

  it("resizes without throwing, including at the lower bound", () => {
    const backend = new NodePtyBackend();
    const pty = backend.spawn({
      shell: "/bin/sh",
      args: ["-c", "sleep 5"],
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24,
    });
    expect(() => pty.resize(120, 40)).not.toThrow();
    expect(() => pty.resize(0, 0)).not.toThrow(); // node-pty #877: 0 を渡すと落ちることがある
    pty.kill();
  });

  // 20260926-kitty-graphics の AC8。画素の大きさは `stty` では見えないので、python3 で TIOCGWINSZ を読む（無い環境では飛ばす）。
  it.skipIf(!hasPython3())(
    "resize の画素の大きさが PTY の ws_xpixel/ws_ypixel になる",
    async () => {
      const backend = new NodePtyBackend();
      const script =
        "import fcntl, struct, termios; r, c, x, y = struct.unpack('HHHH', fcntl.ioctl(0, termios.TIOCGWINSZ, bytes(8))); print('WS', r, c, x, y)";
      const pty = backend.spawn({
        shell: "/bin/sh",
        args: ["-c", `read line; python3 -c "${script}"`],
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
        cols: 80,
        rows: 24,
      });
      const chunks: string[] = [];
      const onData = pty.onData((c) => chunks.push(c));
      try {
        pty.resize(100, 30, { width: 900, height: 510 });
        pty.write("\n");
        await waitFor(() => /WS \d+ \d+ \d+ \d+/.test(chunks.join("")), 5000);
        expect(chunks.join("")).toMatch(/WS 30 100 900 510/);
      } finally {
        onData.dispose();
        pty.kill();
      }
    },
  );

  it("pause/resume do not throw", async () => {
    const backend = new NodePtyBackend();
    const pty = backend.spawn({
      shell: "/bin/sh",
      args: ["-c", "yes"],
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24,
    });
    expect(() => pty.pause()).not.toThrow();
    expect(() => pty.resume()).not.toThrow();
    pty.kill();
  });
});

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 20));
  }
}

function hasPython3(): boolean {
  return spawnSync("python3", ["-c", "import fcntl, termios"], { stdio: "ignore" }).status === 0;
}
