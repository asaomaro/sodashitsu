import type { MethodName, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import { Terminal } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";
import type { ConnectionPort } from "@sodashitsu/client-core";
import type { TerminalRegistry } from "./TerminalRegistry.js";
import { ViewSync } from "./ViewSync.js";

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

function makeElement(width: number, height: number): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect;
  return el;
}

/**
 * `TerminalRegistry` の代わり。`pending` は「今の接続でまだ購読していない」pane（実物の `unsubscribed`）——
 * `takePendingSubscriptions(shown)` は表示する分だけを取り出し、`markAllUnsubscribed` は全部を戻す（D107）。
 */
function makeRegistry(
  paneIds: string[],
  pending: string[],
  scrollbackOf: Record<string, number> = {},
): TerminalRegistry & { markAllUnsubscribed: ReturnType<typeof vi.fn> } {
  const terms = new Map(paneIds.map((id) => [id, new Terminal({ cols: 80, rows: 24 })]));
  const unsubscribed = new Set(pending);
  return {
    // `scrollback` は作ったときの行数（20260921-herdr-settings-gaps の D6）。渡さなければ `undefined`＝既存のテストの形。
    get: (paneId: string) =>
      terms.has(paneId)
        ? { paneId, term: terms.get(paneId)!, element: document.createElement("div"), webgl: false, lastUsed: 0, copy: { apply: () => ({}) }, scrollback: scrollbackOf[paneId] }
        : undefined,
    takePendingSubscriptions: (shown: Iterable<string>) => [...shown].filter((id) => unsubscribed.delete(id)),
    markAllUnsubscribed: vi.fn(() => {
      for (const id of paneIds) unsubscribed.add(id);
    }),
  } as unknown as TerminalRegistry & { markAllUnsubscribed: ReturnType<typeof vi.fn> };
}

const FIXED_CELL = { width: 9, height: 18 };

