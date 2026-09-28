import { decodeFrame } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  imageReadTimeoutMs,
  isRemoteSession,
  nodeRunner,
  readClipboardImage,
  readClipboardText,
  writeClipboardTool,
  type Runner,
} from "../clipboard.js";
import { PaneTerminal } from "../term/PaneTerminal.js";
import { startedApp } from "../testing/appHarness.js";
import { ImagePaster, pasteBytes } from "./ImagePaster.js";
import { InlineImageFilter, parseInlineImage } from "./inlineImages.js";
import { KittyImages, kittyGraphicsSupported } from "./kittyOutput.js";

/** クリップボードと画像（05 の T5。design「clipboard.ts」「image/」・AC7・AC15）。 */
function fakeRunner(table: Record<string, { code?: number; out?: string | Buffer }>) {
  const calls: { cmd: string; args: string[]; input?: string | Buffer }[] = [];
  const run: Runner = (cmd, args, opts = {}) => {
    calls.push({
      cmd,
      args: [...args],
      ...(opts.input !== undefined ? { input: opts.input } : {}),
    });
    const key = [cmd, ...args].join(" ");
    const hit = Object.entries(table).find(([k]) => key.startsWith(k));
    if (!hit) return Promise.reject(new Error(`ENOENT ${cmd}`));
    const out = hit[1].out ?? "";
    return Promise.resolve({
      code: hit[1].code ?? 0,
      stdout: Buffer.isBuffer(out) ? out : Buffer.from(out),
    });
  };
  return { run, calls };
}

describe("クリップボードの OS の道具", () => {
  it("写す：macOS は pbcopy、Linux は Wayland なら wl-copy・X なら xclip。SSH 越し・Windows・WSL は道具を使わない（OSC 52 に任せる）", async () => {
    const r = fakeRunner({ pbcopy: {}, "wl-copy": {}, xclip: {} });
    expect(await writeClipboardTool({ platform: "darwin", env: {}, run: r.run }, "a")).toBe(true);
    expect(
      await writeClipboardTool(
        { platform: "linux", env: { WAYLAND_DISPLAY: "w" }, run: r.run },
        "b",
      ),
    ).toBe(true);
    expect(
      await writeClipboardTool({ platform: "linux", env: { DISPLAY: ":0" }, run: r.run }, "c"),
    ).toBe(true);
    expect(r.calls.map((c) => [c.cmd, c.input])).toEqual([
      ["pbcopy", "a"],
      ["wl-copy", "b"],
      ["xclip", "c"],
    ]);
    for (const ce of [
      { platform: "linux", env: { DISPLAY: ":0", SSH_CONNECTION: "1 2 3 4" } },
      { platform: "win32", env: {} },
      { platform: "linux", env: { DISPLAY: ":0", WSL_DISTRO_NAME: "Ubuntu" } },
    ])
      expect(await writeClipboardTool({ ...ce, run: r.run }, "x")).toBe(false);
    expect(r.calls).toHaveLength(3);
    expect(isRemoteSession({ SSH_TTY: "/dev/pts/1" })).toBe(true);
  });

  it("読む：文字（道具が無い・失敗・SSH 越しは null）", async () => {
    const r = fakeRunner({
      "wl-paste --no-newline": { out: "hi" },
      pbpaste: { out: "mac" },
      powershell: { out: "win" },
    });
    expect(
      await readClipboardText({ platform: "linux", env: { WAYLAND_DISPLAY: "w" }, run: r.run }),
    ).toBe("hi");
    expect(await readClipboardText({ platform: "darwin", env: {}, run: r.run })).toBe("mac");
    expect(await readClipboardText({ platform: "win32", env: {}, run: r.run })).toBe("win");
    expect(
      await readClipboardText({ platform: "linux", env: { DISPLAY: ":0" }, run: r.run }),
    ).toBeNull(); // xclip が無い
    expect(
      await readClipboardText({ platform: "darwin", env: { SSH_CONNECTION: "x" }, run: r.run }),
    ).toBeNull();
  });

  it("読む：画像（形式を訊いて PNG を先に。macOS は AppleScript の 16 進、Windows は PowerShell の base64）", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const r = fakeRunner({
      "wl-paste --list-types": { out: "text/plain\nimage/jpeg\nimage/png\n" },
      "wl-paste --type image/png": { out: png },
      "xclip -selection clipboard -target TARGETS": { out: "UTF8_STRING\nTEXT\n" },
      osascript: { out: `«data PNGf${png.toString("hex").toUpperCase()}»\n` },
      "powershell.exe": { out: `${png.toString("base64")}\r\n` },
    });
    expect(
      await readClipboardImage({ platform: "linux", env: { WAYLAND_DISPLAY: "w" }, run: r.run }),
    ).toEqual({
      mime: "image/png",
      bytes: png,
    });
    expect(
      await readClipboardImage({ platform: "linux", env: { DISPLAY: ":0" }, run: r.run }),
    ).toBeNull();
    expect(await readClipboardImage({ platform: "darwin", env: {}, run: r.run })).toEqual({
      mime: "image/png",
      bytes: png,
    });
    expect(
      await readClipboardImage({ platform: "linux", env: { WSL_DISTRO_NAME: "U" }, run: r.run }),
    ).toEqual({ mime: "image/png", bytes: png });
    expect(
      await readClipboardImage({
        platform: "linux",
        env: { SSH_TTY: "t", WAYLAND_DISPLAY: "w" },
        run: r.run,
      }),
    ).toBeNull();
  });
});

