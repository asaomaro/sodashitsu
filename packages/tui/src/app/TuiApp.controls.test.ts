import { stateGlyph } from "@sodashitsu/client-core";
import { afterEach, expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { snapshot, pane, agent, tab, workspace, leaf } from "../testing/fixtures.js";
import { paneButtons } from "../render/chrome/frame.js";
import type { SidebarHit } from "../render/chrome/sidebar.js";
import type { LayoutResult } from "../layout/computeLayout.js";
const close: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of close.splice(0)) await c();
});
const click = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M\x1b[<0;${x + 1};${y + 1}m`;
it("操作ボタン・下部の新規メニュー・通知・閉じた帯を描画しクリックできる", async () => {
  const h = await startedApp();
  close.push(h.close);
  await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
  h.app.renderNow();
  const get = () => h.app as unknown as { sidebarHits: SidebarHit[]; lastLayout: LayoutResult };
  const button = (action: string) =>
    get().sidebarHits.find((b) => b.kind === "control" && b.action === action)! as Extract<
      SidebarHit,
      { kind: "control" }
    >;
  expect(await h.screen()).toContain("利用状況");
  expect(await h.screen()).toContain("[│][─][□][×]");
  const box = get().lastLayout.panes[0]!;
  const split = paneButtons(box.frame, false, false)[0]!;
  h.io.type(click(split.x, box.frame.y));
  expect(h.ws.requests("pane.split").at(-1)?.params).toMatchObject({
    paneId: "p1",
    direction: "right",
  });
  const fresh = button("new");
  h.io.type(click(fresh.x, fresh.y));
  expect(await h.screen()).not.toContain("知らせの一覧");
  h.app.renderNow();
  expect(await h.screen()).toContain("workspace");
  expect(await h.screen()).toContain("グループ…");
  h.io.type("\x1b");
  await vi.waitFor(() => expect(h.app.ui.contextMenu).toBeNull());
  h.app.renderNow();
  const bell = button("bell");
  h.io.type(click(bell.x, bell.y));
  expect(h.app.ui.dialogContext).toEqual({ kind: "notifications" });
  h.io.type("\x1b");
  await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
  h.io.type("\x02b");
  h.app.renderNow();
  expect(get().lastLayout.sidebar?.w).toBe(3);
  expect(await h.screen()).toContain("»");
  const expand = get().sidebarHits.find((b) => b.kind === "collapse")! as Extract<
    SidebarHit,
    { kind: "collapse" }
  >;
  expect(expand.y).toBe(29);
  h.io.type(click(expand.x, expand.y));
  expect(h.app.prefs.sidebarCollapsed).toBe(false);
});
it("利用状況画面を配信で更新し、入力をPTYへ送らず、一覧からペインへ戻れる", async () => {
  const u = {
    paneId: "p1",
    kind: "codex",
    model: "sample",
    tokens: { basis: "cumulative", total: 1234 },
    source: "rollout",
    updatedAt: Date.now(),
    contextUsedPct: 25,
  };
  const h = await startedApp({
    snapshot: snapshot({
      panes: [pane("p1", "t1", { agent: agent({ kind: "codex" }) }), pane("p2", "t1")],
    }),
    respond: { "agent.usage": { panes: { p1: u }, accounts: [] } },
  });
  close.push(h.close);
  await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
  h.app.ui.setScreen("dashboard");
  await vi.waitFor(() => expect(h.app.usage.status).toBe("ready"));
  h.app.renderNow();
  expect(await h.screen()).toContain("1,234");
  expect(h.ws.requests("client.view").at(-1)?.params).toMatchObject({ visible: [] });
  const count = h.ws.sent.filter((m) => m instanceof Uint8Array).length;
  h.io.type("x\x1b[200~oops\x1b[201~");
  expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toHaveLength(count);
  h.ws.event("agent.usage_changed", {
    panes: { p1: { ...u, tokens: { basis: "cumulative", total: 5678 } } },
  });
  h.app.renderNow();
  expect(await h.screen()).toContain("5,678");
  h.io.type("\r");
  expect(h.app.ui.screen).toBe("base");
  expect(h.ws.requests("agent.usage_watch").at(-1)?.params).toEqual({ on: false });
  h.io.type("\x02U");
  await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "usage", paneId: "p1" }));
  await vi.waitFor(() => expect(h.app.usage.status).toBe("ready"));
  h.app.renderNow();
  expect(await h.screen()).toContain("コンテキスト");
  expect(paneButtons({x:0,y:0,w:40,h:10},true,false)[0]!.action).toBe("info");
});
it("幅10のサイドバーでもベルは新規と重ならず、短い画面でもペイン一覧へ移れる", async () => {
  const u = {
    paneId: "p1",
    kind: "codex",
    model: "sample",
    tokens: { basis: "cumulative", total: 1234 },
    source: "rollout",
    updatedAt: Date.now(),
  };
  const h = await startedApp({
    rows: 8,
    snapshot: snapshot({
      panes: [
        pane("p1", "t1", { label: "worker", agent: agent({ kind: "codex" }) }),
        pane("p2", "t1"),
      ],
    }),
    respond: {
      "agent.usage": {
        panes: { p1: u },
        accounts: Array.from({ length: 10 }, (_, i) => ({
          kind: "codex",
          accountKey: String(i),
          label: "account" + i,
          windows: [{ label: "週", usedPct: 20 }],
          source: "rollout",
          asOf: Date.now(),
        })),
      },
    },
  });
  close.push(h.close);
  await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
  h.app.prefs.setLocal({ sidebarCols: 10 });
  h.app.renderNow();
  const hits = (h.app as unknown as { sidebarHits: SidebarHit[] }).sidebarHits;
  const buttons = hits.filter(
    (b) => b.kind === "control" && ["new", "menu", "bell"].includes(b.action),
  ) as Extract<SidebarHit, { kind: "control" }>[];
  for (let i = 0; i < buttons.length; i++)
    for (let j = i + 1; j < buttons.length; j++) {
      const a = buttons[i]!,
        b = buttons[j]!;
      expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
    }
  const bell = buttons.find((b) => b.action === "bell")!;
  h.io.type(click(bell.x, bell.y));
  expect(h.app.ui.dialogContext).toEqual({ kind: "notifications" });
  h.app.ui.closeDialog();
  h.app.ui.setScreen("dashboard");
  await vi.waitFor(() => expect(h.app.usage.status).toBe("ready"));
  h.app.renderNow();
  expect(await h.screen()).toContain("worker");
  h.io.type("\r");
  expect(h.app.ui.screen).toBe("base");
});

it("畳んだ帯にworkspace集約とagentの状態を描き、agentの印からペインへ戻れる", async () => {
  const h=await startedApp({snapshot:snapshot({panes:[pane("p1","t1",{agent:agent({state:"blocked"})}),pane("p2","t1"),pane("p3","t2")]})});close.push(h.close);
  await vi.waitFor(()=>expect(h.ws.requests("client.view")).toHaveLength(1));
  h.io.type("\x02b");h.app.renderNow();
  const hits=(h.app as unknown as {sidebarHits:SidebarHit[]}).sidebarHits;
  const agentHit=hits.find(h=>h.kind==="agent")!;
  expect(agentHit).toMatchObject({kind:"agent",paneId:"p1",section:"agents"});
  expect((await h.screen()).split("\n")[agentHit.y]!).toContain(stateGlyph("blocked"));
  h.app.model.focusPane("p3");h.app.renderNow();
  h.io.type(click(0,agentHit.y));expect(h.app.model.focusedPaneId).toBe("p1");
});
it("workspaceの掴みと配置先を描き、別タブへのペイン移動先も強調する",async()=>{
 const h=await startedApp({snapshot:snapshot({workspaces:[workspace("w1",["t1","dest"]),workspace("w2",["t2"])],tabs:[tab("t1","w1",leaf("p1")),tab("dest","w1",leaf("pd"),{label:"destination"}),tab("t2","w2",leaf("p3"))],panes:[pane("p1","t1"),pane("pd","dest"),pane("p3","t2")]})});close.push(h.close);
 await vi.waitFor(()=>expect(h.ws.requests("client.view")).toHaveLength(1));h.app.renderNow();
 const state=()=>h.app as unknown as {sidebarHits:SidebarHit[];tabBarHits:{tabs:{tabId:string;x:number;w:number}[]};lastLayout:LayoutResult};
 const ws=state().sidebarHits.filter(h=>h.kind==="workspace");
 const move=(x:number,y:number)=>`\x1b[<32;${x+1};${y+1}M`;
 h.io.type(`\x1b[<0;9;${ws[0]!.y+1}M`+move(8,ws[1]!.y));h.app.renderNow();
 expect(await h.screen()).toContain("↕");expect(await h.screen()).toContain("▶");
 h.io.type("\x1b");await vi.waitFor(async()=>{h.app.renderNow();expect(await h.screen()).not.toContain("↕");});
 const frame=state().lastLayout.panes[0]!.frame;
 const dest=state().tabBarHits.tabs.find(t=>t.tabId==="dest")!;
 h.io.type(`\x1b[<0;${frame.x+3};${frame.y+1}M`+move(dest.x+1,state().lastLayout.tabBar.y));h.app.renderNow();
 expect(await h.screen()).toContain("▶destination");
 h.io.type(`\x1b[<0;${dest.x+2};${state().lastLayout.tabBar.y+1}m`);
 expect(h.ws.requests("pane.move_to_tab").at(-1)?.params).toMatchObject({paneId:"p1",targetTabId:"dest"});
});
