import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useViewStore } from "../store/view.js";
import ReconnectOverlay from "./ReconnectOverlay.vue";

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
});

function makeConnection(): ConnectionPort {
  return { request: vi.fn().mockResolvedValue({}), sendInput: vi.fn(), login: vi.fn(), logout: vi.fn(), connect: vi.fn() };
}

function mountOverlay(conn: ConnectionPort = makeConnection()) {
  return mount(ReconnectOverlay, { global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: conn } } });
}

describe("ReconnectOverlay", () => {
  it("接続中・再接続中のあいだ出し、入力できないことを示す。open で消える（D95）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountOverlay();

    // 初期状態は connecting（初回の接続待ち）。
    expect(wrapper.find(".reconnect-overlay").exists()).toBe(true);
    expect(wrapper.text()).toContain("接続中");
    expect(wrapper.text()).toContain("つながるまで入力できません");

    view.onConnectionState("open");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".reconnect-overlay").exists()).toBe(false);

    view.onConnectionState("reconnecting");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".reconnect-overlay").exists()).toBe(true);
    expect(wrapper.text()).toContain("再接続中");
    expect(wrapper.text()).toContain("つながるまで入力できません");

    view.onConnectionState("open");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".reconnect-overlay").exists()).toBe(false);
  });

  it("detached では出さない（切り離し画面が本体ごと差し替わる）", async () => {
    const view = useViewStore(pinia);
    view.onConnectionState("detached");
    const wrapper = mountOverlay();
    expect(wrapper.find(".reconnect-overlay").exists()).toBe(false);
  });

  /**
   * D107：Cookie は有効だが、このページのアドレスをサーバが許可していない（`/api/session` が 403。サーバの D106）。以前は
   * 401 以外と同じく「再接続中…」のまま理由を示さず繋ぎ直し続けた。
   */
  it("rejected では「再接続中…」ではなく、理由・写せる `--origin <このページの Origin>`・「再試行」を出す。再試行は connect() を呼ぶ", async () => {
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const wrapper = mountOverlay(conn);
    view.onConnectionState("rejected");
    await wrapper.vm.$nextTick();

    const origin = window.location.origin;
    const panel = wrapper.find(".reconnect-overlay-panel");
    expect(panel.exists()).toBe(true);
    expect(panel.attributes("role")).toBe("alert");
    expect(wrapper.text()).not.toContain("再接続中");
    expect(wrapper.find(".reconnect-overlay-text").text()).toContain(`このページのアドレス（${origin}）からの接続を、サーバが許可していません`);
    expect(wrapper.find(".reconnect-overlay-text").text()).toContain("token を作り直す必要はありません"); // 403 は Cookie が有効な証拠
    expect(wrapper.find(".reconnect-overlay-text").text()).toContain("origin rejected");
    expect(wrapper.find(".reconnect-overlay-command").text()).toBe(`--origin ${origin}`);

    const retry = wrapper.find("button.reconnect-overlay-retry");
    expect(retry.text()).toBe("再試行");
    await retry.trigger("click");
    expect(conn.connect).toHaveBeenCalledTimes(1);

    view.onConnectionState("connecting"); // 再試行の確認中は「接続中…」へ戻る
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".reconnect-overlay-panel").exists()).toBe(false);
    expect(wrapper.text()).toContain("接続中");
  });

  it("再接続中に手がかり（/api/session は通るのに WebSocket だけがつながらない。D107）が立ったら、Origin の拒否かもしれないことと `--origin` の行を添える。繋ぎ直しは続けている", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountOverlay();
    view.onConnectionState("reconnecting");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".reconnect-overlay-hint").exists()).toBe(false);

    view.setOriginRejectSuspected(true);
    await wrapper.vm.$nextTick();
    const origin = window.location.origin;
    expect(wrapper.text()).toContain("再接続中");
    const hint = wrapper.find(".reconnect-overlay-hint");
    expect(hint.text()).toContain(`このページのアドレス（${origin}）を拒否しているかもしれません`);
    expect(hint.text()).toContain("繋ぎ直しは続けています");
    expect(hint.find(".reconnect-overlay-command").text()).toBe(`--origin ${origin}`);
    expect(wrapper.find(".reconnect-overlay-retry").exists()).toBe(false); // 自動で繋ぎ直しているのでボタンは出さない

    view.setOriginRejectSuspected(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".reconnect-overlay-hint").exists()).toBe(false);
  });
});
