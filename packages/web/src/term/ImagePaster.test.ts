import { IMAGE_CHUNK_BYTES, IMAGE_MAX_BYTES, type MethodName } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import { InputGate } from "@sodashitsu/client-core";
import type { ConnectionPort } from "@sodashitsu/client-core";
import type { ClipboardContent } from "./clipboard.js";
import {
  bracketedOf,
  imageErrorMessage,
  ImagePaster,
  pasteBytes,
  type ImagePasterClipboard,
  type PasteTerminal,
} from "./ImagePaster.js";

type Req = [string, Record<string, unknown>];

/** 偽のサーバ：`pane.image.*` を受けて、受け取ったバイト列を覚える。 */
function makeConn(opts: { path?: string; failOn?: { method: string; code: string } } = {}) {
  const requests: Req[] = [];
  const sent: [string, string | Uint8Array][] = [];
  let received: number[] = [];
  const conn: ConnectionPort = {
    request: vi.fn(async (method: MethodName, params: unknown) => {
      requests.push([method, params as Record<string, unknown>]);
      if (opts.failOn && opts.failOn.method === method)
        throw Object.assign(new Error(`${opts.failOn.code}: x`), { code: opts.failOn.code });
      switch (method) {
        case "pane.image.begin":
          return { uploadId: "u1" };
        case "pane.image.chunk":
          received = [
            ...received,
            ...Array.from(atob((params as { data: string }).data), (ch) => ch.charCodeAt(0)),
          ];
          return {};
        case "pane.image.commit":
          return { path: opts.path ?? "/state/clipboard-images/soda-image-x.png" };
        default:
          return {};
      }
    }) as ConnectionPort["request"],
    sendInput: (paneId, bytes) => void sent.push([paneId, bytes]),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
  return { conn, requests, sent, received: () => received };
}

function makeTerm(bracketed: boolean, ignore = false): PasteTerminal & { pasted: string[] } {
  const pasted: string[] = [];
  return {
    pasted,
    paste: (t) => void pasted.push(t),
    modes: { bracketedPasteMode: bracketed },
    options: { ignoreBracketedPasteMode: ignore },
  };
}

function makeClipboard(
  c: { canRead?: boolean; image?: Blob | null; forPaste?: ClipboardContent } = {},
): ImagePasterClipboard & { reads: number } {
  const cb = {
    reads: 0,
    canReadByKey: async () => c.canRead ?? true,
    readImage: async () => {
      cb.reads++;
      return c.image ?? null;
    },
    readForPaste: async () => c.forPaste ?? null,
  };
  return cb;
}

function pngBlob(size: number): Blob {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 7) & 0xff;
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Blob([b], { type: "image/png" });
}

