import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { AgentSubagentTranscriptResult } from "@sodashitsu/protocol";
import { ConnectionKey } from "../../injection.js";
import SubagentTranscriptWindow from "./SubagentTranscriptWindow.vue";

// 20261008-graph-first PR6c。記録を読むだけの窓（AC-U4）。

beforeEach(() => vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const flush = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await nextTick();
};
const res = (over: Partial<AgentSubagentTranscriptResult> = {}): AgentSubagentTranscriptResult => ({
  status: "ok",
  entries: [],
  offset: 0,
  reset: false,
  omittedBefore: false,
  running: true,
  ...over,
});

function open(responses: (params: Record<string, unknown>, n: number) => AgentSubagentTranscriptResult | Error) {
  const calls: Record<string, unknown>[] = [];
  const conn = {
    request: vi.fn(async (method: string, params: Record<string, unknown>) => {
      expect(method).toBe("agent.subagent_transcript");
      calls.push(params);
      const r = responses(params, calls.length - 1);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
  const wrapper = mount(SubagentTranscriptWindow, {
    attachTo: document.body,
    props: { paneId: "p1", agentId: "a1", parentName: "impl", title: "Explore 調べる" },
    global: { provide: { [ConnectionKey as symbol]: conn } },
  });
  return { wrapper, calls, conn };
}
const rpcError = (code: string) => Object.assign(new Error(code), { code });

describe("記録を読むだけの窓", () => {
  it("送るのは pane の id・サブエージェントの id・続きの位置だけ。最初は位置なし、次からは前回の offset", async () => {
    const { wrapper, calls } = open((_p, n) => res({ offset: (n + 1) * 100 }));
    await flush();
    expect(calls[0]).toEqual({ paneId: "p1", agentId: "a1" });
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(calls[1]).toEqual({ paneId: "p1", agentId: "a1", offset: 100 });
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls[2]).toEqual({ paneId: "p1", agentId: "a1", offset: 200 });
    for (const c of calls) expect(Object.keys(c).sort().every((k) => ["paneId", "agentId", "offset"].includes(k))).toBe(true);
    wrapper.unmount();
  });

  it("指示・発言・道具・結果を出す。結果は折りたたみ。新しいものは下に足される。入力欄は無く、読むだけと出す", async () => {
    const { wrapper } = open((_p, n) =>
      n === 0
        ? res({ entries: [{ kind: "prompt", text: "調べて" }, { kind: "say", text: "見ます" }, { kind: "tool", name: "Bash", text: "sleep 4" }, { kind: "result", text: "出力\n2 行目" }], offset: 10 })
        : res({ entries: [{ kind: "say", text: "終わり" }], offset: 20 }),
    );
    await flush();
    expect(wrapper.findAll("[data-kind]").map((r) => r.attributes("data-kind"))).toEqual(["prompt", "say", "tool", "result"]);
    const result = wrapper.get('details[data-kind="result"]');
    expect(result.attributes("open")).toBeUndefined();
    expect(result.text()).toContain("出力");
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(wrapper.findAll("[data-kind]").map((r) => r.attributes("data-kind"))).toEqual(["prompt", "say", "tool", "result", "say"]);
    expect(wrapper.find("input, textarea, [contenteditable]").exists()).toBe(false);
    expect(wrapper.text()).toContain("読むだけ。サブエージェントには、入力できません");
    wrapper.unmount();
  });

  it("中身は文字として出す（HTML・スクリプト・リンクを動かさない）", async () => {
    const evil = '<img src=x onerror="window.__pwned=1"><a href="https://example.com">x</a><script>window.__pwned=1</script>';
    const { wrapper } = open(() => res({ entries: [{ kind: "say", text: evil }, { kind: "tool", name: "<b>n</b>", text: evil }, { kind: "result", text: evil }, { kind: "prompt", text: evil }] }));
    await flush();
    const body = wrapper.get(".sat-body");
    expect(body.find("img, a, script, b").exists()).toBe(false);
    expect(body.text()).toContain("<img src=x");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    wrapper.unmount();
  });

  it("実行中 / 終了 の表示。サブエージェントが終わっても読み続ける（窓を閉じるまで）", async () => {
    let running = true;
    const { wrapper, calls } = open(() => res({ running }));
    await flush();
    expect(wrapper.get("[data-subagent-transcript-state]").text()).toBe("実行中");
    running = false;
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(wrapper.get("[data-subagent-transcript-state]").text()).toBe("終了");
    const n = calls.length;
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls.length).toBeGreaterThan(n);
    wrapper.unmount();
  });

  it("記録がまだ無い（pending）・読めない（理由）を出す。表示済みの内容は残す", async () => {
    let mode: "pending" | "ok" | "unreadable" = "pending";
    const { wrapper } = open(() =>
      mode === "pending" ? res({ status: "pending" }) : mode === "ok" ? res({ entries: [{ kind: "say", text: "あ" }] }) : res({ status: "unreadable", reason: "記録が、Claude Code の記録の置き場所の外にあります" }),
    );
    await flush();
    expect(wrapper.get("[data-subagent-transcript-note]").text()).toContain("記録がまだありません");
    mode = "ok";
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(wrapper.find("[data-subagent-transcript-note]").exists()).toBe(false);
    mode = "unreadable";
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(wrapper.get("[data-subagent-transcript-note]").text()).toContain("置き場所の外");
    expect(wrapper.find('[data-kind="say"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("reset（位置が合わなくなった）で今までの表示を捨てて入れ替える", async () => {
    const { wrapper } = open((_p, n) => (n === 0 ? res({ entries: [{ kind: "say", text: "古い" }], offset: 99 }) : res({ reset: true, entries: [{ kind: "say", text: "新しい" }], offset: 5 })));
    await flush();
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(wrapper.findAll('[data-kind="say"]').map((r) => r.text())).toEqual(["発言新しい"]);
    wrapper.unmount();
  });

  it("not_found（居なくなった）で読むのを止め、今までの表示は残して理由を出す", async () => {
    let fail = false;
    const { wrapper, calls } = open(() => (fail ? rpcError("not_found") : res({ entries: [{ kind: "say", text: "残る" }] })));
    await flush();
    fail = true;
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(wrapper.get("[data-subagent-transcript-note]").text()).toContain("もう読めません");
    expect(wrapper.text()).toContain("残る");
    const n = calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.length).toBe(n);
    wrapper.unmount();
  });

  it("ほかの失敗は一言だけ出し（詳細は出さない）、読み続ける", async () => {
    let fail = true;
    const { wrapper } = open(() => (fail ? new Error("secret /home/u/.claude/projects/x") : res({ entries: [{ kind: "say", text: "戻った" }] })));
    await flush();
    expect(wrapper.get("[data-subagent-transcript-note]").text()).toContain("取れませんでした");
    expect(wrapper.text()).not.toContain("/home/u");
    fail = false;
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(wrapper.text()).toContain("戻った");
    wrapper.unmount();
  });

  it("タブが隠れている間・閉じた後は読まない", async () => {
    const { wrapper, calls } = open(() => res());
    await flush();
    const n = calls.length;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await vi.advanceTimersByTimeAsync(4500);
    expect(calls.length).toBe(n);
    vi.restoreAllMocks();
    wrapper.unmount();
    const m = calls.length;
    await vi.advanceTimersByTimeAsync(4500);
    expect(calls.length).toBe(m);
  });

  it("Esc・× で closed を出す。窓の中のキーはグラフ画面（外）へ渡さない（Tab を除く）", async () => {
    const { wrapper } = open(() => res());
    await flush();
    const outer: string[] = [];
    document.body.addEventListener("keydown", (e) => outer.push(e.key));
    wrapper.get("[data-subagent-transcript]").element.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
    wrapper.get("[data-subagent-transcript]").element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    wrapper.get("[data-subagent-transcript]").element.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(outer).toEqual(["Tab"]);
    wrapper.get("[data-subagent-transcript]").element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(wrapper.emitted("close")).toHaveLength(1);
    await wrapper.get(".sat-close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(2);
    wrapper.unmount();
  });
});
