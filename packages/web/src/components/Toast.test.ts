import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import Toast from "./Toast.vue";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

/** フェイクタイマーの下でマイクロタスクだけを進める（D58：`vi.waitFor` は使わない）。 */
async function flush() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("Toast — 一覧表示・クリックで消す", () => {
  it("view.toasts を並べ、クリックで dismissToast を呼ぶ", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    const id = view.toast("test message");
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("test message");
    await wrapper.get(".toast").trigger("click");
    expect(view.toasts.find((t) => t.id === id)).toBeUndefined();
  });
});

describe("Toast — 自動で消える", () => {
  it("一定時間で自動的に消える", async () => {
    vi.useFakeTimers();
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    const id = view.toast("auto dismiss me");
    await wrapper.vm.$nextTick();
    expect(view.toasts.some((t) => t.id === id)).toBe(true);
    await vi.advanceTimersByTimeAsync(4000);
    await flush();
    expect(view.toasts.some((t) => t.id === id)).toBe(false);
  });
});

describe("Toast — 初回 pane フォーカスの案内", () => {
  it("最初に pane へフォーカスが入ったら一度だけ案内を出す", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    expect(view.toasts).toHaveLength(0);
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(view.toasts.map((t) => t.message)).toContain("ctrl+b ? でキー一覧");

    const countAfterFirst = view.toasts.length;
    view.focusPane("p2");
    await wrapper.vm.$nextTick();
    expect(view.toasts).toHaveLength(countAfterFirst); // 増えない（一度だけ）
  });

  it("キー一覧の割り当てを変えていれば、その割り当てで案内する（prefix・直接のキー。AC11）", async () => {
    const settings = useSettingsStore(pinia);
    settings.setKeyPrefix("alt+x");
    settings.setKeyBindings("help", ["prefix+h"]);
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(view.toasts.map((t) => t.message)).toEqual(["alt+x h でキー一覧"]);
  });

  it("直接のキーが先頭なら、prefix を付けずに案内する", async () => {
    const settings = useSettingsStore(pinia);
    settings.setKeyBindings("help", ["ctrl+alt+/", "prefix+?"]);
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(view.toasts.map((t) => t.message)).toEqual(["ctrl+alt+/ でキー一覧"]);
  });

  it("キー一覧の割り当てが無ければ案内を出さず、表示済みにもしない（割り当てたあと、次に別の pane へフォーカスが移ったときに出る）", async () => {
    const settings = useSettingsStore(pinia);
    settings.setKeyBindings("help", []);
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(view.toasts).toHaveLength(0);
    expect(localStorage.getItem("soda.hint.prefixHelp.v1")).toBeNull();
    settings.setKeyBindings("help", ["prefix+?"]);
    view.focusPane("p2");
    await wrapper.vm.$nextTick();
    expect(view.toasts.map((t) => t.message)).toEqual(["ctrl+b ? でキー一覧"]);
  });

  it("localStorage に既に表示済みが記録されていれば出さない", async () => {
    localStorage.setItem("soda.hint.prefixHelp.v1", "1");
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(view.toasts).toHaveLength(0);
  });
});

// 20260920-agent-notifications：席を外している間に出た知らせが 4 秒で消えては意味が無い。
describe("Toast — sticky（消えない知らせ）", () => {
  it("sticky は時間が経っても消えない（普通のトーストは消える）", async () => {
    vi.useFakeTimers();
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    const normal = view.toast("ふつう");
    const sticky = view.toast("知らせ", { kind: "sticky" });
    await wrapper.vm.$nextTick();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(view.toasts.find((t) => t.id === normal), "ふつうのトーストは消えた").toBeUndefined();
    expect(view.toasts.find((t) => t.id === sticky), "sticky は残っている").toBeDefined();
  });

  it("sticky には閉じるボタンが付き、キーボードから押せる（Tab の順に入る）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    const id = view.toast("知らせ", { kind: "sticky" });
    await wrapper.vm.$nextTick();

    const close = wrapper.get(".toast-close");
    expect(close.element.tagName).toBe("BUTTON"); // `<div>` だと Tab で辿れない
    expect(close.attributes("aria-label")).toBe("閉じる");
    await close.trigger("click");
    expect(view.toasts.find((t) => t.id === id)).toBeUndefined();
  });

  it("ふつうのトーストには閉じるボタンを付けない（4 秒で消えるので要らない）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.toast("ふつう");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".toast-close").exists()).toBe(false);
  });

  it("行動ボタンを押しても、トースト本体の「消す」が走らない（@click.stop）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    const run = vi.fn();
    const id = view.toast("許可しますか", { kind: "sticky", actions: [{ label: "許可する", run }] });
    await wrapper.vm.$nextTick();

    await wrapper.get(".toast-action").trigger("click");
    expect(run).toHaveBeenCalledOnce();
    expect(view.toasts.find((t) => t.id === id), "ボタンを押しただけでは消えない").toBeDefined();
  });

  it("行動ボタンは並べた順に出る", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.toast("許可しますか", { kind: "sticky", actions: [{ label: "許可する", run: vi.fn() }, { label: "あとで", run: vi.fn() }] });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".toast-action").map((b) => b.text())).toEqual(["許可する", "あとで"]);
  });

  it("wrap を付けたトーストだけ畳まない（案内の例外）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.toast("知らせ", { kind: "sticky" });
    view.toast("案内", { kind: "sticky", wrap: true });
    await wrapper.vm.$nextTick();
    const toasts = wrapper.findAll(".toast");
    expect(toasts[0]!.classes()).not.toContain("toast-wrap");
    expect(toasts[1]!.classes()).toContain("toast-wrap");
  });
});

// 20261005-notify-bell（AC2・AC4）。置き場所（右上・重ならない）は CSS なので実ブラウザの E2E（`notification-history.spec.ts`）で測る。
describe("Toast — 積み方と読み上げ", () => {
  it("状況メッセージの領域（role=status・aria-live=polite）で、消えない知らせの閉じるボタンに名前が付く", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.toast("実装が入力待ちです", { kind: "sticky", actions: [{ label: "移動", run: () => undefined }] });
    await wrapper.vm.$nextTick();
    const list = wrapper.get(".toast-list");
    expect(list.attributes("role")).toBe("status");
    expect(list.attributes("aria-live")).toBe("polite");
    expect(wrapper.get(".toast-close").attributes("aria-label")).toBe("閉じる");
  });

  it("古いものが上・新しいものが下（表示順は view.toasts の順のまま）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.toast("1つ目", { kind: "sticky" });
    view.toast("短い");
    view.toast("3つ目", { kind: "sticky" });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".toast-message").map((m) => m.text())).toEqual(["1つ目", "短い", "3つ目"]);
  });

  it("消えない知らせは見分けられる（クラス）・全文が title に入る。短い知らせには付かない", async () => {
    const view = useViewStore(pinia);
    const wrapper = mount(Toast, { global: { plugins: [pinia] } });
    view.toast("とても長い呼び名の pane が入力待ちです", { kind: "sticky" });
    view.toast("短い");
    await wrapper.vm.$nextTick();
    const [sticky, plain] = wrapper.findAll(".toast");
    expect(sticky!.classes()).toContain("toast-sticky");
    expect(sticky!.get(".toast-message").attributes("title")).toBe("とても長い呼び名の pane が入力待ちです");
    expect(plain!.classes()).not.toContain("toast-sticky");
    expect(plain!.get(".toast-message").attributes("title")).toBeUndefined();
  });

});
