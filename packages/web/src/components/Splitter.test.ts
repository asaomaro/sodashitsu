import type { MethodName, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import type { ConnectionPort } from "../net/ports.js";
import Splitter from "./Splitter.vue";

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

function mountSplitter(conn: ConnectionPort, dir: "right" | "down" = "right") {
  return mount(Splitter, {
    props: { splitId: "s1", tabId: "t1", ratio: 0.5, dir },
    global: { provide: { [ConnectionKey as symbol]: conn } },
    attachTo: document.body,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Splitter", () => {
  it("role=separator・aria-valuenow を持つ（APG の Window Splitter）", () => {
    const conn = makeConnection();
    const wrapper = mountSplitter(conn);
    const el = wrapper.get('[role="separator"]');
    expect(el.attributes("aria-valuenow")).toBe("50");
    expect(el.attributes("aria-orientation")).toBe("vertical");
    wrapper.unmount();
  });

  it("縦方向（down）は aria-orientation が horizontal", () => {
    const conn = makeConnection();
    const wrapper = mountSplitter(conn, "down");
    expect(wrapper.get('[role="separator"]').attributes("aria-orientation")).toBe("horizontal");
    wrapper.unmount();
  });

  it("矢印キーで 2% ずつ動かし、layout.set_split_ratio を 50ms 後に送る", async () => {
    const conn = makeConnection();
    const wrapper = mountSplitter(conn);
    const el = wrapper.get('[role="separator"]');

    await el.trigger("keydown", { key: "ArrowRight" });
    expect(el.attributes("aria-valuenow")).toBe("52");
    expect(conn.requests).toEqual([]); // まだ送っていない（50ms 待つ）

    await vi.advanceTimersByTimeAsync(50);
    expect(conn.requests).toEqual([["layout.set_split_ratio", { tabId: "t1", splitId: "s1", ratio: 0.52 }]]);
    wrapper.unmount();
  });

  it("ArrowLeft で減らす（down 方向では ArrowUp/Down）", async () => {
    const conn = makeConnection();
    const wrapper = mountSplitter(conn);
    const el = wrapper.get('[role="separator"]');
    await el.trigger("keydown", { key: "ArrowLeft" });
    expect(el.attributes("aria-valuenow")).toBe("48");
    await vi.advanceTimersByTimeAsync(50);
    expect(conn.requests).toEqual([["layout.set_split_ratio", { tabId: "t1", splitId: "s1", ratio: 0.48 }]]);
    wrapper.unmount();
  });

  it("0.05〜0.95 に丸める", async () => {
    const conn = makeConnection();
    const wrapper = mount(Splitter, {
      props: { splitId: "s1", tabId: "t1", ratio: 0.06, dir: "right" },
      global: { provide: { [ConnectionKey as symbol]: conn } },
    });
    const el = wrapper.get('[role="separator"]');
    await el.trigger("keydown", { key: "ArrowLeft" });
    expect(el.attributes("aria-valuenow")).toBe("5"); // 0.06 - 0.02 = 0.04 → 0.05 に丸め
    wrapper.unmount();
  });

  it("連続した変更を 50ms 間隔にまとめる（複数キー押下でも 1 回だけ送る）", async () => {
    const conn = makeConnection();
    const wrapper = mountSplitter(conn);
    const el = wrapper.get('[role="separator"]');
    await el.trigger("keydown", { key: "ArrowRight" });
    await el.trigger("keydown", { key: "ArrowRight" });
    await el.trigger("keydown", { key: "ArrowRight" });
    await vi.advanceTimersByTimeAsync(50);
    expect(conn.requests).toHaveLength(1);
    expect(conn.requests[0]).toEqual(["layout.set_split_ratio", { tabId: "t1", splitId: "s1", ratio: 0.56 }]);
    wrapper.unmount();
  });

  it("ドラッグ（Pointer Events）で比率を動かす", async () => {
    const conn = makeConnection();
    const wrapper = mountSplitter(conn);
    const el = wrapper.get('[role="separator"]');
    const parent = el.element.parentElement!;
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({ width: 1000, height: 500, x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 500, toJSON: () => ({}) } as DOMRect);

    await el.trigger("pointerdown", { clientX: 500, clientY: 0 });
    await el.trigger("pointermove", { clientX: 600, clientY: 0 }); // +100px / 1000px = +0.1
    expect(el.attributes("aria-valuenow")).toBe("60");
    await el.trigger("pointerup");

    await vi.advanceTimersByTimeAsync(50);
    expect(conn.requests).toEqual([["layout.set_split_ratio", { tabId: "t1", splitId: "s1", ratio: 0.6 }]]);
    wrapper.unmount();
  });

  it("props.ratio の外部変化（サーバからの layout.updated）を反映する（ドラッグ中でなければ）", async () => {
    const conn = makeConnection();
    const wrapper = mountSplitter(conn);
    await wrapper.setProps({ ratio: 0.7 });
    expect(wrapper.get('[role="separator"]').attributes("aria-valuenow")).toBe("70");
    wrapper.unmount();
  });
});
