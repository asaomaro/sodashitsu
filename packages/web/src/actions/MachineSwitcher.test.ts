import { describe, expect, it } from "vitest";
import { MachineSwitcher, type MachineSwitcherPorts } from "./MachineSwitcher.js";

/** 切り替えの手順（20260927-multi-host-machines の T13）。ports の呼ばれた順を記録する。 */
function setup(opts: { selectable?: (id: string) => boolean } = {}) {
  const calls: string[] = [];
  let selected = "local";
  const ticks: (() => void)[] = [];
  const ports: MachineSwitcherPorts = {
    selectedId: () => selected,
    selectMachine: (id) => {
      selected = id;
      calls.push(`select:${id}`);
    },
    isSelectable: (id) => opts.selectable?.(id) ?? true,
    setViewScope: (id) => calls.push(`viewScope:${id}`),
    setSeenScope: (id) => calls.push(`seenScope:${id}`),
    rememberView: (w, t) => calls.push(`remember:${w}/${t}`),
    forgetStoredView: () => calls.push("forget"),
    focusWorkspaceHere: (w) => calls.push(`focusHere:${w}`),
    resetNotifications: () => calls.push("resetNotifications"),
    resetBaseline: () => calls.push("resetBaseline"),
    clearSession: () => calls.push("clearSession"),
    resetView: () => calls.push("resetView"),
    nextTick: () => new Promise<void>((r) => ticks.push(r)),
    disposeTerminals: () => calls.push("disposeTerminals"),
    retarget: (url) => calls.push(`retarget:${url}`),
    wsUrlFor: (id) => (id === "local" ? "/ws" : `/ws?machine=${id}`),
    requestWorkspaceFocus: (w) => calls.push(`workspace.focus:${w}`),
    requestPaneFocus: (p) => calls.push(`pane.focus:${p}`),
  };
  const sw = new MachineSwitcher(ports);
  const tick = async (): Promise<void> => {
    for (const r of ticks.splice(0)) r();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { sw, calls, tick };
}

describe("MachineSwitcher（T13）", () => {
  it("状態を入れ替えてから、部品が外れた後に端末を捨てて行き先を替える（この順）", async () => {
    const { sw, calls, tick } = setup();
    const done = sw.switchTo("m1", { workspaceId: "w3", tabId: "t4" });
    expect(calls).toEqual([
      "select:m1",
      "viewScope:m1",
      "seenScope:m1",
      "remember:w3/t4",
      "resetNotifications",
      "resetBaseline",
      "clearSession",
      "resetView",
    ]);
    await tick();
    expect(await done).toBe(true);
    expect(calls.slice(-2)).toEqual(["disposeTerminals", "retarget:/ws?machine=m1"]);
  });

  it("見出しから（target なし）はそのマシンの記憶を消す（今の focus を表示）", async () => {
    const { sw, calls, tick } = setup();
    const done = sw.switchTo("m1");
    await tick();
    await done;
    expect(calls).toContain("forget");
    expect(calls.some((c) => c.startsWith("remember"))).toBe(false);
  });

  it("同じマシンなら切り替えず、target があればそこを表示するだけ", async () => {
    const { sw, calls } = setup();
    expect(await sw.switchTo("local", { workspaceId: "w1", tabId: "t1" })).toBe(false);
    expect(calls).toEqual(["focusHere:w1"]);
  });

  it("選べない（切れている）マシンには切り替えない。force なら切り替える", async () => {
    const { sw, calls, tick } = setup({ selectable: () => false });
    expect(await sw.switchTo("m1", { workspaceId: "w1", tabId: "t1" })).toBe(false);
    expect(calls).toEqual([]);
    const done = sw.switchTo("m1", undefined, { force: true });
    await tick();
    expect(await done).toBe(true);
  });

  it("切り替えの途中にさらに切り替えたら、後の切り替えだけが行き先を替える", async () => {
    const { sw, calls, tick } = setup();
    const a = sw.switchTo("m1", { workspaceId: "w1", tabId: "t1" });
    const b = sw.switchTo("m2", { workspaceId: "w9", tabId: "t9" });
    await tick();
    expect(await a).toBe(false);
    expect(await b).toBe(true);
    expect(calls.filter((c) => c.startsWith("retarget"))).toEqual(["retarget:/ws?machine=m2"]);
    expect(calls.filter((c) => c === "disposeTerminals")).toHaveLength(1);
  });

  it("workspace.focus は切り替えの直後の最初の onOpened で 1 回だけ（後の繋ぎ直しでは送らない）", async () => {
    const { sw, calls, tick } = setup();
    const done = sw.switchTo("m1", { workspaceId: "w3", tabId: "t4" });
    await tick();
    await done;
    sw.onOpened();
    sw.onOpened();
    expect(calls.filter((c) => c.startsWith("workspace.focus"))).toEqual(["workspace.focus:w3"]);
    // 後勝ち: 古い切り替えの target は送らない
    const s2 = setup();
    const x = s2.sw.switchTo("m1", { workspaceId: "w1", tabId: "t1" });
    const y = s2.sw.switchTo("m2");
    await s2.tick();
    await Promise.all([x, y]);
    s2.sw.onOpened();
    expect(s2.calls.filter((c) => c.startsWith("workspace.focus"))).toEqual([]);
  });

  it("pane を指した切り替え（連携のグラフのノードから。04）は、workspace の後にその pane に焦点を置く（最初の onOpened だけ）", async () => {
    const { sw, calls, tick } = setup();
    const done = sw.switchTo("m1", { workspaceId: "w3", tabId: "t4", paneId: "p7" });
    await tick();
    await done;
    sw.onOpened();
    sw.onOpened();
    expect(calls.filter((c) => c.includes(".focus:"))).toEqual([
      "workspace.focus:w3",
      "pane.focus:p7",
    ]);
  });
});
