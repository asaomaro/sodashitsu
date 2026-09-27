import { TERMINAL_PALETTES, type MethodName, type ParamsOf, type ResultOf } from "@sodashitsu/protocol";
import type { ITerminalAddon, ITheme } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyInputController } from "../keys/KeyInputController.js";
import { KeyRouter, type KeyRouterClock } from "../keys/KeyRouter.js";
import { DEFAULT_KEYMAP } from "../keys/keymap.js";
import type { ConnectionPort } from "../net/ports.js";
import { MouseBridge } from "./MouseBridge.js";
import { RendererPool, type WebglAddonLike } from "./RendererPool.js";
import { TerminalRegistry } from "./TerminalRegistry.js";
import { toXtermTheme } from "./theme.js";

function realClock(): KeyRouterClock {
  return { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
}

function makeConnection(): ConnectionPort & { sentInput: [string, string | Uint8Array][]; requests: [MethodName, unknown][] } {
  return {
    sentInput: [],
    requests: [],
    sendInput(paneId, bytes) {
      this.sentInput.push([paneId, bytes]);
    },
    request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return Promise.resolve({} as ResultOf<M>);
    },
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}

class FakeWebglAddon implements WebglAddonLike {
  activate(): void {}
  dispose(): void {}
  onContextLoss(): { dispose(): void } {
    return { dispose: () => undefined };
  }
}

function makeRegistry(opts: {
  capacity: number;
  now?: () => number;
  hasSizeAuthority?: (paneId: string) => boolean;
  getScrollbackLines?: () => number;
  getTheme?: () => ITheme;
  createImageAddon?: () => ITerminalAddon | null;
  onImagePaste?: (paneId: string, blob: Blob) => void;
}) {
  const conn = makeConnection();
  const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
  const keys = new KeyInputController(router, conn);
  const renderers = new RendererPool({ capacity: 100, createWebglAddon: () => new FakeWebglAddon() });
  const mouseBridges: MouseBridge[] = [];
  const registry = new TerminalRegistry({
    capacity: opts.capacity,
    conn,
    renderers,
    keys,
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.onImagePaste ? { onImagePaste: opts.onImagePaste } : {}),
    ...(opts.hasSizeAuthority ? { hasSizeAuthority: opts.hasSizeAuthority } : {}),
    ...(opts.getScrollbackLines ? { getScrollbackLines: opts.getScrollbackLines } : {}),
    ...(opts.getTheme ? { getTheme: opts.getTheme } : {}),
    ...(opts.createImageAddon ? { createImageAddon: opts.createImageAddon } : {}),
    createMouseBridge: (term, paneId) => {
      const bridge = new MouseBridge({ term, paneId, ui: { toast: () => undefined, openContextMenu: () => undefined }, getRightClickTarget: () => "herdr" });
      mouseBridges.push(bridge);
      return bridge;
    },
  });
  return { registry, conn, renderers, mouseBridges };
}

