import type { AgentInfo, SubagentInfo } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TuiDispatcher } from "../actions/TuiDispatcher.js";
import { menuItems } from "../modes/ContextMenu.js";
import { plainText } from "../modes/SubagentList.js";
import { startedApp } from "../testing/appHarness.js";
import { agent, pane, snapshot } from "../testing/fixtures.js";

// 20261004-subagent-display。端末版: サイドバーの行の末尾の `⤷n`・クリック・一覧の overlay・pane のメニュー・操作 show_subagents・自動で閉じる。

const down = (x: number, y: number, b = 0) => `\x1b[<${b};${x + 1};${y + 1}M`;
const up = (x: number, y: number, b = 0) => `\x1b[<${b};${x + 1};${y + 1}m`;
const sub = (id: string, over: Partial<SubagentInfo> = {}): SubagentInfo => ({
  id,
  startedAt: Date.now() - 65_000,
  ...over,
});
const subs = (n: number, type = "Explore") => ({
  count: n,
  items: Array.from({ length: Math.min(n, 64) }, (_, i) =>
    sub(`s${i}`, { type, description: `説明${i}` }),
  ),
});

describe("端末版のサブエージェントの表示", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  /** p3（w2/t2。agents の区画に出る）にエージェントを置く。`extra` でサブエージェントを足す。 */
  async function start(extra: Partial<AgentInfo> = {}, opts: { cols?: number } = {}) {
    const snap = snapshot({
      panes: [
        pane("p1", "t1"),
        pane("p2", "t1"),
        pane("p3", "t2", {
          label: "worker",
          agent: agent({ state: "working", label: "Claude", ...extra }),
        }),
      ],
    });
    const h = await startedApp({ snapshot: snap, ...opts });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    await h.screen();
    h.app.renderNow();
    const hits = () =>
      (
        h.app as unknown as {
          sidebarHits: { kind: string; y: number; x?: number; w?: number; paneId?: string }[];
        }
      ).sidebarHits;
    const badge = () => hits().find((x) => x.kind === "subagents");
    return { ...h, hits, badge };
  }
  /** `TuiApp` の操作の入口（protected。試験では直接呼ぶ）。 */
  const dispatcherOf = (app: object): TuiDispatcher =>
    (app as unknown as { dispatcher: TuiDispatcher }).dispatcher;

  it("1 件以上のとき、エージェントの行の 1 行目の末尾に ⤷n が出る。0 件・項目なしでは出ない", async () => {
    const h = await start({ subagents: subs(3) });
    const screen = await h.screen();
    const line = screen.split("\n").find((l) => l.includes("⤷3"));
    expect(line).toBeDefined();
    expect(line!.slice(0, line!.indexOf("│")).trimEnd().endsWith("⤷3")).toBe(true);
    expect(h.badge()).toMatchObject({ paneId: "p3", w: 2 });
    await h.close();
    closers.pop();
    for (const extra of [{ subagents: { count: 0, items: [] } }, {}] as Partial<AgentInfo>[]) {
      const g = await start(extra);
      expect(g.badge()).toBeUndefined();
      expect(await g.screen()).not.toContain("⤷");
    }
  });

  it("⤷n の桁範囲のクリックで一覧が開く（pane へは移らない）。行のほかの場所のクリックは今までどおり pane へ", async () => {
    const h = await start({ subagents: subs(2) });
    const b = h.badge()!;
    h.io.type(down(b.x!, b.y) + up(b.x!, b.y));
    expect(h.app.ui.dialogContext).toMatchObject({ kind: "subagents", paneId: "p3" });
    expect(h.app.model.focusedPaneId).toBe("p1");
    h.app.renderNow();
    const screen = await h.screen();
    expect(screen).toContain("サブエージェント — worker");
    expect(screen).toContain("Explore");
    expect(screen).toContain("説明0");
    expect(screen).toContain("1分");
    expect(h.ws.requests("pane.focus")).toHaveLength(0);
    h.io.type("\x1b"); // Esc
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
    // 行の別の場所（印の桁）は今までどおり
    h.app.renderNow();
    const row = h.hits().find((x) => x.kind === "agent")!;
    h.io.type(down(3, row.y) + up(3, row.y));
    expect(h.app.model.focusedPaneId).toBe("p3");
    expect(h.app.ui.dialogContext).toBeNull();
  });

  it("上下で読み（ホイールも）、Esc で閉じる。一覧が長ければ ↑↓ の印が出る。64 件を超えれば「ほか n 件」", async () => {
    const h = await start(
      {
        subagents: {
          count: 70,
          items: Array.from({ length: 64 }, (_, i) =>
            sub(`s${i}`, { type: `T${i}`, description: `d${i}` }),
          ),
        },
      },
      { cols: 100 },
    );
    dispatcherOf(h.app).showSubagentsOf("p3");
    expect(h.app.ui.dialogContext?.kind).toBe("subagents");
    h.app.renderNow();
    let screen = await h.screen();
    expect(screen).toContain("T0");
    expect(screen).not.toContain("T63");
    for (let i = 0; i < 80; i++) h.io.type("\x1b[B"); // ↓
    h.app.renderNow();
    screen = await h.screen();
    expect(screen).toContain("T63");
    expect(screen).toContain("ほか 6 件");
    expect(screen).not.toContain("T0 ");
    for (let i = 0; i < 80; i++) h.io.type("\x1b[A");
    h.app.renderNow();
    screen = await h.screen();
    expect(screen).toContain("T0");
    h.io.type("\x1b[F"); // End
    h.app.renderNow();
    expect(await h.screen()).toContain("ほか 6 件");
    h.io.type("\x1b[H"); // Home
    h.app.renderNow();
    expect(await h.screen()).toContain("T0");
    for (let i = 0; i < 80; i++) h.io.type("\x1b[<65;50;15M"); // 一覧の中のホイール（下）
    h.app.renderNow();
    expect(await h.screen()).toContain("ほか 6 件");
    for (let i = 0; i < 80; i++) h.io.type("\x1b[<64;50;15M"); // 上
    h.app.renderNow();
    expect(await h.screen()).toContain("T0");
    h.io.type("\x1b");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
  });

  it("操作 show_subagents（既定のキーは無い）: フォーカスしている pane のエージェントの一覧を開く。件数が 0・エージェントなしでは何もしない", async () => {
    const h = await start({ subagents: subs(2) });
    dispatcherOf(h.app).run({ type: "showSubagents" });
    expect(h.app.ui.dialogContext).toBeNull(); // 焦点は p1（エージェントなし）
    h.app.model.focusPane("p3");
    dispatcherOf(h.app).run({ type: "showSubagents" });
    expect(h.app.ui.dialogContext).toMatchObject({ kind: "subagents", paneId: "p3" });
    h.app.ui.closeDialog();
    // 既定のキーは無い（利用者が設定で割り当てる。次の試験）。
    expect(
      (h.app as unknown as { keymap: { hintFor(id: string): string | null } }).keymap.hintFor(
        "show_subagents",
      ),
    ).toBeNull();
  });

  it("利用者が設定で割り当てたキー（prefs.keys）で、キーボードだけで一覧が開き、Esc で閉じる", async () => {
    const h = await start({ subagents: subs(2) });
    h.app.model.focusPane("p3");
    h.ws.event("prefs.changed", {
      prefs: { keys: { bindings: { show_subagents: ["prefix+u"] } } },
      rev: 3,
      byClientId: "x",
    });
    await vi.waitFor(() =>
      expect(
        (h.app as unknown as { keymap: { hintFor(id: string): string | null } }).keymap.hintFor(
          "show_subagents",
        ),
      ).not.toBeNull(),
    );
    h.io.type("\x02u"); // prefix（ctrl+b）→ u
    await vi.waitFor(() =>
      expect(h.app.ui.dialogContext).toMatchObject({ kind: "subagents", paneId: "p3" }),
    );
    h.io.type("\x1b");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
  });

  it("pane のメニューに「サブエージェントの一覧」が出る（1 件以上のときだけ）。選ぶと一覧が開く", async () => {
    const h = await start({ subagents: subs(2) });
    const deps = { ui: h.app.ui, model: h.app.model, actions: dispatcherOf(h.app) };
    const labels = (paneId: string) =>
      menuItems({ target: { kind: "pane", paneId }, x: 0, y: 0 } as never, deps).map(
        (i) => i.label,
      );
    expect(labels("p3")).toContain("サブエージェントの一覧");
    expect(labels("p1")).not.toContain("サブエージェントの一覧");
    menuItems({ target: { kind: "pane", paneId: "p3" }, x: 0, y: 0 } as never, deps)
      .find((i) => i.label === "サブエージェントの一覧")!
      .run();
    expect(h.app.ui.dialogContext).toMatchObject({ kind: "subagents", paneId: "p3" });
    // キーボードだけ: 右クリックのメニューを開いて項目を選ぶ代わりに、メニューの部品に ↓ と Enter を送る。
    h.app.ui.closeDialog();
    h.app.ui.openContextMenu({ kind: "pane", paneId: "p3" }, { x: 5, y: 5 });
    const n = menuItems({ target: { kind: "pane", paneId: "p3" } } as never, deps).findIndex(
      (i) => i.label === "サブエージェントの一覧",
    );
    for (let i = 0; i < n; i++) h.io.type("\x1b[B");
    h.io.type("\r");
    await vi.waitFor(() =>
      expect(h.app.ui.dialogContext).toMatchObject({ kind: "subagents", paneId: "p3" }),
    );
  });

  it("開いている間に、エージェントが居なくなる・入れ替わる・pane が閉じると閉じる。同じ instanceId の更新では閉じず、一覧が更新される", async () => {
    const h = await start({ subagents: subs(2) });
    dispatcherOf(h.app).showSubagentsOf("p3");
    expect(h.app.ui.dialogContext).toMatchObject({ kind: "subagents", instanceId: "a1" });
    h.ws.event("pane.agent_status_changed", {
      paneId: "p3",
      agent: agent({ state: "idle", label: "Claude", subagents: subs(1, "NEW") }),
    });
    expect(h.app.ui.dialogContext).not.toBeNull();
    h.app.renderNow();
    expect(await h.screen()).toContain("NEW");
    h.ws.event("pane.agent_status_changed", {
      paneId: "p3",
      agent: agent({ instanceId: "other", label: "Claude" }),
    });
    expect(h.app.ui.dialogContext).toBeNull();
    dispatcherOf(h.app).showSubagentsOf("p3"); // 項目が無い（分からない）ので開かない
    expect(h.app.ui.dialogContext).toBeNull();
    h.ws.event("pane.agent_status_changed", {
      paneId: "p3",
      agent: agent({ instanceId: "other", subagents: subs(1) }),
    });
    dispatcherOf(h.app).showSubagentsOf("p3");
    expect(h.app.ui.dialogContext).not.toBeNull();
    h.ws.event("pane.agent_status_changed", { paneId: "p3", agent: null });
    expect(h.app.ui.dialogContext).toBeNull();
    h.ws.event("pane.agent_status_changed", {
      paneId: "p3",
      agent: agent({ instanceId: "x", subagents: subs(1) }),
    });
    dispatcherOf(h.app).showSubagentsOf("p3");
    expect(h.app.ui.dialogContext).not.toBeNull();
    h.ws.event("pane.closed", { paneId: "p3" });
    expect(h.app.ui.dialogContext).toBeNull();
  });

  it("説明の中の制御文字は空白にして出す（画面を壊さない）", async () => {
    const h = await start({
      subagents: { count: 1, items: [sub("a", { type: "T", description: "行1\x1b[2J\n行2" })] },
    });
    dispatcherOf(h.app).showSubagentsOf("p3");
    h.app.renderNow();
    const screen = await h.screen();
    expect(screen).toContain("行1 [2J 行2");
  });

  it("⤷n の桁を右クリックすると、その pane のメニュー（サブエージェントの一覧つき）が開く", async () => {
    const h = await start({ subagents: subs(2) });
    const b = h.badge()!;
    h.io.type(down(b.x!, b.y, 2));
    expect(h.app.ui.contextMenu?.target).toEqual({ kind: "pane", paneId: "p3" });
  });

  it("2 桁・3 桁の件数でも印は行の末尾に収まり、桁範囲は印の幅と一致する。全角の種類・説明でも桁がずれない", async () => {
    const h = await start({
      subagents: {
        count: 123,
        items: [
          sub("a", {
            type: "調査担当（全角の種類）",
            background: true,
            description: "これは全角の長い説明です。".repeat(8),
          }),
        ],
      },
    });
    const b = h.badge()!;
    expect(b.w).toBe(4); // ⤷123
    const screen = await h.screen();
    const line = screen.split("\n").find((l) => l.includes("⤷123"))!;
    expect(line.slice(0, line.indexOf("│")).trimEnd().endsWith("⤷123")).toBe(true);
    dispatcherOf(h.app).showSubagentsOf("p3");
    h.app.renderNow();
    const box = (await h.screen()).split("\n").filter((l) => l.includes("調査担当"));
    expect(box).toHaveLength(1);
    // 箱の右の罫線と経過時間が同じ行で桁をそろえて収まる（全角の説明が桁を押しのけていない）。
    expect(box[0]!).toMatch(/1分\s*│/);
  });

  it("狭いサイドバー（幅 10）では、印を出す・出さないの境界で行を壊さない（出さないとき当たりも無い）", async () => {
    const h = await start({ subagents: subs(2) });
    h.io.type(down(25, 10) + `\x1b[<32;${6};${11}M` + up(5, 10)); // 右端の境界を左へドラッグして幅を縮める
    h.app.renderNow();
    const w = (h.app as unknown as { prefs: { sidebarCols: number } }).prefs.sidebarCols;
    expect(w).toBeLessThan(26);
    const screen = await h.screen();
    const showing = h.badge() !== undefined;
    expect(screen.includes("⤷2")).toBe(showing);
    for (const hit of h.hits().filter((x) => x.kind === "subagents"))
      expect(hit.x! + hit.w!).toBeLessThanOrEqual(w - 1);
  });

  it("plainText: C0・DEL・C1（0x9b）・行区切り・双方向の制御を空白にし、ふつうの文字（全角・絵文字）は残す", () => {
    expect(plainText("a\x1b[2Jb\x07c\x7fd\u009b31me\u2028f\u2029g\u202eh\u2066i\u2069j")).toBe(
      "a [2Jb c d 31me f g h i j",
    );
    expect(plainText("全角と😀と ascii")).toBe("全角と😀と ascii");
  });

  it("一覧が長いとき、↑↓ の印は右端の桁に出て、経過時間の最後の文字を上書きしない", async () => {
    const h = await start({
      subagents: {
        count: 70,
        items: Array.from({ length: 64 }, (_, i) =>
          sub(`s${i}`, { type: `T${i}`, startedAt: Date.now() - 65_000 }),
        ),
      },
    });
    dispatcherOf(h.app).showSubagentsOf("p3");
    h.app.renderNow(); // 一覧の大きさは描いて初めて決まる（実際の操作は、描いた後のキー）
    for (let i = 0; i < 3; i++) h.io.type("\x1b[B"); // 少し下げて ↑ も出す
    h.app.renderNow();
    const rows = (await h.screen())
      .split("\n")
      .filter((l) => /T\d+\s/.test(l) && l.includes("│", 30));
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) expect(r).toMatch(/1分\s*[↑↓]?\s*│/); // 経過時間が欠けていない
    expect(rows.some((r) => /1分\s*↑\s*│/.test(r))).toBe(true);
    expect(rows.some((r) => /1分\s*↓\s*│/.test(r))).toBe(true);
  });
});
