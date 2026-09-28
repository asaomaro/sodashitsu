import { describe, expect, it } from "vitest";
import type { AgentInfo, AgentState } from "@sodashitsu/protocol";
import { SUPERVISOR_DEBOUNCE_MS } from "@sodashitsu/client-core";
import { SupervisorNotifier, subordinatesSignature } from "./SupervisorNotifier.js";

// 20260927-agent-graph の 02 T2：監督役への知らせの決定（変化の列 → 決定）。
const D = SUPERVISOR_DEBOUNCE_MS;
function agent(instanceId: string, state: AgentState = "idle"): AgentInfo {
  return {
    instanceId,
    kind: "claude",
    label: "Claude",
    state,
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
  };
}
function make(
  supervisor: AgentInfo | null = agent("s1"),
  opts: { paused?: boolean; at?: number; signature?: string } = {},
) {
  return new SupervisorNotifier({
    signature: opts.signature ?? "local:p1",
    supervisor,
    paused: opts.paused ?? false,
    at: opts.at ?? 0,
  });
}

describe("SupervisorNotifier", () => {
  it("できた時点で印が付き、2 秒たって手が空いていれば 1 回送る（1ms 前は送らない）", () => {
    const n = make();
    expect(n.pending).toBe(true);
    expect(n.handle({ kind: "tick", at: D - 1 })).toBeNull();
    expect(n.handle({ kind: "tick", at: D })).toEqual({ kind: "send" });
    expect(n.pending).toBe(false);
    expect(n.handle({ kind: "tick", at: D * 5 })).toBeNull();
  });

  it("配下が変わるたびに印を付け直し、続く変化は最後から 2 秒で 1 回にまとめる", () => {
    const n = make();
    n.handle({ kind: "tick", at: D }); // 最初の知らせ
    expect(
      n.handle({ kind: "subordinates", signature: "local:p1,local:p2", at: 10_000 }),
    ).toBeNull();
    expect(
      n.handle({ kind: "subordinates", signature: "local:p1,local:p2,local:p3", at: 11_000 }),
    ).toBeNull();
    expect(n.handle({ kind: "tick", at: 10_000 + D })).toBeNull(); // 最初の変化からは 2 秒でも、最後からはまだ
    expect(n.handle({ kind: "tick", at: 11_000 + D })).toEqual({ kind: "send" });
    expect(n.handle({ kind: "tick", at: 11_000 + D * 2 })).toBeNull();
  });

  it("同じ顔ぶれ（署名が同じ）の知らせでは印を付けない", () => {
    const n = make();
    n.handle({ kind: "tick", at: D });
    expect(n.handle({ kind: "subordinates", signature: "local:p1", at: 5000 })).toBeNull();
    expect(n.pending).toBe(false);
  });

  it("変わった後の顔ぶれを覚える（同じ新しい顔ぶれの知らせがもう一度来ても、送った後は印を付けない）", () => {
    const n = make();
    n.handle({ kind: "tick", at: D });
    n.handle({ kind: "subordinates", signature: "local:p1,local:p2", at: 5000 });
    expect(n.handle({ kind: "tick", at: 5000 + D })).toEqual({ kind: "send" });
    expect(n.handle({ kind: "subordinates", signature: "local:p1,local:p2", at: 9000 })).toBeNull();
    expect(n.pending).toBe(false);
  });

  it("監督役が作業中・承認待ち・起動直後・居ない間は待ち、手が空いたら送る", () => {
    for (const state of ["working", "blocked", "unknown"] as const) {
      const n = make(agent("s1", state));
      expect(n.handle({ kind: "tick", at: D * 10 })).toBeNull();
      expect(n.pending).toBe(true);
      expect(n.handle({ kind: "supervisor", agent: agent("s1", "idle"), at: D * 11 })).toEqual({
        kind: "send",
      });
    }
    const none = make(null);
    expect(none.handle({ kind: "tick", at: D * 10 })).toBeNull();
    // 居なかった監督役が現れた（新しいエージェント）→ そこから 2 秒待つ
    expect(none.handle({ kind: "supervisor", agent: agent("s1"), at: D * 11 })).toBeNull();
    expect(none.handle({ kind: "tick", at: D * 12 })).toEqual({ kind: "send" });
  });

  it("監督役のエージェントが入れ替わったら知らせ直す（同じエージェントの状態の変化では知らせ直さない）", () => {
    const n = make();
    n.handle({ kind: "tick", at: D });
    expect(n.handle({ kind: "supervisor", agent: agent("s1", "working"), at: 5000 })).toBeNull();
    expect(n.handle({ kind: "supervisor", agent: agent("s1", "idle"), at: 6000 })).toBeNull();
    expect(n.pending).toBe(false);
    expect(n.handle({ kind: "supervisor", agent: agent("s2", "idle"), at: 7000 })).toBeNull();
    expect(n.pending).toBe(true);
    expect(n.handle({ kind: "tick", at: 7000 + D })).toEqual({ kind: "send" });
  });

  it("監督役が居なくなっても印は変えない（戻ってきたら新しいエージェントとして知らせ直す）", () => {
    const n = make();
    n.handle({ kind: "tick", at: D });
    expect(n.handle({ kind: "supervisor", agent: null, at: 5000 })).toBeNull();
    expect(n.pending).toBe(false);
    n.handle({ kind: "supervisor", agent: agent("s1"), at: 6000 });
    expect(n.pending).toBe(true);
  });

  it("一時停止の間は送らず、再開したら（2 秒たっていれば）送る", () => {
    const n = make(agent("s1"), { paused: true });
    expect(n.handle({ kind: "tick", at: D * 3 })).toBeNull();
    expect(n.handle({ kind: "paused", paused: false, at: D * 4 })).toEqual({ kind: "send" });
    const m = make(agent("s1"));
    expect(m.handle({ kind: "paused", paused: true, at: 1 })).toBeNull();
    expect(m.handle({ kind: "tick", at: D * 2 })).toBeNull();
    expect(m.pending).toBe(true);
  });

  it("retry で印を戻し、2 秒後に送り直す", () => {
    const n = make();
    n.handle({ kind: "tick", at: D });
    n.retry(5000);
    expect(n.handle({ kind: "tick", at: 5000 + D - 1 })).toBeNull();
    expect(n.handle({ kind: "tick", at: 5000 + D })).toEqual({ kind: "send" });
  });
});

describe("subordinatesSignature", () => {
  it("順に依らず、無効かどうかで変わる", () => {
    expect(
      subordinatesSignature([
        { key: "local:p2", stale: false },
        { key: "local:p1", stale: false },
      ]),
    ).toBe(
      subordinatesSignature([
        { key: "local:p1", stale: false },
        { key: "local:p2", stale: false },
      ]),
    );
    expect(subordinatesSignature([{ key: "local:p1", stale: true }])).not.toBe(
      subordinatesSignature([{ key: "local:p1", stale: false }]),
    );
    expect(subordinatesSignature([])).toBe("");
  });
});
