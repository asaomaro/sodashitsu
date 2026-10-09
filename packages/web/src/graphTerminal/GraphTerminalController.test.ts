import type { MethodName, Pane, Tab } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, watch } from "vue";
import { useGraphTerminalsStore } from "../store/graphTerminals.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import type { BaseMount } from "../term/terminalHost.js";
import { makeHostKit } from "../term/terminalHostKit.js";
import { GraphTerminalController } from "./GraphTerminalController.js";

const pane = (id: string, tabId: string): Pane => ({ id, tabId, status: "running", cols: 80, rows: 24 }) as unknown as Pane;
const tab = (id: string, workspaceId: string): Tab => ({ id, workspaceId, label: id, paneIds: [], focusedPaneId: "", sizeOwnerClientId: null }) as unknown as Tab;

interface Kit {
  controller: GraphTerminalController;
  store: ReturnType<typeof useGraphTerminalsStore>;
  session: ReturnType<typeof useSessionStore>;
  view: ReturnType<typeof useViewStore>;
  host: ReturnType<typeof makeHostKit>["host"];
  registry: ReturnType<typeof makeHostKit>["registry"];
  requests: [MethodName, unknown][];
  /** 次の pane.attach の応答を差し替える。 */
  attach: { result: (paneId: string) => Promise<unknown> };
}

function setup(): Kit {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { host, registry, conn, requests } = makeHostKit();
  const attach = { result: async (_paneId: string) => ({ cols: 100, rows: 30 }) as unknown };
  const request = conn.request.bind(conn);
  conn.request = ((method: MethodName, params: unknown) => {
    if (method === "pane.attach") {
      requests.push([method, params]);
      return attach.result((params as { paneId: string }).paneId);
    }
    return request(method as never, params as never);
  }) as typeof conn.request;
  const store = useGraphTerminalsStore();
  const session = useSessionStore();
  const view = useViewStore();
  session.clientId = "me";
  session.tabs.set("t1", tab("t1", "w1"));
  session.tabs.set("t2", tab("t2", "w2"));
  for (const [id, t] of [["p1", "t1"], ["p2", "t2"], ["p3", "t1"], ["p4", "t2"]] as const) session.panes.set(id, pane(id, t));
  // 窓の部品の代わり: 新しい窓に、本体の箱を渡す（窓の部品は mount 時に `setContainer` する）。
  watch(
    () => store.windows.map((w) => w.key),
    (keys) => {
      for (const k of keys) {
        if (store.findByKey(k)?.container) continue;
        const win = document.createElement("div");
        win.setAttribute("data-graph-terminal-window", "");
        const mount = document.createElement("div");
        win.appendChild(mount);
        document.body.appendChild(win);
        store.setContainer(k, mount);
      }
    },
    { flush: "sync" },
  );
  const controller = new GraphTerminalController({ conn, host, registry, store, session, view, resizeIntervalMs: 10 });
  return { controller, store, session, view, host, registry, requests, attach };
}

const methods = (k: Kit): string[] => k.requests.map(([m]) => m);
const panesOf = (k: Kit): string[] => k.store.windows.map((w) => w.paneId);

