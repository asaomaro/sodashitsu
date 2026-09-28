import type { AgentInfo, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationsStore } from "../store/notifications.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import { NotificationController, type NotificationControllerOptions } from "./NotificationController.js";
import type { NotifyKind } from "@sodashitsu/client-core";
import type { DesktopNotifierPort, DesktopPermission, SoundPort, SoundResult } from "./ports.js";

let pinia: Pinia;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", verified: true, state: "idle", since: 1, completionSeq: 0, serverSeenSeq: 0, ...overrides };
}
function makePane(id: string, overrides: Partial<Pane> = {}): Pane {
  return { id, tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...overrides };
}
function makeTab(): Tab {
  return { id: "t1", workspaceId: "w1", label: "tab-A", layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null };
}
function makeWorkspace(): Workspace {
  return { id: "w1", label: "ws-A", cwd: "/", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: null, autoLabel: false };
}

function fakeDesktop(opts: { permission?: DesktopPermission; showFails?: boolean } = {}) {
  const shown: { title: string; body: string; tag: string; onClick: () => void }[] = [];
  const closed: string[] = [];
  const port: DesktopNotifierPort = {
    permission: () => opts.permission ?? "granted",
    request: async () => opts.permission ?? "granted",
    show: (o) => {
      if (opts.showFails) return false;
      shown.push(o);
      return true;
    },
    closeByTag: (t) => void closed.push(t),
  };
  return { port, shown, closed };
}

function fakeSound(result: SoundResult = "played", unlockResult = true) {
  const played: NotifyKind[] = [];
  // **実物は「解除できたか」を返す**（`ports.ts`）。常に成功を返す偽物にすると、
  // 「解除できなかったのに印を下ろす」穴が見えなくなる。
  const unlock = vi.fn(async () => unlockResult);
  const port: SoundPort = {
    play: (k) => {
      played.push(k);
      return result;
    },
    unlock,
  };
  return { port, played, unlock };
}

/** 既定は「フォーカス無し・その pane は非表示」＝表の (a)（3 経路とも出る行）。 */
function makeController(over: Partial<NotificationControllerOptions> = {}) {
  const desktop = fakeDesktop();
  const sound = fakeSound();
  const visible = new Set<string>();
  let focused = false;
  const c = new NotificationController({
    pinia,
    desktop: desktop.port,
    sound: sound.port,
    isPaneVisible: (id) => visible.has(id),
    hasFocus: () => focused,
    ...over,
  });
  return {
    c,
    desktop,
    sound,
    visible,
    setFocused: (v: boolean) => {
      focused = v;
    },
  };
}

function seedSession(agent: AgentInfo | null = null) {
  const session = useSessionStore(pinia);
  session.workspaceUpserted(makeWorkspace());
  session.tabUpserted(makeTab());
  session.paneUpserted(makePane("p1", { label: "実装", agent }));
  return session;
}

/** `blocked` の 1 秒待ちと `nextTick` を進める。 */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(1100);
  await Promise.resolve();
}

describe("NotificationController — 検知（AC1）", () => {
  it("入力待ちに変わったら知らせる", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    expect(view.toasts.map((t) => t.message)).toEqual(["実装（ws-A / tab-A）が入力待ちです"]);
  });

  // **AC1**：状態が続いている間は繰り返さない。ここが緩いと同じ知らせが何度も出る。
  it("入力待ちが続いている間は繰り返さない", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    c.onAgentChanged("p1", blocked, blocked); // 同じ状態のまま別のフィールドが変わった等
    await settle();
    expect(view.toasts).toHaveLength(1);
  });

  // **同じ pane の知らせは置き換わる**（待ち行列の規則）ので枚数は増えないが、
  // **新しい id のトーストに入れ替わっている**ことで「改めて知らせた」と分かる。
  it("一度抜けてからもう一度入力待ちになれば、改めて知らせる（古い方は置き換わる）", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const first = makeAgent({ state: "blocked", since: 5 });
    seedSession(first);
    c.onAgentChanged("p1", makeAgent({ state: "working" }), first);
    await settle();
    const firstId = view.toasts[0]!.id;

    const second = makeAgent({ state: "blocked", since: 9 }); // `since` が進む
    seedSession(second);
    c.onAgentChanged("p1", makeAgent({ state: "working", since: 7 }), second);
    await settle();

    expect(view.toasts, "同じ pane なので 1 枚に置き換わる").toHaveLength(1);
    expect(view.toasts[0]!.id, "でも新しい知らせ").not.toBe(firstId);
  });

  it("完了（completionSeq の前進）を知らせる", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const done = makeAgent({ state: "idle", completionSeq: 3 });
    seedSession(done);

    c.onAgentChanged("p1", makeAgent({ state: "working", completionSeq: 2 }), done);
    await settle();
    expect(view.toasts.map((t) => t.message)).toEqual(["実装（ws-A / tab-A）が完了しました"]);
  });

  // 前の値が無いと「前進した」と言えない（初めて見る pane に「完了しました」と言わない）。
  it("初めて見る pane では完了を出さない", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const done = makeAgent({ state: "idle", completionSeq: 3 });
    seedSession(done);

    c.onAgentChanged("p1", null, done);
    await settle();
    expect(view.toasts).toHaveLength(0);
  });

  it("エージェントが消えたときは何も起きない", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    seedSession(null);
    c.onAgentChanged("p1", makeAgent({ state: "blocked" }), null);
    await settle();
    expect(view.toasts).toHaveLength(0);
  });
});

