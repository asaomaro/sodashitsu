import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  NodePtyBackend,
  SentLengths,
  sumPendingChunks,
  windowsSocketChunks,
} from "./NodePtyBackend.js";

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

  // 20260927-server-size-input-limits の AC5・decisions D4。読まない raw モードの子（固まった TUI の代わり）に書くと、書けなかった分が node-pty の
  // 内部の待ちに残り、`pendingWriteBytes` がそれを返す（canonical のままだとカーネルが溢れた入力を捨てて待ちが消えるので、raw にする）。
  // node-pty の版を更新して内部の形（`_writeStream._writeQueue`）が変わると、ここが undefined になって落ちる。書くのは 1 回だけ（負荷試験ではない）。
  it("読まない raw モードの子への書き込みは pendingWriteBytes に残り、読む子では 0 に戻る", async () => {
    const backend = new NodePtyBackend();
    // 出力は spawn の直後から受ける（node-pty は聞き手がいなくても data を捨てるので、後から付けると READY を取りこぼす。T3 の点検）。
    const spawnRaw = (then: string) => {
      const p = backend.spawn({
        shell: "/bin/sh",
        args: ["-c", `stty raw -echo; printf READY; exec ${then}`],
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
        cols: 80,
        rows: 24,
      });
      let out = "";
      p.onData((c) => (out += c));
      return { p, ready: () => out.includes("READY") };
    };
    const size = 2 * 1024 * 1024;
    const s = spawnRaw("sleep 30");
    const r = spawnRaw("cat > /dev/null");
    const stuck = s.p;
    const reader = r.p;
    try {
      await waitFor(() => s.ready() && r.ready(), 5000);
      expect(stuck.pendingWriteBytes?.()).toBe(0);
      expect(reader.pendingWriteBytes?.()).toBe(0);
      stuck.write(new Uint8Array(size).fill(0x61));
      reader.write(new Uint8Array(size).fill(0x61));
      await new Promise((r) => setTimeout(r, 100));
      const pending = stuck.pendingWriteBytes?.();
      expect(pending).toBeTypeOf("number");
      // カーネルの受け口（数 KiB〜数十 KiB）の分だけ減る。
      expect(pending!).toBeGreaterThan(size - 256 * 1024);
      expect(pending!).toBeLessThanOrEqual(size);
      await waitFor(() => reader.pendingWriteBytes?.() === 0, 5000);
      expect(reader.pendingWriteChunks?.()).toBe(0);

      // 上限の判定を通らない書き込みだけが続いても、覚えた長さは詰め直される（T11 の点検）。
      const readerSent = (reader as unknown as { sent: SentLengths }).sent;
      for (let i = 0; i < 1500; i++) reader.write("z");
      await waitFor(() => (internalQueueOf(reader) as unknown[]).length === 0, 5000);
      reader.write("z"); // 覚えた件数が 1024 を超えているので、この書き込みで詰め直す
      expect(readerSent.remembered()).toBeLessThanOrEqual(2);

      // 小さな書き込みを大量に（review ラウンド 1 の must・decisions D9）: 件数は 1 回の write ごとに 1 件で、O(1) の数え方が node-pty の待ちの全件の走査と一致する。
      const internalQueue = () =>
        (stuck as unknown as { pty: { _writeStream: { _writeQueue: unknown } } }).pty._writeStream
          ._writeQueue;
      const before = stuck.pendingWriteChunks?.() ?? 0;
      // "xy"（2）・"あ"（UTF-8 で 3）・1 バイトを 3000 回。
      for (let i = 0; i < 3000; i++)
        stuck.write(i % 3 === 0 ? "xy" : i % 3 === 1 ? "あ" : new Uint8Array([0x61]));
      expect(stuck.pendingWriteChunks?.()).toBe(before + 3000);
      expect(stuck.pendingWriteBytes?.()).toBe(sumPendingChunks(internalQueue()));
      expect(stuck.pendingWriteBytes?.()).toBe(pending! + 6000);
      // O(1) の道（覚えた長さ）で出せていること（全件の走査に戻っていない）。
      const q = internalQueue() as { offset: number }[];
      const sent = (stuck as unknown as { sent: SentLengths }).sent;
      expect(sent.reconcile(q.length, q[0]!.offset)).toBe(pending! + 6000);
    } finally {
      stuck.kill();
      reader.kill();
    }
  }, 15_000);

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

