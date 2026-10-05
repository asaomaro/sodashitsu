import { mount, type VueWrapper } from "@vue/test-utils";
import type { HistoryEntry } from "@sodashitsu/client-core";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationControllerKey, TerminalRegistryKey } from "../injection.js";
import { useNotificationsStore } from "../store/notifications.js";
import { useViewStore } from "../store/view.js";
import NotificationBell from "./NotificationBell.vue";
import NotificationHistoryDialog from "./NotificationHistoryDialog.vue";

let pinia: Pinia;
const NOW = 10_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  localStorage.clear();
});

function entry(n: number, o: Partial<HistoryEntry> = {}): HistoryEntry {
  return { key: `blocked:a${n}:1`, kind: "blocked", paneId: `p${n}`, instanceId: `a${n}`, seq: 1, label: `pane${n}（ws / tab）`, at: NOW - n * 60_000, reason: "dismissed", ...o };
}

/** コントローラの代役（ストアを直に触る。実物の結線は `NotificationController.test.ts`）。 */
function fakeController() {
  const store = useNotificationsStore(pinia);
  return {
    focusHistoryEntry: vi.fn((key: string) => void store.removeHistory(key)),
    dismissHistoryEntry: vi.fn((key: string) => void store.removeHistory(key)),
    clearHistory: vi.fn(() => store.clearHistory()),
  };
}

async function setup(entries: HistoryEntry[], opener?: "bell") {
  const store = useNotificationsStore(pinia);
  for (const e of entries) store.addHistory(e);
  const view = useViewStore(pinia);
  const controller = fakeController();
  const registry = { focus: vi.fn() };
  const wrapper = mount(NotificationHistoryDialog, {
    global: { plugins: [pinia], provide: { [NotificationControllerKey as symbol]: controller, [TerminalRegistryKey as symbol]: registry } },
    attachTo: document.body,
  });
  view.focusPane("p-focus");
  view.openDialogWithContext(opener ? { kind: "notificationHistory", opener } : { kind: "notificationHistory" });
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
  return { store, view, controller, registry, wrapper };
}
const dialogOf = (w: VueWrapper) => w.get("dialog").element as HTMLDialogElement;
const rowsOf = (w: VueWrapper) => w.findAll(".nh-row");
async function press(el: Element, key: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

describe("NotificationHistoryDialog — 表示（AC10）", () => {
  it("新しい順に、種類・呼び名・時刻・移動を出す。見出しに件数", async () => {
    const { wrapper } = await setup([entry(3, { kind: "done", key: "done:a3:1", at: NOW - 3 * 3_600_000 }), entry(1), entry(2)]);
    expect(dialogOf(wrapper).open).toBe(true);
    expect(wrapper.get(".nh-title").text()).toBe("判断を先送りした通知（3 件）");
    const rows = rowsOf(wrapper);
    // 追加順が 3→1→2 なので、新しい順は 2→1→3。
    expect(rows.map((r) => r.get(".nh-label").text())).toEqual(["pane2（ws / tab）", "pane1（ws / tab）", "pane3（ws / tab）"]);
    expect(rows[0]!.get(".nh-kind").text()).toBe("入力待ち");
    expect(rows[0]!.get(".nh-age").text()).toBe("2 分前");
    expect(rows[2]!.get(".nh-kind").text()).toBe("完了");
    expect(rows[2]!.get(".nh-age").text()).toBe("3 時間前");
    expect(rows[0]!.get(".nh-move").text()).toBe("移動");
  });

  it("0 件なら案内を出し、［すべて削除］は無効", async () => {
    const { wrapper } = await setup([]);
    expect(wrapper.get(".nh-empty").text()).toBe("判断を先送りした通知はありません");
    expect(wrapper.find(".nh-list").exists()).toBe(false);
    expect(wrapper.get(".nh-clear").attributes("disabled")).toBeDefined();
  });

  it("時刻は開いている間 30 秒ごとに進む", async () => {
    const { wrapper } = await setup([entry(0, { at: NOW })]);
    expect(wrapper.get(".nh-age").text()).toBe("たった今");
    await vi.advanceTimersByTimeAsync(90_000);
    expect(wrapper.get(".nh-age").text()).toBe("1 分前");
  });

  it("開いている間に解消で行が消えたら、一覧からも消える。全部消えたら 0 件の表示", async () => {
    const { wrapper, store } = await setup([entry(1), entry(2)]);
    store.removeHistory("blocked:a1:1");
    await wrapper.vm.$nextTick();
    expect(rowsOf(wrapper)).toHaveLength(1);
    store.removeHistory("blocked:a2:1");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".nh-empty").exists()).toBe(true);
  });
});