// **AC4**：エージェントの状態は細かく揺れる。そのたびに出すと通知そのものを無視するようになる。
describe("NotificationController — 揺れの吸収（AC4）", () => {
  it("1 秒の間に元へ戻ったら知らせない", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    seedSession(makeAgent({ state: "working", since: 6 })); // 1 秒経つ前に抜けた
    await settle();
    expect(view.toasts).toHaveLength(0);
  });

  it("1 秒の間に別の入力待ちへ変わっていたら、古い方は知らせない", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const first = makeAgent({ state: "blocked", since: 5 });
    seedSession(first);

    c.onAgentChanged("p1", makeAgent({ state: "working" }), first);
    seedSession(makeAgent({ state: "blocked", since: 9 })); // 鍵が変わった
    await settle();
    expect(view.toasts).toHaveLength(0);
  });

  // 完了はサーバ側に既に保留がある（`AgentTracker` の working→idle 700ms×3）ので待たない。
  it("完了はクライアント側で待たない", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const done = makeAgent({ state: "idle", completionSeq: 3 });
    seedSession(done);

    c.onAgentChanged("p1", makeAgent({ state: "working", completionSeq: 2 }), done);
    await vi.advanceTimersByTimeAsync(0); // 1 秒待たずに出る
    expect(view.toasts).toHaveLength(1);
  });
});

// requirements の表（AC3）。**前面にいるときに OS 通知を重ねない**のが作法。
describe("NotificationController — 経路の使い分け（AC3）", () => {
  async function fire(setup: (h: ReturnType<typeof makeController>) => void) {
    vi.useFakeTimers();
    const h = makeController();
    setup(h);
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);
    const store = useNotificationsStore(pinia);
    store.setPrefs({ toast: true, desktop: true, sound: true });
    store.setHintDone(true); // 案内はこの describe の関心ではない（別の describe で見る）
    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    return { ...h, view: useViewStore(pinia) };
  }

  it("(a) フォーカス無し → 3 つとも", async () => {
    const r = await fire((h) => h.setFocused(false));
    expect(r.view.toasts).toHaveLength(1);
    expect(r.desktop.shown).toHaveLength(1);
    expect(r.sound.played).toEqual(["blocked"]);
  });

  it("(b) フォーカス有り・その pane は非表示 → トーストだけ", async () => {
    const r = await fire((h) => h.setFocused(true));
    expect(r.view.toasts).toHaveLength(1);
    expect(r.desktop.shown, "前面にいるのに OS 通知を重ねない").toHaveLength(0);
    expect(r.sound.played).toEqual([]);
  });

  it("(c) その pane を見ている → 何も出さない", async () => {
    const r = await fire((h) => {
      h.setFocused(true);
      h.visible.add("p1");
    });
    expect(r.view.toasts).toHaveLength(0);
    expect(r.desktop.shown).toHaveLength(0);
    expect(r.sound.played).toEqual([]);
  });

  it("OS 通知の title と body は pane と場所が分かる（tag は pane id）", async () => {
    const r = await fire((h) => h.setFocused(false));
    expect(r.desktop.shown[0]).toMatchObject({ title: "入力待ち: 実装", body: "ws-A / tab-A", tag: "p1" });
  });
});

// **AC14**：再接続のたびに一斉に出ない／切断中の取りこぼしは拾う。
describe("NotificationController — スナップショット（AC14）", () => {
  it("初回は基準線（既に入力待ちでも知らせない）", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    c.onSnapshotApplied([{ paneId: "p1", agent: blocked }], true);
    await settle();
    expect(view.toasts).toHaveLength(0);
  });

  it("再接続では、初回に見たものを繰り返さない", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    c.onSnapshotApplied([{ paneId: "p1", agent: blocked }], true);
    await settle();
    c.onSnapshotApplied([{ paneId: "p1", agent: blocked }], false); // 再接続
    await settle();
    expect(view.toasts).toHaveLength(0);
  });

  it("切断中に入力待ちになったものは、再接続で知らせる", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    c.onSnapshotApplied([{ paneId: "p1", agent: makeAgent({ state: "working" }) }], true);

    const blocked = makeAgent({ state: "blocked", since: 9 });
    seedSession(blocked);
    c.onSnapshotApplied([{ paneId: "p1", agent: blocked }], false);
    await settle();
    expect(view.toasts.map((t) => t.message)).toEqual(["実装（ws-A / tab-A）が入力待ちです"]);
  });

  it("切断中に完了したものも、再接続で知らせる", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    c.onSnapshotApplied([{ paneId: "p1", agent: makeAgent({ completionSeq: 1 }) }], true);

    const done = makeAgent({ state: "idle", completionSeq: 4 });
    seedSession(done);
    c.onSnapshotApplied([{ paneId: "p1", agent: done }], false);
    await settle();
    expect(view.toasts.map((t) => t.message)).toEqual(["実装（ws-A / tab-A）が完了しました"]);
  });

  // **`snapshotKeys` の守り**：前の値が無いスナップショットでは、状態そのものを見ないと誤爆する。
  it("入力待ちでも完了でもないエージェントには何も言わない", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    seedSession(makeAgent({ state: "working", completionSeq: 0 }));
    c.onSnapshotApplied([{ paneId: "p1", agent: makeAgent({ state: "working", completionSeq: 0 }) }], false);
    await settle();
    expect(view.toasts).toHaveLength(0);
  });

  // **遅延中の鍵も「判定済み」に入っている**（入っていないと 2 本目が立って二重に配送される）。
  it("遅延中に再接続しても、二重に配送しない", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(false);
    useNotificationsStore(pinia).setPrefs({ toast: true, desktop: true, sound: true });
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await vi.advanceTimersByTimeAsync(300); // まだ 1 秒経っていない
    h.c.onSnapshotApplied([{ paneId: "p1", agent: blocked }], false);
    await settle();

    expect(useViewStore(pinia).toasts, "トーストは 1 枚").toHaveLength(1);
    expect(h.desktop.shown, "OS 通知も 1 回").toHaveLength(1);
    expect(h.sound.played, "音も 1 回").toEqual(["blocked"]);
  });
});