describe("TerminalRegistry", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("acquire: 無ければ作り、pane.subscribe を予約する", () => {
    const { registry } = makeRegistry({ capacity: 24 });
    const entry = registry.acquire("p1");
    expect(entry.paneId).toBe("p1");
    expect(registry.takePendingSubscriptions(["p1"])).toEqual(["p1"]);
    entry.term.dispose();
  });

  // 20260921-theme-settings：作るときの配色と、開いている端末の入れ替え（AC2・AC-I5）。
  describe("テーマ", () => {
    it("作るときは、そのときの getTheme の配色（替えた後に作る端末は新しい配色）。省けば既定（dracula）", () => {
      let current = toXtermTheme(TERMINAL_PALETTES["catppuccin-latte"]);
      const { registry } = makeRegistry({ capacity: 24, getTheme: () => current });
      const p1 = registry.acquire("p1");
      expect(p1.term.options.theme).toMatchObject({ background: "#eff1f5", foreground: "#4c4f69" });
      current = toXtermTheme(TERMINAL_PALETTES.nord);
      const p2 = registry.acquire("p2");
      expect(p2.term.options.theme).toMatchObject({ background: "#2e3440" });
      const b = makeRegistry({ capacity: 24 }).registry.acquire("p1");
      expect(b.term.options.theme).toMatchObject({ background: "#282a36", foreground: "#f8f8f2" });
      for (const t of [p1.term, p2.term, b.term]) t.dispose();
    });

    it("setTheme は隠れている端末も含めて options.theme だけを替え、端末を作り直さず中身を保つ。dracula に戻すと選択の色は既定に戻る", async () => {
      const { registry } = makeRegistry({ capacity: 24 });
      const p1 = registry.acquire("p1");
      const p2 = registry.acquire("p2");
      registry.release("p2"); // 隠れている（LRU に残っている）端末
      const term1 = p1.term;
      await new Promise<void>((resolve) => term1.write("keep-this", resolve));
      registry.setTheme(toXtermTheme(TERMINAL_PALETTES.nord));
      expect(registry.get("p1")?.term).toBe(term1); // 作り直していない
      expect(term1.buffer.active.getLine(0)?.translateToString(true)).toBe("keep-this"); // 中身を保つ
      expect(p1.term.options.theme).toMatchObject({ background: "#2e3440", selectionForeground: "#2e3440" });
      expect(p2.term.options.theme).toMatchObject({ background: "#2e3440" });
      registry.setTheme(toXtermTheme());
      expect(p1.term.options.theme).toMatchObject({ background: "#282a36" });
      expect(p1.term.options.theme).not.toHaveProperty("selectionBackground");
      expect(p1.term.options.theme).not.toHaveProperty("selectionForeground");
      p1.term.dispose();
      p2.term.dispose();
    });
  });

  // 20260920-agent-notifications の AC3：知らせる直前に「その pane を見ているか」を引く口。
  describe("isVisible（通知の抑止に使う）", () => {
    it("acquire で表示中になり、release で外れる", () => {
      const { registry } = makeRegistry({ capacity: 24 });
      expect(registry.isVisible("p1")).toBe(false); // 作る前
      const entry = registry.acquire("p1");
      expect(registry.isVisible("p1")).toBe(true);
      registry.release("p1");
      expect(registry.isVisible("p1")).toBe(false); // 端末は生きているが、画面には出ていない
      expect(registry.get("p1")).toBeDefined();
      entry.term.dispose();
    });

    it("知らない pane は表示中ではない", () => {
      const { registry } = makeRegistry({ capacity: 24 });
      expect(registry.isVisible("missing")).toBe(false);
    });

    it("複数を開いていれば、それぞれ独立に判定する（分割している tab）", () => {
      const { registry } = makeRegistry({ capacity: 24 });
      const p1 = registry.acquire("p1");
      const p2 = registry.acquire("p2");
      registry.release("p1");
      expect(registry.isVisible("p1")).toBe(false);
      expect(registry.isVisible("p2")).toBe(true);
      p1.term.dispose();
      p2.term.dispose();
    });
  });

  it("acquire: 既にあれば同じ entry を返し、再購読しない", () => {
    const { registry } = makeRegistry({ capacity: 24 });
    const first = registry.acquire("p1");
    registry.takePendingSubscriptions(["p1"]);
    const second = registry.acquire("p1");
    expect(second).toBe(first);
    expect(registry.takePendingSubscriptions(["p1"])).toEqual([]);
    first.term.dispose();
  });

  describe("接続が替わったときの購読し直し（D107：サーバは接続ごとに新しい clientId に購読を持つ）", () => {
    it("markAllUnsubscribed の後は、生きている端末を表示したときに購読し直す（xterm.js は作り直さない）", () => {
      const { registry } = makeRegistry({ capacity: 24 });
      const p1 = registry.acquire("p1");
      const p2 = registry.acquire("p2");
      expect(registry.takePendingSubscriptions(["p1", "p2"])).toEqual(["p1", "p2"]);
      expect(registry.takePendingSubscriptions(["p1", "p2"])).toEqual([]); // 同じ接続では 2 度送らない

      registry.markAllUnsubscribed(); // 新しい接続の hello が通った
      expect(registry.takePendingSubscriptions(["p1", "p2"])).toEqual(["p1", "p2"]);
      expect(registry.get("p1")).toBe(p1);
      expect(registry.get("p2")).toBe(p2);
      p1.term.dispose();
      p2.term.dispose();
    });

    it("隠れている端末は、次に表示されるまで購読しない（再接続の直後に LRU の全部の SNAPSHOT を取り寄せない）", () => {
      const { registry } = makeRegistry({ capacity: 24 });
      registry.acquire("p1");
      registry.acquire("p2");
      registry.takePendingSubscriptions(["p1", "p2"]);
      registry.release("p2"); // 別の tab へ移って隠れた（LRU には残る）

      registry.markAllUnsubscribed();
      expect(registry.takePendingSubscriptions(["p1"])).toEqual(["p1"]);
      // p2 はまだ未購読のまま残っている——表示されたら購読する。
      registry.acquire("p2");
      expect(registry.takePendingSubscriptions(["p2"])).toEqual(["p2"]);
    });

    it("破棄した端末は、未購読の印も消す（後で同じ id を表示しても、新しく作った分として 1 回だけ購読する）", async () => {
      const { registry } = makeRegistry({ capacity: 1 });
      registry.acquire("p1");
      registry.takePendingSubscriptions(["p1"]);
      registry.release("p1");
      registry.markAllUnsubscribed();
      registry.acquire("p2"); // 容量 1：隠れた p1 は破棄される
      expect(registry.get("p1")).toBeUndefined();
      expect(registry.takePendingSubscriptions(["p1", "p2"])).toEqual(["p2"]);
    });
  });

  it("term.onData は ConnectionPort.sendInput(paneId, …) につながる", async () => {
    const { registry, conn } = makeRegistry({ capacity: 24 });
    const entry = registry.acquire("p1");
    entry.term.input("a", false); // xterm.js の内部から onData を発火させる公開 API
    await new Promise((r) => setTimeout(r, 0));
    expect(conn.sentInput).toEqual([["p1", "a"]]);
    entry.term.dispose();
  });

  it("setInputEnabled(false) の間は入力を送らず、true に戻すと再び送る（D95：切断中は入力を止める）", async () => {
    const { registry, conn } = makeRegistry({ capacity: 24 });
    const entry = registry.acquire("p1");
    registry.setInputEnabled(false);
    entry.term.input("a", true);
    entry.term.paste("pasted");
    await new Promise((r) => setTimeout(r, 0));
    expect(conn.sentInput).toEqual([]);

    registry.setInputEnabled(true);
    entry.term.input("b", true);
    await new Promise((r) => setTimeout(r, 0));
    expect(conn.sentInput).toEqual([["p1", "b"]]);
    entry.term.dispose();
  });

  it("入力を止めている間に作った xterm.js も止まった状態で始まり、disableStdin（readOnly）は使わない（D95）", async () => {
    const { registry, conn } = makeRegistry({ capacity: 24 });
    registry.setInputEnabled(false);
    const entry = registry.acquire("p2");
    expect(entry.term.options.disableStdin).toBe(false); // モバイルのソフトキーボードを閉じさせない
    entry.term.input("a", true);
    await new Promise((r) => setTimeout(r, 0));
    expect(conn.sentInput).toEqual([]);
    entry.term.dispose();
  });

  it("フォーカスの報告（CSI I/O）はサイズ権限を持たないクライアントでは送らない", async () => {
    const { registry, conn } = makeRegistry({ capacity: 24, hasSizeAuthority: () => false });
    const entry = registry.acquire("p1");
    await new Promise<void>((resolve) => entry.term.write("\x1b[?1004h", () => resolve()));
    entry.term.input("\x1b[I", false);
    entry.term.input("a", false);
    await new Promise((r) => setTimeout(r, 0));
    expect(conn.sentInput).toEqual([["p1", "a"]]); // フォーカス報告だけ抜けている
    entry.term.dispose();
  });

  it("サイズ権限を持つクライアントではフォーカスの報告も送る", async () => {
    const { registry, conn } = makeRegistry({ capacity: 24, hasSizeAuthority: () => true });
    const entry = registry.acquire("p1");
    await new Promise<void>((resolve) => entry.term.write("\x1b[?1004h", () => resolve()));
    entry.term.input("\x1b[I", false);
    await new Promise((r) => setTimeout(r, 0));
    // xterm.js は開いた直後の内部状態から余分な "\x1b[O" を 1 回出すことがある（実測）ので、
    // 「意図的に送った \x1b[I が含まれる」ことだけを確かめる（サイズ権限が無いケースとの非対称を見る）。
    expect(conn.sentInput).toContainEqual(["p1", "\x1b[I"]);
    entry.term.dispose();
  });

  it("get: 副作用が無い（作らない）", () => {
    const { registry } = makeRegistry({ capacity: 24 });
    expect(registry.get("p1")).toBeUndefined();
    registry.acquire("p1");
    expect(registry.get("p1")?.paneId).toBe("p1");
  });

  it("release: 表示から外すが保持は続ける（LRU の対象になるだけ）", () => {
    const { registry } = makeRegistry({ capacity: 24 });
    const entry = registry.acquire("p1");
    registry.release("p1");
    expect(registry.get("p1")).toBe(entry); // まだ保持している
  });

  it("evictIfNeeded: 容量超過で表示していない最古のものを破棄し pane.unsubscribe を送る", async () => {
    const { registry, conn } = makeRegistry({ capacity: 2 });
    registry.acquire("p1");
    registry.release("p1"); // 表示していない・最古
    registry.acquire("p2");
    registry.release("p2");
    registry.acquire("p3"); // 3 つ目で容量超過（表示中）
    await new Promise((r) => setTimeout(r, 0));
    expect(registry.get("p1")).toBeUndefined(); // 破棄された
    expect(registry.get("p2")).toBeDefined();
    expect(registry.get("p3")).toBeDefined();
    expect(conn.requests).toContainEqual(["pane.unsubscribe", { paneId: "p1" }]);
  });

  it("evictIfNeeded: 表示中のものは破棄しない（容量を超えたままでも）", () => {
    const { registry } = makeRegistry({ capacity: 1 });
    registry.acquire("p1"); // 表示中
    registry.acquire("p2"); // 表示中（p1 も表示中なので破棄されない）
    expect(registry.get("p1")).toBeDefined();
    expect(registry.get("p2")).toBeDefined();
  });

  it("focus: 該当 pane の term.focus を呼ぶ", () => {
    const { registry } = makeRegistry({ capacity: 24 });
    const entry = registry.acquire("p1");
    const spy = vi.spyOn(entry.term, "focus");
    registry.focus("p1");
    expect(spy).toHaveBeenCalled();
  });

  it("onOutput/onSnapshot/onSizeChanged は該当 pane の term に反映する", async () => {
    const { registry } = makeRegistry({ capacity: 24 });
    const entry = registry.acquire("p1");
    registry.onSnapshot("p1", 80, 24, "hello");
    await new Promise<void>((resolve) => entry.term.write("", () => resolve()));
    expect(entry.term.cols).toBe(80);
    expect(entry.term.rows).toBe(24);
    expect(entry.term.buffer.active.getLine(0)?.translateToString(true)).toBe("hello");

    registry.onOutput("p1", new TextEncoder().encode(" world"));
    await new Promise<void>((resolve) => entry.term.write("", () => resolve()));
    expect(entry.term.buffer.active.getLine(0)?.translateToString(true)).toBe("hello world");

    registry.onSizeChanged("p1", 40, 10);
    expect(entry.term.cols).toBe(40);
    expect(entry.term.rows).toBe(10);
  });

  it("onSnapshot: まだ処理していない書き込みが残っていても、SNAPSHOT の前の古い出力を重ねない（D107：消すのは書き込みの列の中で行う）", async () => {
    const { registry } = makeRegistry({ capacity: 24 });
    const entry = registry.acquire("p1");
    registry.onSnapshot("p1", 80, 24, "first");
    await new Promise<void>((resolve) => entry.term.write("", () => resolve()));

    // 切断の前に届いた出力（xterm.js はまだ処理していない）の直後に、再接続の SNAPSHOT が届く。SNAPSHOT は、その出力を
    // 含むサーバのミラーの画面そのもの。`term.reset()` をその場で呼ぶと、残っていた書き込みが消した後の画面に流れ込み、
    // SNAPSHOT の前に古い行が重なっていた。
    registry.onOutput("p1", new TextEncoder().encode("\r\nold-line-1\r\nold-line-2"));
    registry.onSnapshot("p1", 80, 24, "first\r\nold-line-1\r\nold-line-2");
    registry.onOutput("p1", new TextEncoder().encode("\r\nnew-line")); // SNAPSHOT の後の出力（溜め置き・以後の OUTPUT）
    await new Promise<void>((resolve) => entry.term.write("", () => resolve()));

    const buffer = entry.term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
    expect(lines.filter((l) => l !== "")).toEqual(["first", "old-line-1", "old-line-2", "new-line"]);
    expect(entry.term.cols).toBe(80);
    expect(entry.term.rows).toBe(24);
  });

  it("onSnapshot: SNAPSHOT の大きさにしてから書き、scrollback も SNAPSHOT のものだけにする（切断の前の scrollback と重ねない）", async () => {
    const { registry } = makeRegistry({ capacity: 24 });
    const entry = registry.acquire("p1");
    const before = Array.from({ length: 40 }, (_, i) => `before-${i}`).join("\r\n");
    registry.onSnapshot("p1", 80, 10, before);
    await new Promise<void>((resolve) => entry.term.write("", () => resolve()));
    expect(entry.term.buffer.active.length).toBeGreaterThan(10); // scrollback がある

    const restored = Array.from({ length: 30 }, (_, i) => `restored-${i}`).join("\r\n");
    registry.onSnapshot("p1", 60, 12, restored);
    await new Promise<void>((resolve) => entry.term.write("", () => resolve()));
    const buffer = entry.term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
    expect(lines.filter((l) => l !== "")).toEqual(Array.from({ length: 30 }, (_, i) => `restored-${i}`));
    expect(entry.term.cols).toBe(60);
    expect(entry.term.rows).toBe(12);
  });

  it("xterm.js は pane.subscribe で求める行数（getScrollbackLines）の scrollback で作る。SNAPSHOT の scrollback を 1,000 行で切らない（D107）", async () => {
    let lines = 5000;
    const { registry } = makeRegistry({ capacity: 24, getScrollbackLines: () => lines });
    const entry = registry.acquire("p1");
    expect(entry.term.options.scrollback).toBe(5000);

    // 3,000 行の scrollback を持つ SNAPSHOT（以前は xterm.js の既定の 1,000 行を超える分を捨てていた）。
    const text = Array.from({ length: 3000 + 24 }, (_, i) => `line-${i}`).join("\r\n");
    registry.onSnapshot("p1", 80, 24, text);
    await new Promise<void>((resolve) => entry.term.write("", () => resolve()));
    expect(entry.term.buffer.active.getLine(0)?.translateToString(true)).toBe("line-0");
    expect(entry.term.buffer.active.length).toBe(3000 + 24);

    lines = 10000; // 作るときの値を使う（`--scrollback 10000` のサーバ・モバイルの 1,000 も同じ口）
    expect(registry.acquire("p2").term.options.scrollback).toBe(10000);
  });

  it("getScrollbackLines を省くと xterm.js の既定（1,000 行）のまま", () => {
    const { registry } = makeRegistry({ capacity: 24 });
    expect(registry.acquire("p1").term.options.scrollback).toBe(1000);
    expect(registry.get("p1")?.scrollback, "作ったときの行数は無い（購読は getScrollbackLines を使う）").toBeUndefined();
  });

  // 20260921-herdr-settings-gaps の D6：購読（`ViewSync`）は作ったときの行数を使う。**後から設定が変わっても、
  // 既に作った端末の値は変わらない**（xterm の容量と SNAPSHOT に求める行数を食い違わせない）。
  it("作ったときの行数を持ち、後から getScrollbackLines が変わっても変えない", () => {
    let lines = 2000;
    const { registry } = makeRegistry({ capacity: 24, getScrollbackLines: () => lines });
    registry.acquire("p1");
    lines = 5000;
    expect(registry.get("p1")?.scrollback).toBe(2000);
    expect(registry.get("p1")?.term.options.scrollback).toBe(2000);
    registry.acquire("p2");
    expect(registry.get("p2")?.scrollback, "新しく作る端末には新しい値").toBe(5000);
  });

  it("存在しない pane への onOutput/onSnapshot/onSizeChanged は例外を投げない（破棄済み・未購読）", () => {
    const { registry } = makeRegistry({ capacity: 24 });
    expect(() => {
      registry.onOutput("ghost", new Uint8Array());
      registry.onSnapshot("ghost", 1, 1, "");
      registry.onSizeChanged("ghost", 1, 1);
    }).not.toThrow();
  });
});