describe("ImagePaster（web の term/ImagePaster.ts と同じ手順）", () => {
  function setup(image: { mime: "image/png"; bytes: Buffer } | null, fail?: string) {
    const calls: [string, unknown][] = [];
    const holds: { cancelled?: string | Uint8Array | undefined; discarded?: boolean }[] = [];
    const toasts: string[] = [];
    const pasted: string[] = [];
    const p = new ImagePaster({
      conn: {
        request: ((m: string, params: unknown) => {
          calls.push([m, params]);
          if (fail && m === "pane.image.begin")
            return Promise.reject(Object.assign(new Error(fail), { code: fail }));
          if (m === "pane.image.begin") return Promise.resolve({ uploadId: "u1" });
          if (m === "pane.image.commit") return Promise.resolve({ path: "/tmp/soda/img.png" });
          return Promise.resolve({});
        }) as never,
      },
      input: {
        holdInput: () => {
          const h: (typeof holds)[number] = {};
          holds.push(h);
          return {
            release: () => undefined,
            cancel: (first?: string | Uint8Array) => {
              h.cancelled = first;
            },
            discard: () => {
              h.discarded = true;
            },
          };
        },
      },
      readImage: () => Promise.resolve(image),
      readText: () => Promise.resolve("text!"),
      bracketed: () => true,
      paneExists: () => true,
      pasteText: (_id, t) => pasted.push(t),
      toast: (m) => toasts.push(m),
    });
    return { p, calls, holds, toasts, pasted };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("キー：画像があれば送ってパスを貼る（ブラケットペースト）。無ければそのキーの列を送る", async () => {
    const png = Buffer.alloc(10, 1);
    const s = setup({ mime: "image/png", bytes: png });
    s.p.fromKey("p1", "\x16");
    await vi.waitFor(() =>
      expect(s.holds[0]!.cancelled).toBe(pasteBytes("/tmp/soda/img.png", true)),
    );
    expect(s.calls.map((c) => c[0])).toEqual([
      "pane.image.begin",
      "pane.image.chunk",
      "pane.image.commit",
    ]);
    expect(s.calls[1]![1]).toEqual({ uploadId: "u1", offset: 0, data: png.toString("base64") });
    const none = setup(null);
    none.p.fromKey("p1", "\x16");
    await vi.waitFor(() => expect(none.holds[0]!.cancelled).toBe("\x16"));
    expect(none.calls).toEqual([]);
  });

  it("失敗は知らせて打鍵を元の宛先へ。マシンを切り替えたら途中のものを捨てる。メニューの貼り付けは画像が無ければ文字", async () => {
    const s = setup({ mime: "image/png", bytes: Buffer.alloc(3) }, "image_too_large");
    s.p.fromKey("p1", null);
    await vi.waitFor(() => expect(s.toasts).toEqual(["画像が大きすぎます（16MB まで）"]));
    expect(s.holds[0]!.cancelled).toBeUndefined();
    const t = setup(null);
    expect(await t.p.pasteClipboard("p1")).toBe("text");
    expect(t.pasted).toEqual(["text!"]);
    const u = setup({ mime: "image/png", bytes: Buffer.alloc(3) });
    u.p.fromKey("p1", null);
    u.p.resetForMachineSwitch();
    await flush();
    expect(u.holds[0]!.discarded).toBe(true);
  });
});

describe("pane の中の画像（サーバが作り直した OSC 1337 File=）", () => {
  const osc = (b64: string, cols: number, rows: number) =>
    `\x1b]1337;File=inline=1;size=4;width=${cols};height=${rows};preserveAspectRatio=0:${b64}\x07`;

  it("読み取り：inline=1・width・height（セル）と base64", () => {
    expect(
      parseInlineImage("File=inline=1;size=4;width=3;height=2;preserveAspectRatio=0:iVBORw=="),
    ).toEqual({
      cols: 3,
      rows: 2,
      base64: "iVBORw==",
    });
    expect(parseInlineImage("File=size=4;width=3;height=2:AAAA")).toBeNull();
    expect(parseInlineImage("File=inline=1;width=x;height=2:AAAA")).toBeNull();
  });

  it("画像の直後に高さ-1 回の IND を足す（読みで割れても）。ほかのバイトはそのまま", () => {
    const f = new InlineImageFilter();
    const s = osc("iVBORw==", 3, 3) + "\x1b[3C";
    const a = new TextEncoder().encode(s.slice(0, 20));
    const b = new TextEncoder().encode(s.slice(20));
    const out = new TextDecoder().decode(f.feed(a)) + new TextDecoder().decode(f.feed(b));
    expect(out).toBe(osc("iVBORw==", 3, 3) + "\x1bD\x1bD" + "\x1b[3C");
    const plain = new TextEncoder().encode("hello\x1b]0;title\x07");
    expect(f.feed(plain)).toBe(plain);
  });

  it("PaneTerminal：置いた位置（カーソル）と大きさを覚え、カーソルはミラーと同じだけ進む", async () => {
    const t = new PaneTerminal("p", 20, 10, 100);
    t.output(new TextEncoder().encode(`ab${osc("iVBORw==", 4, 3)}\x1b[4C`));
    await t.flush();
    const [im] = t.liveImages();
    expect(im).toMatchObject({ col: 2, row: 0, cols: 4, rows: 3, base64: "iVBORw==" });
    expect(t.term.buffer.active.cursorY).toBe(2); // IND×2
    expect(t.term.buffer.active.cursorX).toBe(6);
    t.snapshot(20, 10, "reset");
    await t.flush();
    expect(t.liveImages()).toEqual([]);
    t.dispose();
  });
});

describe("Kitty graphics への出し直し", () => {
  it("描ける端末の判定（tmux の中は使わない）", () => {
    expect(kittyGraphicsSupported({ TERM: "xterm-kitty" })).toBe(true);
    expect(kittyGraphicsSupported({ TERM_PROGRAM: "WezTerm" })).toBe(true);
    expect(kittyGraphicsSupported({ TERM_PROGRAM: "ghostty" })).toBe(true);
    expect(kittyGraphicsSupported({ TERM: "xterm-kitty", TMUX: "/tmp/t" })).toBe(false);
    expect(kittyGraphicsSupported({ WT_SESSION: "1" })).toBe(false);
    expect(kittyGraphicsSupported({ TERM_PROGRAM: "vscode" })).toBe(false);
  });

  it("中身は 1 回だけ送り、置き方が変わったときだけ置き直す。使わなくなった中身は消す", () => {
    const k = new KittyImages();
    const a = { imageKey: "p1:1", base64: "QUJD", x: 10, y: 5, cols: 4, rows: 2 };
    const first = k.sync([a]);
    expect(first).toContain("\x1b_Ga=t,f=100,t=d,i=1,q=2,m=0;QUJD\x1b\\");
    expect(first).toContain("\x1b[6;11H\x1b_Ga=p,i=1,p=1,c=4,r=2,C=1,z=-1,q=2\x1b\\");
    expect(first.startsWith("\x1b7")).toBe(true);
    expect(k.sync([a])).toBe("");
    const moved = k.sync([{ ...a, y: 6 }]);
    expect(moved).not.toContain("a=t");
    expect(moved).toContain("\x1b[7;11H");
    expect(k.sync([])).toContain("\x1b_Ga=d,d=I,i=1,q=2\x1b\\");
    expect(k.clear()).toBe("\x1b_Ga=d,d=A,q=2\x1b\\");
  });
});

describe("端末版の画像とクリップボード（組み立て）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  const inputs = (h: Awaited<ReturnType<typeof startedApp>>) =>
    h.ws.sent
      .filter((m): m is Uint8Array => m instanceof Uint8Array)
      .map((m) => new TextDecoder().decode((decodeFrame(m) as { bytes: Uint8Array }).bytes));

  it("描けない端末では画像の位置に「[画像]」の印", async () => {
    const h = await startedApp();
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    const t = h.app.panes.get("p1")!;
    t.output(
      new TextEncoder().encode(
        `\x1b]1337;File=inline=1;size=4;width=8;height=2;preserveAspectRatio=0:iVBORw==\x07`,
      ),
    );
    await t.flush();
    h.app.renderNow();
    expect(await h.screen()).toContain("[画像]");
  });

  it("描ける端末（kitty）では画像を出し直し、ダイアログを開いている間は外す。終わるときに全部消す", async () => {
    const h = await startedApp({ env: { TERM: "xterm-kitty" } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    const t = h.app.panes.get("p1")!;
    t.output(
      new TextEncoder().encode(
        `\x1b]1337;File=inline=1;size=4;width=8;height=2;preserveAspectRatio=0:iVBORw==\x07`,
      ),
    );
    await t.flush();
    h.app.renderNow();
    expect(h.io.output()).toContain("\x1b_Ga=t,f=100,t=d,i=1,q=2,m=0;iVBORw==\x1b\\");
    expect(h.io.output()).toContain("a=p,i=1,p=1,c=8,r=2,C=1,z=-1,q=2");
    expect(await h.screen()).not.toContain("[画像]");
    const before = h.io.output().length;
    h.app.ui.openDialogWithContext({ kind: "help" });
    h.app.renderNow();
    expect(h.io.output().slice(before)).toContain("\x1b_Ga=d,d=a,q=2\x1b\\");
    expect(h.io.output().slice(before)).not.toContain("a=p,");
    h.app.ui.closeDialog();
    h.app.finish(0);
    expect(h.io.output()).toContain("\x1b_Ga=d,d=A,q=2\x1b\\");
  });

  it("Ctrl+V：画像が無ければ Ctrl+V（0x16）を pane へ。メニューの貼り付けは手元のクリップボードの文字", async () => {
    const r = fakeRunner({
      "wl-paste --list-types": { out: "text/plain" },
      "wl-paste --no-newline": { out: "clip" },
    });
    const h = await startedApp({ clipboardRunner: r.run, env: { WAYLAND_DISPLAY: "w" } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.io.type("\x16");
    await vi.waitFor(() => expect(inputs(h)).toEqual(["\x16"]));
    (
      h.app as unknown as { dispatcher: { pasteIntoPane(id: string): void } }
    ).dispatcher.pasteIntoPane("p1");
    await vi.waitFor(() => expect(inputs(h)).toEqual(["\x16", "clip"]));
  });
});

describe("画像とクリップボードの点検の指摘（05 T5）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  const img = (b64 = "iVBORw==", cols = 8, rows = 2) =>
    `\x1b]1337;File=inline=1;size=4;width=${cols};height=${rows};preserveAspectRatio=0:${b64}\x07`;

  it("OSC の途中で xterm が捨てる終わり（ESC と別の文字・CAN・SUB）では IND を足さない。続く画像は数え直す", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const dec = (b: Uint8Array) => new TextDecoder().decode(b);
    for (const cut of ["\x1b[0m", "\x18", "\x1a"]) {
      const f = new InlineImageFilter();
      const s = `\x1b]1337;File=inline=1;width=2;height=3:AAAA${cut}\x07x`;
      expect(dec(f.feed(enc(s)))).toBe(s);
    }
    const f = new InlineImageFilter();
    const s = `\x1b]1337;File=inline=1;width=2;height=3:AA\x1b${img("QQ==", 2, 2)}`;
    expect(dec(f.feed(enc(s)))).toBe(s + "\x1bD");
  });

  it("画像の上に文字を書く・ED・EL で消えたら画像も消す（addon-image と同じ）。鍵は中身の指紋", async () => {
    const mk = async (after: string) => {
      const t = new PaneTerminal("p", 20, 10, 100);
      t.output(new TextEncoder().encode(`\r\n${img("iVBORw==", 4, 2)}${after}`));
      await t.flush();
      return t;
    };
    expect((await mk("")).liveImages()).toHaveLength(1);
    expect((await mk("\x1b[2;1Hxxxx")).liveImages()).toEqual([]); // 上書き
    expect((await mk("\x1b[2J")).liveImages()).toEqual([]);
    expect((await mk("\x1b[2;1H\x1b[K")).liveImages()).toEqual([]);
    expect((await mk("\x1b[1;1H\x1b[J")).liveImages()).toEqual([]); // ED 0（カーソルから下）
    expect((await mk("\x1b[5;1H\x1b[1J")).liveImages()).toEqual([]); // ED 1（頭からカーソルまで）
    expect((await mk("\x1b[9;1H\x1b[K")).liveImages()).toHaveLength(1); // 別の行
    const a = (await mk("")).liveImages()[0]!;
    const b = (await mk("")).liveImages()[0]!;
    expect(a.hash).toBe(b.hash);
    const t = new PaneTerminal("p", 20, 10, 100);
    t.output(new TextEncoder().encode(img("QUJD", 4, 2)));
    await t.flush();
    expect(t.liveImages()[0]!.hash).not.toBe(a.hash);
  });

  it("写す道具は出力をつながずに動かす（裏に残る xclip で終われなくならない）。本物でも裏の子を待たない", async () => {
    const r = fakeRunner({ xclip: {} });
    const seen: unknown[] = [];
    const run: Runner = (cmd, args, opts) => {
      seen.push(opts?.capture);
      return r.run(cmd, args, opts);
    };
    await writeClipboardTool({ platform: "linux", env: { DISPLAY: ":0" }, run }, "x");
    expect(seen).toEqual([false]);
    const started = Date.now();
    const res = await nodeRunner("sh", ["-c", "sleep 3 >/dev/null 2>&1 & exit 0"], {
      capture: false,
    });
    expect(res.code).toBe(0);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("Windows・WSL は画像を読む待ちを長く（PowerShell の起動）。遅いと「読んでいます」を出す", async () => {
    expect(imageReadTimeoutMs({ platform: "win32", env: {} })).toBe(8000);
    expect(imageReadTimeoutMs({ platform: "linux", env: { WSL_DISTRO_NAME: "U" } })).toBe(8000);
    expect(imageReadTimeoutMs({ platform: "linux", env: {} })).toBe(2000);
    const shown: string[] = [];
    let dismissed = 0;
    const p = new ImagePaster({
      conn: { request: (() => Promise.resolve({})) as never },
      input: {
        holdInput: () => ({
          release: () => undefined,
          cancel: () => undefined,
          discard: () => undefined,
        }),
      },
      readImage: () => new Promise((r) => setTimeout(() => r(null), 600)),
      readText: () => Promise.resolve(null),
      bracketed: () => false,
      paneExists: () => true,
      pasteText: () => undefined,
      toast: () => undefined,
      status: (m) => {
        shown.push(m);
        return () => dismissed++;
      },
      readTimeoutMs: 5000,
    });
    p.fromKey("p1", "\x16");
    await vi.waitFor(() => expect(dismissed).toBe(1), { timeout: 2000 });
    expect(shown).toEqual(["クリップボードの画像を読んでいます…"]);
  });

  it("出し直しは同期の更新の中へ入れ、全体の描き直しの後は置き直す。狭い幅の navigate の重ねたサイドバーの間は出さない", async () => {
    const h = await startedApp({ env: { TERM: "xterm-kitty" } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    const t = h.app.panes.get("p1")!;
    t.output(new TextEncoder().encode(img()));
    await t.flush();
    let before = h.io.output().length;
    h.app.renderNow();
    let out = h.io.output().slice(before);
    const place = out.indexOf("a=p,");
    expect(place).toBeGreaterThan(0);
    expect(out.lastIndexOf("\x1b[?2026l")).toBeGreaterThan(place);
    // 大きさが変わる（全体の描き直し）→ 置き直す。
    before = h.io.output().length;
    h.io.resizeTo(100, 30);
    h.app.renderNow();
    out = h.io.output().slice(before);
    expect(out).toContain("\x1b[2J");
    expect(out).toContain("a=p,");
    // pane の headless を作り直して、同じ番号の別の画像が来ても、古い画像を置かない（鍵は中身の指紋）。
    h.app.panes.paneClosed("p1");
    (h.app as unknown as { commitView(): void }).commitView(); // 作り直す
    const t2 = h.app.panes.get("p1")!;
    expect(t2).not.toBe(t);
    t2.output(new TextEncoder().encode(img("QUJDRA==")));
    await t2.flush();
    before = h.io.output().length;
    h.app.renderNow();
    expect(h.io.output().slice(before)).toContain(";QUJDRA==\x1b\\");
    // 出し直す画像の鍵は中身の指紋（pane と番号ではない）。
    const frameImages = (h.app as unknown as { frameImages: { imageKey: string }[] }).frameImages;
    expect(frameImages.map((f) => f.imageKey)).toEqual([t2.liveImages()[0]!.hash]);
    // 狭い幅で navigate：重ねたサイドバーの間は外す。
    h.io.resizeTo(50, 20);
    h.io.type("\x02w");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("navigate"));
    before = h.io.output().length;
    h.app.renderNow();
    out = h.io.output().slice(before);
    expect(out).not.toContain("a=p,");
    expect(await h.screen()).not.toContain("[画像]");
  });
});