describe("NotificationController — 環境の可否", () => {
  it("OS 通知を出せない環境を覚える（以後は設定に「使えません」と出す）", async () => {
    vi.useFakeTimers();
    const desktop = fakeDesktop({ showFails: true });
    const h = makeController({ desktop: desktop.port });
    h.setFocused(false);
    useNotificationsStore(pinia).setPrefs({ desktop: true });
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    expect(useNotificationsStore(pinia).desktopUsable).toBe(false);
  });

  // **解除も通らない環境で見る**（D12）。解除が通るなら印は下りるのが正しいので、
  // 「鳴らせなかった」だけでは立ったままにならない。
  it("音が鳴らせなかったことを覚える（AC13）", async () => {
    vi.useFakeTimers();
    const blockedSound = fakeSound("blocked", false);
    const h = makeController({ sound: blockedSound.port });
    h.setFocused(false);
    useNotificationsStore(pinia).setPrefs({ sound: true });
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    expect(useNotificationsStore(pinia).soundBlocked).toBe(true);
  });
});

describe("NotificationController — pane が閉じた", () => {
  it("判定済みを忘れる（同じ id の pane が作り直されたら改めて知らせる）", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);

    c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    expect(view.toasts).toHaveLength(1);

    const firstId = view.toasts[0]!.id;

    c.onPaneClosed("p1");
    expect(view.toasts, "閉じたときに片付く").toHaveLength(0);

    seedSession(blocked);
    c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    expect(view.toasts, "同じ鍵でも改めて知らせる（判定済みを忘れているので）").toHaveLength(1);
    expect(view.toasts[0]!.id).not.toBe(firstId);
  });
});

// **decisions D4**：積む条件はトーストの入／切と独立。ここが `routes.toast` だと、
// 「トースト切・OS 通知入」の利用者で `prefix+o` が永久に効かなくなる。
describe("NotificationController — 待ち行列（AC9）", () => {
  async function fireBlocked(h: ReturnType<typeof makeController>, paneId: string, since: number) {
    const blocked = makeAgent({ state: "blocked", since, instanceId: `a-${paneId}` });
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace());
    session.tabUpserted(makeTab());
    session.paneUpserted(makePane(paneId, { label: paneId, agent: blocked }));
    h.c.onAgentChanged(paneId, makeAgent({ state: "working", instanceId: `a-${paneId}` }), blocked);
    await settle();
  }

  it("知らせるたびに積まれる", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await fireBlocked(h, "p1", 5);
    await fireBlocked(h, "p2", 5);
    expect(useNotificationsStore(pinia).queue.map((q) => q.paneId)).toEqual(["p1", "p2"]);
  });

  it("トーストを「切」にしても積まれる（OS 通知だけ入の利用者でも prefix+o が効く）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ toast: false, desktop: true, sound: false });
    await fireBlocked(h, "p1", 5);

    const store = useNotificationsStore(pinia);
    expect(useViewStore(pinia).toasts, "トーストは出ない").toHaveLength(0);
    expect(store.queue, "でも待ち行列には入る").toHaveLength(1);
    expect(store.queue[0]!.toastId, "対応するトーストは無い").toBeNull();
  });

  it("見ている pane は積まれない（後で戻る先ではない）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    h.visible.add("p1");
    await fireBlocked(h, "p1", 5);
    expect(useNotificationsStore(pinia).queue).toHaveLength(0);
  });

  // **押し出された件は「新しい通知を出す前」に片付ける**——`tag` が pane id なので、
  // 後から片付けると新しい OS 通知まで閉じてしまう。
  it("同じ pane を出し直すと古い件は片付き、新しい OS 通知は残る", async () => {
    vi.useFakeTimers();
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ toast: true, desktop: true, sound: false });
    await fireBlocked(h, "p1", 5);
    const firstToast = useViewStore(pinia).toasts[0]!.id;

    await fireBlocked(h, "p1", 9);
    const store = useNotificationsStore(pinia);
    expect(store.queue, "同じ pane は 1 件に置き換わる").toHaveLength(1);
    expect(useViewStore(pinia).toasts.map((t) => t.id), "古いトーストは消えた").not.toContain(firstToast);
    expect(h.desktop.shown, "OS 通知は 2 回出た").toHaveLength(2);
    // 片付けは 1 回（古い方）。新しい通知を出した後にもう一度閉じていたら 2 回になる。
    expect(h.desktop.closed).toEqual(["p1"]);
  });

  it("pane が閉じたら、その件とトーストと OS 通知が片付く", async () => {
    vi.useFakeTimers();
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ toast: true, desktop: true, sound: false });
    await fireBlocked(h, "p1", 5);
    h.c.onPaneClosed("p1");

    expect(useNotificationsStore(pinia).queue).toHaveLength(0);
    expect(useViewStore(pinia).toasts).toHaveLength(0);
    expect(h.desktop.closed).toContain("p1");
  });

  // **1 対 1 を保つ唯一の観測点**（sticky は自動消去に掛からない）。
  it("利用者がトーストを消したら、待ち行列からも消えて OS 通知も閉じる", async () => {
    vi.useFakeTimers();
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ toast: true, desktop: true, sound: false });
    await fireBlocked(h, "p1", 5);

    useViewStore(pinia).dismissToast(useViewStore(pinia).toasts[0]!.id);
    h.c.syncToasts();
    expect(useNotificationsStore(pinia).queue).toHaveLength(0);
    expect(h.desktop.closed).toContain("p1");
  });

  it("syncToasts を何度呼んでも壊れない（再入しても安全）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await fireBlocked(h, "p1", 5);
    h.c.syncToasts();
    h.c.syncToasts();
    expect(useNotificationsStore(pinia).queue).toHaveLength(1);
  });
});

