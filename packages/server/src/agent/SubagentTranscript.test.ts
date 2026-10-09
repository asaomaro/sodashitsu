import { execFileSync } from "node:child_process";
import { link, mkdir, mkdtemp, rm, symlink, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RpcError } from "@sodashitsu/protocol";
import { MemoryLogger } from "../log/Logger.js";
import {
  defaultTranscriptRoots,
  entriesOfLine,
  readTranscriptWindow,
  resolveTranscriptFile,
  SubagentTranscriptReader,
  TRANSCRIPT_ENTRIES_MAX,
  TRANSCRIPT_TEXT_MAX,
} from "./SubagentTranscript.js";

// 20261008-graph-first PR6c（T19c）。記録（Claude Code の内部の形。調査 subagent-research.md の 2.2）を読む部分と、読んでよい場所の決め方。

const user = (content: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ type: "user", isSidechain: true, timestamp: "2026-10-09T01:02:03.000Z", message: { role: "user", content }, ...extra }) + "\n";
const asst = (content: unknown) => JSON.stringify({ type: "assistant", isSidechain: true, message: { role: "assistant", content } }) + "\n";

describe("entriesOfLine（人が読む 3 種だけ）", () => {
  it("指示（user の文字列）・発言・道具・道具の結果を取り出す。thinking・attachment・知らない種類は飛ばす", () => {
    expect(entriesOfLine(JSON.parse(user("調べて")))).toEqual([{ kind: "prompt", text: "調べて", truncated: false, at: "2026-10-09T01:02:03.000Z" }]);
    expect(
      entriesOfLine(JSON.parse(asst([
        { type: "thinking", thinking: "…", signature: "x" },
        { type: "text", text: "見ます" },
        { type: "tool_use", name: "Bash", input: { command: "sleep 4", description: "待つ", secret: "x" } },
      ]))),
    ).toEqual([
      { kind: "say", text: "見ます", truncated: false },
      { kind: "tool", name: "Bash", text: "待つ" },
    ]);
    expect(entriesOfLine(JSON.parse(user([{ type: "tool_result", tool_use_id: "t", content: "出力", is_error: true }])))).toEqual([
      { kind: "result", text: "出力", truncated: false, error: true, at: "2026-10-09T01:02:03.000Z" },
    ]);
    expect(entriesOfLine({ type: "attachment", attachment: { x: "y".repeat(100000) } })).toEqual([]);
    expect(entriesOfLine({ type: "future-type", message: { content: "x" } })).toEqual([]);
    expect(entriesOfLine(null)).toEqual([]);
    expect(entriesOfLine("x")).toEqual([]);
    expect(entriesOfLine({ type: "user", message: { content: 5 } })).toEqual([]);
  });

  it("道具の入力の全体は出さず、決まった項目の先頭 1 行だけ。結果の配列は text だけ連ねる", () => {
    const [t] = entriesOfLine(JSON.parse(asst([{ type: "tool_use", name: "Read", input: { file_path: "/a/b.ts", token: "S3CR3T" } }])));
    expect(t).toEqual({ kind: "tool", name: "Read", text: "/a/b.ts" });
    expect(JSON.stringify(t)).not.toContain("S3CR3T");
    const [r] = entriesOfLine(JSON.parse(user([{ type: "tool_result", content: [{ type: "text", text: "a" }, { type: "image", source: "…" }, { type: "text", text: "b" }] }])));
    expect(r).toMatchObject({ kind: "result", text: "a\nb" });
  });

  it("1 件 4,000 文字で切り、truncated を付ける（サロゲートペアを割らない）", () => {
    const [e] = entriesOfLine(JSON.parse(asst([{ type: "text", text: "あ".repeat(TRANSCRIPT_TEXT_MAX + 50) }])));
    expect(e).toMatchObject({ kind: "say", truncated: true });
    expect((e as { text: string }).text).toHaveLength(TRANSCRIPT_TEXT_MAX);
    const [p] = entriesOfLine(JSON.parse(asst([{ type: "text", text: "a".repeat(TRANSCRIPT_TEXT_MAX - 1) + "😀" }])));
    expect((p as { text: string }).text).toHaveLength(TRANSCRIPT_TEXT_MAX - 1); // 😀（2 単位）の前半だけを残さない
  });
});

