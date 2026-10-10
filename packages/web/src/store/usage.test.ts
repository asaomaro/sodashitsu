import type { AgentUsage } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useUsageStore } from "./usage.js";

beforeEach(() => setActivePinia(createPinia()));

const u = (paneId: string, output: number, updatedAt = 1000): AgentUsage => ({
  paneId,
  kind: "claude",
  model: null,
  tokens: { basis: "transcript", output },
  source: "transcript",
  updatedAt,
});

describe("useUsageStore（20261010-agent-usage PR3）", () => {
  it("最初の応答で全部を置き換える。null（取れない pane）は入れない", () => {
    const s = useUsageStore();
    expect(s.loaded).toBe(false);
    s.setSnapshot({ panes: { a: u("a", 1), b: null }, accounts: [] });
    expect(Object.keys(s.panes)).toEqual(["a"]);
    expect(s.loaded).toBe(true);
    s.setSnapshot({ panes: { c: u("c", 3) }, accounts: [] });
    expect(Object.keys(s.panes)).toEqual(["c"]);
  });
  it("差分: 変わった pane だけを足す。null は消す。アカウントは来たときだけ置き換える", () => {
    const s = useUsageStore();
    s.setSnapshot({ panes: { a: u("a", 1), b: u("b", 2) }, accounts: [{ kind: "claude", accountKey: "k", label: "Claude Code", windows: [], source: "statusline", asOf: 1 }] });
    s.applyChanged({ panes: { a: u("a", 5, 2000), b: null } });
    expect(s.panes["a"]!.tokens.output).toBe(5);
    expect(s.panes["b"]).toBeUndefined();
    expect(s.accounts).toHaveLength(1); // accounts が無い差分では、そのまま
    s.applyChanged({ panes: {}, accounts: [] });
    expect(s.accounts).toEqual([]);
  });
  it("古い値（updatedAt が前）で、新しい値を戻さない", () => {
    const s = useUsageStore();
    s.setSnapshot({ panes: { a: u("a", 9, 5000) }, accounts: [] });
    s.applyChanged({ panes: { a: u("a", 1, 4000) } });
    expect(s.panes["a"]!.tokens.output).toBe(9);
  });
  it("対応しない・取れなかった・マシンの切り替え（clear）", () => {
    const s = useUsageStore();
    s.markUnsupported();
    expect(s.unsupported).toBe(true);
    s.markFailed();
    expect(s.failed).toBe(true);
    s.setSnapshot({ panes: { a: u("a", 1) }, accounts: [] });
    expect(s.unsupported).toBe(false);
    expect(s.failed).toBe(false);
    s.clear();
    expect(s.panes).toEqual({});
    expect(s.loaded).toBe(false);
  });
});