describe("NotificationController — prefix+o（AC10・AC11）", () => {
  async function fireBlocked(h: ReturnType<typeof makeController>, paneId: string) {
    const blocked = makeAgent({ state: "blocked", since: 5, instanceId: `a-${paneId}` });
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace());
    session.tabUpserted(makeTab());
    session.paneUpserted(makePane(paneId, { label: paneId, agent: blocked }));
    h.c.onAgentChanged(paneId, makeAgent({ state: "working", instanceId: `a-${paneId}` }), blocked);
    await settle();
  }

  it("先頭の pane へ移り、その 1 件を消費する", async () => {
    vi.useFakeTimers();
    const h = makeController();
    const onFocusPane = vi.fn();
    const h2 = makeController({ onFocusPane });
    await fireBlocked(h2, "p1");
    void h;

    h2.c.focusNext();
    const view = useViewStore(pinia);
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    expect(view.focusedPaneId).toBe("p1");
    expect(onFocusPane).toHaveBeenCalledWith("p1");
    expect(useNotificationsStore(pinia).queue, "消費される").toHaveLength(0);
    expect(view.toasts.filter((t) => t.kind === "sticky"), "トーストも消える").toHaveLength(0);
  });

  it("もう一度押すと次の件へ移る", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await fireBlocked(h, "p1");
    await fireBlocked(h, "p2");

    h.c.focusNext();
    expect(useViewStore(pinia).focusedPaneId).toBe("p1");
    h.c.focusNext();
    expect(useViewStore(pinia).focusedPaneId).toBe("p2");
    expect(useNotificationsStore(pinia).queue).toHaveLength(0);
  });

  it("空のときは、その旨を出して何も起きない（通知の設定とは無関係に必ず出る）", () => {
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ toast: false, desktop: false, sound: false });
    h.c.focusNext();
    expect(useViewStore(pinia).toasts.map((t) => t.message)).toEqual(["未処理の知らせはありません。"]);
  });

  // **decisions D1**：herdr は留めるが、この製品のトーストは消えないので留めると永久に詰まる。
  it("対象が消えていたら捨てて次へ進む", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await fireBlocked(h, "p1");
    await fireBlocked(h, "p2");
    useSessionStore(pinia).paneClosed("p1"); // 待ち行列には残したまま pane だけ消す

    h.c.focusNext();
    expect(useViewStore(pinia).focusedPaneId, "p1 を飛ばして p2 へ").toBe("p2");
    expect(useNotificationsStore(pinia).queue).toHaveLength(0);
  });

  it("全部消えていたら、その旨を 1 回だけ出す", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await fireBlocked(h, "p1");
    await fireBlocked(h, "p2");
    useSessionStore(pinia).paneClosed("p1");
    useSessionStore(pinia).paneClosed("p2");

    h.c.focusNext();
    const msgs = useViewStore(pinia).toasts.filter((t) => t.kind !== "sticky").map((t) => t.message);
    expect(msgs, "捨てた件数ぶん繰り返さない").toEqual(["知らせの対象はすでに閉じられていました。"]);
  });

  // **AC11 の後半**：「その旨を出して次へ進む」。出さないと、1 回押しただけで
  // トーストが何枚も消えて別の pane に着いたように見える。
  it("途中の件を捨てて移ったときも、捨てたことを知らせる", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await fireBlocked(h, "p1");
    await fireBlocked(h, "p2");
    useSessionStore(pinia).paneClosed("p1"); // 先頭だけ消えている

    h.c.focusNext();
    expect(useViewStore(pinia).focusedPaneId, "到達できる p2 へ移る").toBe("p2");
    const msgs = useViewStore(pinia).toasts.filter((t) => t.kind !== "sticky").map((t) => t.message);
    expect(msgs, "捨てたことも知らせる").toEqual(["知らせの対象はすでに閉じられていました。"]);
  });

  it("捨てた件が無ければ、余計な知らせは出さない", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await fireBlocked(h, "p1");
    h.c.focusNext();
    expect(useViewStore(pinia).toasts.filter((t) => t.kind !== "sticky")).toHaveLength(0);
  });
});

// **AC15**：OS 通知は pane ごとに複数同時に出る。先頭を消費すると別の pane へ飛ぶ。
describe("NotificationController — OS 通知のクリック（AC15）", () => {
  async function fireBlocked(h: ReturnType<typeof makeController>, paneId: string) {
    const blocked = makeAgent({ state: "blocked", since: 5, instanceId: `a-${paneId}` });
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace());
    session.tabUpserted(makeTab());
    session.paneUpserted(makePane(paneId, { label: paneId, agent: blocked }));
    h.c.onAgentChanged(paneId, makeAgent({ state: "working", instanceId: `a-${paneId}` }), blocked);
    await settle();
  }

  it("クリックした通知の pane へ移る（先頭ではない）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ toast: true, desktop: true, sound: false });
    await fireBlocked(h, "p1");
    await fireBlocked(h, "p2");

    h.desktop.shown[1]!.onClick(); // 2 件目（p2）をクリック
    expect(useViewStore(pinia).focusedPaneId, "先頭の p1 ではなく p2 へ").toBe("p2");
    expect(useNotificationsStore(pinia).queue.map((q) => q.paneId), "p1 は残る").toEqual(["p1"]);
  });

  it("既に片付けた通知をクリックしても何も起きない", async () => {
    vi.useFakeTimers();
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ toast: true, desktop: true, sound: false });
    await fireBlocked(h, "p1");
    const click = h.desktop.shown[0]!.onClick;
    h.c.focusNext(); // 先に消費

    expect(() => click()).not.toThrow();
    expect(useNotificationsStore(pinia).queue).toHaveLength(0);
  });
});