describe("NotificationHistoryDialog — 開く・閉じる・フォーカス（AC-I1・AC-I4）", () => {
  it("開いたら最初の行へフォーカスが移る。0 件なら［閉じる］", async () => {
    const a = await setup([entry(1), entry(2)]);
    expect(document.activeElement).toBe(rowsOf(a.wrapper)[0]!.get(".nh-go").element);
    a.wrapper.unmount();
    document.body.innerHTML = "";
    localStorage.clear(); // 履歴は localStorage に残る（再読み込みで戻る）ので、別の状態から始め直す
    pinia = createPinia();
    const b = await setup([]);
    expect(document.activeElement).toBe(b.wrapper.get(".nh-close").element);
  });

  it("［閉じる］で閉じ、履歴はそのまま。キー（opener 無し）から開いたなら端末へフォーカスを戻す", async () => {
    const { wrapper, view, store, registry } = await setup([entry(1)]);
    await wrapper.get(".nh-close").trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    expect(view.dialogContext).toBeNull();
    expect(dialogOf(wrapper).open).toBe(false);
    expect(store.historyCount).toBe(1);
    expect(registry.focus).toHaveBeenCalledWith("p-focus");
  });

  it("Esc（cancel）で閉じる", async () => {
    const { wrapper, view } = await setup([entry(1)]);
    dialogOf(wrapper).dispatchEvent(new Event("cancel", { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(view.dialogContext).toBeNull();
  });

  it("背景のクリック（dialog 自身のクリック）で閉じる", async () => {
    const { wrapper, view } = await setup([entry(1)]);
    await wrapper.get("dialog").trigger("click");
    expect(view.dialogContext).toBeNull();
  });

  it("ベルから開いたら、閉じたあとフォーカスをベルへ戻す", async () => {
    const bell = mount(NotificationBell, { global: { plugins: [pinia] }, attachTo: document.body });
    const { wrapper, registry } = await setup([entry(1)], "bell");
    await wrapper.get(".nh-close").trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(bell.get("[data-notification-bell]").element);
    expect(registry.focus).not.toHaveBeenCalled();
  });
});

describe("NotificationHistoryDialog — 行の操作（AC11・AC12・AC-I2・AC-I3）", () => {
  it("行の本体で、先に閉じてからその知らせへ移る", async () => {
    const { wrapper, view, controller } = await setup([entry(1), entry(2)]);
    await rowsOf(wrapper)[0]!.get(".nh-go").trigger("click");
    expect(controller.focusHistoryEntry).toHaveBeenCalledWith("blocked:a2:1");
    expect(view.dialogContext, "移る前に閉じている").toBeNull();
  });

  it("［×］で 1 件消え、次の行へフォーカスが移る。最後の行を消したら前の行へ、0 件なら［閉じる］へ", async () => {
    const { wrapper, controller } = await setup([entry(1), entry(2), entry(3)]);
    // 新しい順は 3→2→1。先頭（3）を消すと、次（2）の本体へ。
    await rowsOf(wrapper)[0]!.get(".nh-del").trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.dismissHistoryEntry).toHaveBeenCalledWith("blocked:a3:1");
    expect(rowsOf(wrapper)).toHaveLength(2);
    expect(document.activeElement).toBe(rowsOf(wrapper)[0]!.get(".nh-go").element);
    // 最後の行（1）を消すと、前の行（2）へ。
    await rowsOf(wrapper)[1]!.get(".nh-del").trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(rowsOf(wrapper)[0]!.get(".nh-go").element);
    // 残りの 1 件を消すと 0 件。［閉じる］へ。
    await rowsOf(wrapper)[0]!.get(".nh-del").trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(wrapper.get(".nh-close").element);
    expect(wrapper.find(".nh-empty").exists()).toBe(true);
  });

  it("［×］はダイアログを開いたままにする（移動はしない）", async () => {
    const { wrapper, view, controller } = await setup([entry(1), entry(2)]);
    await rowsOf(wrapper)[0]!.get(".nh-del").trigger("click");
    expect(view.dialogContext).not.toBeNull();
    expect(controller.focusHistoryEntry).not.toHaveBeenCalled();
  });

  it("↑↓・Home・End で行の本体を移る（端で止まる）", async () => {
    const { wrapper } = await setup([entry(1), entry(2), entry(3)]);
    const go = () => wrapper.findAll(".nh-go").map((b) => b.element);
    expect(document.activeElement).toBe(go()[0]);
    await press(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(go()[1]);
    await press(document.activeElement!, "End");
    expect(document.activeElement).toBe(go()[2]);
    await press(document.activeElement!, "ArrowDown");
    expect(document.activeElement, "端で止まる").toBe(go()[2]);
    await press(document.activeElement!, "ArrowUp");
    expect(document.activeElement).toBe(go()[1]);
    await press(document.activeElement!, "Home");
    expect(document.activeElement).toBe(go()[0]);
    await press(document.activeElement!, "ArrowUp");
    expect(document.activeElement, "端で止まる").toBe(go()[0]);
  });

  it("Delete・Backspace で、フォーカスのある行を 1 件消す（［×］にフォーカスがあるときは何もしない）", async () => {
    const { wrapper, controller } = await setup([entry(1), entry(2)]);
    await press(wrapper.findAll(".nh-go")[0]!.element, "Delete");
    expect(controller.dismissHistoryEntry).toHaveBeenCalledWith("blocked:a2:1");
    await press(wrapper.findAll(".nh-go")[0]!.element, "Backspace");
    expect(controller.dismissHistoryEntry).toHaveBeenCalledWith("blocked:a1:1");
    expect(wrapper.find(".nh-empty").exists()).toBe(true);
  });

  it("［×］のボタンの Delete は消さない", async () => {
    const { wrapper, controller } = await setup([entry(1)]);
    await press(wrapper.get(".nh-del").element, "Delete");
    expect(controller.dismissHistoryEntry).not.toHaveBeenCalled();
  });

  it("［×］のボタンに、どの知らせかが分かる名前が付く", async () => {
    const { wrapper } = await setup([entry(1)]);
    expect(wrapper.get(".nh-del").attributes("aria-label")).toBe("削除: pane1（ws / tab）");
  });
});

describe("NotificationHistoryDialog — すべて削除（AC16・AC-I2）", () => {
  it("1 回目は確認に変わり（まだ消えない）、フォーカスは［やめる］。［削除する］で 0 件になる", async () => {
    const { wrapper, store, controller } = await setup([entry(1), entry(2)]);
    await wrapper.get(".nh-clear").trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.historyCount, "まだ消えない").toBe(2);
    expect(controller.clearHistory).not.toHaveBeenCalled();
    expect(wrapper.get(".nh-confirm-text").text()).toBe("2 件をすべて削除しますか？");
    expect(wrapper.get(".nh-confirm-text").attributes("role")).toBe("alert");
    expect(document.activeElement).toBe(wrapper.get(".nh-cancel").element);
    expect(wrapper.find(".nh-clear").exists()).toBe(false);

    await wrapper.get(".nh-confirm").trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.clearHistory).toHaveBeenCalledOnce();
    expect(store.historyCount).toBe(0);
    expect(wrapper.find(".nh-empty").exists()).toBe(true);
    expect(wrapper.find(".nh-confirm").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get(".nh-close").element);
  });

  it("［やめる］で取り消せる（消えない。［すべて削除］へ戻る）", async () => {
    const { wrapper, store } = await setup([entry(1)]);
    await wrapper.get(".nh-clear").trigger("click");
    await wrapper.get(".nh-cancel").trigger("click");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.historyCount).toBe(1);
    expect(document.activeElement).toBe(wrapper.get(".nh-clear").element);
  });

  it("確認の中の Esc は確認だけを取り消し、ポップアップは閉じない。もう一度 Esc で閉じる", async () => {
    const { wrapper, view, store } = await setup([entry(1)]);
    await wrapper.get(".nh-clear").trigger("click");
    dialogOf(wrapper).dispatchEvent(new Event("cancel", { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(view.dialogContext).not.toBeNull();
    expect(wrapper.find(".nh-confirm").exists()).toBe(false);
    expect(store.historyCount).toBe(1);
    dialogOf(wrapper).dispatchEvent(new Event("cancel", { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(view.dialogContext).toBeNull();
  });

  it("確認の途中で 0 件になったら、確認を閉じる", async () => {
    const { wrapper, store } = await setup([entry(1)]);
    await wrapper.get(".nh-clear").trigger("click");
    store.clearHistory();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".nh-confirm").exists()).toBe(false);
    expect(wrapper.get(".nh-clear").attributes("disabled")).toBeDefined();
  });

  it("開き直したら確認は閉じている", async () => {
    const { wrapper, view } = await setup([entry(1)]);
    await wrapper.get(".nh-clear").trigger("click");
    await wrapper.get(".nh-close").trigger("click");
    view.openDialogWithContext({ kind: "notificationHistory" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".nh-confirm").exists()).toBe(false);
  });
});

describe("NotificationBell — 件数のバッヂと開く（AC9）", () => {
  function mountBell(variant?: "sidebar" | "mobile") {
    return mount(NotificationBell, { props: variant ? { variant } : {}, global: { plugins: [pinia] }, attachTo: document.body });
  }

  it("0 件はバッヂなし。名前は件数なし", () => {
    const w = mountBell();
    expect(w.find(".notify-bell-badge").exists()).toBe(false);
    expect(w.get("button").attributes("aria-label")).toBe("通知の一覧");
  });

  it("件数をバッヂに出し、名前に入れる。バッヂ自体は読み上げない", async () => {
    const store = useNotificationsStore(pinia);
    const w = mountBell();
    store.addHistory(entry(1));
    store.addHistory(entry(2));
    await w.vm.$nextTick();
    expect(w.get(".notify-bell-badge").text()).toBe("2");
    expect(w.get(".notify-bell-badge").attributes("aria-hidden")).toBe("true");
    expect(w.get("button").attributes("aria-label")).toBe("通知の一覧（2 件）");
  });

  it("100 件以上は 99+（履歴は 50 件で止まるので、直接の確認は badgeText の単体。ここは 50 件が「50」と出ること）", async () => {
    const store = useNotificationsStore(pinia);
    const w = mountBell();
    for (let i = 0; i < 60; i++) store.addHistory(entry(i, { key: `blocked:a${i}:1`, paneId: `p${i}`, instanceId: `a${i}` }));
    await w.vm.$nextTick();
    expect(w.get(".notify-bell-badge").text()).toBe("50");
  });

  it("押すと、ベルから開いたことを覚えてポップアップを開く。popup の入口だと分かる属性", async () => {
    const w = mountBell("mobile");
    const view = useViewStore(pinia);
    expect(w.get("button").attributes("aria-haspopup")).toBe("dialog");
    expect(w.get("button").classes()).toContain("notify-bell-mobile");
    await w.get("button").trigger("click");
    expect(view.dialogContext).toEqual({ kind: "notificationHistory", opener: "bell" });
  });
});
