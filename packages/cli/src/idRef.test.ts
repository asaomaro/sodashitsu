import { describe, expect, it } from "vitest";
import type { SessionSnapshot } from "@sodashitsu/protocol";
import { resolveAgentTarget } from "./agentTarget.js";
import { needsLookup, resolveIdRef, resolvePaneRef, resolveTabRef, resolveWorkspaceRef } from "./idRef.js";

const P1 = "3f2a9c10-1111-4111-8111-aaaaaaaaaaaa";
const P2 = "3f2b0000-2222-4222-8222-bbbbbbbbbbbb";
const P3 = "9d000000-3333-4333-8333-cccccccccccc";

const snap = {
  workspaces: [{ id: "aaaa1111-0000-4000-8000-000000000001" }],
  tabs: [{ id: "bbbb2222-0000-4000-8000-000000000002" }],
  panes: [
    { id: P1, tabId: "t", agent: { name: "reviewer" } },
    { id: P2, tabId: "t" },
    { id: P3, tabId: "t", agent: { name: "worker" } },
  ],
} as unknown as SessionSnapshot;

describe("resolveIdRef（完全な id か、一意に決まる先頭の部分）", () => {
  it("完全一致が先。一意な先頭の部分（4 文字以上）は完全な id に直す", () => {
    expect(resolvePaneRef(snap, P1)).toBe(P1);
    expect(resolvePaneRef(snap, "3f2a")).toBe(P1);
    expect(resolvePaneRef(snap, "9d00")).toBe(P3);
    expect(resolvePaneRef(snap, P1.slice(0, 8))).toBe(P1);
  });

  it("曖昧な部分は id_ambiguous（候補を並べる）", () => {
    expect(() => resolvePaneRef(snap, "3f2")).not.toThrow(); // 3 文字は部分として扱わない
    expect(() => resolvePaneRef(snap, "3f2a-")).not.toThrow();
    expect(() => resolveIdRef([P1, P1.replace("3f2a9c10", "3f2a9c11")], "3f2a9c1", "pane")).toThrow(
      expect.objectContaining({ code: "id_ambiguous", message: expect.stringContaining(P1) }),
    );
  });

  it("当たらない・4 文字未満・16 進でない指定は、そのまま返す（既存の not_found などに任せる）", () => {
    expect(resolvePaneRef(snap, "ffff")).toBe("ffff");
    expect(resolvePaneRef(snap, "3f2")).toBe("3f2");
    expect(resolvePaneRef(snap, "reviewer")).toBe("reviewer");
    expect(resolvePaneRef(snap, "p1")).toBe("p1");
  });

  it("tab・workspace も同じ規則", () => {
    expect(resolveTabRef(snap, "bbbb")).toBe("bbbb2222-0000-4000-8000-000000000002");
    expect(resolveWorkspaceRef(snap, "aaaa1")).toBe("aaaa1111-0000-4000-8000-000000000001");
  });

  it("needsLookup は部分かもしれない指定だけ真（完全な UUID・名前・短い指定は偽）", () => {
    expect(needsLookup("3f2a9c10")).toBe(true);
    expect(needsLookup(P1)).toBe(false);
    expect(needsLookup("reviewer")).toBe(false);
    expect(needsLookup("p1")).toBe(false);
  });
});

describe("resolveAgentTarget の先頭の部分", () => {
  it("完全な id → 名前 → pane の id の先頭の部分の順。エージェントの居ない pane の部分は agent_not_found", () => {
    expect(resolveAgentTarget(snap, P1).paneId).toBe(P1);
    expect(resolveAgentTarget(snap, "reviewer").paneId).toBe(P1);
    expect(resolveAgentTarget(snap, "9d00").paneId).toBe(P3);
    expect(() => resolveAgentTarget(snap, "3f2b")).toThrow(expect.objectContaining({ code: "agent_not_found" }));
    expect(() => resolveAgentTarget(snap, "ffff")).toThrow(expect.objectContaining({ code: "agent_not_found" }));
  });
});
