import type { MethodName, Pane, Tab } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
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
  attach: { result: () => Promise<unknown> };
  win: HTMLElement;
}

function setup(): Kit {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { host, registry, conn, requests } = makeHostKit();
  const attach = { result: async () => ({ cols: 100, rows: 30 }) as unknown };
  const request = conn.request.bind(conn);
  conn.request = ((method: MethodName, params: unknown) => {
    if (method === "pane.attach") {
      requests.push([method, params]);
      return attach.result();
    }
    return request(method as never, params as never);
  }) as typeof conn.request;
  const store = useGraphTerminalsStore();
  const session = useSessionStore();
  const view = useViewStore();
  session.clientId = "me";
  session.tabs.set("t1", tab("t1", "w1"));
  session.tabs.set("t2", tab("t2", "w2"));
  session.panes.set("p1", pane("p1", "t1"));
  session.panes.set("p2", pane("p2", "t2"));
  const win = document.createElement("div");
  win.setAttribute("data-graph-terminal-window", "");
  win.tabIndex = -1;
  const mount = document.createElement("div");
  win.appendChild(mount);
  document.body.appendChild(win);
  store.setContainer(mount);
  const controller = new GraphTerminalController({ conn, host, registry, store, session, view, resizeIntervalMs: 10 });
  return { controller, store, session, view, host, registry, requests, attach, win };
}

const methods = (k: Kit): string[] => k.requests.map(([m]) => m);

