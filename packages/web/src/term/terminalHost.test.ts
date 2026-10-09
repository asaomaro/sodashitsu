import type { MethodName, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyInputController } from "../keys/KeyInputController.js";
import { KeyRouter, DEFAULT_KEYMAP, type ConnectionPort, type KeyRouterClock } from "@sodashitsu/client-core";
import { MouseBridge } from "./MouseBridge.js";
import { RendererPool, type WebglAddonLike } from "./RendererPool.js";
import { TerminalRegistry } from "./TerminalRegistry.js";
import { TerminalHost, type BaseMount } from "./terminalHost.js";

const realClock = (): KeyRouterClock => ({ now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });
class FakeWebglAddon implements WebglAddonLike {
  activate(): void {}
  dispose(): void {}
  onContextLoss(): { dispose(): void } {
    return { dispose: () => undefined };
  }
}

export function makeHostKit(capacity = 100) {
  const requests: [MethodName, unknown][] = [];
  const conn: ConnectionPort = {
    request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      requests.push([method, params]);
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
  const keys = new KeyInputController(new KeyRouter(DEFAULT_KEYMAP, realClock()), conn);
  const renderers = new RendererPool({ capacity: 100, createWebglAddon: () => new FakeWebglAddon() });
  const registry = new TerminalRegistry({
    capacity,
    conn,
    renderers,
    keys,
    createMouseBridge: (term, paneId) => new MouseBridge({ term, paneId, ui: { toast: () => undefined, openContextMenu: () => undefined }, getRightClickTarget: () => "herdr" }),
  });
  const host = new TerminalHost({ registry, conn, getScrollbackLines: () => 1000 });
  return { registry, host, conn, requests };
}

function base(): BaseMount & { synced: number } {
  const b = { mount: document.createElement("div"), synced: 0, syncTabStop: () => void (b.synced += 1) };
  document.body.appendChild(b.mount);
  return b;
}

describe("TerminalRegistry の持ち主の数え方（基本画面と窓の 2 者。X4）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("どちらかが持っている間は visible のまま。両方が手放すと外れる", () => {
    const { registry } = makeHostKit();
    registry.acquire("p1", "base");
    registry.acquire("p1", "window");
    registry.release("p1", "base");
    expect(registry.isVisible("p1")).toBe(true);
    registry.release("p1", "window");
    expect(registry.isVisible("p1")).toBe(false);
  });

  it("窓だけが使っている端末は、LRU の容量を超えても捨てられない", () => {
    const { registry } = makeHostKit(2);
    registry.acquire("w", "window");
    registry.acquire("a", "base");
    registry.release("a", "base");
    registry.acquire("b", "base");
    registry.release("b", "base");
    registry.acquire("c", "base");
    expect(registry.get("w")).toBeDefined();
    registry.release("w", "window");
    registry.acquire("d", "base");
    expect(registry.get("w")).toBeUndefined(); // 手放した後は、いちばん古いので捨てられる
  });
});

describe("TerminalHost", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("基本画面に載っている端末を窓へ移し、返すと同じ要素が基本画面へ戻る（端末の実体は 1 つ）", () => {
    const { host } = makeHostKit();
    const b = base();
    const entry = host.mountBase("p1", b);
    expect(entry.element.parentElement).toBe(b.mount);
    const win = document.createElement("div");
    document.body.appendChild(win);

    const same = host.attachToWindow("p1", win);
    expect(same).toBe(entry);
    expect(entry.element.parentElement).toBe(win);
    expect(host.heldByWindow("p1")).toBe(true);

    host.detachFromWindow("p1");
    expect(entry.element.parentElement).toBe(b.mount);
    expect(b.synced).toBe(1);
    expect(host.heldByWindow("p1")).toBe(false);
  });

  it("窓が持っている間に基本画面の部品が外れても、要素には触らない。返すときは、載せる基本画面が無いので要素を外す（端末は残る）", () => {
    const { host, registry } = makeHostKit();
    const b = base();
    const entry = host.mountBase("p1", b);
    const win = document.createElement("div");
    host.attachToWindow("p1", win);
    host.unmountBase("p1", b);
    expect(entry.element.parentElement).toBe(win);
    expect(registry.isVisible("p1")).toBe(true); // 窓が持っている

    host.detachFromWindow("p1");
    expect(entry.element.parentElement).toBeNull();
    expect(registry.get("p1")).toBe(entry);
    expect(registry.isVisible("p1")).toBe(false);
  });

  it("窓が持っている間に基本画面の部品が載っても、要素を付けない。窓が返すとそこへ載る", () => {
    const { host } = makeHostKit();
    const win = document.createElement("div");
    const entry = host.attachToWindow("p1", win);
    const b = base();
    host.mountBase("p1", b);
    expect(entry.element.parentElement).toBe(win);
    host.detachFromWindow("p1");
    expect(entry.element.parentElement).toBe(b.mount);
  });

  it("基本画面の部品が外れるとき、窓が持っていなければ要素を外す（今までの動き）", () => {
    const { host } = makeHostKit();
    const b = base();
    const entry = host.mountBase("p1", b);
    host.unmountBase("p1", b);
    expect(entry.element.parentElement).toBeNull();
  });

  it("窓のための購読: 今の接続で未購読のときだけ pane.subscribe を送る（作ったときの scrollback で）", () => {
    const { host, requests } = makeHostKit();
    host.attachToWindow("p1", document.createElement("div"));
    host.ensureSubscribed("p1");
    host.ensureSubscribed("p1");
    expect(requests.filter(([m]) => m === "pane.subscribe")).toEqual([["pane.subscribe", { paneId: "p1", scrollbackLines: 1000 }]]);
  });

  it("返しても購読は外さない（unsubscribe を送らない。X4）", () => {
    const { host, requests } = makeHostKit();
    host.attachToWindow("p1", document.createElement("div"));
    host.ensureSubscribed("p1");
    host.detachFromWindow("p1");
    expect(requests.some(([m]) => m === "pane.unsubscribe")).toBe(false);
  });

  it("持っていない pane の detach は何もしない", () => {
    const { host } = makeHostKit();
    expect(() => host.detachFromWindow("nope")).not.toThrow();
  });
});
