import { mount } from "@vue/test-utils";
import type { Graph, GraphLink } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import LinkPanel from "./LinkPanel.vue";
import { graphOf, triggerLink } from "./graphTestKit.js";

// 20260927-agent-graph の 03-web-graph T3：線の設定のパネル（保存・Ctrl+Enter・取り消しの確認・削除・delegate の注意・他での変更）。
function mountPanel(o: { graph?: Graph; link?: GraphLink | null; gone?: boolean } = {}) {
  const graph = o.graph ?? graphOf();
  const link = o.link === undefined ? null : o.link;
  return mount(LinkPanel, {
    attachTo: document.body,
    props: {
      graph,
      link,
      newEnds: link ? null : { from: "local:p1", to: "local:p2" },
      gone: o.gone ?? false,
      nameOf: (k: string) => (k === "local:p1" ? "impl" : "reviewer"),
      invalid: false,
      saving: false,
      error: null,
    },
  });
}
const key = (k: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });

describe("LinkPanel", () => {
  it("新しい線は既定でトリガ（完了・受け渡し 80 行・待つ・上限 10）。Ctrl+Enter で保存を送る", async () => {
    const w = mountPanel();
    await nextTick();
    expect(w.find(".link-panel-heading").text()).toBe("新しい線: impl → reviewer（トリガ）");
    expect(w.attributes("role")).toBe("dialog");
    w.find(".link-panel-prompt").element.dispatchEvent(key("Enter", { ctrlKey: true }));
    expect(w.emitted("save")![0]![0]).toEqual({
      kind: "trigger",
      from: "local:p1",
      to: "local:p2",
      limit: 10,
      trigger: {
        on: "done",
        prompt: "次の結果を確認して、続きの作業をしてください。\n\n{output}",
        output: { lines: 80 },
        whenBusy: "wait",
      },
    });
    w.unmount();
  });

  it("prompt の欄の Enter は改行（保存しない）。単一行の欄の Enter は保存。IME の変換中は無視", async () => {
    const w = mountPanel();
    w.find(".link-panel-prompt").element.dispatchEvent(key("Enter"));
    expect(w.emitted("save")).toBeUndefined();
    w.find(".link-panel-limit").element.dispatchEvent(key("Enter", { isComposing: true }));
    expect(w.emitted("save")).toBeUndefined();
    w.find(".link-panel-limit").element.dispatchEvent(key("Enter"));
    expect(w.emitted("save")).toHaveLength(1);
    w.unmount();
  });

  it("保存の前に検証する（空の文面・同じ向きの線）。問題があれば送らずに出す", async () => {
    const w = mountPanel({
      graph: graphOf({ links: [triggerLink("l1", "local:p1", "local:p2")] }),
    });
    await w.find(".link-panel-save").trigger("click");
    expect(w.emitted("save")).toBeUndefined();
    expect(w.find(".link-panel-issues").text()).toContain("同じ向きのトリガの線が既にあります");
    w.unmount();
    const w2 = mountPanel();
    await w2.find(".link-panel-prompt").setValue("{output}");
    await w2.find(".link-panel-pass").setValue(false);
    await w2.find(".link-panel-save").trigger("click");
    expect(w2.emitted("save")).toBeUndefined();
    expect(w2.find(".link-panel-issues").text()).toContain("送る文面が空です");
    w2.unmount();
  });

  it("種類を監督・承認の代理にすると、それぞれの設定だけを送る。delegate には注意を出す（D2）", async () => {
    const w = mountPanel();
    await w.find('input[value="approval"]').setValue(true);
    expect(w.find(".link-panel-warn").exists()).toBe(false);
    await w.find(".link-panel-mode").setValue("delegate");
    expect(w.find(".link-panel-warn").text()).toContain("承認に答えます");
    await w.find(".link-panel-save").trigger("click");
    expect(w.emitted("save")![0]![0]).toEqual({
      kind: "approval",
      from: "local:p1",
      to: "local:p2",
      limit: 10,
      approval: { mode: "delegate", lines: 40 },
    });
    await w.find('input[value="supervise"]').setValue(true);
    await w.find(".link-panel-swap").trigger("click");
    expect(w.find(".link-panel-ends").text()).toContain("配下: reviewer");
    await w.find(".link-panel-save").trigger("click");
    expect(w.emitted("save")![1]![0]).toEqual({
      kind: "supervise",
      from: "local:p2",
      to: "local:p1",
      limit: 10,
    });
    w.unmount();
  });

  it("Esc: 変更が無ければそのまま取り消し。変更があれば「変更を捨てますか」（編集に戻る／捨てる）", async () => {
    const w = mountPanel();
    w.find(".link-panel-prompt").element.dispatchEvent(key("Escape"));
    expect(w.emitted("cancel")).toHaveLength(1);
    w.unmount();
    const w2 = mountPanel();
    await w2.find(".link-panel-limit").setValue(3);
    const esc = key("Escape");
    w2.find(".link-panel-limit").element.dispatchEvent(esc);
    await nextTick();
    expect(esc.defaultPrevented).toBe(true);
    expect(w2.emitted("cancel")).toBeUndefined();
    expect(w2.find(".graph-confirm").exists()).toBe(true);
    await nextTick();
    expect(document.activeElement?.className).toBe("graph-confirm-cancel");
    await w2.find(".graph-confirm-cancel").trigger("click");
    expect(w2.find(".graph-confirm").exists()).toBe(false);
    expect(w2.emitted("cancel")).toBeUndefined();
    (w2.vm as unknown as { requestClose(): void }).requestClose(); // 外側のクリック
    await nextTick();
    await w2.find(".graph-confirm-ok").trigger("click");
    expect(w2.emitted("cancel")).toHaveLength(1);
    w2.unmount();
  });

  it("既存の線: 種類は変えられず、状態・一時停止/再開・削除・履歴を出す。上限だけ変えて保存", async () => {
    const link = triggerLink("l1", "local:p1", "local:p2", { count: 3, paused: "limit" });
    const w = mountPanel({ graph: graphOf({ links: [link] }), link });
    expect(w.find('input[value="approval"]').exists()).toBe(false);
    expect(w.find(".link-panel-status").text()).toContain("実行 3/10・上限に達して一時停止中");
    await w.find(".link-panel-resume").trigger("click");
    expect(w.emitted("pause")![0]).toEqual([false]);
    await w.find(".link-panel-delete").trigger("click");
    expect(w.emitted("delete")).toHaveLength(1);
    await w.find(".link-panel-limit").setValue(20);
    await w.find(".link-panel-save").trigger("click");
    expect(w.emitted("save")![0]![0]).toMatchObject({ id: "l1", limit: 20, kind: "trigger" });
    w.unmount();
  });

  it("他の画面・sodactl が同じ線の設定を変えたら知らせ、最新を読み込める。回数だけの変化では知らせない。消えたら保存できない", async () => {
    const link = triggerLink("l1", "local:p1", "local:p2");
    const w = mountPanel({ graph: graphOf({ links: [link] }), link });
    await w.setProps({ link: { ...link, count: 4 } });
    expect(w.find(".link-panel-note").exists()).toBe(false);
    await w.setProps({ link: { ...link, limit: 30 } });
    expect(w.find(".link-panel-note").text()).toContain("ほかの画面・sodactl で変わりました");
    await w.find(".link-panel-reload").trigger("click");
    expect(w.find(".link-panel-note").exists()).toBe(false);
    expect((w.find(".link-panel-limit").element as HTMLInputElement).value).toBe("30");
    await w.setProps({ link: null, gone: true });
    expect(w.find(".link-panel-note").text()).toContain("削除されました");
    expect(w.find(".link-panel-save").attributes("disabled")).toBeDefined();
    w.unmount();
  });
});