describe("resolveTranscriptFile / readTranscriptWindow / SubagentTranscriptReader", () => {
  let base: string;
  let root: string; // ~/.claude/projects 相当
  let projDir: string;
  let parent: string;
  const SESSION = "11111111-2222-3333-4444-555555555555";
  const subDir = () => join(projDir, SESSION, "subagents");
  const fileOf = (id: string) => join(subDir(), `agent-${id}.jsonl`);

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "soda-transcript-"));
    root = join(base, ".claude", "projects");
    projDir = join(root, "-work-proj");
    await mkdir(subDir(), { recursive: true });
    parent = join(projDir, `${SESSION}.jsonl`);
    await writeFile(parent, "");
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  describe("場所の決め方（AC-U5 の b・d）", () => {
    it("決まった形に組み立てて、根の下の実体のファイルだけを返す", async () => {
      await writeFile(fileOf("a1"), user("x"));
      const r = await resolveTranscriptFile(parent, SESSION, "a1", [root]);
      expect(r.ok && r.file).toBe(fileOf("a1"));
    });

    it("ファイルがまだ無ければ missing（始まったばかり）", async () => {
      expect(await resolveTranscriptFile(parent, SESSION, "a1", [root])).toEqual({ ok: false, reason: "missing" });
    });

    it.each([
      ["../evil", "../ を含む id"],
      ["/etc/passwd", "絶対のパス"],
      ["a/b", "区切り"],
      ["a.b", "ドット"],
      ["", "空"],
      ["x".repeat(129), "長すぎる id"],
      ["a\0b", "NUL"],
    ])("安全でない id（%j: %s）は拒む", async (id) => {
      await writeFile(fileOf("a1"), "x");
      expect(await resolveTranscriptFile(parent, SESSION, id, [root])).toEqual({ ok: false, reason: "invalid" });
    });

    it("偽の報告で、親の記録の場所を根の外へ向けても読めない（outside）", async () => {
      const evil = join(base, "elsewhere");
      await mkdir(join(evil, SESSION, "subagents"), { recursive: true });
      await writeFile(join(evil, SESSION, "subagents", "agent-a1.jsonl"), user("secret"));
      expect(await resolveTranscriptFile(join(evil, `${SESSION}.jsonl`), SESSION, "a1", [root])).toEqual({ ok: false, reason: "outside" });
      // `..` で根の外へ出る場所
      expect(await resolveTranscriptFile(join(projDir, "..", "..", "..", "elsewhere", `${SESSION}.jsonl`), SESSION, "a1", [root])).toEqual({ ok: false, reason: "outside" });
    });

    it("形が違う親の場所（相対・名前がセッションの id でない・.jsonl でない・NUL）は拒む", async () => {
      await writeFile(fileOf("a1"), "x");
      for (const p of ["relative/x.jsonl", join(projDir, "other.jsonl"), join(projDir, SESSION), `${parent}\0`])
        expect(await resolveTranscriptFile(p, SESSION, "a1", [root])).toEqual({ ok: false, reason: "invalid" });
      expect(await resolveTranscriptFile(parent, "../x", "a1", [root])).toEqual({ ok: false, reason: "invalid" });
    });

    it("フォルダがリンクで根の外を指していれば拒む。根の中の別の場所を指す `subagents` も、形（3 段）が合わなければ拒む", async () => {
      const outside = join(base, "outside-dir");
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, "agent-a1.jsonl"), user("secret"));
      await rm(subDir(), { recursive: true });
      await symlink(outside, subDir());
      expect(await resolveTranscriptFile(parent, SESSION, "a1", [root])).toEqual({ ok: false, reason: "outside" });
      // 根の直下（段が足りない）
      await rm(subDir());
      await mkdir(join(root, "subagents"), { recursive: true });
      await writeFile(join(root, "subagents", "agent-a1.jsonl"), "x");
      await symlink(join(root, "subagents"), subDir());
      expect(await resolveTranscriptFile(parent, SESSION, "a1", [root])).toEqual({ ok: false, reason: "outside" });
    });

    it("ファイル自体がリンクなら（根の中を指していても、外を指していても）開かない", async () => {
      const target = join(base, "target.jsonl");
      await writeFile(target, user("secret"));
      await symlink(target, fileOf("a1"));
      expect(await resolveTranscriptFile(parent, SESSION, "a1", [root])).toEqual({ ok: false, reason: "unreadable" });
      const inside = join(subDir(), "agent-real.jsonl");
      await writeFile(inside, user("ok"));
      await symlink(inside, fileOf("a2"));
      expect(await resolveTranscriptFile(parent, SESSION, "a2", [root])).toEqual({ ok: false, reason: "unreadable" });
    });

    it("根が無い（Claude Code を使っていない）ときは、何も読めない。CLAUDE_CONFIG_DIR の projects も根になる", async () => {
      await writeFile(fileOf("a1"), "x");
      expect(await resolveTranscriptFile(parent, SESSION, "a1", [join(base, "no-root")])).toEqual({ ok: false, reason: "outside" });
      expect(defaultTranscriptRoots({ CLAUDE_CONFIG_DIR: "/cfg" }, "/home/u")).toEqual(["/home/u/.claude/projects", "/cfg/projects"]);
      expect(defaultTranscriptRoots({ CLAUDE_CONFIG_DIR: "relative" }, "/home/u")).toEqual(["/home/u/.claude/projects"]);
      expect(defaultTranscriptRoots({}, "/home/u")).toEqual(["/home/u/.claude/projects"]);
    });
  });

  describe("レビューの直し（PR6c の S1・S2・S3・N1）", () => {
    it("S1: ハードリンク（nlink > 1）は、根の外のファイルへ繋いであっても読まない", async () => {
      const outside = join(base, "outside.jsonl");
      await writeFile(outside, user("OUTSIDE-SECRET"));
      await link(outside, fileOf("h1"));
      expect(await resolveTranscriptFile(parent, SESSION, "h1", [root])).toEqual({ ok: false, reason: "unreadable" });
      // 開いた後の確認（解決を通らずに渡されても断る）
      expect(await readTranscriptWindow(fileOf("h1"), undefined)).toMatchObject({ status: "unreadable", entries: [] });
      // 否定の対照: 1 つしかリンクの無いファイルは読める
      await writeFile(fileOf("h2"), user("ok"));
      expect((await resolveTranscriptFile(parent, SESSION, "h2", [root])).ok).toBe(true);
      expect((await readTranscriptWindow(fileOf("h2"), undefined)).entries).toHaveLength(1);
    });

    it("S3: FIFO は、開いて固まらず、断る", async () => {
      const f = fileOf("fifo");
      execFileSync("mkfifo", [f]);
      expect(await resolveTranscriptFile(parent, SESSION, "fifo", [root])).toEqual({ ok: false, reason: "unreadable" });
      // 解決の後にすり替えられた想定で、直接渡す。O_NONBLOCK が無ければ、書き手を待って返らない。
      const r = await Promise.race([readTranscriptWindow(f, undefined), new Promise<"hung">((res) => setTimeout(() => res("hung"), 1500))]);
      expect(r).not.toBe("hung");
      expect(r).toMatchObject({ status: "unreadable", entries: [] });
    });

    it("S2: 1 行に多数の件数があっても、1 回に返すのは 200 件まで（続きでも最初でも）。切った行は読んだことにして先へ進む", async () => {
      const f = fileOf("fat");
      const parts = Array.from({ length: 3500 }, (_, i) => ({ type: "tool_result", tool_use_id: `t${i}`, content: "x" }));
      await writeFile(f, user(parts) + asst([{ type: "text", text: "次の行" }]));
      const forward = await readTranscriptWindow(f, 0);
      expect(forward.entries.length).toBeLessThanOrEqual(TRANSCRIPT_ENTRIES_MAX);
      expect(forward.entries).toHaveLength(TRANSCRIPT_ENTRIES_MAX);
      // 位置は、その行の次（次の読みで同じ行を読み直さない）
      const next = await readTranscriptWindow(f, forward.offset);
      expect(next.entries.map((e) => e.kind)).toEqual(["say"]);
      const first = await readTranscriptWindow(f, undefined);
      expect(first.entries.length).toBeLessThanOrEqual(TRANSCRIPT_ENTRIES_MAX);
      // 否定の対照: 件数の少ない行は切らない
      await writeFile(f, user([{ type: "tool_result", content: "a" }, { type: "tool_result", content: "b" }]));
      expect((await readTranscriptWindow(f, 0)).entries).toHaveLength(2);
    });

    it("N1: 根の外の場所は、有っても無くても同じ答え。根の下でまだ無いものだけが missing", async () => {
      const exists = join(base, "ex");
      await mkdir(join(exists, SESSION, "subagents"), { recursive: true });
      const a = await resolveTranscriptFile(join(exists, `${SESSION}.jsonl`), SESSION, "a1", [root]);
      const b = await resolveTranscriptFile(join(base, "nope", `${SESSION}.jsonl`), SESSION, "a1", [root]);
      expect(a).toEqual({ ok: false, reason: "outside" });
      expect(b).toEqual(a);
      // 否定の対照: 根の下の、まだ無いフォルダは「まだ無い」
      expect(await resolveTranscriptFile(join(root, "-new-proj", `${SESSION}.jsonl`), SESSION, "a1", [root])).toEqual({ ok: false, reason: "missing" });
    });
  });

  describe("窓の読み出し", () => {
    it("最初は先頭から全部（小さいファイル）。壊れた行・巨大な行・知らない種類は飛ばす。途中まで書かれた行は読まない", async () => {
      const f = fileOf("a1");
      await writeFile(f, user("指示") + "{broken\n" + JSON.stringify({ type: "attachment", x: "y".repeat(300 * 1024) }) + "\n" + asst([{ type: "text", text: "発言" }]) + '{"type":"assistant","message":{"con');
      const r = await readTranscriptWindow(f, undefined);
      expect(r.entries.map((e) => e.kind)).toEqual(["prompt", "say"]);
      expect(r.omittedBefore).toBe(false);
      // 書き終わった行が来たら、続きとして返す（途中だった行は、改めて全体が返る）
      await appendFile(f, 'tent":[{"type":"text","text":"続き"}]}}\n');
      const r2 = await readTranscriptWindow(f, r.offset);
      expect(r2.entries).toEqual([{ kind: "say", text: "続き", truncated: false }]);
      expect((await readTranscriptWindow(f, r2.offset)).entries).toEqual([]);
    });

    it("1 MiB を超える大きいファイルは、末尾から 1 MiB まで。先頭の指示は添える。最初の中途半端な行は捨てる", async () => {
      const f = fileOf("big");
      const filler = JSON.stringify({ type: "attachment", x: "y".repeat(200 * 1024) }) + "\n";
      let body = user("最初の指示");
      for (let i = 0; i < 10; i++) body += filler;
      body += asst([{ type: "text", text: "末尾の発言" }]);
      await writeFile(f, body);
      const r = await readTranscriptWindow(f, undefined);
      expect(r.omittedBefore).toBe(true);
      expect(r.entries.map((e) => (e as { text: string }).text)).toEqual(["最初の指示", "末尾の発言"]);
    });

    it("1 回に返すのは 200 件まで（最初は末尾の 200 件・続きは先頭から 200 件で、残りは次の読みへ）", async () => {
      const f = fileOf("many");
      let body = "";
      for (let i = 0; i < 450; i++) body += asst([{ type: "text", text: `n${i}` }]);
      await writeFile(f, body);
      const first = await readTranscriptWindow(f, undefined);
      expect(first.entries).toHaveLength(TRANSCRIPT_ENTRIES_MAX);
      expect((first.entries[0] as { text: string }).text).toBe("n250");
      expect(first.omittedBefore).toBe(true);
      const part = await readTranscriptWindow(f, 0);
      expect(part.entries).toHaveLength(TRANSCRIPT_ENTRIES_MAX);
      expect((part.entries[0] as { text: string }).text).toBe("n0");
      const next = await readTranscriptWindow(f, part.offset);
      expect((next.entries[0] as { text: string }).text).toBe("n200");
    });

    it("ファイルが小さくなって位置が合わなくなったら、最初から読み直し、reset を立てる", async () => {
      const f = fileOf("r");
      await writeFile(f, user("a") + user("b"));
      const r = await readTranscriptWindow(f, undefined);
      await writeFile(f, user("c"));
      const again = await readTranscriptWindow(f, r.offset + 1000);
      expect(again.reset).toBe(true);
      expect(again.entries.map((e) => (e as { text: string }).text)).toEqual(["c"]);
    });

    it("空のファイルは、何も無いまま ok", async () => {
      const f = fileOf("e");
      await writeFile(f, "");
      expect(await readTranscriptWindow(f, undefined)).toMatchObject({ status: "ok", entries: [], offset: 0 });
    });
  });

  describe("読む口（SubagentTranscriptReader。AC-U5 の c）", () => {
    let reported: Map<string, { sessionId: string; parentTranscriptPath: string }>;
    let instance: string | null;
    let clock: number;
    let reader: SubagentTranscriptReader;
    const logger = new MemoryLogger();
    beforeEach(() => {
      reported = new Map();
      instance = "i1";
      clock = 1_000_000;
      reader = new SubagentTranscriptReader({
        tracker: { transcriptSource: (pane, id) => reported.get(`${pane}\n${id}`) },
        agentInstanceOf: () => instance,
        roots: () => [root],
        now: () => clock,
        logger,
      });
    });
    const report = (pane: string, id: string, parentTranscriptPath = parent) => reported.set(`${pane}\n${id}`, { sessionId: SESSION, parentTranscriptPath });
    const code = async (p: Promise<unknown>) => (await p.then(() => null, (e: unknown) => (e instanceof RpcError ? e.code : "other"))) as string | null;

    it("報告されているサブエージェントは読める。ファイルがまだ無ければ pending、あれば抜粋と running", async () => {
      report("p1", "a1");
      expect(await reader.read("p1", "a1", undefined)).toMatchObject({ status: "pending", entries: [], running: true });
      await writeFile(fileOf("a1"), user("指示"));
      const r = await reader.read("p1", "a1", undefined);
      expect(r).toMatchObject({ status: "ok", running: true });
      expect(r.entries).toHaveLength(1);
    });

    it("居ない id・別の pane の id・形の合わない id・長い id は not_found（ファイルの有無を教えない）", async () => {
      report("p1", "a1");
      await writeFile(fileOf("a1"), user("x"));
      for (const [pane, id] of [["p1", "nope"], ["p2", "a1"], ["p1", "../a1"], ["p1", "/etc/passwd"], ["p1", "a".repeat(300)], ["nopane", "a1"]] as const)
        expect(await code(reader.read(pane, id, undefined))).toBe("not_found");
    });

    it("偽の報告（親の場所が根の外）は、報告されていても読めない（unreadable・固定の理由。場所を載せない）", async () => {
      const evil = join(base, "elsewhere");
      await mkdir(join(evil, SESSION, "subagents"), { recursive: true });
      await writeFile(join(evil, SESSION, "subagents", "agent-a1.jsonl"), user("secret"));
      report("p1", "a1", join(evil, `${SESSION}.jsonl`));
      const r = await reader.read("p1", "a1", undefined);
      expect(r.status).toBe("unreadable");
      expect(r.entries).toEqual([]);
      expect(JSON.stringify(r)).not.toContain(base);
      expect(JSON.stringify(logger.lines)).not.toContain(base);
    });

    it("窓を開いたときに報告していたものは、終わった後も（同じエージェントの間）読める。別のエージェントに入れ替われば読めない。開く前に終わっていたものは読めない", async () => {
      await writeFile(fileOf("a1"), user("指示"));
      expect(await code(reader.read("p1", "a1", undefined))).toBe("not_found"); // まだ報告が無い・窓も開いていない
      report("p1", "a1");
      await reader.read("p1", "a1", undefined);
      reported.clear(); // 終わった
      const after = await reader.read("p1", "a1", undefined);
      expect(after).toMatchObject({ status: "ok", running: false });
      instance = "i2"; // 別のエージェントに入れ替わった
      expect(await code(reader.read("p1", "a1", undefined))).toBe("not_found");
      instance = "i1";
      expect(await code(reader.read("p1", "a1", undefined))).toBe("not_found"); // 入れ替わった時点で許可は捨てた
    });

    it("許可には期限がある（30 分読まなければ失効）。エージェントが居なくなれば読めない", async () => {
      await writeFile(fileOf("a1"), user("指示"));
      report("p1", "a1");
      await reader.read("p1", "a1", undefined);
      reported.clear();
      clock += 29 * 60_000;
      await reader.read("p1", "a1", undefined); // 読むたびに延びる
      clock += 31 * 60_000;
      expect(await code(reader.read("p1", "a1", undefined))).toBe("not_found");
      report("p1", "a1");
      await reader.read("p1", "a1", undefined);
      reported.clear();
      instance = null;
      expect(await code(reader.read("p1", "a1", undefined))).toBe("not_found");
    });

    it("続きの位置で、新しく書かれた分だけが返る", async () => {
      report("p1", "a1");
      await writeFile(fileOf("a1"), user("指示"));
      const r1 = await reader.read("p1", "a1", undefined);
      await appendFile(fileOf("a1"), asst([{ type: "text", text: "発言" }]));
      const r2 = await reader.read("p1", "a1", r1.offset);
      expect(r2.entries.map((e) => e.kind)).toEqual(["say"]);
      expect((await reader.read("p1", "a1", r2.offset)).entries).toEqual([]);
    });
  });
});
