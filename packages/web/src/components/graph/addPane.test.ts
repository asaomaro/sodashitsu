import { describe, expect, it, vi } from "vitest";
import type { Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { AddPaneError, addPane, autoAgentName, splitDirectionOf, splitSourceOf, type AddPaneDeps } from "./addPane.js";

// 20261008-graph-first の PR3 T14c・T14d：グラフから pane を足す進行。
const ws = { id: "w1", tabIds: ["t1", "t2"], activeTabId: "t2" } as unknown as Workspace;
const tabs = new Map([
  ["t1", { id: "t1", focusedPaneId: "p1" } as unknown as Tab],
  ["t2", { id: "t2", focusedPaneId: "p3" } as unknown as Tab],
]);
const panes = new Map<string, Pane>([
  ["p1", { id: "p1", tabId: "t1", cols: 200, rows: 40 } as Pane],
  ["p2", { id: "p2", tabId: "t2", cols: 80, rows: 40 } as Pane],
  ["p3", { id: "p3", tabId: "t2", cols: 100, rows: 40 } as Pane],
]);

function setup(over: Partial<AddPaneDeps> = {}, handlers: Record<string, (p: unknown) => unknown> = {}) {
  const calls: { method: string; params: unknown }[] = [];
  const nodes = new Set<string>();
  const deps: AddPaneDeps = {
    conn: {
      request: async (method, params) => {
        calls.push({ method, params });
        const h = handlers[method];
        if (h) return h(params);
        if (method === "pane.split") {
          panes.set("pNew", { id: "pNew", tabId: "t2", cols: 50, rows: 20 } as Pane);
          nodes.add("local:pNew");
          return { pane: panes.get("pNew") };
        }
        return {};
      },
    },
    workspaces: new Map([["w1", ws]]),
    tabs,
    panes,
    newCwdFor: (id) => ({ policy: "inherit", from: id }) as never,
    hasNode: (k) => nodes.has(k),
    updateGraph: async (build) => {
      calls.push({ method: "graph.update", params: build() });
      return { ok: true };
    },
    agentNames: () => new Set(),
    sleep: async () => {},
    waitMs: 50,
    ...over,
  };
  return { deps, calls };
}

describe("分割する pane と向き", () => {
  it("選ばれている tab の、最後にフォーカスのあった pane。向きは桁が行の 2 倍以上なら右、そうでなければ下", () => {
    const { deps } = setup();
    expect(splitSourceOf(deps, "w1")!.id).toBe("p3"); // t2 の focusedPane
    expect(splitSourceOf(deps, "nope")).toBeNull();
    expect(splitDirectionOf({ cols: 80, rows: 40 })).toBe("right");
    expect(splitDirectionOf({ cols: 79, rows: 40 })).toBe("down");
    expect(splitDirectionOf({ cols: 100, rows: 40 })).toBe("right");
  });
  it("自動の名前は、種類の id に連番。使われていれば次", () => {
    expect(autoAgentName("claude", new Set())).toBe("claude-1");
    expect(autoAgentName("claude", new Set(["claude-1", "claude-2"]))).toBe("claude-3");
    expect(autoAgentName("Kiro CLI!", new Set())).toBe("kirocli-1");
  });
});

describe("addPane", () => {
  it("シェル: pane.split だけ（agent.start は送らない）。ノードが出たら onNode", async () => {
    const { deps, calls } = setup();
    const onNode = vi.fn();
    const r = await addPane(deps, { workspaceId: "w1", kind: "shell", name: "", supervisorKey: null }, { onNode });
    expect(r).toEqual({ paneId: "pNew", key: "local:pNew" });
    expect(calls.map((c) => c.method)).toEqual(["pane.split"]);
    expect(calls[0]!.params).toMatchObject({ paneId: "p3", direction: "right" });
    expect(onNode).toHaveBeenCalledWith("local:pNew", "pNew");
  });

  it("エージェント: 送るのは name・kind・paneId と空の args だけ。監督の線（配下＝新しい pane、監督役＝選んでいたノード）", async () => {
    const { deps, calls } = setup();
    await addPane(deps, { workspaceId: "w1", kind: "claude", name: "reviewer", supervisorKey: "local:p1" });
    const start = calls.find((c) => c.method === "agent.start")!;
    expect(Object.keys(start.params as object).sort()).toEqual(["args", "kind", "name", "paneId"]);
    expect(start.params).toEqual({ name: "reviewer", kind: "claude", paneId: "pNew", args: [] });
    expect(calls.at(-1)).toEqual({ method: "graph.update", params: [{ op: "add_link", kind: "supervise", from: "local:pNew", to: "local:p1" }] });
  });

  it("名前が空なら自動の名前。名前の書式が合わなければ、何も送らずに断る", async () => {
    const { deps, calls } = setup();
    await addPane(deps, { workspaceId: "w1", kind: "codex", name: "", supervisorKey: null });
    expect((calls.find((c) => c.method === "agent.start")!.params as { name: string }).name).toBe("codex-1");
    const s2 = setup();
    await expect(addPane(s2.deps, { workspaceId: "w1", kind: "claude", name: "Bad Name", supervisorKey: null })).rejects.toThrow(AddPaneError);
    expect(s2.calls).toEqual([]);
  });

  it("新しいシェルの準備が間に合わず agent_pane_busy のときは、やり直す。別の失敗は、すぐ理由と pane の id つきで", async () => {
    let n = 0;
    const busy = Object.assign(new Error("busy"), { code: "agent_pane_busy" });
    const s = setup({}, { "agent.start": () => { if (++n < 3) throw busy; return {}; } });
    await addPane(s.deps, { workspaceId: "w1", kind: "claude", name: "a", supervisorKey: null });
    expect(n).toBe(3);
    const taken = Object.assign(new Error("x"), { code: "agent_name_taken" });
    const s2 = setup({}, { "agent.start": () => { throw taken; } });
    const err = await addPane(s2.deps, { workspaceId: "w1", kind: "claude", name: "a", supervisorKey: null }).catch((e: unknown) => e as AddPaneError);
    expect(err).toBeInstanceOf(AddPaneError);
    expect(err.message).toContain("その名前は別のエージェントが使っています");
    expect(err.paneId).toBe("pNew");
    expect(s2.calls.filter((c) => c.method === "agent.start")).toHaveLength(1);
  });

  it("やり直しは、足した pane を使う（また分割しない）", async () => {
    const s = setup({ hasNode: () => true });
    await addPane(s.deps, { workspaceId: "w1", kind: "claude", name: "a", supervisorKey: null, existingPaneId: "pNew" });
    expect(s.calls.map((c) => c.method)).toEqual(["agent.start"]);
  });

  it("分割できない（元の pane が無い・サーバが断る）ときは、理由を出す。ノードが出なければ、pane を足したことと一緒に", async () => {
    const none = setup({ workspaces: new Map() });
    await expect(addPane(none.deps, { workspaceId: "w1", kind: "shell", name: "", supervisorKey: null })).rejects.toThrow("分割できる pane がありません");
    const spawn = setup({}, { "pane.split": () => { throw Object.assign(new Error("x"), { code: "spawn_failed" }); } });
    await expect(addPane(spawn.deps, { workspaceId: "w1", kind: "shell", name: "", supervisorKey: null })).rejects.toThrow("シェルを起動できませんでした");
    const late = setup({ hasNode: () => false });
    const err = await addPane(late.deps, { workspaceId: "w1", kind: "shell", name: "", supervisorKey: null }).catch((e: unknown) => e as AddPaneError);
    expect(err.message).toContain("ノードがまだ出ません");
    expect(err.paneId).toBe("pNew");
  });

  it("監督役が新しい pane 自身・選んでいない（null）なら、線は結ばない。線の更新が失敗したら、理由つきで知らせる", async () => {
    const s = setup();
    await addPane(s.deps, { workspaceId: "w1", kind: "claude", name: "a", supervisorKey: "local:pNew" });
    expect(s.calls.some((c) => c.method === "graph.update")).toBe(false);
    const f = setup({ updateGraph: async () => ({ ok: false, message: "重複" }) });
    await expect(addPane(f.deps, { workspaceId: "w1", kind: "claude", name: "a", supervisorKey: "local:p1" })).rejects.toThrow("監督の線を結べませんでした（重複）");
  });
});