describe("LinkPanel（範囲外の値。g03 点検 T3 nit）", () => {
  it("範囲外・空の上限や行数は黙って丸めず、検証のエラーとして見せて送らない", async () => {
    const w = mountPanel();
    await w.find(".link-panel-limit").setValue(500);
    await w.find(".link-panel-save").trigger("click");
    expect(w.emitted("save")).toBeUndefined();
    expect(w.find(".link-panel-issues").text()).toContain("上限は 1〜100 の整数");
    await w.find(".link-panel-limit").setValue("");
    await w.find(".link-panel-save").trigger("click");
    expect(w.emitted("save")).toBeUndefined();
    await w.find(".link-panel-limit").setValue(7);
    await w.find(".link-panel-lines").setValue(0);
    await w.find(".link-panel-save").trigger("click");
    expect(w.emitted("save")).toBeUndefined();
    expect(w.find(".link-panel-issues").text()).toContain("受け渡す行数は 1〜500 の整数");
    await w.find(".link-panel-lines").setValue(501);
    await w.find(".link-panel-pass").setValue(false); // 受け渡さないなら行数は見ない
    await w.find(".link-panel-save").trigger("click");
    expect(w.emitted("save")![0]![0]).toMatchObject({ limit: 7, trigger: { output: null } });
    w.unmount();
    const w2 = mountPanel();
    await w2.find('input[value="approval"]').setValue(true);
    await w2.find(".link-panel-approval-lines").setValue(2.5);
    await w2.find(".link-panel-save").trigger("click");
    expect(w2.emitted("save")).toBeUndefined();
    expect(w2.find(".link-panel-issues").text()).toContain("渡す行数は 1〜500 の整数");
    w2.unmount();
  });
});
