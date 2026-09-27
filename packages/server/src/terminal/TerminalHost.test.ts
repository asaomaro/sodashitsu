import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PtyProcess } from "../pty/PtyBackend.js";
import { DefaultTerminalHost } from "./TerminalHost.js";
import { encodePng } from "./png.js";

/**
 * `writeModal` と送信中の入力の後回し（20260926-agent-prompt-send-keys design.md「`TerminalHost.writeModal` と後回し」）。
 * 偽の PTY の出力をミラーへ流してモードを切り替え、書き込みを記録する。時間はフェイクタイマーで進める
 * （ミラー〔@xterm/headless〕の書き込みの処理もタイマーで進むので、`advanceTimersByTimeAsync` で一緒に進める）。
 */
class FakePty implements PtyProcess {
  readonly pid = 1;
  readonly writes: string[] = [];
  private readonly dataCbs = new Set<(chunk: string) => void>();
  private readonly exitCbs = new Set<(e: { exitCode: number }) => void>();
  onData(cb: (chunk: string) => void) {
    this.dataCbs.add(cb);
    return { dispose: () => this.dataCbs.delete(cb) };
  }
  onExit(cb: (e: { exitCode: number }) => void) {
    this.exitCbs.add(cb);
    return { dispose: () => this.exitCbs.delete(cb) };
  }
  write(data: string | Uint8Array): void {
    this.writes.push(typeof data === "string" ? data : new TextDecoder().decode(data));
  }
  readonly resizes: unknown[][] = [];
  resize(...args: unknown[]): void {
    this.resizes.push(args);
  }
  pause(): void {}
  resume(): void {}
  kill(): void {}
  /** アプリの出力（ミラーへ流れる）。 */
  output(chunk: string): void {
    for (const cb of [...this.dataCbs]) cb(chunk);
  }
  exit(code: number): void {
    for (const cb of [...this.exitCbs]) cb({ exitCode: code });
  }
}

function setup(): { pty: FakePty; host: DefaultTerminalHost } {
  const pty = new FakePty();
  const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);
  return { pty, host };
}