function setup(
  o: {
    clip?: Parameters<typeof makeClipboard>[0];
    conn?: Parameters<typeof makeConn>[0];
    term?: PasteTerminal | null;
    paneExists?: (paneId: string) => boolean;
  } = {},
) {
  const c = makeConn(o.conn);
  const gate = new InputGate(c.conn);
  const toasts: string[] = [];
  const term = o.term === undefined ? makeTerm(true) : o.term;
  const clipboard = makeClipboard(o.clip);
  let current = term;
  const paster = new ImagePaster({
    conn: gate,
    input: gate,
    terminalOf: () => current,
    toast: (m) => void toasts.push(m),
    clipboard,
    ...(o.paneExists ? { paneExists: o.paneExists } : {}),
  });
  const setTerm = (t: PasteTerminal | null): void => {
    current = t;
  };
  return { ...c, gate, toasts, paster, clipboard, term, setTerm };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
async function idle(): Promise<void> {
  for (let i = 0; i < 20; i++) await settle();
}

describe("ImagePaster（20260927-clipboard-image-paste）", () => {
  it("キー: 画像があれば送り、パスを bracketed paste で貼る。確かめている間に打ったキーはパスの後に届く", async () => {
    const blob = pngBlob(IMAGE_CHUNK_BYTES + 100);
    const s = setup({ clip: { image: blob } });
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "a"); // 送っている間に打ったキー
    s.gate.sendInput("p1", "b");
    await idle();
    expect(s.requests.map((r) => r[0])).toEqual([
      "pane.image.begin",
      "pane.image.chunk",
      "pane.image.chunk",
      "pane.image.commit",
    ]);
    expect(s.requests[0]![1]).toEqual({ paneId: "p1", mime: "image/png", size: blob.size });
    expect(s.requests[1]![1]).toMatchObject({ uploadId: "u1", offset: 0 });
    expect(s.requests[2]![1]).toMatchObject({ uploadId: "u1", offset: IMAGE_CHUNK_BYTES });
    expect(s.received()).toEqual(Array.from(new Uint8Array(await blob.arrayBuffer())));
    expect(s.sent).toEqual([
      ["p1", "\x1b[200~/state/clipboard-images/soda-image-x.png\x1b[201~"],
      ["p1", "a"],
      ["p1", "b"],
    ]);
    expect(s.toasts).toEqual([]);
  }, 15_000); // 1 片（768 KiB）を超える実物の Blob を base64 にする。単独で約 0.9 秒、並行の全体テストの負荷で 5.6 秒かかり既定の 5 秒を超えた（PR #67 マージ後の main）

  it("キー: 画像が無ければ fallback（\\x16）だけが、確かめている間に打ったキーより先に届く", async () => {
    const s = setup({ clip: { image: null } });
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "j");
    await idle();
    expect(s.sent).toEqual([
      ["p1", "\x16"],
      ["p1", "j"],
    ]);
    expect(s.requests).toEqual([]);
  });

  it("キー: キーから読めないブラウザ（Firefox 等）なら読まずに fallback", async () => {
    const s = setup({ clip: { canRead: false, image: pngBlob(20) } });
    s.paster.fromKey("p1", "\x16");
    await idle();
    expect(s.clipboard.reads).toBe(0);
    expect(s.sent).toEqual([["p1", "\x16"]]);
  });

  it("キー: fallback が null なら何も差し込まない", async () => {
    const s = setup({ clip: { image: null } });
    s.paster.fromKey("p1", null);
    s.gate.sendInput("p1", "x");
    await idle();
    expect(s.sent).toEqual([["p1", "x"]]);
  });

  it("bracketed paste が無効・無視の設定なら包まない", async () => {
    for (const term of [makeTerm(false), makeTerm(true, true)]) {
      const s = setup({ clip: { image: pngBlob(20) }, term });
      s.paster.fromKey("p1", "\x16");
      await idle();
      expect(s.sent).toEqual([["p1", "/state/clipboard-images/soda-image-x.png"]]);
    }
  });

  it("サーバが返したパスが制御文字を含めば貼らず toast（溜めたキーは流す）", async () => {
    const s = setup({ clip: { image: pngBlob(20) }, conn: { path: "/x\x1b[201~; rm -rf ~\r" } });
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "k");
    await idle();
    expect(s.sent).toEqual([["p1", "k"]]);
    expect(s.toasts[0]).toMatch(/使えない文字/);
  });

  it("送れなかったら画像の分は何も入らず toast、溜めたキーは流す。begin の後の失敗は cancel を送る", async () => {
    const s = setup({
      clip: { image: pngBlob(20) },
      conn: { failOn: { method: "pane.image.commit", code: "image_store_failed" } },
    });
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "k");
    await idle();
    expect(s.sent).toEqual([["p1", "k"]]);
    expect(s.toasts).toEqual([imageErrorMessage({ code: "image_store_failed" })]);
    expect(s.requests.at(-1)).toEqual(["pane.image.cancel", { uploadId: "u1" }]);
  });

  it("begin で断られたら cancel は送らない（uploadId が無い）", async () => {
    const s = setup({
      clip: { image: pngBlob(20) },
      conn: { failOn: { method: "pane.image.begin", code: "not_found" } },
    });
    s.paster.fromKey("p1", "\x16");
    await idle();
    expect(s.requests.map((r) => r[0])).toEqual(["pane.image.begin"]);
    expect(s.toasts[0]).toMatch(/古く/);
  });

  it("4 種類以外・16 MiB 超・空は送らずに toast", async () => {
    for (const [blob, re] of [
      [new Blob([new Uint8Array([1])], { type: "image/bmp" }), /対応していない/],
      [{ type: "image/png", size: IMAGE_MAX_BYTES + 1 } as Blob, /大きすぎ/],
      [new Blob([], { type: "image/png" }), /空/],
    ] as const) {
      const s = setup();
      s.paster.pasteBlob("p1", blob);
      s.gate.sendInput("p1", "z");
      await idle();
      expect(s.requests).toEqual([]);
      expect(s.sent).toEqual([["p1", "z"]]);
      expect(s.toasts[0]).toMatch(re);
    }
  });

  it("pane が閉じたならパスは貼らない", async () => {
    const s = setup({ clip: { image: pngBlob(20) }, paneExists: () => false });
    s.paster.fromKey("p1", "\x16");
    await idle();
    expect(s.sent).toEqual([]);
  });

  it("送っている間に端末が LRU で捨てられても、pane があれば始めたときの bracketed paste の状態で貼る", async () => {
    const s = setup({ clip: { image: pngBlob(20) }, paneExists: () => true });
    s.paster.fromKey("p1", "\x16"); // 始めたときは bracketed
    s.setTerm(null);
    await idle();
    expect(s.sent).toEqual([["p1", "\x1b[200~/state/clipboard-images/soda-image-x.png\x1b[201~"]]);
  });

  it("マシンを切り替えたら、前に始めた仕事は送らず・貼らず・溜めたキーも流さない。切り替えの後の仕事は動く", async () => {
    const s = setup({ clip: { image: pngBlob(20) } });
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "old");
    s.paster.resetForMachineSwitch();
    await idle();
    expect(s.sent).toEqual([]);
    expect(s.requests).toEqual([]);
    s.paster.fromKey("p1", "\x16");
    await idle();
    expect(s.sent).toEqual([["p1", "\x1b[200~/state/clipboard-images/soda-image-x.png\x1b[201~"]]);
  });

  it("読み取り（許可の画面）で止まっている間に切り替えたら、保持をその場で捨てる（次のマシンの同じ id の pane へ打った文字を拾わない）", async () => {
    const s = setup();
    let answer!: (b: Blob | null) => void;
    s.clipboard.readImage = () => new Promise((r) => (answer = r));
    s.paster.fromKey("p3", "\x16");
    await idle(); // 読み取りで止まる
    s.gate.sendInput("p3", "old"); // 前のマシン
    s.paster.resetForMachineSwitch();
    s.gate.sendInput("p3", "new"); // 次のマシンの同じ id の pane
    expect(s.sent).toEqual([["p3", "new"]]);
    answer(pngBlob(20));
    await idle();
    expect(s.sent).toEqual([["p3", "new"]]);
    expect(s.requests).toEqual([]);
  });

  it("キーからの読み取りが上限（許可の画面に答えない等）を過ぎたら、画像無しとして fallback を送り、後の Ctrl+V も待たせない", async () => {
    const c = makeConn();
    const gate = new InputGate(c.conn);
    const clipboard = makeClipboard();
    clipboard.readImage = () => new Promise(() => undefined); // 決まらない
    const paster = new ImagePaster({
      conn: gate,
      input: gate,
      terminalOf: () => makeTerm(true),
      toast: () => undefined,
      clipboard,
      readTimeoutMs: 20,
    });
    paster.fromKey("p1", "\x16");
    gate.sendInput("p1", "j");
    paster.fromKey("p1", "\x16");
    gate.sendInput("p1", "k");
    await new Promise((r) => setTimeout(r, 100));
    expect(c.sent).toEqual([
      ["p1", "\x16"],
      ["p1", "j"],
      ["p1", "\x16"],
      ["p1", "k"],
    ]);
    expect(c.requests).toEqual([]);
  });

  it("列で待っている仕事は、切り替えの後に番が来ても始めない（次のマシンへ begin を送らない）", async () => {
    const s = setup();
    let answer!: (b: Blob | null) => void;
    s.clipboard.readImage = () => new Promise((r) => (answer = r));
    s.paster.fromKey("p3", "\x16");
    s.paster.pasteBlob("p3", pngBlob(20)); // 列で待つ
    await idle();
    s.paster.resetForMachineSwitch();
    answer(null);
    await idle();
    expect(s.requests).toEqual([]);
    expect(s.sent).toEqual([]);
  });

  it("送っている途中でマシンを切り替えたら、残りの片・commit を送らず、パスも貼らない", async () => {
    const s = setup({ clip: { image: pngBlob(IMAGE_CHUNK_BYTES + 10) } });
    const orig = s.conn.request;
    s.conn.request = (async (m: MethodName, p: never) => {
      const r = await orig(m, p);
      if (m === "pane.image.begin") s.paster.resetForMachineSwitch();
      return r;
    }) as ConnectionPort["request"];
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "k");
    await idle();
    expect(s.requests.map((r) => r[0])).toEqual(["pane.image.begin"]);
    expect(s.sent).toEqual([]);
  });

  it("続けて 2 回押しても直列に送り、押した順（1 つ目のパス → 間のキー → 2 つ目のパス）に届く", async () => {
    const s = setup({ clip: { image: pngBlob(20) } });
    let inFlight = 0;
    let maxInFlight = 0;
    const orig = s.conn.request;
    s.conn.request = (async (m: MethodName, p: never) => {
      if (m === "pane.image.begin") maxInFlight = Math.max(maxInFlight, ++inFlight);
      const r = await orig(m, p);
      if (m === "pane.image.commit") inFlight--;
      return r;
    }) as ConnectionPort["request"];
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "a");
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "b");
    await idle();
    expect(maxInFlight).toBe(1);
    const P = "\x1b[200~/state/clipboard-images/soda-image-x.png\x1b[201~";
    expect(s.sent).toEqual([
      ["p1", P],
      ["p1", "a"],
      ["p1", P],
      ["p1", "b"],
    ]);
  });

  it("送り先はきっかけの pane に固定（別の pane へ打ったキーは溜めずにそのまま）", async () => {
    const s = setup({ clip: { image: pngBlob(20) } });
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p2", "other");
    await idle();
    expect(s.sent[0]).toEqual(["p2", "other"]);
    expect(s.sent[1]![0]).toBe("p1");
  });

  it("pasteClipboard: テキストなら term.paste（溜めない）、画像なら送る、何も無ければ何もしない", async () => {
    const t = setup({ clip: { forPaste: { kind: "text", text: "hello" } } });
    t.paster.pasteClipboard("p1");
    await idle();
    expect((t.term as ReturnType<typeof makeTerm>).pasted).toEqual(["hello"]);
    expect(t.requests).toEqual([]);

    const i = setup({ clip: { forPaste: { kind: "image", blob: pngBlob(20) } } });
    i.paster.pasteClipboard("p1");
    await idle();
    expect(i.requests.map((r) => r[0])).toContain("pane.image.commit");
    expect(i.sent).toHaveLength(1);

    const n = setup({ clip: { forPaste: null } });
    n.paster.pasteClipboard("p1");
    await idle();
    expect(n.sent).toEqual([]);
    expect(n.requests).toEqual([]);
  });
  it("読み取りが投げても fallback と溜めたキーは流れ、続く貼り付けも動く（直列の列が止まらない）", async () => {
    const s = setup();
    let calls = 0;
    s.clipboard.canReadByKey = async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return true;
    };
    s.clipboard.readImage = async () => null;
    s.paster.fromKey("p1", "\x16");
    s.gate.sendInput("p1", "a");
    await idle();
    s.paster.fromKey("p1", "\x16");
    await idle();
    expect(s.sent).toEqual([
      ["p1", "\x16"],
      ["p1", "a"],
      ["p1", "\x16"],
    ]);
  });

  it("送信の途中で想定外に投げても（blob の読み取り）溜めたキーは流れ、次の貼り付けも動く", async () => {
    const s = setup({ clip: { image: null } });
    const broken = {
      type: "image/png",
      size: 10,
      slice: () => ({ arrayBuffer: () => Promise.reject(new Error("read")) }),
    } as unknown as Blob;
    s.paster.pasteBlob("p1", broken);
    s.gate.sendInput("p1", "k");
    await idle();
    s.paster.fromKey("p1", "\x16");
    await idle();
    expect(s.sent).toEqual([
      ["p1", "k"],
      ["p1", "\x16"],
    ]);
  });

  it("仕事の中で想定外に投げても（端末の取得）溜めたキーは流れ、列は止まらない", async () => {
    const c = makeConn();
    const gate = new InputGate(c.conn);
    let broken = true;
    const term = makeTerm(false);
    const paster = new ImagePaster({
      conn: gate,
      input: gate,
      terminalOf: () => {
        if (broken) throw new Error("boom");
        return term;
      },
      toast: () => undefined,
      clipboard: makeClipboard({ image: pngBlob(20) }),
    });
    paster.fromKey("p1", "\x16");
    gate.sendInput("p1", "k");
    await idle();
    expect(c.sent).toEqual([["p1", "k"]]);
    broken = false;
    paster.fromKey("p1", "\x16");
    await idle();
    expect(c.sent.at(-1)).toEqual(["p1", "/state/clipboard-images/soda-image-x.png"]);
  });

  it("保持は 20 秒（decisions D7）で作る", () => {
    const s = setup();
    const spy = vi.spyOn(s.gate, "holdInput");
    s.paster.fromKey("p1", "\x16");
    s.paster.pasteBlob("p1", pngBlob(20));
    expect(spy.mock.calls).toEqual([
      ["p1", { timeoutMs: 20_000 }],
      ["p1", { timeoutMs: 20_000 }],
    ]);
  });
});

describe("pasteBytes・imageErrorMessage", () => {
  it("改行は CR にし、bracketed なら包む", () => {
    expect(pasteBytes("a\nb\r\nc", true)).toBe("\x1b[200~a\rb\rc\x1b[201~");
    expect(pasteBytes("a\nb", false)).toBe("a\rb");
    expect(bracketedOf(makeTerm(true))).toBe(true);
    expect(bracketedOf(makeTerm(false))).toBe(false);
    expect(bracketedOf(makeTerm(true, true))).toBe(false);
  });
  it("code ごとの日本語。知らない code・接続の失敗は汎用", () => {
    expect(imageErrorMessage({ code: "image_too_large" })).toMatch(/16MB/);
    expect(imageErrorMessage({ code: "image_upload_rate_limited" })).toMatch(/1 分/);
    expect(imageErrorMessage({ code: "image_upload_busy" })).toMatch(/最中/);
    expect(imageErrorMessage({ code: "image_upload_expired" })).toMatch(/途中で切れ/);
    expect(imageErrorMessage({ code: "invalid_image" })).toMatch(/形式/);
    expect(imageErrorMessage(new Error("not connected (method=pane.image.begin)"))).toBe(
      "画像を送れませんでした",
    );
  });
});