describe("GraphTerminalController", () => {
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
    expect(k.store.paneId).toBe("p1");
    expect(k.store.status).toBe("attached");
    expect(k.registry.get("p1")!.element.parentElement).toBe(k.store.container);
    const order = methods(k);
    expect(order.indexOf("pane.subscribe")).toBeLessThan(order.indexOf("pane.attach"));
    expect(order.indexOf("pane.attach")).toBeLessThan(order.indexOf("pane.focus"));
    const attach = k.requests.find(([m]) => m === "pane.attach")![1] as { cols: number; rows: number };
    expect(attach.cols).toBeGreaterThanOrEqual(40);
    expect(attach.rows).toBeGreaterThanOrEqual(10);
    expect(k.view.workspaceId).toBe("w1");
    expect(k.view.focusedPaneId).toBe("p1");
    expect(k.store.cols).toBe(100);
    expect(k.controller.ownsAttachment("p1")).toBe(true);
  });

  it("同じ pane をもう一度開いても、attach し直さない", async () => {
    await k.controller.open("p1");
    await k.controller.open("p1");
    expect(methods(k).filter((m) => m === "pane.attach")).toHaveLength(1);
  });

  it("別の pane に替える: 前の pane の直結をやめ、要素を戻してから、新しい pane に直結する", async () => {
    await k.controller.open("p1");
    const first = k.registry.get("p1")!;
    k.requests.length = 0;
    await k.controller.open("p2");
    expect(methods(k).slice(0, 1)).toEqual(["pane.detach"]);
    expect(k.requests[0]![1]).toEqual({ paneId: "p1" });
    expect(first.element.parentElement).toBeNull();
    expect(k.host.heldByWindow("p1")).toBe(false);
    expect(k.host.heldByWindow("p2")).toBe(true);
    expect(k.store.paneId).toBe("p2");
    expect(k.view.workspaceId).toBe("w2");
  });

  it("別の所有者がいる（pane_attached）: 端末の代わりに W2 の表示。要素は窓にない。［引き取って開く］で takeover", async () => {
    k.attach.result = async () => {
      throw Object.assign(new Error("pane_attached: x"), { code: "pane_attached" });
    };
    await k.controller.open("p1");
    expect(k.store.status).toBe("taken");
    expect(k.host.heldByWindow("p1")).toBe(false);
    expect(methods(k)).not.toContain("pane.focus"); // 選ばない
    k.attach.result = async () => ({ cols: 90, rows: 20 });
    await k.controller.takeover();
    expect(k.store.status).toBe("attached");
    const attach = k.requests.filter(([m]) => m === "pane.attach").at(-1)![1] as { takeover?: boolean };
    expect(attach.takeover).toBe(true);
  });

  it("開いた後に別のクライアントが奪ったら（attach_changed）W2 の表示に替わり、要素が戻る。自分の通知・終了の通知は無視", async () => {
    await k.controller.open("p1");
    k.controller.onAttachChanged("p1", "me");
    k.controller.onAttachChanged("p1", null);
    expect(k.store.status).toBe("attached");
    k.controller.onAttachChanged("p2", "other"); // 別の pane
    expect(k.store.status).toBe("attached");
    k.controller.onAttachChanged("p1", "other");
    expect(k.store.status).toBe("taken");
    expect(k.host.heldByWindow("p1")).toBe(false);
    expect(k.store.takenBy).toBe("other");
  });

  it("閉じる: 要素を戻し、pane.detach を送り、窓を外す。taken のときは detach を送らない。何度呼んでもよい", async () => {
    await k.controller.open("p1");
    k.requests.length = 0;
    k.controller.close("none");
    k.controller.close("none");
    expect(k.requests).toEqual([["pane.detach", { paneId: "p1" }]]);
    expect(k.store.paneId).toBeNull();
    expect(k.host.heldByWindow("p1")).toBe(false);
    expect(k.controller.ownsAttachment("p1")).toBe(false);

    k.attach.result = async () => {
      throw Object.assign(new Error("x"), { code: "pane_attached" });
    };
    await k.controller.open("p2");
    k.requests.length = 0;
    k.controller.close("none");
    expect(methods(k)).not.toContain("pane.detach");
  });

  it("閉じるとき、窓の端末にあったフォーカスを、要素を動かす前に窓の枠へ移す（body に落とさない）", async () => {
    await k.controller.open("p1");
    const textarea = k.registry.get("p1")!.term.textarea!;
    textarea.focus();
    expect(document.activeElement).toBe(textarea);
    let activeWhenMoved: Element | null = null;
    const el = k.registry.get("p1")!.element;
    const remove = el.remove.bind(el);
    el.remove = () => {
      activeWhenMoved = document.activeElement;
      remove();
    };
    k.controller.close("none");
    expect(activeWhenMoved).not.toBe(document.body);
  });

  it("開いている途中（attach の応答待ち）で閉じても、あとから届いた応答で窓を作り直さない", async () => {
    let finish: (v: unknown) => void = () => undefined;
    k.attach.result = () => new Promise((r) => (finish = r));
    const opening = k.controller.open("p1");
    await nextTick();
    await nextTick();
    k.controller.close("none");
    finish({ cols: 100, rows: 30 });
    await opening;
    expect(k.store.paneId).toBeNull();
    expect(k.host.heldByWindow("p1")).toBe(false);
    // 閉じる前の attach と、閉じたときの detach の順で届く（サーバは順に処理する）
    expect(methods(k).filter((m) => m === "pane.attach" || m === "pane.detach")).toEqual(["pane.attach", "pane.detach"]);
  });

  it("再接続: 窓の pane を購読し直し、直結し直す（選び直しはしない）。pane が無くなっていれば閉じる", async () => {
    await k.controller.open("p1");
    k.registry.markAllUnsubscribed();
    k.requests.length = 0;
    await k.controller.onReconnected();
    expect(methods(k)).toEqual(["pane.subscribe", "pane.attach"]);
    expect(k.store.status).toBe("attached");
    k.session.panes.delete("p1");
    await k.controller.onReconnected();
    expect(k.store.paneId).toBeNull();
  });

  it("再接続のとき、窓が W2 の表示なら何もしない（引き取るかは利用者が決める）", async () => {
    k.attach.result = async () => {
      throw Object.assign(new Error("x"), { code: "pane_attached" });
    };
    await k.controller.open("p1");
    k.requests.length = 0;
    await k.controller.onReconnected();
    expect(k.requests).toEqual([]);
  });

  it("大きさの変化: 桁と行が変わったときだけ pane.attach_resize を送る（間引く）", async () => {
    await k.controller.open("p1");
    k.requests.length = 0;
    const body = k.store.container!;
    Object.defineProperty(body, "clientWidth", { configurable: true, value: 900 });
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 450 });
    k.controller.noteBodyResized();
    k.controller.noteBodyResized();
    await new Promise((r) => setTimeout(r, 40));
    expect(k.requests).toEqual([["pane.attach_resize", { paneId: "p1", cols: 100, rows: 25 }]]);
    k.controller.noteBodyResized();
    await new Promise((r) => setTimeout(r, 40));
    expect(k.requests).toHaveLength(1); // 同じ大きさは送らない
  });

  it("基本画面で開く: その pane を選び直し、画面を基本画面へ切り替える", async () => {
    await k.controller.open("p1");
    k.view.setScreen("graph");
    k.view.setView("w2", "t2");
    k.controller.openInBase();
    expect(k.view.workspaceId).toBe("w1");
    expect(k.view.focusedPaneId).toBe("p1");
    expect(k.view.screen).toBe("base");
  });

  it("マシンの切り替え: サーバへ何も送らず、窓を外す", async () => {
    await k.controller.open("p1");
    k.requests.length = 0;
    k.controller.resetForMachineSwitch();
    expect(k.requests).toEqual([]);
    expect(k.store.paneId).toBeNull();
    expect(k.host.heldByWindow("p1")).toBe(false);
  });

  it("失敗状態の pane は、attach せずに理由を出す", async () => {
    k.session.panes.set("pf", { ...pane("pf", "t1"), status: "failed", failure: "シェルが見つかりません" } as Pane);
    await k.controller.open("pf");
    expect(k.store.status).toBe("failed");
    expect(k.store.failure).toBe("シェルが見つかりません");
    expect(methods(k)).not.toContain("pane.attach");
  });

  it("基本画面の端末が載っている pane を窓へ移し、閉じると基本画面へ戻る（20 回くり返しても同じ）", async () => {
    const mount = document.createElement("div");
    document.body.appendChild(mount);
    const b: BaseMount = { mount, syncTabStop: () => undefined };
    const entry = k.host.mountBase("p1", b);
    for (let i = 0; i < 20; i++) {
      await k.controller.open("p1");
      expect(entry.element.parentElement).toBe(k.store.container);
      k.controller.close("none");
      expect(entry.element.parentElement).toBe(mount);
    }
    expect(k.registry.get("p1")).toBe(entry);
  });

  it("窓の pane が選ばれていなければ、attached のとき選び直す（開く途中・別の pane・既に選ばれているときは何もしない）", async () => {
    await k.controller.open("p1");
    k.requests.length = 0;
    k.controller.ensureSelected("p1");
    expect(k.requests).toEqual([]); // 選ばれている
    k.view.setView("w2", "t2");
    k.view.focusPane("p2");
    k.controller.ensureSelected("p2"); // 窓の pane ではない
    expect(k.requests).toEqual([]);
    k.controller.ensureSelected("p1");
    expect(k.view.focusedPaneId).toBe("p1");
    expect(k.view.workspaceId).toBe("w1");
    expect(methods(k)).toContain("pane.focus");
  });
});
