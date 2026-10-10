import { execFileSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { locateClaudeMain, locateClaudeSubagents } from "./claudeSource.js";

/** 20261010-agent-usage の AC2・AC8: 記録の場所はサーバが決める。根の外・リンク・ハードリンク・FIFO・深い入れ子・名前の違いは、読まない。 */

const SID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
let base: string;
let root: string; // 根（`<…>/projects`）
let outside: string; // 根の外
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "usage-src-")));
  root = join(base, "projects");
  outside = join(base, "outside");
  mkdirSync(root);
  mkdirSync(outside);
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});
const mk = (...parts: string[]): string => {
  const f = join(...parts);
  mkdirSync(join(f, ".."), { recursive: true });
  writeFileSync(f, "{}\n");
  return f;
};

describe("locateClaudeMain", () => {
  it("フックの報告の場所が、根の直下の 1 段の中で、名前が <id>.jsonl なら、その実体を使う", async () => {
    const f = mk(root, "proj-a", `${SID}.jsonl`);
    expect(await locateClaudeMain(SID, f, [root])).toBe(f);
  });

  it("報告の場所が無い・合わないときは、根の下を会話の id の名前で探す", async () => {
    const f = mk(root, "proj-b", `${SID}.jsonl`);
    expect(await locateClaudeMain(SID, undefined, [root])).toBe(f);
    expect(await locateClaudeMain(SID, join(outside, `${SID}.jsonl`), [root])).toBe(f);
  });

  it("同じ id が複数のプロジェクトにあるときは、更新の時刻が新しいほう（readdir の順ではない。R2）", async () => {
    const old = mk(root, "p1-old", `${SID}.jsonl`);
    const fresh = mk(root, "p2-new", `${SID}.jsonl`);
    const older = mk(root, "p0-oldest", `${SID}.jsonl`);
    utimesSync(old, 1_000, 1_000);
    utimesSync(older, 500, 500);
    utimesSync(fresh, 2_000, 2_000);
    expect(await locateClaudeMain(SID, undefined, [root])).toBe(fresh);
    utimesSync(old, 3_000, 3_000); // 古かった写しが新しくなれば、そちら
    expect(await locateClaudeMain(SID, undefined, [root])).toBe(old);
  });

  it("根の外の場所は読まない（同じ名前のファイルが外に有っても）。探しても無ければ null", async () => {
    const evil = mk(outside, `${SID}.jsonl`);
    expect(await locateClaudeMain(SID, evil, [root])).toBeNull();
    expect(await locateClaudeMain(SID, "/etc/passwd", [root])).toBeNull();
    expect(await locateClaudeMain(SID, `${root}/../outside/${SID}.jsonl`, [root])).toBeNull();
  });

  it("名前が <id>.jsonl でない報告は使わない（別の id のファイル・別の拡張子）", async () => {
    mk(root, "proj", "other-session.jsonl");
    expect(await locateClaudeMain(SID, join(root, "proj", "other-session.jsonl"), [root])).toBeNull();
  });

  it("プロジェクトのフォルダがリンクで根の外を指すとき、読まない（実体が根の外）", async () => {
    mk(outside, `${SID}.jsonl`);
    symlinkSync(outside, join(root, "linked-proj"));
    expect(await locateClaudeMain(SID, join(root, "linked-proj", `${SID}.jsonl`), [root])).toBeNull();
    expect(await locateClaudeMain(SID, undefined, [root])).toBeNull();
  });

  it("ファイル自体がリンク（根の外のファイルへ）なら、読まない", async () => {
    const target = mk(outside, "secret.jsonl");
    mkdirSync(join(root, "proj"));
    symlinkSync(target, join(root, "proj", `${SID}.jsonl`));
    expect(await locateClaudeMain(SID, join(root, "proj", `${SID}.jsonl`), [root])).toBeNull();
    expect(await locateClaudeMain(SID, undefined, [root])).toBeNull();
  });

  it("ハードリンク（リンクが 2 つ以上）のファイルは読まない（外のファイルを根の中へ繋いでも）", async () => {
    const target = mk(outside, "secret.jsonl");
    mkdirSync(join(root, "proj"));
    linkSync(target, join(root, "proj", `${SID}.jsonl`));
    expect(await locateClaudeMain(SID, join(root, "proj", `${SID}.jsonl`), [root])).toBeNull();
    expect(await locateClaudeMain(SID, undefined, [root])).toBeNull();
  });

  it("FIFO（通常のファイルでない）・フォルダは読まない（開いて固まらない）", async () => {
    mkdirSync(join(root, "proj"));
    execFileSync("mkfifo", [join(root, "proj", `${SID}.jsonl`)]);
    expect(await locateClaudeMain(SID, join(root, "proj", `${SID}.jsonl`), [root])).toBeNull();
    mkdirSync(join(root, "proj2", `${SID}.jsonl`), { recursive: true });
    expect(await locateClaudeMain(SID, join(root, "proj2", `${SID}.jsonl`), [root])).toBeNull();
  });

  it("根の直下の 1 段より深い場所（<根>/<プロジェクト>/<さらに下>/<id>.jsonl）は使わない", async () => {
    const f = mk(root, "proj", "deeper", `${SID}.jsonl`);
    expect(await locateClaudeMain(SID, f, [root])).toBeNull();
  });

  it("会話の id の形が合わないときは、探さない（フォルダ・ファイルの名前に化けさせない）", async () => {
    mk(root, "proj", "x.jsonl");
    for (const bad of ["../x", "a/b", "", "a b", "x".repeat(200), "..", "a\0b"]) expect(await locateClaudeMain(bad, undefined, [root]), JSON.stringify(bad)).toBeNull();
  });

  it("根が無い（Claude Code を使っていない）なら null（落ちない）", async () => {
    expect(await locateClaudeMain(SID, undefined, [join(base, "no-such-root")])).toBeNull();
  });
});

