import { Terminal } from "@xterm/xterm";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MethodName, Pane, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import type { TerminalRegistry } from "../term/TerminalRegistry.js";
import { ViewSync } from "../term/ViewSync.js";
import { useFitToScreen } from "./useFitToScreen.js";

let pinia: Pinia;
let term: Terminal;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  term = new Terminal({ cols: 40, rows: 10, allowProposedApi: true });
  term.open(document.createElement("div"));
});
afterEach(() => {
  term.dispose();
  document.body.innerHTML = "";
});

function makePane(id: string, cols: number): Pane {
  return { id, tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null };
}

function makeConnection(): ConnectionPort & { requests: [MethodName, unknown][] } {
  return {
    requests: [],
    request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}

/**
 * `TerminalRegistry` の代わり。`takePendingSubscriptions`・`markAllUnsubscribed` は実物の `ViewSync` を組み合わせる test（D108）
 * のため（「今の接続で未購読」の集合。`ViewSync.test.ts` の偽物と同じ形）。
 */
function makeRegistry(): TerminalRegistry {
  const unsubscribed = new Set(["p1"]);
  return {
    get: (paneId: string) => (paneId === "p1" ? { term, paneId, element: document.createElement("div"), webgl: false, lastUsed: 0, copy: {} } : undefined),
    takePendingSubscriptions: (shown: Iterable<string>) => [...shown].filter((id) => unsubscribed.delete(id)),
    markAllUnsubscribed: () => unsubscribed.add("p1"),
  } as unknown as TerminalRegistry;
}

/** `onViewEstablished` の listener を持つだけの `ViewSync` の代わり（`fire()` で「新しい接続の最初の client.view を送った」）。 */
function makeViewSyncPort() {
  const listeners = new Set<() => void>();
  return {
    listeners,
    onViewEstablished: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    fire: () => {
      for (const l of [...listeners]) l();
    },
  };
}

function makeContainer(width: number): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: width, configurable: true });
  document.body.appendChild(el);
  return el;
}

/**
 * `useFitToScreen` は `onBeforeUnmount` を使うので、コンポーネントの `setup()` から呼ぶ。既定では hello の通った接続がある
 * （`connectionState === 'open'`）状態で始める（D108：それ以外では `toggleFit` は送らない）。
 */
function mountHost(
  conn: ConnectionPort,
  registry: TerminalRegistry,
  paneId: string | null,
  containerWidth: number,
  opts: { viewSync?: Pick<ViewSync, "onViewEstablished">; connectionState?: "open" | "connecting" | "reconnecting" } = {},
) {
  useViewStore(pinia).onConnectionState(opts.connectionState ?? "open");
  const paneIdRef = ref<string | null>(paneId);
  const containerRef = ref<HTMLElement | null>(makeContainer(containerWidth));
  const viewSync = opts.viewSync ?? makeViewSyncPort();
  let exposed!: ReturnType<typeof useFitToScreen>;
  const Host = defineComponent({
    setup() {
      exposed = useFitToScreen({ conn, registry, viewSync, paneId: paneIdRef, container: containerRef });
      return () => h("div");
    },
  });
  const wrapper = mount(Host, { global: { plugins: [pinia] } });
  return { wrapper, ...exposed, paneIdRef, containerRef };
}

describe("useFitToScreen", () => {
  it("既定では縮小する（表示領域の幅 ÷ 必要な幅）", async () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", 200)); // 9px（既定のセル幅）× 200 = 1800px 必要
    const { scale } = mountHost(makeConnection(), makeRegistry(), "p1", 400);
    await new Promise((r) => setTimeout(r, 0));
    expect(scale.value).toBeCloseTo(400 / 1800, 5);
  });

  it("必要な幅より表示領域が広ければ等倍のまま（1 を超えない）", async () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", 10)); // 9px × 10 = 90px
    const { scale } = mountHost(makeConnection(), makeRegistry(), "p1", 400);
    await new Promise((r) => setTimeout(r, 0));
    expect(scale.value).toBe(1);
  });

  it("toggleFit で client.fit を送り、有効な間は等倍になる", async () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", 200));
    const conn = makeConnection();
    const { scale, fitEnabled, toggleFit } = mountHost(conn, makeRegistry(), "p1", 400);
    await new Promise((r) => setTimeout(r, 0));
    expect(scale.value).toBeLessThan(1);

    toggleFit();
    expect(fitEnabled.value).toBe(true);
    expect(conn.requests).toEqual([["client.fit", { enabled: true }]]);
    expect(scale.value).toBe(1);

    toggleFit();
    expect(fitEnabled.value).toBe(false);
    expect(conn.requests).toEqual([
      ["client.fit", { enabled: true }],
      ["client.fit", { enabled: false }],
    ]);
    await new Promise((r) => setTimeout(r, 0));
    expect(scale.value).toBeLessThan(1);
  });

  it("pane が無い・表示領域が測れないときは等倍のまま", async () => {
    const { scale } = mountHost(makeConnection(), makeRegistry(), null, 400);
    await new Promise((r) => setTimeout(r, 0));
    expect(scale.value).toBe(1);
  });

  it("naturalSize は cols/rows × セルの寸法（pane が cols/rows を変えたら再計算する）", async () => {
    const session = useSessionStore(pinia);
    session.paneUpserted(makePane("p1", 200));
    const { scale, naturalSize } = mountHost(makeConnection(), makeRegistry(), "p1", 400);
    await new Promise((r) => setTimeout(r, 0));
    expect(naturalSize.value).toEqual({ width: 1800, height: 24 * 18 });
    expect(scale.value).toBeCloseTo(400 / 1800, 5);

    session.paneSizeChanged("p1", 30, 24); // サーバからの実際のリサイズを模す
    await new Promise((r) => setTimeout(r, 0));
    expect(naturalSize.value).toEqual({ width: 30 * 9, height: 24 * 18 });
    expect(scale.value).toBe(1); // 30*9=270 は表示領域の 400 を超えないので等倍のまま
  });
});

