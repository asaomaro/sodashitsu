import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { USAGE_LINES } from "./cliArgs.js";
import { readSkill, runSkill, skillFilePath } from "./skill.js";

/**
 * skill ファイル（`packages/cli/skills/wtmctl/SKILL.md`）と `wtmctl skill`（20260926-agent-skill-file。AC2〜AC5）。
 * コマンドの食い違いの検査は `USAGE_LINES`（`wtmctl help` の一覧と同じもの）を正とする。
 */

const SKILL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "skills",
  "wtmctl",
  "SKILL.md",
);
const skill = readFileSync(SKILL_PATH, "utf8");

const GROUPS = new Set(["workspace", "tab", "pane", "agent"]);

/** `wtmctl <語>`（グループなら `<語> <語>`）を、`USAGE_LINES` の 1 行の先頭のコマンドの形で返す。 */
function commandOf(words: readonly string[]): string {
  const [first, second] = words;
  if (first !== undefined && GROUPS.has(first))
    return second === undefined ? first : `${first} ${second}`;
  return first ?? "";
}

/** `USAGE_LINES` のコマンド（例 `pane split`・`snapshot`）と `help`。 */
const KNOWN = new Set([
  ...USAGE_LINES.map((line) => commandOf(line.split(/\s+/).slice(1))),
  "help",
]);

/** 本文の中の `wtmctl` の後の英小文字の語（日本語の散文の「wtmctl で」等は拾わない）。 */
function mentionedCommands(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bwtmctl[ \t]+([a-z][a-z-]*)(?:[ \t]+([a-z][a-z-]*))?/g)) {
    out.push(commandOf([m[1]!, ...(m[2] === undefined ? [] : [m[2]])]));
  }
  return out;
}

describe("skill ファイル", () => {
  it("front matter に name: wtmctl と description がある（AC1）", () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(skill);
    expect(fm).not.toBeNull();
    expect(fm![1]).toMatch(/^name: wtmctl\r?$/m);
    expect(fm![1]).toMatch(/^description: .*WTM_PANE_ID/m);
  });

  it("最初の節で pane の中にいるかを確かめ、無ければ止まるよう指示する（AC2）", () => {
    const body = skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    const first = body.split(/\r?\n## /)[1] ?? "";
    expect(first).toContain('test -n "${WTM_PANE_ID:-}"');
    expect(first).toMatch(/止まる/);
  });

  it("本文の wtmctl のコマンドはすべて wtmctl に実在する（AC3）", () => {
    const mentioned = mentionedCommands(skill);
    expect(mentioned.length).toBeGreaterThan(20);
    expect(mentioned.filter((c) => !KNOWN.has(c))).toEqual([]);
  });

  it("wtmctl の全コマンドが本文に出てくる（AC4）", () => {
    const mentioned = new Set(mentionedCommands(skill));
    const commands = [...KNOWN].filter((c) => c !== "help");
    expect(commands.length).toBe(USAGE_LINES.length);
    expect(commands.filter((c) => !mentioned.has(c))).toEqual([]);
  });

  it("self_target の歯止めの 9 コマンドを挙げる（FR1 (h)）", () => {
    for (const c of [
      "pane close",
      "pane input",
      "pane run",
      "pane attach",
      "tab close",
      "workspace close",
      "agent prompt",
      "agent send-keys",
      "agent start",
    ]) {
      expect(skill).toContain(`\`${c}\``);
    }
    expect(skill).toContain("self_target");
  });
});

describe("検査の規則そのもの", () => {
  it("存在しないコマンド・グループだけの言及を見つける", () => {
    expect(mentionedCommands("wtmctl pane frobnicate と wtmctl frob と wtmctl agent")).toEqual([
      "pane frobnicate",
      "frob",
      "agent",
    ]);
    expect(["pane frobnicate", "frob", "agent"].filter((c) => !KNOWN.has(c))).toEqual([
      "pane frobnicate",
      "frob",
      "agent",
    ]);
  });
  it("散文の「wtmctl で」やオプションは拾わない", () => {
    expect(
      mentionedCommands(
        "`wtmctl` は wtmctl で操作する。wtmctl snapshot | jq・wtmctl login --url x",
      ),
    ).toEqual(["snapshot", "login"]);
  });
});

describe("wtmctl skill（AC5）", () => {
  it("skillFilePath はパッケージの skills/wtmctl/SKILL.md", () => {
    expect(skillFilePath()).toBe(SKILL_PATH);
  });
  it("readSkill はファイルの内容そのもの・runSkill はそれを改行を足さずに書く", async () => {
    expect(await readSkill()).toBe(skill);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await runSkill();
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(skill);
    } finally {
      write.mockRestore();
    }
  });
});
