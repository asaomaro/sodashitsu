import { decodeFrame } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkCommand } from "../app/TuiApp.js";
import { startedApp } from "../testing/appHarness.js";
import { agent, pane, snapshot, tab, workspace, leaf } from "../testing/fixtures.js";
import { InputDecoder } from "./decode.js";

const down = (x: number, y: number, b = 0) => `\x1b[<${b};${x + 1};${y + 1}M`;
const up = (x: number, y: number, b = 0) => `\x1b[<${b};${x + 1};${y + 1}m`;
const drag = (x: number, y: number) => `\x1b[<32;${x + 1};${y + 1}M`;
const wheel = (x: number, y: number, b: number) => `\x1b[<${b};${x + 1};${y + 1}M`;
const b64 = (s: string) => Buffer.from(s).toString("base64");

/**
 * 04 ラウンド 2 の点検の指摘（マウス・リンク・スクロールバー・サイドバーと tab バーのボタン）。画面は 100×30・サイドバー 26・
 * p1 の枠は 26〜62（中身 27〜61・2〜28 行）・p2 の枠は 63〜99（境界は 63、p1 の右の罫線は 62）。
 */
describe("マウス（04 ラウンド 2）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  async function start(opts?: Parameters<typeof startedApp>[0]) {
    const h = await startedApp(opts);
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    await h.screen();
    h.app.renderNow();
    const inputs = () =>
      h.ws.sent
        .filter((m): m is Uint8Array => m instanceof Uint8Array)
        .map((m) => new TextDecoder().decode((decodeFrame(m) as { bytes: Uint8Array }).bytes));
    return { ...h, inputs };
  }

  it("境界は掴んだだけでは動かさず、掴んだ位置との差を保って動かす", async () => {
    const h = await start();
    h.io.type(down(62, 10) + drag(62, 10) + up(62, 10)); // p1 の右の罫線（境界の左隣）を掴んで離す
    expect(h.ws.requests("layout.set_split_ratio")).toEqual([]);
    h.io.type(down(62, 10) + drag(52, 10) + up(52, 10));
    // 境界（63）から 1 桁左を掴んだので、境界は 52+1=53 へ。
    const r = h.ws.requests("layout.set_split_ratio").at(-1)!.params as { ratio: number };
    expect(r.ratio).toBeCloseTo((53 - 26) / 74);
  });

  it("ホイールの座標も pane の大きさに収め、横のホイールはマウスを求める pane にだけ渡す", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.snapshot(10, 5, Array.from({ length: 40 }, (_, i) => `l${i}`).join("\r\n"));
    await t.flush();
    // マウスを求めていない：横のホイールではスクロールしない。
    const bottom = t.term.buffer.active.viewportY;
    h.io.type(wheel(30, 3, 66) + wheel(30, 3, 67));
    expect(t.term.buffer.active.viewportY).toBe(bottom);
    t.output(new TextEncoder().encode("\x1b[?1000;1006h"));
    await t.flush();
    h.io.type(wheel(50, 20, 65) + wheel(50, 20, 66));
    expect(h.inputs()).toEqual(["\x1b[<65;10;5M", "\x1b[<66;10;5M"]);
  });

  it("pane へ渡している押下を捨てるときは離しも送る", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.output(new TextEncoder().encode("\x1b[?1002;1006h"));
    await t.flush();
    h.io.type(down(30, 5) + drag(31, 5));
    h.io.type("\x1b[O"); // 外側の端末を離れた
    expect(h.inputs()).toEqual(["\x1b[<0;4;4M", "\x1b[<32;5;4M", "\x1b[<0;5;4m"]);
  });

  it("遡っているときも、切り取りの余白の行は pane の最後の行として選ぶ", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.snapshot(20, 3, Array.from({ length: 20 }, (_, i) => `row${i}`).join("\r\n"));
    await t.flush();
    t.term.scrollLines(-5);
    const top = t.term.buffer.active.viewportY;
    // 中身の 20 行目（pane は 3 行しかない）から 0 行目の頭まで。
    h.io.type(down(27 + 5, 2 + 20) + drag(27, 2) + up(27, 2));
    expect(h.app.mouse.selection).toMatchObject({
      from: { row: top, col: 0 },
      to: { row: top + 2 },
    });
  });

  it("全角の左右どちらの半分を押してもダブルクリック。押したまま動かすと単語単位に広げる（M5）", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, "語 alpha beta gamma");
    await t.flush();
    h.io.type(down(27, 2) + up(27, 2) + down(28, 2) + up(28, 2));
    await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;${b64("語")}\x07`));
    // alpha（桁 3〜7）をダブルクリックして、beta の途中まで押したまま動かす → alpha beta。
    h.io.type(
      down(27 + 4, 2) + up(27 + 4, 2) + down(27 + 4, 2) + drag(27 + 10, 2) + up(27 + 10, 2),
    );
    await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;${b64("alpha beta")}\x07`));
    // 左へ広げる：gamma から alpha の途中へ。
    h.io.type(
      down(27 + 16, 2) + up(27 + 16, 2) + down(27 + 16, 2) + drag(27 + 4, 2) + up(27 + 4, 2),
    );
    await vi.waitFor(() =>
      expect(h.io.output()).toContain(`\x1b]52;c;${b64("alpha beta gamma")}\x07`),
    );
  });

  it("リンクの当たりは絵文字の後・全角の右半分でもずれない", async () => {
    const opened: string[] = [];
    const h = await start({ openUrl: (u) => opened.push(u) });
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, "😀😀 https://a.example/x 語");
    await t.flush();
    // 😀😀 は 4 セル＋空白 → URL は桁 5〜。桁 5 を Ctrl＋押下。
    h.io.type(down(27 + 5, 2, 16) + up(27 + 5, 2, 16));
    expect(opened).toEqual(["https://a.example/x"]);
    // URL の直後の空白（桁 24）は外。
    h.io.type(down(27 + 24, 2, 16) + up(27 + 24, 2, 16));
    expect(opened).toHaveLength(1);
  });

  it("全角の右半分を Ctrl＋押下しても、その文字の後の URL を開かない", async () => {
    const opened: string[] = [];
    const h = await start({ openUrl: (u) => opened.push(u) });
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, "語https://b.example/y");
    await t.flush();
    h.io.type(down(27 + 1, 2, 16) + up(27 + 1, 2, 16)); // 「語」の右半分
    expect(opened).toEqual([]);
    h.io.type(down(27 + 2, 2, 16) + up(27 + 2, 2, 16));
    expect(opened).toEqual(["https://b.example/y"]);
  });

  it("tab バーのホイールで前後の tab へ（H22b）。あふれたら「‹」「›」でずらす", async () => {
    const tabs = Array.from({ length: 12 }, (_, i) => `t${i + 1}`);
    const snap = snapshot({
      workspaces: [workspace("w1", tabs, { label: "alpha" })],
      tabs: tabs.map((id) => tab(id, "w1", leaf(`p-${id}`), { label: `long-tab-name-${id}` })),
      panes: tabs.map((id) => pane(`p-${id}`, id)),
    });
    const h = await start({ snapshot: snap });
    h.io.type(wheel(40, 0, 65));
    await vi.waitFor(() => expect(h.app.model.tabId).toBe("t2"));
    h.io.type(wheel(40, 0, 64));
    await vi.waitFor(() => expect(h.app.model.tabId).toBe("t1"));
    h.app.renderNow();
    const line0 = (await h.screen()).split("\n")[0]!;
    expect(line0).toContain("›");
    expect(line0).not.toContain("‹");
    const right = (h.app as unknown as { tabBarHits: { scrollRight: { x: number } } }).tabBarHits
      .scrollRight.x;
    // 「›」で右へずらすと「‹」が出る。
    h.io.type(down(right, 0) + up(right, 0));
    h.app.renderNow();
    const shifted = (await h.screen()).split("\n")[0]!;
    expect(shifted).toContain("‹");
    expect(shifted).not.toContain("1:long-tab-name-t1 ");
    expect(h.app.model.tabId).toBe("t1"); // ずらすだけで tab は替えない
    // 9 番目の tab へ移ると、それが見えるまでずれる。
    h.io.type("\x029");
    await vi.waitFor(() => expect(h.app.model.tabId).toBe("t9"));
    h.app.renderNow();
    expect((await h.screen()).split("\n")[0]).toContain("9:long-tab-name-t9");
  });

  it("pane の右の罫線のスクロールバー（M9）：つまみを出し、溝を押すと飛び、つまみを動かすとスクロールする", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, Array.from({ length: 300 }, (_, i) => `line${i}`).join("\r\n"));
    await t.flush();
    h.app.renderNow();
    const screen = (await h.screen()).split("\n");
    // 末尾にいるので、つまみは溝（2〜28 行）の下の端。
    expect(screen[28]![62]).toBe("┃");
    expect(screen[2]![62]).toBe("│");
    // 溝の上の端を押す → いちばん上の近くへ。
    h.io.type(down(62, 2));
    expect(t.term.buffer.active.viewportY).toBeLessThan(10);
    // そのままつまみを下の端まで動かす → 末尾へ。
    h.io.type(drag(62, 28) + up(62, 28));
    expect(t.term.buffer.active.viewportY).toBe(t.term.buffer.active.baseY);
    // スクロールバーの押下で境界は動かない。
    expect(h.ws.requests("layout.set_split_ratio")).toEqual([]);
  });

  it("サイドバーのボタン（M14）：並び順の切り替え・畳む「«」、畳んだら tab バーの「»」で開く", async () => {
    const snap = snapshot({
      panes: [
        pane("p1", "t1"),
        pane("p2", "t1"),
        pane("p3", "t2", { agent: agent({ state: "idle", label: "Claude" }) }),
      ],
    });
    const h = await start({ snapshot: snap, cols: 120 });
    h.app.prefs.setLocal({ sidebarCols: 40 });
    h.app.renderNow();
    const hits = (
      h.app as unknown as {
        sidebarHits: { kind: string; y: number; x?: number; section?: string }[];
      }
    ).sidebarHits;
    const sortSpaces = hits.find((x) => x.kind === "sort" && x.section === "spaces")!;
    const sortAgents = hits.find((x) => x.kind === "sort" && x.section === "agents")!;
    h.io.type(down(sortSpaces.x!, sortSpaces.y) + up(sortSpaces.x!, sortSpaces.y));
    h.io.type(down(sortAgents.x!, sortAgents.y) + up(sortAgents.x!, sortAgents.y));
    expect(h.ws.requests("prefs.set").map((r) => r.params)).toEqual([
      { patch: { workspaceSort: "name" } },
      { patch: { agentSort: "priority" } },
    ]);
    expect(h.app.prefs.workspaceSort).toBe("name");
    const collapse = hits.find((x) => x.kind === "collapse")!;
    h.io.type(down(collapse.x!, collapse.y) + up(collapse.x!, collapse.y));
    expect(h.app.prefs.sidebarCollapsed).toBe(true);
    h.app.renderNow();
    expect((await h.screen()).split("\n")[0]!.startsWith("»")).toBe(true);
    h.io.type(down(0, 0) + up(0, 0));
    expect(h.app.prefs.sidebarCollapsed).toBe(false);
  });

  it("spaces の区画が一覧より低ければ、選んだ workspace が見える所までずらし、ホイールで動かせる", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `w${i + 1}`);
    const snap = snapshot({
      workspaces: ids.map((id) => workspace(id, [`t-${id}`], { label: `space-${id}` })),
      tabs: ids.map((id) => tab(`t-${id}`, id, leaf(`p-${id}`))),
      panes: [...ids.map((id) => pane(`p-${id}`, `t-${id}`))].map((p, i) =>
        i === 19 ? { ...p, agent: agent({ label: "Claude" }) } : p,
      ),
    });
    const h = await start({ snapshot: snap });
    h.app.prefs.setLocal({ sidebarSpacesRows: 6 }); // spaces は 5 行（見出しの下）
    h.app.renderNow();
    let text = await h.screen();
    expect(text).toContain("space-w1");
    expect(text).not.toMatch(/^ {3}space-w20/m); // spaces の区画には無い（agents の行の workspace 名は別）
    // navigate モードで下の workspace を選ぶと、そこまでずれる。
    h.io.type("\x02w");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("navigate"));
    for (let i = 0; i < 12; i++) h.io.type("\x1b[B");
    h.app.renderNow();
    text = await h.screen();
    expect(text).toContain("space-w13");
    h.io.type("\x1b");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("terminal"));
    h.app.renderNow();
    expect(await h.screen()).toContain("space-w1 "); // 今の workspace（w1）が見える所へ戻る
    // ホイールで区画を動かせる（今の workspace は隠れてよい）。
    for (let i = 0; i < 3; i++) h.io.type(wheel(5, 2, 65));
    h.app.renderNow();
    text = await h.screen();
    expect(text).not.toContain("space-w1 ");
    expect(text).toContain("space-w10");
  });

  it("リンクを開く道具：シェルを通さない（Windows は rundll32）。http・https だけ", () => {
    const url = "https://example.com/a?x=1&calc.exe";
    expect(linkCommand("win32", url)).toEqual({
      cmd: "rundll32",
      args: ["url.dll,FileProtocolHandler", "https://example.com/a?x=1&calc.exe"],
    });
    expect(linkCommand("darwin", url)).toEqual({ cmd: "open", args: [url] });
    expect(linkCommand("linux", url)).toEqual({ cmd: "xdg-open", args: [url] });
    // file: は開かない（web の D110 と同じ。Windows では実行ファイルを起動しうる）。
    expect(linkCommand("linux", "file:///tmp/a")).toBeNull();
    expect(linkCommand("win32", "file:///C:/Windows/System32/calc.exe")).toBeNull();
    expect(linkCommand("win32", "javascript:alert(1)")).toBeNull();
    expect(linkCommand("linux", "--help")).toBeNull();
  });

  it("全部の動き（?1003）をやめるときはボタンとドラッグの報告を出し直す。mouseCapture が切なら ?1003h も出さない", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.output(new TextEncoder().encode("\x1b[?1003;1006h"));
    await t.flush();
    h.app.renderNow();
    t.output(new TextEncoder().encode("\x1b[?1003l"));
    await t.flush();
    h.app.renderNow();
    expect(h.io.output()).toContain("\x1b[?1003l\x1b[?1000h\x1b[?1002h\x1b[?1006h");
    const before = h.io.output().length;
    h.app.prefs.apply({ tui: { mouseCapture: false } }, 99);
    t.output(new TextEncoder().encode("\x1b[?1003h"));
    await t.flush();
    h.app.renderNow();
    expect(h.io.output().slice(before)).not.toContain("\x1b[?1003h");
  });
});