/**
 * 04-mobile T9・D108（統合 review ラウンド1・D106 の独立点検 #2 で発見）：サーバは接続ごとに新しい clientId を fit:false で登録する
 * （D106）が、以前は「この端末に合わせる」を有効にしたまま繋ぎ直しても `client.fit` を送り直さず、ボタンは押された表示のまま、
 * サーバでは権限を取らなかった。`ViewSync.onViewEstablished`（新しい接続の最初の `client.view` の直後、`pane.subscribe` の前）で
 * 送り直す。hello の前には何も送らない（D107）。
 */
describe("useFitToScreen — 繋ぎ直した後の client.fit の送り直し（D108）", () => {
  const leaf = document.createElement("div");
  leaf.getBoundingClientRect = () => ({ width: 720, height: 360, x: 0, y: 0, top: 0, left: 0, right: 720, bottom: 360, toJSON: () => ({}) }) as DOMRect;
  const view = { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: leaf }] };

  function setup(connectionState: "open" | "connecting" = "open") {
    useSessionStore(pinia).paneUpserted(makePane("p1", 40));
    const conn = makeConnection();
    const viewSync = new ViewSync({ conn, registry: makeRegistry(), getScrollbackLines: () => 1000, getCellSize: () => ({ width: 9, height: 18 }) });
    const host = mountHost(conn, makeRegistry(), "p1", 400, { viewSync, connectionState });
    return { conn, viewSync, ...host };
  }

  it("有効にしたまま繋ぎ直したら、新しい接続の最初の client.view の直後・pane.subscribe の前に client.fit({enabled:true}) を送る（実物の ViewSync）", () => {
    const { conn, viewSync, toggleFit, fitEnabled } = setup();
    viewSync.onConnectionOpened(); // 最初の接続の hello
    viewSync.commit(view);
    toggleFit();
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe", "client.fit"]);

    // 切断 → 新しい接続（サーバは fit:false で登録し直す）。
    conn.requests.length = 0;
    viewSync.onConnectionClosed();
    useViewStore(pinia).onConnectionState("reconnecting");
    useViewStore(pinia).onConnectionState("open");
    viewSync.onConnectionOpened();
    viewSync.commit(view);
    expect(fitEnabled.value).toBe(true); // 手元の状態は持ち越す（ボタンは押された表示のまま）
    expect(conn.requests).toEqual([
      ["client.view", { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", cols: 80, rows: 20 }] }],
      ["client.fit", { enabled: true }],
      ["pane.subscribe", { paneId: "p1", scrollbackLines: 1000 }],
    ]);

    // 同じ接続の以後の commit では送らない（1 接続に 1 回）。
    conn.requests.length = 0;
    viewSync.commit({ ...view, tabId: "t2" });
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view"]);
  });

  it("初回の接続（無効のまま）では何も送らない。無効にしてから繋ぎ直しても送らない（新しい接続は fit:false から始まる）", () => {
    const { conn, viewSync, toggleFit } = setup();
    viewSync.onConnectionOpened();
    viewSync.commit(view);
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe"]);

    toggleFit(); // 有効
    toggleFit(); // 無効
    conn.requests.length = 0;
    viewSync.onConnectionClosed();
    viewSync.onConnectionOpened();
    viewSync.commit(view);
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe"]);
  });

  it("hello の前（切断中・再接続の hello 待ち）の toggleFit は送らず、有効にした分は次の接続の最初の client.view の直後に送る", () => {
    const { conn, viewSync, toggleFit, fitEnabled, scale } = setup("connecting");
    toggleFit(); // 最初の接続の hello より前
    expect(fitEnabled.value).toBe(true);
    expect(scale.value).toBe(1); // 表示は手元の状態に従う
    expect(conn.requests).toEqual([]);

    useViewStore(pinia).onConnectionState("open");
    viewSync.onConnectionOpened();
    viewSync.commit(view);
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "client.fit", "pane.subscribe"]);
    expect(conn.requests[1]).toEqual(["client.fit", { enabled: true }]);

    // 切断中に無効にした分は送らない（新しい接続は fit:false から始まる）。
    conn.requests.length = 0;
    viewSync.onConnectionClosed();
    useViewStore(pinia).onConnectionState("reconnecting");
    toggleFit();
    expect(fitEnabled.value).toBe(false);
    useViewStore(pinia).onConnectionState("open");
    viewSync.onConnectionOpened();
    viewSync.commit(view);
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe"]);
  });

  it("unmount で onViewEstablished の listener を外す", () => {
    useSessionStore(pinia).paneUpserted(makePane("p1", 40));
    const port = makeViewSyncPort();
    const conn = makeConnection();
    const { wrapper, toggleFit } = mountHost(conn, makeRegistry(), "p1", 400, { viewSync: port });
    expect(port.listeners.size).toBe(1);
    toggleFit();
    conn.requests.length = 0;
    port.fire();
    expect(conn.requests).toEqual([["client.fit", { enabled: true }]]);

    wrapper.unmount();
    expect(port.listeners.size).toBe(0);
  });
});