const PROMPT = { build: () => ["TEXT", "\r"], delayMs: 300 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DefaultTerminalHost.writeModal", () => {
  it("モード付き入力が無いときの write は、今までどおり即座に（同期で）書く", () => {
    const { pty, host } = setup();
    host.write("a");
    host.write(new TextEncoder().encode("b"));
    expect(pty.writes).toEqual(["a", "b"]);
    host.dispose();
  });

  it("部分の間に delayMs を置く: 本文の後 299ms では Enter が無く、300ms で書かれてから解決する（AC2）", async () => {
    const { pty, host } = setup();
    let resolved = false;
    const done = host.writeModal(PROMPT).then(() => (resolved = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(pty.writes).toEqual(["TEXT"]);
    await vi.advanceTimersByTimeAsync(299);
    expect(pty.writes).toEqual(["TEXT"]);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(pty.writes).toEqual(["TEXT", "\r"]);
    expect(resolved).toBe(true);
    host.dispose();
  });

  it("送信中に届いた write は Enter の後に元の順序で書かれ、終わった後の write は即座に書かれる（AC3）", async () => {
    const { pty, host } = setup();
    const done = host.writeModal(PROMPT);
    host.write("x"); // flush を待っている間
    await vi.advanceTimersByTimeAsync(100);
    host.write("y"); // 遅延の間
    host.write("z");
    expect(pty.writes).toEqual(["TEXT"]);
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(pty.writes).toEqual(["TEXT", "\r", "x", "y", "z"]);
    host.write("after");
    expect(pty.writes.at(-1)).toBe("after");
    host.dispose();
  });

  it("build は送る瞬間のモードで呼ばれる: 直前の出力の bracketed paste の切り替えも flush してから読む（AC1）", async () => {
    const { pty, host } = setup();
    const seen: boolean[] = [];
    const build = (modes: { bracketedPaste: boolean }) => {
      seen.push(modes.bracketedPaste);
      return [modes.bracketedPaste ? "WRAPPED" : "PLAIN"];
    };
    pty.output("\x1b[?2004h"); // 書いた直後（ミラーの処理前）に送る
    const first = host.writeModal({ build, delayMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await first;
    pty.output("\x1b[?2004l");
    const second = host.writeModal({ build, delayMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await second;
    expect(seen).toEqual([true, false]);
    expect(pty.writes).toEqual(["WRAPPED", "PLAIN"]);
    host.dispose();
  });

  it("送信中に来た別のモード付き入力は、それまでに後回しにした入力の後で、順番に処理される", async () => {
    const { pty, host } = setup();
    const a = host.writeModal({ build: () => ["A1", "A2"], delayMs: 300 });
    host.write("raw");
    const b = host.writeModal({ build: () => ["B1", "B2"], delayMs: 300 });
    host.write("raw2");
    await vi.advanceTimersByTimeAsync(700);
    await Promise.all([a, b]);
    expect(pty.writes).toEqual(["A1", "A2", "raw", "B1", "B2", "raw2"]);
    host.dispose();
  });

  it("送信中に破棄されたら reject し、残りの部分は書かず、後回しの入力を捨て、以後の write は即座に書く", async () => {
    const { pty, host } = setup();
    const a = host.writeModal(PROMPT);
    const aResult = a.catch((e: Error) => e.message);
    host.write("queued");
    const b = host.writeModal({ build: () => ["B"], delayMs: 0 });
    const bResult = b.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.getTimerCount()).toBeGreaterThan(0); // Enter までの待ち
    host.dispose();
    expect(vi.getTimerCount()).toBe(0); // 待ちのタイマーを解除した
    expect(await aResult).toBe("terminal closed");
    expect(await bResult).toBe("terminal closed");
    await vi.advanceTimersByTimeAsync(1000);
    expect(pty.writes).toEqual(["TEXT"]);
    host.write("late");
    expect(pty.writes).toEqual(["TEXT", "late"]);
    await expect(host.writeModal(PROMPT)).rejects.toThrow("terminal closed");
  });

  it("flush を待っている間に PTY が終了したら reject し、何も書かない", async () => {
    const { pty, host } = setup();
    const a = host.writeModal(PROMPT).catch((e: Error) => e.message);
    pty.exit(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await a).toBe("terminal closed");
    expect(pty.writes).toEqual([]);
    host.dispose();
  });

  it("build が投げたら reject し、後回しの入力はそのまま処理を続ける", async () => {
    const { pty, host } = setup();
    const a = host
      .writeModal({
        build: () => {
          throw new Error("boom");
        },
        delayMs: 0,
      })
      .catch((e: Error) => e.message);
    host.write("next");
    await vi.advanceTimersByTimeAsync(0);
    expect(await a).toBe("boom");
    expect(pty.writes).toEqual(["next"]);
    host.write("free");
    expect(pty.writes).toEqual(["next", "free"]);
    host.dispose();
  });
});

describe("DefaultTerminalHost.resize（20260926-kitty-graphics の AC8）", () => {
  it("PTY に基準のセル 9×17 で計った画素の大きさも渡し、ミラーの大きさも変える", () => {
    const { pty, host } = setup();
    host.resize(120, 40);
    expect(pty.resizes).toEqual([[120, 40, { width: 120 * 9, height: 40 * 17 }]]);
    expect(host.mirror.serialize(0)).toMatchObject({ cols: 120, rows: 40 });
    host.dispose();
  });

  it("0 以下の大きさでは、PTY と同じく下限 1 セルとして画素を計る", () => {
    const { pty, host } = setup();
    host.resize(0, 0);
    expect(pty.resizes).toEqual([[0, 0, { width: 9, height: 17 }]]);
    host.dispose();
  });
});

describe("DefaultTerminalHost と Kitty graphics（20260926-kitty-graphics の AC1・AC3・AC7・AC12）", () => {
  /** 18×34 画素（基準のセル 9×17 で 2×2 セル）の PNG の base64。 */
  const PNG_B64 = Buffer.from(encodePng(new Uint8Array(18 * 34 * 4), 18, 34, 4)).toString("base64");
  const apc = (control: string, payload?: string): string =>
    `\x1b_G${control}${payload !== undefined ? `;${payload}` : ""}\x1b\\`;

  function capture(host: DefaultTerminalHost): { client: string[]; mirror: string[] } {
    const client: string[] = [];
    const mirror: string[] = [];
    const push = host.fanout.push.bind(host.fanout);
    vi.spyOn(host.fanout, "push").mockImplementation((chunk: Uint8Array) => {
      client.push(new TextDecoder().decode(chunk));
      push(chunk);
    });
    const write = host.mirror.write.bind(host.mirror);
    vi.spyOn(host.mirror, "write").mockImplementation((chunk: string, done?: () => void) => {
      mirror.push(chunk);
      write(chunk, done);
    });
    return { client, mirror };
  }

  it("画像はブラウザへ iTerm2 形式、ミラーへ同じだけのカーソル移動として渡り、画像の後のカーソルは 2 行目の 2 列右（CPR で確かめる）", async () => {
    const { pty, host } = setup();
    const { client, mirror } = capture(host);
    pty.output(`\x1b[5;3HA${apc("a=T,f=100,i=1", PNG_B64)}\x1b[6n`);
    await vi.advanceTimersByTimeAsync(10);
    const toClient = client.join("");
    expect(toClient).toContain("\x1b]1337;File=inline=1;size=");
    expect(toClient).toContain(";width=2;height=2;preserveAspectRatio=0:");
    expect(toClient).not.toContain("\x1b_G");
    expect(mirror.join("")).toBe("\x1b[5;3HA\x1bD\x1b[2C\x1b[6n");
    // A を書いた後の列は 4。画像（2×2）の後は 1 行下・2 列右＝ 6 行目の 6 列目。Kitty の OK はそれより前の出力の後、CPR より先。
    expect(pty.writes).toEqual(["\x1b_Gi=1;OK\x1b\\", "\x1b[6;6R"]);
    host.dispose();
  });

  it("LNM（CSI 20 h）が有効でも、ミラーの画像の後のカーソルの列は画像の左端から数える（ブラウザの addon と同じ）", async () => {
    const { pty, host } = setup();
    pty.output(`\x1b[20h\x1b[5;3HA${apc("a=T,f=100", PNG_B64)}\x1b[6n`);
    await vi.advanceTimersByTimeAsync(10);
    expect(pty.writes).toEqual(["\x1b[6;6R"]);
    host.dispose();
  });

  it("応答は、同じ出力で先に来た問い合わせ（DA1）へのミラーの応答を追い越さない（decisions D6）", async () => {
    const { pty, host } = setup();
    pty.output(`\x1b[c${apc("a=q,i=31,s=1,v=1,f=24", "AAAA")}`);
    await vi.advanceTimersByTimeAsync(10);
    expect(pty.writes).toEqual(["\x1b[?1;2c", "\x1b_Gi=31;OK\x1b\\"]);
    host.dispose();
  });

  it("画像を含まない出力は、割れた ESC も含め、元の文字列のままミラーとブラウザの両方へ渡る", async () => {
    const { pty, host } = setup();
    const { client, mirror } = capture(host);
    for (const chunk of ["hello \x1b", "[31mred\x1b_", "Xignored\x1b\\", "\x1b]0;t\x07end"])
      pty.output(chunk);
    await vi.advanceTimersByTimeAsync(10);
    expect(client).toEqual(["hello \x1b", "[31mred\x1b_", "Xignored\x1b\\", "\x1b]0;t\x07end"]);
    expect(mirror).toEqual(client);
    expect(pty.writes).toEqual([]);
    host.dispose();
  });

  it("応答を返す前に破棄されたら PTY へ書かない", async () => {
    const { pty, host } = setup();
    pty.output(apc("a=q,i=1"));
    host.dispose();
    await vi.advanceTimersByTimeAsync(10);
    expect(pty.writes).toEqual([]);
  });
});