describe("GraphTerminalController（窓は 3 つまで）", () => {
  let k: Kit;
  beforeEach(() => {
    localStorage.clear();
    k = setup();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("開く: 要素を窓へ移し、購読 → pane.attach（40×10 以上）→ その pane を選ぶ（X6 の順）", async () => {
    await k.controller.open("p1");
    const w = k.store.find("p1")!;
    expect(w.status).toBe("attached");
    expect(k.registry.get("p1")!.element.parentElement).toBe(w.container);
    const order = methods(k);
    expect(order.indexOf("pane.subscribe")).toBeLessThan(order.indexOf("pane.attach"));
    expect(order.indexOf("pane.attach")).toBeLessThan(order.indexOf("pane.focus"));
    const attach = k.requests.find(([m]) => m === "pane.attach")![1] as { cols: number; rows: number };
    expect(attach.cols).toBeGreaterThanOrEqual(40);
    expect(attach.rows).toBeGreaterThanOrEqual(10);
    expect(k.view.workspaceId).toBe("w1");
    expect(k.view.focusedPaneId).toBe("p1");
    expect(w.cols).toBe(100);
    expect(k.controller.ownsAttachment("p1")).toBe(true);
  });

  it("同じ pane をもう一度押しても、窓は増えない・attach し直さない（前へ出る）", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    await k.controller.open("p2");
    k.controller.pin("p2", true);
    await k.controller.open("p3");
    await k.controller.open("p1");
    expect(methods(k).filter((m) => m === "pane.attach")).toHaveLength(3);
    expect(k.store.windows).toHaveLength(3);
    expect(k.store.order.at(-1)).toBe(k.store.find("p1")!.key);
  });

  it("留めていない窓は高々 1 つ: 別のノードを押すと、その窓の中身が替わる（前の pane は直結をやめ、要素を戻す）。窓の部品〔key〕は同じ", async () => {
    await k.controller.open("p1");
    const first = k.registry.get("p1")!;
    const key = k.store.find("p1")!.key;
    k.requests.length = 0;
    await k.controller.open("p2");
    expect(methods(k)[0]).toBe("pane.detach");
    expect(k.requests[0]![1]).toEqual({ paneId: "p1" });
    expect(first.element.parentElement).toBeNull();
    expect(panesOf(k)).toEqual(["p2"]);
    expect(k.store.find("p2")!.key).toBe(key);
    expect(k.view.workspaceId).toBe("w2");
  });

  it("留めた窓は替わらない。留めた窓があると、別のノードは新しい窓で開く（3 つまで）", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    await k.controller.open("p2");
    k.controller.pin("p2", true);
    await k.controller.open("p3");
    expect(panesOf(k)).toEqual(["p1", "p2", "p3"]);
    // p3 は留めていない: 4 つ目の pane は、その窓を替える
    await k.controller.open("p4");
    expect(panesOf(k)).toEqual(["p1", "p2", "p4"]);
    expect(k.host.heldByWindow("p3")).toBe(false);
  });

  it("3 つとも留めてあるとき、別のノードを押しても開かず、知らせる", async () => {
    const toast = vi.spyOn(k.view, "toast");
    k.session.panes.set("p5", pane("p5", "t1"));
    for (const id of ["p1", "p2", "p3"]) {
      await k.controller.open(id);
      k.controller.pin(id, true);
    }
    k.requests.length = 0;
    await k.controller.open("p4");
    expect(panesOf(k)).toEqual(["p1", "p2", "p3"]);
    expect(k.requests).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("3 つまで"));
  });

  it("留めを外すとき、ほかに留めていない窓があれば、そちらを閉じる（留めていない窓は高々 1 つ）", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    await k.controller.open("p2");
    k.requests.length = 0;
    k.controller.pin("p1", false);
    expect(panesOf(k)).toEqual(["p1"]);
    expect(k.requests).toEqual([["pane.detach", { paneId: "p2" }]]);
    expect(k.store.find("p1")!.pinned).toBe(false);
  });

  it("3 つの窓は、それぞれ別の直結。それぞれ別の端末の要素を持つ", async () => {
    for (const id of ["p1", "p2", "p3"]) {
      await k.controller.open(id);
      k.controller.pin(id, true);
    }
    for (const id of ["p1", "p2", "p3"]) {
      expect(k.host.heldByWindow(id)).toBe(true);
      expect(k.controller.ownsAttachment(id)).toBe(true);
    }
    expect(k.requests.filter(([m]) => m === "pane.attach").map(([, p]) => (p as { paneId: string }).paneId)).toEqual(["p1", "p2", "p3"]);
  });

  it("別の所有者がいる（pane_attached）窓だけ W2 の表示。要素は窓にない。［引き取って開く］で takeover。ほかの窓は変わらない", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    k.attach.result = async () => {
      throw Object.assign(new Error("pane_attached: x"), { code: "pane_attached" });
    };
    await k.controller.open("p2");
    expect(k.store.find("p2")!.status).toBe("taken");
    expect(k.store.find("p1")!.status).toBe("attached");
    expect(k.host.heldByWindow("p2")).toBe(false);
    k.attach.result = async () => ({ cols: 90, rows: 20 });
    await k.controller.takeover("p2");
    expect(k.store.find("p2")!.status).toBe("attached");
    const attach = k.requests.filter(([m]) => m === "pane.attach").at(-1)![1] as { takeover?: boolean };
    expect(attach.takeover).toBe(true);
  });

  it("開いた後に別のクライアントが奪ったら、その窓だけ W2 の表示に替わり、要素が戻る。自分の通知・終了の通知・ほかの pane の通知は無視", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    await k.controller.open("p2");
    k.controller.onAttachChanged("p1", "me");
    k.controller.onAttachChanged("p1", null);
    k.controller.onAttachChanged("p9", "other");
    expect(k.store.find("p1")!.status).toBe("attached");
    k.controller.onAttachChanged("p1", "other");
    expect(k.store.find("p1")!.status).toBe("taken");
    expect(k.store.find("p1")!.takenBy).toBe("other");
    expect(k.host.heldByWindow("p1")).toBe(false);
    expect(k.store.find("p2")!.status).toBe("attached");
  });

  it("閉じる: 要素を戻し、pane.detach を送り、窓を外し、留めの記憶も外す。taken のときは detach を送らない。何度呼んでもよい", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    k.requests.length = 0;
    k.controller.close("p1", "none");
    k.controller.close("p1", "none");
    expect(k.requests).toEqual([["pane.detach", { paneId: "p1" }]]);
    expect(k.store.windows).toHaveLength(0);
    expect(k.store.memory.pinned).toEqual([]);
    expect(k.host.heldByWindow("p1")).toBe(false);

    k.attach.result = async () => {
      throw Object.assign(new Error("x"), { code: "pane_attached" });
    };
    await k.controller.open("p2");
    k.requests.length = 0;
    k.controller.close("p2", "none");
    expect(methods(k)).not.toContain("pane.detach");
  });

  it("closeAll: 3 つの窓の全部の直結をやめ、要素を戻す。留めた窓の記憶は残る（グラフへ戻ると開き直す）", async () => {
    for (const id of ["p1", "p2", "p3"]) {
      await k.controller.open(id);
      k.controller.pin(id, true);
    }
    k.requests.length = 0;
    k.controller.closeAll("none");
    expect(k.requests.filter(([m]) => m === "pane.detach").map(([, p]) => (p as { paneId: string }).paneId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(k.store.windows).toHaveLength(0);
    for (const id of ["p1", "p2", "p3"]) expect(k.host.heldByWindow(id)).toBe(false);
    expect(k.store.memory.pinned).toEqual(["p1", "p2", "p3"]);
  });

  it("reopenPinned: 留めた窓を開き直す（選ばない・フォーカスを動かさない）。無くなった pane は掃除する。3 つまで", async () => {
    k.store.memory.pinned = ["p1", "p2", "gone"];
    k.view.setView("w2", "t2");
    k.view.focusPane("p4");
    await k.controller.reopenPinned();
    expect(panesOf(k)).toEqual(["p1", "p2"]);
    expect(k.store.windows.every((w) => w.pinned)).toBe(true);
    expect(k.store.memory.pinned).toEqual(["p1", "p2"]);
    expect(k.view.focusedPaneId).toBe("p4"); // 選び直さない
    expect(methods(k)).not.toContain("pane.focus");
  });

  it("閉じるとき、窓の端末にあったフォーカスを、要素を動かす前に窓の枠へ移す（body に落とさない）", async () => {
    await k.controller.open("p1");
    const textarea = k.registry.get("p1")!.term.textarea!;
    const root = k.store.find("p1")!.container!.parentElement as HTMLElement;
    root.setAttribute("data-pane-id", "p1");
    root.tabIndex = -1;
    textarea.focus();
    expect(document.activeElement).toBe(textarea);
    let activeWhenMoved: Element | null = null;
    const el = k.registry.get("p1")!.element;
    const remove = el.remove.bind(el);
    el.remove = () => {
      activeWhenMoved = document.activeElement;
      remove();
    };
    k.controller.close("p1", "none");
    expect(activeWhenMoved).not.toBe(document.body);
  });

  it("開いている途中（attach の応答待ち）で閉じても、あとから届いた応答で窓を作り直さない", async () => {
    let finish: (v: unknown) => void = () => undefined;
    k.attach.result = () => new Promise((r) => (finish = r));
    const opening = k.controller.open("p1");
    await nextTick();
    await nextTick();
    k.controller.close("p1", "none");
    finish({ cols: 100, rows: 30 });
    await opening;
    expect(k.store.windows).toHaveLength(0);
    expect(k.host.heldByWindow("p1")).toBe(false);
    expect(methods(k).filter((m) => m === "pane.attach" || m === "pane.detach")).toEqual(["pane.attach", "pane.detach"]);
  });

  it("再接続: すべての窓が、購読し直し、直結し直す（選び直しはしない）。pane が無くなっていればその窓を閉じる。W2 の窓は何もしない", async () => {
    for (const id of ["p1", "p2", "p3"]) {
      await k.controller.open(id);
      k.controller.pin(id, true);
    }
    k.registry.markAllUnsubscribed();
    k.requests.length = 0;
    await k.controller.onReconnected();
    expect(methods(k).filter((m) => m === "pane.attach")).toHaveLength(3);
    expect(methods(k).filter((m) => m === "pane.subscribe")).toHaveLength(3);
    expect(methods(k)).not.toContain("pane.focus");
    for (const w of k.store.windows) expect(w.status).toBe("attached");
    k.session.panes.delete("p3");
    k.attach.result = async () => {
      throw Object.assign(new Error("x"), { code: "pane_attached" });
    };
    await k.controller.onReconnected();
    expect(panesOf(k)).toEqual(["p1", "p2"]);
    expect(k.store.windows.map((w) => w.status)).toEqual(["taken", "taken"]);
    k.requests.length = 0;
    await k.controller.onReconnected();
    expect(k.requests).toEqual([]);
  });

  it("大きさの変化: 窓ごとに、桁と行が変わったときだけ pane.attach_resize を送る（間引く）", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    await k.controller.open("p2");
    k.requests.length = 0;
    const body = k.store.find("p1")!.container!;
    Object.defineProperty(body, "clientWidth", { configurable: true, value: 900 });
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 450 });
    k.controller.noteBodyResized("p1");
    k.controller.noteBodyResized("p1");
    await new Promise((r) => setTimeout(r, 40));
    const resizes = (): unknown[] => k.requests.filter(([m, p]) => m === "pane.attach_resize" && (p as { paneId: string }).paneId === "p1");
    expect(resizes()).toEqual([["pane.attach_resize", { paneId: "p1", cols: 100, rows: 25 }]]);
    k.controller.noteBodyResized("p1");
    await new Promise((r) => setTimeout(r, 40));
    expect(resizes()).toHaveLength(1);
  });

  it("基本画面で開く: その pane を選び直し、画面を基本画面へ切り替える", async () => {
    await k.controller.open("p1");
    k.view.setScreen("graph");
    k.view.setView("w2", "t2");
    k.controller.openInBase("p1");
    expect(k.view.workspaceId).toBe("w1");
    expect(k.view.focusedPaneId).toBe("p1");
    expect(k.view.screen).toBe("base");
  });

  it("マシンの切り替え: サーバへ何も送らず、すべての窓を外し、留めの記憶も捨てる", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    await k.controller.open("p2");
    k.requests.length = 0;
    k.controller.resetForMachineSwitch();
    expect(k.requests).toEqual([]);
    expect(k.store.windows).toHaveLength(0);
    expect(k.store.memory.pinned).toEqual([]);
    expect(k.host.heldByWindow("p1")).toBe(false);
  });

  it("失敗状態の pane は、attach せずに理由を出す", async () => {
    k.session.panes.set("pf", { ...pane("pf", "t1"), status: "failed", failure: "シェルが見つかりません" } as Pane);
    await k.controller.open("pf");
    expect(k.store.find("pf")!.status).toBe("failed");
    expect(k.store.find("pf")!.failure).toBe("シェルが見つかりません");
    expect(methods(k)).not.toContain("pane.attach");
  });

  it("基本画面の端末が載っている pane を窓へ移し、閉じると基本画面へ戻る（20 回くり返しても同じ）", async () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const b: BaseMount = { mount, syncTabStop: () => undefined };
    const entry = k.host.mountBase("p1", b);
    for (let i = 0; i < 20; i++) {
      await k.controller.open("p1");
      expect(entry.element.parentElement).toBe(k.store.find("p1")!.container);
      k.controller.close("p1", "none");
      expect(entry.element.parentElement).toBe(mount);
    }
    expect(k.registry.get("p1")).toBe(entry);
  });

  it("窓の pane が選ばれていなければ、attached のとき選び直す（開く途中・別の pane・既に選ばれているときは何もしない）。窓ごとに", async () => {
    await k.controller.open("p1");
    k.controller.pin("p1", true);
    await k.controller.open("p2");
    k.requests.length = 0;
    k.controller.ensureSelected("p2");
    expect(k.requests).toEqual([]); // 選ばれている
    k.controller.ensureSelected("p1"); // フォーカスが p1 の窓に入った
    expect(k.view.focusedPaneId).toBe("p1");
    expect(k.view.workspaceId).toBe("w1");
    k.controller.ensureSelected("p4"); // 窓の pane ではない
    expect(k.view.focusedPaneId).toBe("p1");
  });

  it("留めた窓の位置と大きさの記憶は、pane ごとに持ち、その pane を開くとき使う（新しい窓の rect は null のまま。部品が記憶から決める）", async () => {
    k.store.remember("p2", { fx: 0.5, fy: 0.5, cols: 90, rows: 30 });
    await k.controller.open("p1");
    k.store.setRect("p1", { x: 10, y: 10, w: 400, h: 300 });
    await k.controller.open("p2"); // 留めていない窓 p1 を替える。覚えた位置があるので、動かした位置は引き継がない
    expect(k.store.find("p2")!.rect).toBeNull();
    await k.controller.open("p3"); // 覚えが無い pane（p2 の窓を替える）
    k.store.setRect("p3", { x: 20, y: 20, w: 400, h: 300 });
    await k.controller.open("p4"); // 覚えが無い pane: 動かした位置を引き継ぐ
    expect(k.store.find("p4")!.rect).toEqual({ x: 20, y: 20, w: 400, h: 300 });
  });
});