// **AC5・US8**：既定は OS 通知が「切」なので、案内が無いと席を外した利用者に届く経路がゼロ。
describe("NotificationController — 案内（AC5）", () => {
  async function fireBlocked(h: ReturnType<typeof makeController>) {
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);
    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
  }
  const hints = () => useViewStore(pinia).toasts.filter((t) => t.message.includes("OS の通知でも受け取れます"));

  // **「知らせが起きた瞬間には出さない」**——最初の知らせは定義上フォーカスが無いときに起きるので、
  // その場で出すと誰も見ていないタブに出て消費される。
  it("フォーカスが無いときは出さず、戻ってきたら出る", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(false);
    await fireBlocked(h);
    expect(hints(), "見ていないタブには出さない").toHaveLength(0);

    h.setFocused(true);
    h.c.showHintIfDue();
    expect(hints()).toHaveLength(1);
  });

  // 20260921-keybinding-customization の AC11：「後から〜でも変えられます」のキーは現在の割り当て。
  it("設定を開くキーは現在の割り当てで案内する（既定は ctrl+b s）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    expect(hints()[0]!.message).toContain("（後から ctrl+b s でも変えられます）");
  });

  it("prefix を変えると、既定の prefix+s も新しい prefix で案内する（alt+x s）", async () => {
    vi.useFakeTimers();
    useSettingsStore(pinia).setKeyPrefix("alt+x");
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    expect(hints()[0]!.message).toContain("（後から alt+x s でも変えられます）");
  });

  it("設定の割り当てを直接のキーへ変えていれば、その割り当てで案内する", async () => {
    vi.useFakeTimers();
    useSettingsStore(pinia).setKeyPrefix("alt+x");
    useSettingsStore(pinia).setKeyBindings("settings", ["ctrl+alt+,"]);
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    expect(hints()[0]!.message).toContain("（後から ctrl+alt+, でも変えられます）");
  });

  it("案内が出ている間に prefix・割り当てを変えても、文が追従する（sticky で残っているため）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    expect(hints()[0]!.message).toContain("（後から ctrl+b s でも変えられます）");

    useSettingsStore(pinia).setKeyPrefix("alt+x");
    await settle();
    expect(hints(), "重ねず、同じ案内の文だけが変わる").toHaveLength(1);
    expect(hints()[0]!.message).toContain("（後から alt+x s でも変えられます）");

    useSettingsStore(pinia).setKeyBindings("settings", []);
    await settle();
    expect(hints()[0]!.message).toContain("（後から設定でも変えられます）");
  });

  it("設定を開く割り当てが無ければ、キーを書かずに「設定」と言う", async () => {
    vi.useFakeTimers();
    useSettingsStore(pinia).setKeyBindings("settings", []);
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    expect(hints()[0]!.message).toContain("（後から設定でも変えられます）");
    expect(hints()[0]!.message).not.toContain("prefix");
  });

  // **decisions D3**：表の (b) では `window` の `focus` がもう発火しないので、
  // これが無いと利用者が一度離れて戻るまで案内が出ない。
  it("既にフォーカスがあるなら、その場で出す", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    expect(hints()).toHaveLength(1);
  });

  // **3 経路とも「切」でも出す**——「知らせを出した」を契機にすると、全部切のとき永久に出ない。
  it("通知を全部「切」にしていても出る", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    useNotificationsStore(pinia).setPrefs({ toast: false, desktop: false, sound: false });
    await fireBlocked(h);
    expect(hints()).toHaveLength(1);
  });

  // **重ねない**。持たないと、押さずに放置したままフォーカスのたびに 1 枚ずつ増える。
  it("押さずに放置しても、フォーカスのたびに増えない", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    h.c.showHintIfDue();
    h.c.showHintIfDue();
    h.c.showHintIfDue();
    expect(hints()).toHaveLength(1);
  });

  it("［許可する］で許可を求め、通れば OS 通知を「入」にする。案内は消える", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);

    const accept = hints()[0]!.actions!.find((a) => a.label === "許可する")!;
    accept.run();
    await Promise.resolve();
    await Promise.resolve();

    const store = useNotificationsStore(pinia);
    expect(store.prefs.desktop).toBe(true);
    expect(store.hintDone).toBe(true);
    expect(hints(), "押したら消える（消えないトーストが残らない）").toHaveLength(0);
  });

  it("［許可する］で拒否されたら「入」にしない（が、案内は消費する）", async () => {
    vi.useFakeTimers();
    const denied = fakeDesktop({ permission: "denied" });
    const h = makeController({ desktop: denied.port });
    h.setFocused(true);
    await fireBlocked(h);

    hints()[0]!.actions!.find((a) => a.label === "許可する")!.run();
    await Promise.resolve();
    await Promise.resolve();
    expect(useNotificationsStore(pinia).prefs.desktop).toBe(false);
    expect(useNotificationsStore(pinia).hintDone).toBe(true);
  });

  // 自動再生の解除も「利用者の操作の中」でしかできない（AC13）。
  it("［許可する］は音の解除も試みる", async () => {
    vi.useFakeTimers();
    const sound = fakeSound();
    const h = makeController({ sound: sound.port });
    h.setFocused(true);
    await fireBlocked(h);
    hints()[0]!.actions!.find((a) => a.label === "許可する")!.run();
    await Promise.resolve();
    expect(sound.port.unlock).toHaveBeenCalled();
  });

  it("［あとで］は何も変えずに消費する", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);

    hints()[0]!.actions!.find((a) => a.label === "あとで")!.run();
    const store = useNotificationsStore(pinia);
    expect(store.prefs.desktop).toBe(false);
    expect(store.hintDone).toBe(true);
    expect(hints()).toHaveLength(0);
  });

  it("一度消費したら、次の知らせでも出ない（再読み込み後も）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    hints()[0]!.actions!.find((a) => a.label === "あとで")!.run();

    // 別の知らせ
    const second = makeAgent({ state: "blocked", since: 9 });
    seedSession(second);
    h.c.onAgentChanged("p1", makeAgent({ state: "working", since: 7 }), second);
    await settle();
    expect(hints()).toHaveLength(0);

    // 再読み込み相当（新しい pinia でも localStorage から読み戻す）
    expect(useNotificationsStore(createPinia()).hintDone).toBe(true);
  });

  // **本体のクリックで消した場合も反応**——消したのは「いまは要らない」なので、また出すのは催促。
  it("案内を本体のクリックで消しても消費する", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);

    useViewStore(pinia).dismissToast(hints()[0]!.id);
    h.c.syncToasts();
    expect(useNotificationsStore(pinia).hintDone).toBe(true);

    h.c.showHintIfDue();
    expect(hints(), "もう出ない").toHaveLength(0);
  });

  // 20260926-settings-onboarding の AC9：はじめの案内を確定したら、同じことを問う案内を出さない。
  it("markHintAnswered：出ている案内を消して消費する（設定は変えない）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await fireBlocked(h);
    expect(hints()).toHaveLength(1);
    h.c.markHintAnswered();
    const store = useNotificationsStore(pinia);
    expect(hints()).toHaveLength(0);
    expect(store.hintDone).toBe(true);
    expect(store.hintPending).toBe(false);
    expect(store.prefs.desktop).toBe(false);
  });

  it("markHintAnswered：まだ出ていなくても、以後の知らせで案内を出さない", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    h.c.markHintAnswered();
    await fireBlocked(h);
    expect(hints()).toHaveLength(0);
    expect(useNotificationsStore(createPinia()).hintDone, "再読み込みしても残る").toBe(true);
  });

  it("案内の印は localStorage に残る（フォーカスが戻る前に再読み込みしても失わない）", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(false);
    await fireBlocked(h);
    expect(useNotificationsStore(createPinia()).hintPending, "再読み込みしても残る").toBe(true);
  });
});