describe("ViewSync", () => {
  // 20260921-herdr-settings-gaps の D6：作ってから購読するまでの間に利用者が設定を変えても、xterm の容量と
  // SNAPSHOT に求める行数を食い違わせない。
  it("購読の行数は、その端末を作ったときの値を getScrollbackLines より優先する", () => {
    const conn = makeConnection();
    // p3 は 0 行で作った端末（サーバの `--scrollback 0` も、0 を選んで保存することも有効な値）。`??` ではなく `||` で
    // 予備に落とすと、0 で作った端末に 5000 を求めてしまい、D6 が防ぐ食い違いそのものになる。
    const registry = makeRegistry(["p1", "p2", "p3"], ["p1", "p2", "p3"], { p1: 2000, p3: 0 });
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    viewSync.onConnectionOpened();

    viewSync.commit({
      workspaceId: "w1",
      tabId: "t1",
      visible: [
        { paneId: "p1", element: makeElement(720, 360) },
        { paneId: "p2", element: makeElement(720, 360) },
        { paneId: "p3", element: makeElement(720, 360) },
      ],
    });

    expect(conn.requests.filter(([m]) => m === "pane.subscribe")).toEqual([
      ["pane.subscribe", { paneId: "p1", scrollbackLines: 2000 }], // 作ったときの値
      ["pane.subscribe", { paneId: "p2", scrollbackLines: 5000 }], // 作ったときの値が無ければ予備
      ["pane.subscribe", { paneId: "p3", scrollbackLines: 0 }], // 0 も作ったときの値（予備に落とさない）
    ]);
  });

  it("commit: client.view を送ってから、予約された pane.subscribe を送る（この順で）", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1"], ["p1"]);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    viewSync.onConnectionOpened(); // hello が通った（D107：それまでは送らない）

    viewSync.commit({ workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: makeElement(720, 360) }] });

    expect(conn.requests[0]).toEqual(["client.view", { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", cols: 80, rows: 20 }] }]);
    expect(conn.requests[1]).toEqual(["pane.subscribe", { paneId: "p1", scrollbackLines: 5000 }]);
  });

  it("同じ内容（workspace/tab/表示中の pane とサイズ）を繰り返し送らない", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1"], []);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    viewSync.onConnectionOpened(); // hello が通った（D107：それまでは送らない）

    const view = { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: makeElement(720, 360) }] };
    viewSync.commit(view);
    viewSync.commit(view);
    const viewCalls = conn.requests.filter(([m]) => m === "client.view");
    expect(viewCalls).toHaveLength(1);
  });

  it("サイズが変われば改めて送る", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1"], []);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    viewSync.onConnectionOpened(); // hello が通った（D107：それまでは送らない）

    viewSync.commit({ workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: makeElement(720, 360) }] });
    viewSync.commit({ workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: makeElement(900, 360) }] });
    const viewCalls = conn.requests.filter(([m]) => m === "client.view");
    expect(viewCalls).toHaveLength(2);
  });

  it("pane が複数あれば、それぞれ subscribe を送る", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1", "p2"], ["p1", "p2"]);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 1000, getCellSize: () => FIXED_CELL });
    viewSync.onConnectionOpened(); // hello が通った（D107：それまでは送らない）

    viewSync.commit({
      workspaceId: "w1",
      tabId: "t1",
      visible: [
        { paneId: "p1", element: makeElement(720, 360) },
        { paneId: "p2", element: makeElement(720, 360) },
      ],
    });

    const subs = conn.requests.filter(([m]) => m === "pane.subscribe");
    expect(subs).toEqual([
      ["pane.subscribe", { paneId: "p1", scrollbackLines: 1000 }],
      ["pane.subscribe", { paneId: "p2", scrollbackLines: 1000 }],
    ]);
  });

  it("隠れている pane（今の commit の表示に無い）の予約は、表示されるまで送らない（D107）", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1", "p2"], ["p1", "p2"]);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    viewSync.onConnectionOpened(); // hello が通った（D107：それまでは送らない）

    viewSync.commit({ workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: makeElement(720, 360) }] });
    expect(conn.requests.filter(([m]) => m === "pane.subscribe")).toEqual([["pane.subscribe", { paneId: "p1", scrollbackLines: 5000 }]]);

    viewSync.commit({ workspaceId: "w1", tabId: "t2", visible: [{ paneId: "p2", element: makeElement(720, 360) }] });
    expect(conn.requests.filter(([m]) => m === "pane.subscribe").map(([, p]) => (p as { paneId: string }).paneId)).toEqual(["p1", "p2"]);
  });

  it("表示が 1 つの pane だけで measureSinglePane が付いていれば、葉の代わりにそれで枠を測る（D108。モバイルは縮小の枠の中の葉ではなく表示領域を測る）", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1"], []);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 1000, getCellSize: () => FIXED_CELL });
    viewSync.onConnectionOpened();

    const leaf = makeElement(390, 175); // 縮小の枠の中の葉（PTY の大きさ × scale）
    const measureArea = vi.fn(() => ({ width: 390, height: 600 }));
    viewSync.commit({ workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: leaf }], measureSinglePane: measureArea });
    expect(measureArea).toHaveBeenCalledWith("p1", leaf);
    expect(conn.requests[0]).toEqual(["client.view", { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", cols: 43, rows: 33 }] }]);

    // 付けなければ葉を測る（デスクトップ）。
    viewSync.commit({ workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: leaf }] });
    expect(conn.requests.at(-1)).toEqual(["client.view", { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", cols: 43, rows: 9 }] }]);
  });

  it("measureSinglePane は pane ごとの口ではない：表示が 2 つ以上なら使わずに葉を測り、開発時は 1 度だけ警告する（D108 の独立点検 #2）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const conn = makeConnection();
      const registry = makeRegistry(["p1", "p2"], []);
      const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 1000, getCellSize: () => FIXED_CELL });
      viewSync.onConnectionOpened();
      const measureArea = vi.fn(() => ({ width: 390, height: 600 }));
      const split = (width: number) => ({
        workspaceId: "w1",
        tabId: "t1",
        visible: [
          { paneId: "p1", element: makeElement(width, 360) },
          { paneId: "p2", element: makeElement(width, 360) },
        ],
        measureSinglePane: measureArea,
      });
      viewSync.commit(split(360));
      viewSync.commit(split(450));
      expect(measureArea).not.toHaveBeenCalled();
      expect(conn.requests.filter(([m]) => m === "client.view").map(([, p]) => (p as { visible: unknown[] }).visible)).toEqual([
        [
          { paneId: "p1", cols: 40, rows: 20 },
          { paneId: "p2", cols: 40, rows: 20 },
        ],
        [
          { paneId: "p1", cols: 50, rows: 20 },
          { paneId: "p2", cols: 50, rows: 20 },
        ],
      ]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("measureSinglePane");
    } finally {
      warn.mockRestore();
    }
  });

  it("枠の寸法とセルの寸法から cols/rows を求める（余りは切り捨て）", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1"], []);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => ({ width: 10, height: 20 }) });
    viewSync.onConnectionOpened(); // hello が通った（D107：それまでは送らない）

    viewSync.commit({ workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", element: makeElement(805, 405) }] });
    expect(conn.requests[0]).toEqual(["client.view", { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", cols: 80, rows: 20 }] }]);
  });
});

/**
 * D107（統合 review ラウンド1 で発見）：サーバは接続ごとに新しい clientId を振り、購読・表示・fit をその clientId に持つ。
 * 以前は `lastPayload` を接続をまたいで持ち、同じ内容の `client.view` を送らず、購読も xterm.js を作ったときしか予約しなかった
 * ので、再接続の後は表示中の pane に OUTPUT も SNAPSHOT も届かなかった（入力だけは届く）。
 */
describe("ViewSync — 接続が替わったら表示と購読を張り直す（D107）", () => {
  const view = (paneIds: string[]) => ({ workspaceId: "w1", tabId: "t1", visible: paneIds.map((paneId) => ({ paneId, element: makeElement(720, 360) })) });

  it("onConnectionOpened の後は、同じ内容でも client.view を送り直し、表示中の pane を購読し直す（client.view → pane.subscribe の順）", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1", "p2"], ["p1", "p2"]);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    viewSync.onConnectionOpened(); // 最初の接続の hello
    viewSync.commit(view(["p1", "p2"]));
    viewSync.commit(view(["p1", "p2"]));
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe", "pane.subscribe"]); // 同じ接続では 1 回ずつ

    conn.requests.length = 0;
    viewSync.onConnectionClosed(); // 切れた
    viewSync.onConnectionOpened(); // 新しい接続の hello が通った
    expect(registry.markAllUnsubscribed).toHaveBeenCalledTimes(2);
    viewSync.commit(view(["p1", "p2"]));
    expect(conn.requests).toEqual([
      ["client.view", { workspaceId: "w1", tabId: "t1", visible: [{ paneId: "p1", cols: 80, rows: 20 }, { paneId: "p2", cols: 80, rows: 20 }] }],
      ["pane.subscribe", { paneId: "p1", scrollbackLines: 5000 }],
      ["pane.subscribe", { paneId: "p2", scrollbackLines: 5000 }],
    ]);
  });

  it("onConnectionOpened は root の PaneLayout が付けた関数で今の表示を commit し直す。外した後・別の関数に替わった後は呼ばない", () => {
    const conn = makeConnection();
    const viewSync = new ViewSync({ conn, registry: makeRegistry(["p1"], []), getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    const first = vi.fn();
    const detachFirst = viewSync.attachCommitter(first);
    viewSync.onConnectionOpened();
    expect(first).toHaveBeenCalledTimes(1);

    const second = vi.fn();
    const detachSecond = viewSync.attachCommitter(second); // 作り直された root（前のものの unmount が後から届く場合も含む）
    detachFirst(); // 古いものを外しても、新しいものは残る
    viewSync.onConnectionOpened();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    detachSecond(); // root が無い（ログイン画面・切り離し画面）間は呼ばない——次に mount したときの commit が同じ役を果たす
    expect(() => viewSync.onConnectionOpened()).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("hello の前（最初の接続・閉じた後、WebSocket が開いてから hello の応答までを含む）の commit は何も送らず、予約の購読も取らない。hello の後の commit し直しで 1 回ずつ送る（独立点検 #4）", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1"], ["p1"]);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    const commitNow = vi.fn(() => viewSync.commit(view(["p1"])));
    viewSync.attachCommitter(commitNow);
    // 「再接続」ボタンの直後：本体が mount して commit するが、まだ hello が通っていない。
    viewSync.commit(view(["p1"]));
    expect(conn.requests).toEqual([]);

    viewSync.onConnectionOpened(); // hello が通った → 付いている関数で commit し直す
    expect(commitNow).toHaveBeenCalledTimes(1);
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe"]);

    // 切れて、新しい WebSocket は開いたが hello の応答はまだ：その間の commit（大きさの変化のタイマー・レイアウトのイベント等）は
    // 新しい接続へ送らない。以前はここで `pane.subscribe` を送り、hello の後の張り直しで同じ pane をもう一度購読していた
    // （SNAPSHOT の二重送り）——表示の申告より先に購読だけが届くこともあった。
    conn.requests.length = 0;
    viewSync.onConnectionClosed();
    viewSync.commit({ ...view([]), visible: [{ paneId: "p1", element: makeElement(900, 360) }] });
    expect(conn.requests).toEqual([]);

    viewSync.onConnectionOpened();
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe"]); // 1 回ずつ
  });

  it("onViewEstablished：新しい接続で最初の client.view を送った直後、pane.subscribe より前に呼ぶ（04 が client.fit を送り直す口）", () => {
    const conn = makeConnection();
    const registry = makeRegistry(["p1"], ["p1"]);
    const viewSync = new ViewSync({ conn, registry, getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
    const listener = vi.fn(() => void conn.request("client.fit", { enabled: true }));
    viewSync.onViewEstablished(listener);

    viewSync.onConnectionOpened();
    viewSync.commit(view(["p1"]));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "client.fit", "pane.subscribe"]);

    // 同じ接続の以後の commit（大きさの変化等）では呼ばない。
    viewSync.commit({ ...view([]), visible: [{ paneId: "p1", element: makeElement(900, 360) }] });
    expect(listener).toHaveBeenCalledTimes(1);

    // 次の接続では、表示の中身が切断の前と同じでも呼ぶ。
    conn.requests.length = 0;
    viewSync.onConnectionOpened();
    viewSync.commit({ ...view([]), visible: [{ paneId: "p1", element: makeElement(900, 360) }] });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "client.fit", "pane.subscribe"]);
  });

  it("onViewEstablished：外した listener は呼ばない。listener が例外を投げても、続く pane.subscribe は送る", () => {
    vi.useFakeTimers();
    try {
      const conn = makeConnection();
      const viewSync = new ViewSync({ conn, registry: makeRegistry(["p1"], ["p1"]), getScrollbackLines: () => 5000, getCellSize: () => FIXED_CELL });
      const removed = vi.fn();
      viewSync.onViewEstablished(removed)();
      viewSync.onViewEstablished(() => {
        throw new Error("listener failed");
      });
      viewSync.onConnectionOpened();
      viewSync.commit(view(["p1"]));
      expect(removed).not.toHaveBeenCalled();
      expect(conn.requests.map(([m]) => m)).toEqual(["client.view", "pane.subscribe"]);
      // 例外は握りつぶさず、後のタスクで投げ直す（見えるようにする）。
      expect(() => vi.runAllTimers()).toThrow("listener failed");
    } finally {
      vi.useRealTimers();
    }
  });
});