function internalQueueOf(p: unknown): unknown {
  return (p as { pty: { _writeStream: { _writeQueue: unknown } } }).pty._writeStream._writeQueue;
}

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

describe("sumPendingChunks（node-pty の書き込み待ちの列。20260927-server-size-input-limits）", () => {
  it("各要素の buffer の残り（byteLength - offset）を足す", () => {
    expect(sumPendingChunks([])).toBe(0);
    expect(
      sumPendingChunks([
        { buffer: Buffer.alloc(10), offset: 3 },
        { buffer: Buffer.alloc(5), offset: 0 },
      ]),
    ).toBe(12);
  });

  it("形が違えば undefined（測れない＝捨てない側に倒す）", () => {
    expect(sumPendingChunks(undefined)).toBeUndefined();
    expect(sumPendingChunks({ length: 1 })).toBeUndefined();
    expect(sumPendingChunks([{ buffer: "abc", offset: 0 }])).toBeUndefined();
    expect(sumPendingChunks([{ buffer: Buffer.alloc(3) }])).toBeUndefined();
    expect(sumPendingChunks([null])).toBeUndefined();
  });
});

describe("SentLengths（node-pty の待ちを O(1) で数える。decisions D9）", () => {
  it("待ちの件数との差で書き終えた先頭を捨て、先頭の offset を引く", () => {
    const s = new SentLengths();
    s.push(10);
    s.push(0); // 空の書き込みは node-pty も積まない
    s.push(5);
    s.push(7);
    expect(s.reconcile(3, 0)).toBe(22);
    expect(s.reconcile(3, 4)).toBe(18); // 先頭が 4 バイト書けた
    expect(s.reconcile(2, 1)).toBe(11); // 先頭の 10 を書き終え、次の 5 が 1 バイト書けた
    expect(s.reconcile(0, 0)).toBe(0);
    s.push(3);
    expect(s.reconcile(1, 0)).toBe(3);
  });

  it("待ちの方が多い（覚えていない書き込みがある）なら undefined（全件の走査に戻す）", () => {
    const s = new SentLengths();
    s.push(4);
    expect(s.reconcile(2, 0)).toBeUndefined();
  });

  it("書き終えた分を捨て続けても覚えた長さが際限なく増えない（詰め直す）", () => {
    const s = new SentLengths();
    for (let i = 0; i < 5000; i++) {
      s.push(1);
      expect(s.reconcile(1, 0)).toBe(1);
    }
    expect((s as unknown as { lengths: number[] }).lengths.length).toBeLessThan(2100);
  });
});

describe("windowsSocketChunks（Windows の入力の socket の待ちの件数。実機では確かめていない）", () => {
  const pty = (state: unknown) => ({ _agent: { inSocket: { _writableState: state } } });
  it("buffered の残りの件数に、書いている途中（writing）の 1 件を足す", () => {
    expect(windowsSocketChunks(pty({ buffered: [1, 2, 3], bufferedIndex: 1, writing: true }))).toBe(
      3,
    );
    expect(windowsSocketChunks(pty({ buffered: [1, 2], bufferedIndex: 0, writing: false }))).toBe(
      2,
    ); // cork 中等
    expect(windowsSocketChunks(pty({ buffered: [], bufferedIndex: 0, writing: false }))).toBe(0);
    expect(windowsSocketChunks(pty({ buffered: [], bufferedIndex: 0, writing: true }))).toBe(1);
  });
  it("形が違えば undefined", () => {
    expect(windowsSocketChunks({})).toBeUndefined();
    expect(windowsSocketChunks(pty({ buffered: "x", bufferedIndex: 0 }))).toBeUndefined();
    expect(windowsSocketChunks(pty({ buffered: [], bufferedIndex: "0" }))).toBeUndefined();
  });
});
