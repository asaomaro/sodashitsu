import type { AgentInfo, Pane } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import { UsageService, type UsageAdapter } from "./UsageService.js";

/** 20261010-agent-usage の AC1・AC5: アダプタの枠。対応しない種類・エージェントが居ない・会話の id が分からない pane は null。入力は pane の id だけ。 */

function pane(id: string, over: Partial<Pane> = {}): Pane {
  const agent: AgentInfo = { instanceId: "i", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 1 };
  return { id, tabId: "t1", agent, agentSession: { kind: "claude", sessionId: `sess-${id}`, reportedAt: 1 }, cwd: "/x", ...over } as unknown as Pane;
}

function make(panes: Pane[], adapter?: Partial<UsageAdapter>) {
  const calls: { paneId: string; sessionId: string; transcriptPath: string | undefined }[] = [];
  const a: UsageAdapter = {
    kind: "claude",
    usageFor: async (s) => {
      calls.push(s);
      return { model: "m", tokens: { basis: "transcript", total: 1 }, source: "transcript", updatedAt: 5 };
    },
    ...adapter,
  };
  const svc = new UsageService({
    session: { getPane: (id) => panes.find((p) => p.id === id), snapshot: () => ({ panes }) },
    adapters: [a],
    logger: { debug: () => undefined, warn: () => undefined },
  });
  return { svc, calls };
}

describe("UsageService", () => {
  it("pane の id を省くと、取れる全部。取れない pane は答えに入れない", async () => {
    const panes = [pane("p1"), pane("p2", { agent: null }), pane("p3", { agent: { ...pane("x").agent!, kind: "codex" } })];
    const { svc } = make(panes);
    const r = await svc.get();
    expect(Object.keys(r.panes)).toEqual(["p1"]); // codex のアダプタは無い・エージェントが居ない
    expect(r.panes["p1"]).toMatchObject({ paneId: "p1", kind: "claude", model: "m", updatedAt: 5 });
  });

  it("pane の id を指すと、取れなくても、その pane は null で答える（無い、と示す）", async () => {
    const { svc } = make([pane("p2", { agent: null })]);
    expect((await svc.get("p2")).panes).toEqual({ p2: null });
    expect((await svc.get("nope")).panes).toEqual({ nope: null });
  });

  it("会話の id が分からない・別の種類の会話の id の pane は、アダプタを呼ばずに null", async () => {
    const { svc, calls } = make([pane("p1", { agentSession: null }), pane("p2", { agentSession: { kind: "codex", sessionId: "x", reportedAt: 1 } })]);
    const r = await svc.get();
    expect(r.panes).toEqual({});
    expect(calls).toEqual([]);
  });

  it("フックの報告の記録の場所は、その pane の会話の id と一致するときだけ渡す", async () => {
    const { svc, calls } = make([pane("p1")]);
    svc.noteTranscript("p1", "sess-p1", "/some/path.jsonl");
    await svc.get("p1");
    expect(calls[0]!.transcriptPath).toBe("/some/path.jsonl");
    svc.noteTranscript("p1", "another-session", "/other.jsonl");
    await svc.get("p1");
    expect(calls[1]!.transcriptPath).toBeUndefined();
    svc.forgetPane("p1");
    svc.noteTranscript("p1", "sess-p1", undefined); // 場所が無い報告は、覚えない
    await svc.get("p1");
    expect(calls[2]!.transcriptPath).toBeUndefined();
  });

  it("アダプタが投げても、答えは null（落ちない。ログに場所・中身を出さない）", async () => {
    const debug = vi.fn();
    const panes = [pane("p1")];
    const a: UsageAdapter = {
      kind: "claude",
      usageFor: async () => {
        throw new Error("EACCES: /home/secret/place/file.jsonl");
      },
    };
    const svc = new UsageService({ session: { getPane: () => panes[0], snapshot: () => ({ panes }) }, adapters: [a], logger: { debug, warn: debug } });
    expect((await svc.get("p1")).panes).toEqual({ p1: null });
    expect(JSON.stringify(debug.mock.calls)).not.toContain("secret");
  });

  it("アカウント全体: アダプタが返すものを集める。投げても答えは返る", async () => {
    const { svc } = make([pane("p1")], {
      accounts: async () => [{ kind: "claude", accountKey: "k", label: "claude", windows: [{ label: "週", usedPct: 10 }], source: "statusline", asOf: 1 }],
    });
    expect((await svc.get()).accounts).toHaveLength(1);
    const { svc: bad } = make([pane("p1")], {
      accounts: async () => {
        throw new Error("x");
      },
    });
    expect((await bad.get()).accounts).toEqual([]);
  });
});
