import { mount } from "@vue/test-utils";
import type { ServerSessionEntry } from "@wtm/protocol";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionDispatcherKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import SessionSwitchDialog from "./SessionSwitchDialog.vue";

/** 20260926-named-session-ui（AC7・AC-I1〜AC-I5）。 */
let pinia: Pinia;
const opener = { el: null as HTMLButtonElement | null };
beforeEach(() => {
  pinia = createPinia();
  opener.el = document.createElement("button");
  opener.el.textContent = "session: default";
  document.body.appendChild(opener.el);
  opener.el.focus();
});
afterEach(() => {
  opener.el?.remove();
  document.body.innerHTML = "";
});

// happy-dom の location.hostname は localhost（ループバック）。
const SESSIONS: ServerSessionEntry[] = [
  { name: "default", default: true, running: true, current: true },
  { name: "lan", default: false, running: false, current: false },
  { name: "old", default: false, running: true, current: false },
  {
    name: "work",
    default: false,
    running: true,
    current: false,
    endpoint: { port: 7781, https: false, host: "0.0.0.0" },
  },
];
const WORK_URL = "http://127.0.0.1:7781/";

function makeActions() {
  const view = useViewStore(pinia);
  return { openServerSession: vi.fn(() => view.closeDialog()) };
}

function mountDialog(actions: ReturnType<typeof makeActions>) {
  return mount(SessionSwitchDialog, {
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions } },
    attachTo: document.body,
  });
}

async function open(
  wrapper: ReturnType<typeof mountDialog>,
  sessions: ServerSessionEntry[] = SESSIONS,
): Promise<void> {
  useViewStore(pinia).openDialogWithContext({ kind: "sessionSwitch", sessions });
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
}

const dialogOf = (w: ReturnType<typeof mountDialog>) =>
  w.get("dialog").element as HTMLDialogElement;