// 点検が「テストが守っていない」と指摘した 3 つの穴を、それぞれ実際に突く。
describe("NotificationController — 守りの要（負の対照で効くこと）", () => {
  async function armBlocked(h: ReturnType<typeof makeController>) {
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);
    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    return blocked;
  }

  // **`judged` は遅延を仕掛けた時点で入れる**。`#pending` の番人は「発火するまで」しか守らない——
  // タイマが発火して `#pending` から消えた後、`nextTick` が解決する前に再接続が来ると素通りする。
  it("タイマ発火後・配送前に再接続が来ても、二重に配送しない", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(false);
    const store = useNotificationsStore(pinia);
    store.setPrefs({ toast: true, desktop: true, sound: false });
    store.setHintDone(true);
    const blocked = await armBlocked(h);

    vi.advanceTimersByTime(1000); // タイマは発火した（#pending から消えた）が、nextTick はまだ
    h.c.onSnapshotApplied([{ paneId: "p1", agent: blocked }], false); // ここで再接続
    // 判定済みへ入れ損ねていると、ここで 2 本目のタイマが立つ。**それも発火させて**初めて二重配送が見える。
    await vi.advanceTimersByTimeAsync(1100);
    await Promise.resolve();

    expect(h.desktop.shown.map((n) => n.tag), "OS 通知は 1 回").toEqual(["p1"]);
    expect(useViewStore(pinia).toasts.filter((t) => t.message.includes("入力待ちです")), "トーストも 1 枚").toHaveLength(1);
  });

  // **案内の契機は「判定した」時点**。「配送した」時点にすると、表の (c)（見ている pane）で
  // 判定だけされた場合に案内が出ない。
  it("見ている pane の出来事でも、案内の印は立つ", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    h.visible.add("p1"); // 表の (c)：何も配送されない
    await armBlocked(h);
    await settle();

    const notices = useViewStore(pinia).toasts.filter((t) => t.message.includes("入力待ちです"));
    expect(notices, "知らせは出ない").toHaveLength(0);
    expect(useViewStore(pinia).toasts.map((t) => t.message).join(""), "でも案内は出る").toContain("OS の通知でも受け取れます");
  });

  // 1 秒以内に戻って**配送されなかった**場合も、判定はしているので案内は出る。
  it("揺れて配送されなかった出来事でも、案内の印は立つ", async () => {
    vi.useFakeTimers();
    const h = makeController();
    h.setFocused(true);
    await armBlocked(h);
    seedSession(makeAgent({ state: "working", since: 6 })); // 1 秒経つ前に抜けた
    await settle();

    expect(useViewStore(pinia).toasts.filter((t) => t.message.includes("入力待ちです")), "知らせは出ない").toHaveLength(0);
    expect(useViewStore(pinia).toasts.map((t) => t.message).join(""), "でも案内は出る").toContain("OS の通知でも受け取れます");
  });

  // **利用者の状態は `nextTick` の後に読む**。`PaneLayout` の `:key` 付け替えは unmount+mount を
  // 同じパッチに載せるので、途中で読むと「見ている」の判定がひっくり返る。
  it("nextTick の前後で表示が変わるとき、確定した後の値で判定する", async () => {
    vi.useFakeTimers();
    let visible = true; // 同期で読むと「見ている」＝何も出さない
    const h = makeController({ isPaneVisible: () => visible, hasFocus: () => true });
    useNotificationsStore(pinia).setHintDone(true);

    // **完了は遅延を挟まない**ので、`#deliverAfterTick` の `await nextTick()` だけが間に入る。
    // 呼んだ直後に表示を落とす＝「パッチの途中で読むと true、確定後に読むと false」を模す。
    const done = makeAgent({ state: "idle", completionSeq: 3 });
    seedSession(done);
    h.c.onAgentChanged("p1", makeAgent({ state: "working", completionSeq: 2 }), done);
    visible = false; // tick が解決する前に、同期で落とす

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(useViewStore(pinia).toasts.filter((t) => t.message.includes("完了しました")), "確定後の値（非表示）で判定して知らせる").toHaveLength(1);
  });
});