describe("従来形式（X10）のマウスの動き", () => {
  it("ボタンを押していない動き（ボタン 3）は -1（左ボタンのドラッグと取り違えない）", () => {
    const d = new InputDecoder();
    const ev = d.feed(
      new TextEncoder().encode("\x1b[M" + String.fromCharCode(32 + 35, 32 + 5, 32 + 6)),
    );
    expect(ev).toEqual([
      {
        kind: "mouse",
        action: "move",
        button: -1,
        x: 4,
        y: 5,
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      },
    ]);
  });
});

describe("04 review（リンク・境界の送り方）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  it("OSC 8 のリンク（見える文字に URL が無い）も Ctrl＋押下で開く", async () => {
    const opened: string[] = [];
    const h = await startedApp({ openUrl: (u) => opened.push(u) });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, "see \x1b]8;id=1;https://docs.example/p\x1b\\the docs\x1b]8;;\x1b\\ here");
    await t.flush();
    h.app.renderNow();
    h.io.type(down(27 + 5, 2, 16) + up(27 + 5, 2, 16)); // 「the docs」の中
    expect(opened).toEqual(["https://docs.example/p"]);
    h.io.type(down(27 + 14, 2, 16) + up(27 + 14, 2, 16)); // リンクの後
    expect(opened).toHaveLength(1);
  });

  it("境界のドラッグの比率は 50ms 間隔にまとめて送り、離したら最後の値をすぐ送る", async () => {
    const h = await startedApp();
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.app.renderNow();
    h.io.type(down(63, 10));
    for (let x = 62; x > 52; x--) h.io.type(drag(x, 10));
    expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 80));
    expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(1);
    h.io.type(drag(50, 10) + up(50, 10));
    const all = h.ws.requests("layout.set_split_ratio");
    expect(all).toHaveLength(2);
    expect((all[1]!.params as { ratio: number }).ratio).toBeCloseTo((50 - 26) / 74);
  });
});