describe("SessionSwitchDialog", () => {
  it("各 session の名前と理由を並べ、開けない項目は aria-disabled（AC7）", async () => {
    const wrapper = mountDialog(makeActions());
    await open(wrapper);
    expect(dialogOf(wrapper).open).toBe(true);
    const items = wrapper.findAll(".session-switch-dialog-item");
    expect(items.map((li) => li.get(".session-switch-dialog-name").text())).toEqual([
      "default",
      "lan",
      "old",
      "work",
    ]);
    const status = items.map((li) => li.get(".session-switch-dialog-status").text());
    expect(status[0]).toBe("いま開いている session");
    expect(status[1]).toBe("止まっています（起動: wtm serve --session lan）");
    expect(status[2]).toContain("開く先が分かりません");
    expect(status[3]).toBe("ポート 7781 を新しいタブで開く");
    expect(items.map((li) => li.attributes("aria-disabled"))).toEqual([
      "true",
      "true",
      "true",
      undefined,
    ]);
  });

  it("開くと最初の開ける項目が選ばれて一覧にフォーカス。Enter でその URL を開く（AC-I2・AC-I4）", async () => {
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper);
    const items = wrapper.findAll(".session-switch-dialog-item");
    expect(items[3]!.attributes("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(wrapper.get('[role="listbox"]').element);
    await wrapper.get('[role="listbox"]').trigger("keydown", { key: "Enter" });
    expect(actions.openServerSession).toHaveBeenCalledWith(WORK_URL);
  });

  it("↑↓・j/k で選択が移り（末尾で巡回）、開けない項目の Enter・クリックは何もしない（AC-I2・AC-I3）", async () => {
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper);
    const list = wrapper.get('[role="listbox"]');
    const selectedName = () =>
      wrapper.get(".session-switch-dialog-item-selected .session-switch-dialog-name").text();
    await list.trigger("keydown", { key: "ArrowDown" }); // work → default（巡回）
    expect(selectedName()).toBe("default");
    await list.trigger("keydown", { key: "j" });
    expect(selectedName()).toBe("lan");
    await list.trigger("keydown", { key: "Enter" });
    expect(actions.openServerSession).not.toHaveBeenCalled();
    await wrapper.findAll(".session-switch-dialog-item")[0]!.trigger("click");
    expect(actions.openServerSession).not.toHaveBeenCalled();
    expect(useViewStore(pinia).openDialog).toBe("sessionSwitch");
    // クリックした default が選ばれている。k で上へ（先頭から末尾へ巡回）、ArrowUp でさらに上へ
    expect(selectedName()).toBe("default");
    await list.trigger("keydown", { key: "k" });
    expect(selectedName()).toBe("work");
    await list.trigger("keydown", { key: "ArrowUp" });
    expect(selectedName()).toBe("old");
    await wrapper.findAll(".session-switch-dialog-item")[3]!.trigger("click");
    expect(actions.openServerSession).toHaveBeenCalledWith(WORK_URL);
  });

  it("一覧の aria-activedescendant は選択中の項目の id を指す（スクリーンリーダーへ選択を伝える）", async () => {
    const wrapper = mountDialog(makeActions());
    await open(wrapper);
    const list = wrapper.get('[role="listbox"]');
    const check = () => {
      const id = list.attributes("aria-activedescendant");
      expect(id).toBeTruthy();
      expect(document.getElementById(id!)).toBe(
        wrapper.get(".session-switch-dialog-item-selected").element,
      );
    };
    check();
    await list.trigger("keydown", { key: "ArrowDown" });
    check();
    await list.trigger("keydown", { key: "ArrowDown" });
    check();
  });

  it("開いている間に一覧が届き直しても、戻り先（開いたボタン）は上書きしない", async () => {
    const wrapper = mountDialog(makeActions());
    await open(wrapper);
    await open(wrapper); // 応答の二重到着（フォーカスはダイアログの中にある）
    await wrapper.get('[role="listbox"]').trigger("keydown", { key: "Escape" });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(opener.el);
  });

  it("扱うキーは既定の動作を止める（端末・既存のキー操作へ漏らさない。AC-I5）", async () => {
    const wrapper = mountDialog(makeActions());
    await open(wrapper);
    for (const key of ["ArrowDown", "ArrowUp", "j", "k", "Enter", "Escape"]) {
      const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      wrapper.get('[role="listbox"]').element.dispatchEvent(ev);
      expect(ev.defaultPrevented, key).toBe(true);
    }
  });

  it("Esc・閉じるボタン・背景のクリックで閉じ、何も開かず、開いたボタンへフォーカスを戻す（AC-I1・AC-I2・AC-I4）", async () => {
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    const view = useViewStore(pinia);

    await open(wrapper);
    await wrapper.get('[role="listbox"]').trigger("keydown", { key: "Escape" });
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).toBeNull();
    expect(dialogOf(wrapper).open).toBe(false);
    expect(document.activeElement).toBe(opener.el);

    await open(wrapper);
    await wrapper.get(".session-switch-dialog-close").trigger("click");
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).toBeNull();
    expect(document.activeElement).toBe(opener.el);

    await open(wrapper);
    await wrapper.get("dialog").trigger("click"); // 背景（dialog 自身）
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).toBeNull();
    expect(actions.openServerSession).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener.el);
  });

  it("開いた後も閉じ、開いたボタンへフォーカスを戻す（AC-I1）", async () => {
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper);
    await wrapper.get('[role="listbox"]').trigger("keydown", { key: "Enter" });
    await wrapper.vm.$nextTick();
    expect(dialogOf(wrapper).open).toBe(false);
    expect(document.activeElement).toBe(opener.el);
  });

  it("開ける項目が無ければ閉じるボタンにフォーカスし、その上の Enter は一覧の確定に使わない（AC-I4）", async () => {
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, SESSIONS.slice(0, 3));
    const close = wrapper.get(".session-switch-dialog-close");
    expect(document.activeElement).toBe(close.element);
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    close.element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false); // ネイティブのボタンのクリックに任せる
    expect(actions.openServerSession).not.toHaveBeenCalled();
  });

  it("対象外の dialogContext では閉じたまま", async () => {
    const wrapper = mountDialog(makeActions());
    useViewStore(pinia).openDialogWithContext({ kind: "goto" });
    await wrapper.vm.$nextTick();
    expect(dialogOf(wrapper).open).toBe(false);
  });
});