/** xterm.js の問い合わせへの応答は write のコールバックより後（マクロタスク）で届く（QueryFilter.test.ts の tick と同じ）。 */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("TerminalRegistry と画像の addon（20260926-kitty-graphics の AC6）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("作った端末に画像の addon を読み込む", () => {
    const activated: unknown[] = [];
    const { registry } = makeRegistry({
      capacity: 24,
      createImageAddon: () => ({ activate: (term) => activated.push(term), dispose: () => undefined }),
    });
    const entry = registry.acquire("p1");
    expect(activated).toEqual([entry.term]);
  });

  it("addon を作れない・読み込めないときは画像無しで端末を作る", () => {
    const { registry } = makeRegistry({
      capacity: 24,
      createImageAddon: () => {
        throw new Error("no canvas");
      },
    });
    expect(registry.acquire("p1").term).toBeDefined();
    const { registry: r2 } = makeRegistry({ capacity: 24, createImageAddon: () => null });
    expect(r2.acquire("p2").term).toBeDefined();
  });

  it("addon の activate が途中（応答するハンドラを登録した後）で投げても、端末はでき、そのハンドラの応答は握りつぶされる", async () => {
    const { registry, conn } = makeRegistry({
      capacity: 24,
      createImageAddon: () => ({
        activate: (term) => {
          term.parser.registerCsiHandler({ final: "c" }, () => {
            term.input("\x1b[?62;4c", false);
            return true;
          });
          throw new Error("activate failed");
        },
        dispose: () => undefined,
      }),
    });
    const { term } = registry.acquire("p1");
    term.write("\x1b[c");
    await tick();
    expect(conn.sentInput).toEqual([]);
  });

  it("実物の addon を読み込んだ端末からも、DA1・XTSMGRAPHICS・画素と文字数の問い合わせの応答は PTY へ送らない（応答はサーバだけ。D17）", async () => {
    const { registry, conn } = makeRegistry({ capacity: 24 });
    const { term } = registry.acquire("p1");
    term.write("\x1b[c\x1b[?1;1;0S\x1b[?2;1;0S\x1b[14t\x1b[16t\x1b[18t");
    await tick();
    expect(conn.sentInput).toEqual([]);
  });

  it("負の対照: 握りつぶしを addon より前に登録すると（以前の順序）、addon が DA1 に答えてしまう", async () => {
    const { Terminal } = await import("@xterm/xterm");
    const { installQueryFilter } = await import("./QueryFilter.js");
    const { createImageAddon } = await import("./imageAddon.js");
    const term = new Terminal({ allowProposedApi: true });
    term.open(document.createElement("div"));
    installQueryFilter(term);
    term.loadAddon(createImageAddon());
    const out: string[] = [];
    term.onData((d) => out.push(d));
    term.write("\x1b[c");
    await tick();
    expect(out.join("")).toContain("\x1b[?62;4;9;22c");
    term.dispose();
  });
});