describe("locateClaudeSubagents", () => {
  it("<id>/subagents/agent-*.jsonl だけ（名前の形が合うものだけ）。通常のファイルだけ", async () => {
    const main = mk(root, "proj", `${SID}.jsonl`);
    mk(root, "proj", SID, "subagents", "agent-a1.jsonl");
    mk(root, "proj", SID, "subagents", "agent-b_2.jsonl");
    mk(root, "proj", SID, "subagents", "agent-a1.meta.json");
    mk(root, "proj", SID, "subagents", "notes.jsonl");
    const r = await locateClaudeSubagents(main, SID, [root]);
    expect(r.files.map((f) => f.split("/").pop())).toEqual(["agent-a1.jsonl", "agent-b_2.jsonl"]);
    expect(r.truncated).toBe(false);
  });

  it("subagents フォルダがリンクで根の外を指すとき、読まない", async () => {
    const main = mk(root, "proj", `${SID}.jsonl`);
    mkdirSync(join(root, "proj", SID));
    mk(outside, "agent-x.jsonl");
    symlinkSync(outside, join(root, "proj", SID, "subagents"));
    expect((await locateClaudeSubagents(main, SID, [root])).files).toEqual([]);
  });

  it("リンクのファイル・ハードリンクは飛ばす。ファイルの数の上限で切り、truncated を返す", async () => {
    const main = mk(root, "proj", `${SID}.jsonl`);
    const secret = mk(outside, "s.jsonl");
    mk(root, "proj", SID, "subagents", "agent-ok.jsonl");
    symlinkSync(secret, join(root, "proj", SID, "subagents", "agent-sym.jsonl"));
    linkSync(secret, join(root, "proj", SID, "subagents", "agent-hard.jsonl"));
    expect((await locateClaudeSubagents(main, SID, [root])).files.map((f) => f.split("/").pop())).toEqual(["agent-ok.jsonl"]);
    for (let i = 0; i < 300; i++) writeFileSync(join(root, "proj", SID, "subagents", `agent-n${String(i).padStart(3, "0")}.jsonl`), "{}\n");
    const r = await locateClaudeSubagents(main, SID, [root]);
    expect(r.files.length).toBe(256);
    expect(r.truncated).toBe(true);
  });
});
