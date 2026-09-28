import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useGraphStore } from "../../store/graph.js";
import HistoryPanel from "./HistoryPanel.vue";
import { fakeGraphPort, graphOf, triggerLink } from "./graphTestKit.js";

// 20260927-agent-graph の 03-web-graph T4：実行の履歴（AC10）。
beforeEach(() => {
  setActivePinia(createPinia());
});

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await nextTick();
};

describe("HistoryPanel", () => {
  it("開くと graph.history を読み、時刻・線・結果・理由（busy・resolved を含む）・文面を新しい順に出す。graph.fired は先頭へ", async () => {
    const g = useGraphStore();
    const at = new Date(2026, 8, 28, 9, 5, 7).getTime();
    const fake = fakeGraphPort({
      "graph.history": () => ({
        runs: [
          { linkId: "l1", at, result: "skipped", reason: "busy" },
          { linkId: "l2", at, result: "skipped", reason: "resolved" },
          { linkId: "l1", at, result: "sent", text: "続けて\n結果" },
        ],
      }),
    });
    g.bind(fake.port);
    g.applyGraph(graphOf({ links: [triggerLink("l1", "local:p1", "local:p2")] }), "fresh");
    const w = mount(HistoryPanel, { props: { linkId: null }, attachTo: document.body });
    expect(w.text()).toContain("読み込んでいます");
    await flush();
    expect(fake.calls[0]).toEqual({ method: "graph.history", params: {} });
    const rows = w.findAll(".history-row");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.find(".history-row-time").text()).toBe("09:05:07");
    expect(rows[0]!.find(".history-row-link").text()).toBe("pane p1 → pane p2");
    expect(rows[0]!.find(".history-row-result").text()).toBe(
      "見送った（先が作業中（見送る設定））",
    );
    expect(rows[1]!.find(".history-row-link").text()).toBe("削除した線（l2）");
    expect(rows[1]!.find(".history-row-result").text()).toBe(
      "見送った（送る前に承認待ちが解けた）",
    );
    expect(rows[2]!.find(".history-row-text").text()).toBe("続けて\n結果");
    g.applyFired({ linkId: "l1", at: at + 1000, result: "failed", reason: "error", text: "boom" });
    await flush();
    expect(w.findAll(".history-row")[0]!.find(".history-row-result").text()).toBe(
      "失敗（送れなかった）",
    );
    w.unmount();
  });

  it("線を指定すればその線だけ。「すべての線」・Esc・閉じるを知らせる", async () => {
    const g = useGraphStore();
    g.bind(
      fakeGraphPort({
        "graph.history": () => ({
          runs: [
            { linkId: "l1", at: 1, result: "sent" },
            { linkId: "l2", at: 2, result: "sent" },
          ],
        }),
      }).port,
    );
    const w = mount(HistoryPanel, { props: { linkId: "l2" }, attachTo: document.body });
    await flush();
    expect(w.findAll(".history-row")).toHaveLength(1);
    await w.find(".history-panel-all").trigger("click");
    expect(w.emitted("clearFilter")).toHaveLength(1);
    await w.find(".history-panel").trigger("keydown", { key: "Escape" });
    expect(w.emitted("close")).toHaveLength(1);
    w.unmount();
  });

  it("まだ動いていなければそう出す", async () => {
    const g = useGraphStore();
    g.bind(fakeGraphPort({ "graph.history": () => ({ runs: [] }) }).port);
    const w = mount(HistoryPanel, { props: { linkId: null }, attachTo: document.body });
    await flush();
    expect(w.find(".history-panel-empty").text()).toBe("まだ動いていません。");
    w.unmount();
  });
});