// 20260927-multi-host-machines（T11）：マシンの切り替えで全端末を捨てる。
describe("TerminalRegistry.disposeAll", () => {
  it("全端末を捨て、購読の解除は送らない（その接続はこの後に閉じる）", () => {
    const { registry, conn } = makeRegistry({ capacity: 10 });
    registry.acquire("p1");
    registry.acquire("p2");
    registry.release("p2");
    registry.disposeAll();
    expect(registry.get("p1")).toBeUndefined();
    expect(registry.get("p2")).toBeUndefined();
    expect(registry.isVisible("p1")).toBe(false);
    expect(conn.requests.filter(([m]) => m === "pane.unsubscribe")).toEqual([]);
    // 同じ id でもう一度作ると新しい端末（前の中身を持ち越さない）
    const again = registry.acquire("p1");
    expect(registry.takePendingSubscriptions(["p1"])).toEqual(["p1"]);
    expect(again).toBeDefined();
  });
});

describe("TerminalRegistry.attachExternal（20260927-custom-command-keys の popup）", () => {
  it("付けた id の OUTPUT・SNAPSHOT・大きさの変化は外の受け手へ回り、外すと届かない。別の受け手に差し替わっていれば外さない", () => {
    const { registry } = makeRegistry({ capacity: 24 });
    const got: string[] = [];
    const sink = {
      onOutput: (id: string) => got.push(`out:${id}`),
      onSnapshot: (id: string, c: number, r: number, t: string) => got.push(`snap:${id}:${c}x${r}:${t}`),
      onSizeChanged: (id: string, c: number, r: number) => got.push(`size:${id}:${c}x${r}`),
    };
    const detach = registry.attachExternal("p9", sink);
    registry.onOutput("p9", new Uint8Array([1]));
    registry.onSnapshot("p9", 10, 5, "x");
    registry.onSizeChanged("p9", 11, 6);
    registry.onOutput("p1", new Uint8Array([1])); // 付けていない id は今までどおり（端末が無ければ捨てる）
    expect(got).toEqual(["out:p9", "snap:p9:10x5:x", "size:p9:11x6"]);
    const other = { onOutput: () => got.push("other"), onSnapshot: () => undefined, onSizeChanged: () => undefined };
    registry.attachExternal("p9", other);
    detach(); // 差し替わっているので外さない
    registry.onOutput("p9", new Uint8Array([1]));
    expect(got.at(-1)).toBe("other");
  });
});

