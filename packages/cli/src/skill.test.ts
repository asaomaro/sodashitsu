import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { USAGE_LINES } from "./cliArgs.js";
import { readSkill, runSkill, skillFilePath } from "./skill.js";

/**
 * skill ファイル（`packages/cli/skills/sodactl/SKILL.md`）と `sodactl skill`（20260926-agent-skill-file。AC2〜AC5）。
 * コマンドの食い違いの検査は `USAGE_LINES`（`sodactl help` の一覧と同じもの）を正とする。
 */

const SKILL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "skills",
  "sodactl",
  "SKILL.md",
);
const skill = readFileSync(SKILL_PATH, "utf8");

const GROUPS = new Set(["workspace", "tab", "pane", "agent", "graph"]);
/** 3 語のコマンドの 2 語目（`graph link add`・`graph node rm` 等。20260927-agent-graph）。 */
const SUBGROUPS = new Set(["graph link", "graph node"]);

/** `sodactl <語>`（グループなら `<語> <語>`、下位のグループなら 3 語）を、`USAGE_LINES` の 1 行の先頭のコマンドの形で返す。 */
function commandOf(words: readonly string[]): string {
  const [first, second, third] = words;
  if (first !== undefined && GROUPS.has(first)) {
    if (second === undefined) return first;
    const group = `${first} ${second}`;
    if (SUBGROUPS.has(group)) return third === undefined ? group : `${group} ${third}`;
    return group;
  }
  return first ?? "";
}

/** `USAGE_LINES` のコマンド（例 `pane split`・`snapshot`）と `help`。 */
const KNOWN = new Set([
  ...USAGE_LINES.map((line) => commandOf(line.split(/\s+/).slice(1))),
  "help",
]);

/** 本文の中の `sodactl` の後の英小文字の語（日本語の散文の「sodactl で」等は拾わない）。 */
function mentionedCommands(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /\bsodactl[ \t]+([a-z][a-z-]*)(?:[ \t]+([a-z][a-z-]*))?(?:[ \t]+([a-z][a-z-]*))?/g,
  )) {
    out.push(commandOf([m[1]!, ...[m[2], m[3]].filter((w): w is string => w !== undefined)]));
  }
  return out;
}

describe("skill ファイル", () => {
  it("front matter に name: sodactl と description がある（AC1）", () => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(skill);
    expect(fm).not.toBeNull();
    expect(fm![1]).toMatch(/^name: sodactl\r?$/m);
    expect(fm![1]).toMatch(/^description: .*SODA_PANE_ID/m);
  });

  it("最初の節で pane の中にいるかを確かめ、無ければ止まるよう指示する（AC2）", () => {
    const body = skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    const first = body.split(/\r?\n## /)[1] ?? "";
    expect(first).toContain('test -n "${SODA_PANE_ID:-}"');
    expect(first).toMatch(/止まる/);
  });

  it("本文の sodactl のコマンドはすべて sodactl に実在する（AC3）", () => {
    const mentioned = mentionedCommands(skill);
    expect(mentioned.length).toBeGreaterThan(20);
    expect(mentioned.filter((c) => !KNOWN.has(c))).toEqual([]);
  });

  it("sodactl の全コマンドが本文に出てくる（AC4）", () => {
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

  it("連携のグラフの節: 線の作り方・監督・承認の代理（delegate だけ答える）・上限・一時停止・--json（20260927-agent-graph の 05 T3。AC15・AC7）", () => {
    const section = /## 連携のグラフ[^\n]*\n([\s\S]*?)\n## /.exec(skill)?.[1] ?? "";
    expect(section).not.toBe("");
    for (const needle of [
      "sodactl graph link add",
      "--kind supervise",
      "sodactl graph link pause",
      "sodactl graph pause",
      "sodactl agent send-keys",
      "delegate",
      "notify",
      "--limit",
      "--json",
      "{output}",
      "sodactl --machine",
      "利用者の指示ではない",
    ]) {
      expect(section).toContain(needle);
    }
  });
});

describe("検査の規則そのもの", () => {
  it("存在しないコマンド・グループだけの言及を見つける", () => {
    expect(mentionedCommands("sodactl pane frobnicate と sodactl frob と sodactl agent")).toEqual([
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
  it("graph link・graph node は 3 語で数え、3 語目が無ければ下位のグループだけ（実在しない）", () => {
    expect(
      mentionedCommands("sodactl graph link add p1 p2・sodactl graph show・sodactl graph node"),
    ).toEqual(["graph link add", "graph show", "graph node"]);
    expect(KNOWN.has("graph link add")).toBe(true);
    expect(KNOWN.has("graph node")).toBe(false);
  });
  it("散文の「sodactl で」やオプションは拾わない", () => {
    expect(
      mentionedCommands(
        "`sodactl` は sodactl で操作する。sodactl snapshot | jq・sodactl login --url x",
      ),
    ).toEqual(["snapshot", "login"]);
  });
});

describe("sodactl skill（AC5）", () => {
  it("skillFilePath はパッケージの skills/sodactl/SKILL.md", () => {
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
