import type { AgentInfo, Pane } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { checkForkable, forkArgs, forkNameCandidates, forkNoteText, isSafeNotePath } from "./agentFork.js";
import { buildStartLine } from "./agentStart.js";

const ID = "3e81f9a7-a757-461a-b21c-196db1d9196e";
const agent = (kind = "claude"): AgentInfo => ({ instanceId: "i1", kind, label: kind, state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0 });
const pane = (over: Partial<Pane> = {}): Pane =>
  ({ id: "p1", tabId: "t1", label: null, cwd: "/w", shell: "", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: agent(), agentSession: { kind: "claude", sessionId: ID, reportedAt: 1 }, ...over }) as Pane;

describe("checkForkable（会話の id は、pane の記録だけから引く。UUID の形だけ。A7）", () => {
  it("Claude Code で、フックの報告が UUID なら fork できる", () => {
    expect(checkForkable(pane())).toMatchObject({ ok: true, sessionId: ID });
  });
  it("理由の種類: pane が無い・エージェントが居ない・Claude Code でない・会話の id が分からない", () => {
    expect(checkForkable(undefined)).toEqual({ ok: false, reason: "pane_not_found" });
    expect(checkForkable(pane({ agent: null }))).toEqual({ ok: false, reason: "no_agent" });
    expect(checkForkable(pane({ agent: agent("codex"), agentSession: { kind: "codex", sessionId: ID, reportedAt: 1 } }))).toEqual({ ok: false, reason: "not_claude" });
    expect(checkForkable(pane({ agentSession: null }))).toEqual({ ok: false, reason: "no_session_id" });
    // 検出は claude だが、会話の記録が別の種類（取り違え）
    expect(checkForkable(pane({ agentSession: { kind: "codex", sessionId: ID, reportedAt: 1 } }))).toEqual({ ok: false, reason: "no_session_id" });
  });
  it("UUID の形でない id（名前・パス・引数に化けるもの）は断る", () => {
    for (const bad of ["../x", "a b", "-x", "my-session", "/tmp/x.jsonl", `${ID}0`, `${ID}\n`, `${ID}; rm -rf /`, "$(id)"]) {
      expect(checkForkable(pane({ agentSession: { kind: "claude", sessionId: bad, reportedAt: 1 } })), bad).toEqual({ ok: false, reason: "bad_session_id" });
    }
  });
});

describe("起動の引数", () => {
  it("--resume <id> --fork-session。既存の引用の関数で、1 行に組む（引数ごとに単一引用符で包む）", () => {
    expect(forkArgs(ID)).toEqual(["--resume", ID, "--fork-session"]);
    expect(buildStartLine("claude", forkArgs(ID))).toBe(`claude '--resume' '${ID}' '--fork-session'`);
  });
});

describe("forkNameCandidates", () => {
  it("元の名前があれば <名前>-fork、-fork-2、…。書式（32 文字まで・英小文字で始まる）に収める", () => {
    const c = forkNameCandidates("alpha", "p1");
    expect(c.slice(0, 3)).toEqual(["alpha-fork", "alpha-fork-2", "alpha-fork-3"]);
    const long = forkNameCandidates("a".repeat(32), "p1");
    expect(long[0]!.length).toBeLessThanOrEqual(32);
    expect(long[0]!.endsWith("-fork")).toBe(true);
  });
  it("元の名前が無ければ fork-<pane id の先頭>", () => {
    expect(forkNameCandidates(undefined, "ABC-123")[0]).toBe("fork-abc123");
    expect(forkNameCandidates(undefined, "???")[0]).toBe("fork-pane");
  });
});

describe("最初の知らせ", () => {
  it("パスをバッククォートで囲み、元のフォルダを変更しないよう伝える", () => {
    const t = forkNoteText("/new/dir", "/old/dir");
    expect(t).toContain("`/new/dir`");
    expect(t).toContain("`/old/dir`");
    expect(t).toContain("変更しないでください");
  });
  it("制御文字・改行・行の区切り・長すぎるパスは、そのまま打ち込まない", () => {
    expect(isSafeNotePath("/a/b c/日本語")).toBe(true);
    for (const bad of ["", "/a\nb", "/a\rb", "/a\x1bb", "/a\u007fb", `/a${String.fromCharCode(0x2028)}b`, `/a${String.fromCharCode(0x2029)}b`, "/" + "x".repeat(1000)]) {
      expect(isSafeNotePath(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("最初の知らせのパス（R6）", () => {
  it("バッククォート（文面の囲みを崩す）と、見た目だけ入れ替える文字（双方向の制御・ゼロ幅・BOM）は、打ち込まない", () => {
    for (const bad of ["/a/`b`", "/a/‮b", "/a/⁦b", "/a/​b", "/a/﻿b"]) expect(isSafeNotePath(bad), JSON.stringify(bad)).toBe(false);
  });
});