// 点検が見つけた穴：許可を確かめずに `show()` を呼ぶと、`denied` のときに
// 「この環境では使えません」を恒久的に立ててしまう（AC8 の表示が AC12 に化ける）。
describe("NotificationController — 許可の門（AC8 と AC12 を取り違えない）", () => {
  it("許可されていなければ、OS 通知を出そうとしない（環境の可否も落とさない）", async () => {
    vi.useFakeTimers();
    const denied = fakeDesktop({ permission: "denied" });
    const h = makeController({ desktop: denied.port });
    h.setFocused(false);
    const store = useNotificationsStore(pinia);
    store.setPrefs({ desktop: true });
    store.setHintDone(true);

    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);
    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();

    expect(denied.shown).toHaveLength(0);
    expect(store.desktopUsable, "「使えない環境」ではない（許可が無いだけ）").toBe(true);
  });

  it("許可されていれば出し、構築に失敗したときだけ「使えない環境」にする", async () => {
    vi.useFakeTimers();
    const broken = fakeDesktop({ permission: "granted", showFails: true });
    const h = makeController({ desktop: broken.port });
    h.setFocused(false);
    const store = useNotificationsStore(pinia);
    store.setPrefs({ desktop: true });
    store.setHintDone(true);

    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);
    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    expect(store.desktopUsable).toBe(false);
  });
});

// cross 点検が見つけた、タスク単位では見えない 2 つの穴。
describe("NotificationController — 他の仕組みとの噛み合わせ", () => {
  async function queueOne(h: ReturnType<typeof makeController>, paneId = "p1") {
    const blocked = makeAgent({ state: "blocked", since: 5, instanceId: `a-${paneId}` });
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace());
    session.tabUpserted(makeTab());
    session.paneUpserted(makePane(paneId, { label: paneId, agent: blocked }));
    useNotificationsStore(pinia).setHintDone(true);
    h.c.onAgentChanged(paneId, makeAgent({ state: "working", instanceId: `a-${paneId}` }), blocked);
    await settle();
  }

  // **ダイアログが開いている間は焦点を直接動かさない**（D97 の既存の規則）。
  // `prefix+o` は window keydown が遮断するが、**OS 通知のクリックは外から来るので守りが効かない**。
  // 素通しすると、閉じたときに「開く前の pane」へ戻され、表示中の tab に無い pane が焦点のまま残る。
  it("ダイアログが開いている間にクリックされたら、焦点は『閉じたときに戻す先』だけ差し替える", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await queueOne(h);
    const view = useViewStore(pinia);
    view.focusPane("p-other");
    view.openDialogWithContext({ kind: "settings" }); // 開く前の焦点は p-other

    h.c.focusNext();

    expect(view.tabId, "表示する tab は移る").toBe("t1");
    expect(view.focusedPaneId, "焦点は直接動かさない（入力欄からフォーカスを奪わない）").toBe("p-other");
    view.closeDialog();
    expect(view.focusedPaneId, "閉じたら知らせの pane へ戻る（表示中の tab と食い違わない）").toBe("p1");
  });

  it("ダイアログが開いていなければ、今までどおり焦点を動かす", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await queueOne(h);
    const view = useViewStore(pinia);
    h.c.focusNext();
    expect(view.focusedPaneId).toBe("p1");
  });

  // **`pane.closed` は接続中にしか届かない**。切断中に閉じられた pane はスナップショットから
  // 黙って消えるので、掃除しないと鍵が永久に残り、待ち行列の枠を占め、OS 通知も閉じられない。
  it("再接続のスナップショットから消えた pane を掃除する", async () => {
    vi.useFakeTimers();
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ toast: true, desktop: true, sound: false });
    await queueOne(h);
    const store = useNotificationsStore(pinia);
    expect(store.queue).toHaveLength(1);
    expect(store.isJudged("p1", "blocked:a-p1:5")).toBe(true);

    // 切断中に p1 が閉じられた＝次のスナップショットに載っていない。
    h.c.onSnapshotApplied([{ paneId: "p9", agent: null }], false);

    expect(store.queue, "待ち行列から消える").toHaveLength(0);
    expect(store.isJudged("p1", "blocked:a-p1:5"), "判定済みも忘れる").toBe(false);
    expect(useViewStore(pinia).toasts.filter((t) => t.kind === "sticky"), "トーストも消える").toHaveLength(0);
    expect(h.desktop.closed, "OS 通知も閉じる").toContain("p1");
  });

  it("スナップショットに残っている pane は掃除しない", async () => {
    vi.useFakeTimers();
    const h = makeController();
    await queueOne(h);
    const store = useNotificationsStore(pinia);
    h.c.onSnapshotApplied([{ paneId: "p1", agent: makeAgent({ state: "blocked", since: 5, instanceId: "a-p1" }) }], false);
    expect(store.queue).toHaveLength(1);
    expect(store.isJudged("p1", "blocked:a-p1:5")).toBe(true);
  });
});

