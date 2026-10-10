import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexExitSessionId, codexResumeIdFromArgv, isCodexSessionId, lookupCodexRecord } from "./codexSession.js";

const ID = "01a12341-547a-7191-8f4e-75de3ffa2434";

describe("codexResumeIdFromArgv", () => {
  it("実機の形: node のラッパー・ネイティブの本体のどちらの引数からも、resume の id を取る（後ろに -m -c が続いても）", () => {
    expect(codexResumeIdFromArgv(["node", "/usr/bin/codex", "resume", ID, "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="medium"'])).toBe(ID);
    expect(codexResumeIdFromArgv(["/usr/lib/node_modules/@openai/codex/vendor/bin/codex", "resume", ID, "-m", "x"])).toBe(ID);
    expect(codexResumeIdFromArgv(["codex", "-m", "x", "resume", ID])).toBe(ID);
    expect(codexResumeIdFromArgv(["codex", "resume", "-m", "x", ID.toUpperCase()])).toBe(ID);
  });
  it("id の無い形（選ぶ画面・--last・ただの codex・別のコマンド）は、無い", () => {
    expect(codexResumeIdFromArgv(["node", "/usr/bin/codex"])).toBeUndefined();
    expect(codexResumeIdFromArgv(["codex", "resume"])).toBeUndefined();
    expect(codexResumeIdFromArgv(["codex", "resume", "--last"])).toBeUndefined();
    expect(codexResumeIdFromArgv(["codex", "resume", "some-name", ID])).toBeUndefined();
    expect(codexResumeIdFromArgv(["codex", "exec", "resume", ID])).toBeUndefined();
    expect(codexResumeIdFromArgv(["codex", "resume", "not-a-uuid"])).toBeUndefined();
  });
});

describe("codexExitSessionId", () => {
  const tail = `Token usage so far: total=9,164 input=9,159 (+ 12,160 cached) output=5`;
  it("実機の文言（Disconnected… To reconnect, run:）と、To continue this session, run: の形の、最後の id", () => {
    const a = `Disconnected from this task. Any running work continues.\nTo reconnect, run:\n  codex resume ${ID}\nStop the current turn: run codex agents, select this task, and press x.\n${tail}`;
    expect(codexExitSessionId(a)).toBe(ID);
    const other = "01a1234a-1768-7210-befd-023a395239b0";
    expect(codexExitSessionId(`${tail}\nTo continue this session, run:\n  codex resume ${other}\n`)).toBe(other);
    expect(codexExitSessionId(`To reconnect, run:\n  codex resume ${ID}\n$ ls\nTo continue this session, run:\n  codex resume ${other}\n`)).toBe(other);
  });
  it("打った行（シェルの履歴の codex resume <id>）・文言の無い行は拾わない", () => {
    expect(codexExitSessionId(`$ codex resume ${ID}\n`)).toBeUndefined();
    expect(codexExitSessionId(`  codex resume ${ID}\n`)).toBeUndefined();
    expect(codexExitSessionId("To reconnect, run:\n  codex resume not-a-uuid\n")).toBeUndefined();
  });
});

describe("lookupCodexRecord", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "soda-codex-home-"));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function writeRollout(day: string, id: string, cwd: string, padding = 22_000, originator = "codex-tui"): Promise<void> {
    const dir = join(home, "sessions", day);
    await mkdir(dir, { recursive: true });
    const meta = { timestamp: "2026-10-10T01:11:52.954Z", ordinal: 0, type: "session_meta", payload: { session_id: id, id, timestamp: "2026-10-10T01:11:42.720Z", cwd, originator, source: "vscode", base_instructions: { text: "x".repeat(padding) } } };
    await writeFile(join(dir, `rollout-2026-10-10T10-11-42-${id}.jsonl`), `${JSON.stringify(meta)}\n{"type":"event"}\n`);
  }

  it("日付のフォルダの中の記録を id で探し、先頭の cwd を返す（先頭の行が 20 KiB を超えても）", async () => {
    await writeRollout("2026/10/10", ID, "/workspaces/yukkuri-work");
    expect(await lookupCodexRecord(home, ID)).toEqual({ cwd: "/workspaces/yukkuri-work", originator: "codex-tui" });
  });
  it("記録が無ければ null。sessions が無ければ undefined（確かめられない）。UUID の形でない id は null", async () => {
    expect(await lookupCodexRecord(home, ID)).toBeUndefined();
    await writeRollout("2026/10/09", "01a1234a-1768-7210-befd-023a395239b0", "/x");
    expect(await lookupCodexRecord(home, ID)).toBeNull();
    expect(await lookupCodexRecord(home, "../../etc/passwd")).toBeNull();
  });
  it("ファイル名の id と、先頭の id が違う記録は、受けない", async () => {
    const dir = join(home, "sessions", "2026", "10", "10");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `rollout-2026-10-10T10-11-42-${ID}.jsonl`), `{"payload":{"id":"01a1234a-1768-7210-befd-023a395239b0","cwd":"/x"}}\n`);
    expect(await lookupCodexRecord(home, ID)).toBeNull();
  });
  it("originator を返す（source は pane の TUI でも vscode になりうるので使わない）", async () => {
    await writeRollout("2026/10/10", ID, "/x", 22_000, "codex_exec");
    expect(await lookupCodexRecord(home, ID)).toEqual({ cwd: "/x", originator: "codex_exec" });
  });
  it("リンク・通常でないファイルは読まない（シンボリックリンク・ハードリンク）", async () => {
    const dir = join(home, "sessions", "2026", "10", "10");
    await mkdir(dir, { recursive: true });
    const real = join(home, "real.jsonl");
    await writeFile(real, `{"payload":{"id":"${ID}","cwd":"/x","originator":"codex-tui"}}\n`);
    await symlink(real, join(dir, `rollout-2026-10-10T10-11-42-${ID}.jsonl`));
    expect(await lookupCodexRecord(home, ID)).toBeNull();
    await rm(join(dir, `rollout-2026-10-10T10-11-42-${ID}.jsonl`));
    await link(real, join(dir, `rollout-2026-10-10T10-11-42-${ID}.jsonl`));
    expect(await lookupCodexRecord(home, ID)).toBeNull(); // リンクが 2 つ
  });
  it("日付のフォルダは新しい順に、見つかったら止める。maxDayDirs で見る数を縮められる", async () => {
    await writeRollout("2026/10/10", ID, "/new");
    for (let d = 1; d <= 9; d++) await mkdir(join(home, "sessions", "2026", "09", String(d).padStart(2, "0")), { recursive: true });
    await writeRollout("2026/09/01", "01a1234a-1768-7210-befd-023a395239b0", "/old");
    expect(await lookupCodexRecord(home, ID, 1)).toEqual({ cwd: "/new", originator: "codex-tui" });
    expect(await lookupCodexRecord(home, "01a1234a-1768-7210-befd-023a395239b0", 3)).toBeNull(); // 3 日では届かない
    expect(await lookupCodexRecord(home, "01a1234a-1768-7210-befd-023a395239b0")).toEqual({ cwd: "/old", originator: "codex-tui" });
  });
  it("isCodexSessionId", () => {
    expect(isCodexSessionId(ID)).toBe(true);
    expect(isCodexSessionId("abc")).toBe(false);
  });
});