describe("TerminalRegistry — 画像だけの貼り付け（20260927-clipboard-image-paste）", () => {
  /** xterm の textarea に paste イベントを配る（clipboardData は偽物）。 */
  function pasteInto(element: HTMLElement, data: { text: string; files: File[] }): Event {
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", {
      value: {
        getData: (t: string) => (t === "text/plain" ? data.text : ""),
        items: data.files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })),
        files: data.files,
      },
    });
    const target = element.querySelector("textarea") ?? element;
    target.dispatchEvent(ev);
    return ev;
  }
  const png = new File([new Uint8Array([0x89, 0x50])], "a.png", { type: "image/png" });

  it("テキストが無く画像があれば onImagePaste へ渡し、xterm.js には渡さない（空の貼り付けを送らない）", () => {
    const got: [string, Blob][] = [];
    const { registry, conn } = makeRegistry({ capacity: 4, onImagePaste: (p, b) => void got.push([p, b]) });
    const entry = registry.acquire("p1");
    const ev = pasteInto(entry.element, { text: "", files: [png] });
    expect(got).toEqual([["p1", png]]);
    expect(ev.defaultPrevented).toBe(true);
    expect(conn.sentInput).toEqual([]);
    entry.term.dispose();
  });

  it("テキストがあれば何もしない（xterm.js が今までどおり貼る）", () => {
    const got: unknown[] = [];
    const { registry, conn } = makeRegistry({ capacity: 4, onImagePaste: (p, b) => void got.push([p, b]) });
    const entry = registry.acquire("p1");
    const ev = pasteInto(entry.element, { text: "hello", files: [png] });
    expect(got).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
    expect(conn.sentInput.some(([, b]) => String(b).includes("hello"))).toBe(true); // xterm.js が貼った
    entry.term.dispose();
  });

  it("onImagePaste を渡さなければ listener を付けない（今までどおり）", () => {
    const { registry } = makeRegistry({ capacity: 4 });
    const entry = registry.acquire("p1");
    const ev = pasteInto(entry.element, { text: "", files: [png] });
    expect(ev.defaultPrevented).toBe(false);
    entry.term.dispose();
  });
});