// review ラウンド1：`"unsupported"` を `blocked` に畳むと、**永久に鳴らない設定を
// 利用者が「入」だと思い続ける**（設定に注記も `disabled` も出ない）。
describe("NotificationController — 音が使えない環境（AC13）", () => {
  async function fire(h: ReturnType<typeof makeController>) {
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);
    const store = useNotificationsStore(pinia);
    store.setPrefs({ sound: true });
    store.setHintDone(true);
    h.setFocused(false);
    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
  }

  it("unsupported を blocked に畳まず、「この環境では使えない」として覚える", async () => {
    vi.useFakeTimers();
    const h = makeController({ sound: fakeSound("unsupported").port });
    await fire(h);
    const store = useNotificationsStore(pinia);
    expect(store.soundUsable, "使えない環境として覚える").toBe(false);
    expect(store.soundBlocked, "「操作していないから鳴らない」とは別の話").toBe(false);
  });

  it("鳴れば soundBlocked を下ろす", async () => {
    vi.useFakeTimers();
    const h = makeController({ sound: fakeSound("played").port });
    useNotificationsStore(pinia).soundBlocked = true;
    await fire(h);
    expect(useNotificationsStore(pinia).soundBlocked).toBe(false);
  });

  // **鳴らせなかったまま黙って諦めない**（PR レビュー（人間）の指摘）。一度でも操作されたページなら
  // 操作の外からの `resume()` も通るので、**次の知らせから鳴る**。通れば印もその時点で下りる。
  it("鳴らせなかった知らせの後は解除を試み、解除できたら印を下ろす", async () => {
    vi.useFakeTimers();
    const sound = fakeSound("blocked");
    const h = makeController({ sound: sound.port });
    await fire(h);
    const store = useNotificationsStore(pinia);
    expect(sound.unlock, "諦めずに解除を試みる").toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0); // unlock の解決（実物も非同期）
    expect(store.soundBlocked, "解除できた時点で印が下りる").toBe(false);
  });

  it("解除もできなければ印は立ったまま（嘘をつかない）", async () => {
    vi.useFakeTimers();
    const h = makeController({ sound: fakeSound("blocked", false).port });
    await fire(h);
    await vi.advanceTimersByTimeAsync(0);
    expect(useNotificationsStore(pinia).soundBlocked).toBe(true);
  });
});

// review ラウンド1（US4）：既定では OS 通知が「切」なので、これが無いと
// **マウス／タッチの利用者に移動する手段が無い**（本体のクリックは「消す」＝行き先ごと捨てる）。
describe("NotificationController — 知らせから移動する（US4）", () => {
  it("知らせのトーストに［移動］が付き、押すとその pane へ移る", async () => {
    vi.useFakeTimers();
    const h = makeController();
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);
    useNotificationsStore(pinia).setHintDone(true);
    h.c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();

    const view = useViewStore(pinia);
    const toast = view.toasts.find((t) => t.message.includes("入力待ちです"))!;
    expect(toast.actions?.map((a) => a.label)).toEqual(["移動"]);

    toast.actions![0]!.run();
    expect(view.focusedPaneId, "その pane へ移る").toBe("p1");
    expect(view.toasts.filter((t) => t.message.includes("入力待ちです")), "その 1 件は消える").toHaveLength(0);
    expect(useNotificationsStore(pinia).queue).toHaveLength(0);
  });
});

// **PR レビュー（人間）の指摘**：設定の注記は「どこかを押すと鳴るようになります」と言うのに、
// 解除する経路が「設定で入にした瞬間」と「案内の［許可する］」の 2 つしか無かった。
// **自動再生の制限はページの読み込みごとに掛かり直す**ので、読み込み直した後の利用者には効かない。
describe("NotificationController — 利用者の操作で自動再生を解除する（AC13）", () => {
  it("音が「入」なら、画面のどこかを操作した時点で解除しにいく", () => {
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ sound: true });
    h.c.noteUserGesture();
    expect(h.sound.unlock).toHaveBeenCalledOnce();
  });

  it("音が「切」なら解除しにいかない（鳴らすつもりの無い利用者に AudioContext を作らせない）", () => {
    const h = makeController();
    useNotificationsStore(pinia).setPrefs({ sound: false });
    h.c.noteUserGesture();
    expect(h.sound.unlock).not.toHaveBeenCalled();
  });

  // 「押しても変わらない」と見せないための一手（タスク点検 T24 の指摘）。
  it("解除できたら「鳴らせませんでした」の印を下ろす", async () => {
    const h = makeController();
    const store = useNotificationsStore(pinia);
    store.setPrefs({ sound: true });
    store.soundBlocked = true;
    h.c.noteUserGesture();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.soundBlocked, "押した後の設定は「押せば鳴る」と言わない").toBe(false);
  });

  it("解除できなかったら印は下ろさない（嘘をつかない）", async () => {
    const h = makeController({ sound: fakeSound("played", false).port });
    const store = useNotificationsStore(pinia);
    store.setPrefs({ sound: true });
    store.soundBlocked = true;
    h.c.noteUserGesture();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.soundBlocked).toBe(true);
  });

  it("設定で音を「入」にしたときも同じ出口を通る", async () => {
    const h = makeController();
    const store = useNotificationsStore(pinia);
    store.soundBlocked = true;
    h.c.unlockSound();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.sound.unlock).toHaveBeenCalledOnce();
    expect(store.soundBlocked).toBe(false);
  });
});

// 20260927-multi-host-machines（T11）：マシンの切り替えで、前のマシンの知らせを持ち越さない。
describe("NotificationController.resetForMachineSwitch", () => {
  it("出ているトースト・待ち行列・遅延中の知らせを捨てる（前のマシンの p1 を次のマシンの p1 へ移さない）", async () => {
    vi.useFakeTimers();
    const { c } = makeController();
    const view = useViewStore(pinia);
    const blocked = makeAgent({ state: "blocked", since: 5 });
    seedSession(blocked);
    c.onAgentChanged("p1", makeAgent({ state: "working" }), blocked);
    await settle();
    expect(view.toasts).toHaveLength(1);
    // 次の知らせを 1 秒待ちの途中で切り替える
    const again = makeAgent({ state: "blocked", since: 9 });
    c.onAgentChanged("p1", makeAgent({ state: "working" }), again);
    c.resetForMachineSwitch();
    expect(view.toasts).toHaveLength(0);
    expect(useNotificationsStore(pinia).queue).toHaveLength(0);
    await settle();
    expect(view.toasts).toHaveLength(0); // 遅延中だった知らせも出ない
  });
});
