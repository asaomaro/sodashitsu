import { chmod, mkdtemp, readFile, realpath, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatusLineWrapper, statusLinePaths } from "./statusLineWrap.js";
import { appendMember, findMember, removeMember, scanTopObject } from "./statusLineEdit.js";

/** 20261010-agent-usage PR2 の AC3・AC6: 導入 → 外す で、設定のファイルが 1 バイトも違わず戻る。利用者の本物の `~/.claude` には触れない。 */

let work: string;
let cfg: string;
let script: string;

/** 守り: 試験が書く場所は、一時のフォルダの下で、利用者の本物の `~/.claude` の下でない。 */
function assertSandboxed(path: string): void {
  const real = join(homedir(), ".claude");
  expect(path.startsWith(real + sep) || path === real, `本物の ~/.claude の下に触れようとしている: ${path}`).toBe(false);
  expect(path.startsWith(`${work}${sep}`), `一時のフォルダの外: ${path}`).toBe(true);
}

beforeEach(async () => {
  work = await realpath(await mkdtemp(join(tmpdir(), "soda-statusline-")));
  cfg = join(work, "claude");
  await mkdir(cfg, { recursive: true });
  script = join(work, "bundled-soda-statusline.cjs");
  await writeFile(script, "// bundled v1\n");
});
afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

function make(platform: NodeJS.Platform = "linux"): StatusLineWrapper {
  const env = { CLAUDE_CONFIG_DIR: cfg } as NodeJS.ProcessEnv;
  const p = statusLinePaths(env, join(work, "home"));
  assertSandboxed(p.configFile);
  assertSandboxed(p.script);
  return new StatusLineWrapper(script, env, join(work, "home"), platform);
}
const settingsPath = (): string => join(cfg, "settings.json");

const CASES: { name: string; text: string }[] = [
  { name: "2 スペース・statusLine が最後・padding つき・末尾の改行", text: '{\n  "theme": "dark",\n  "statusLine": {\n    "type": "command",\n    "command": "node ~/.claude/statusline.js",\n    "padding": 2\n  }\n}\n' },
  { name: "4 スペース・statusLine が最初・refreshInterval つき・末尾の改行なし", text: '{\n    "statusLine": {\n        "type": "command",\n        "command": "echo hi",\n        "refreshInterval": 5\n    },\n    "model": "opus"\n}' },
  { name: "タブ・statusLine が途中", text: '{\n\t"a": 1,\n\t"statusLine": {"type": "command", "command": "x"},\n\t"b": [1, 2]\n}\n' },
  { name: "コンパクト（1 行）・statusLine が途中", text: '{"a":1,"statusLine":{"type":"command","command":"x"},"b":2}' },
  { name: "CRLF", text: '{\r\n  "a": 1,\r\n  "statusLine": {\r\n    "type": "command",\r\n    "command": "x"\r\n  }\r\n}\r\n' },
  { name: "BOM つき", text: '﻿{\n  "a": 1,\n  "statusLine": { "type": "command", "command": "x" }\n}\n' },
  { name: "元に statusLine が無い（項目は他にある）", text: '{\n  "theme": "dark",\n  "env": { "A": "1" }\n}\n' },
  { name: "元に statusLine が無い（コンパクト）", text: '{"theme":"dark"}' },
  { name: "元に statusLine が無い（空のオブジェクト）", text: "{}\n" },
  { name: "元に statusLine が無い（空の複数行）", text: "{\n}\n" },
  { name: "文字列の中に括弧・引用符を含む", text: '{\n  "note": "} { \\" statusLine",\n  "statusLine": { "type": "command", "command": "echo \\"}\\"" }\n}\n' },
];

describe("導入 → 外す で、設定のファイルが 1 バイトも違わず戻る", () => {
  for (const c of CASES) {
    it(c.name, async () => {
      await writeFile(settingsPath(), c.text);
      const w = make();
      const before = await w.status();
      expect(before.state).toBe("none");
      expect(await w.install()).toEqual({ ok: true, message: null });
      const installed = await readFile(settingsPath(), "utf8");
      expect(installed).not.toBe(c.text);
      const parsed = JSON.parse(installed.replace(/^﻿/, "")) as { statusLine: { type: string; command: string; padding?: number; refreshInterval?: number } };
      expect(parsed.statusLine.type).toBe("command");
      expect(parsed.statusLine.command).toContain("soda-statusline.cjs");
      // 利用者のほかのキーは、そのまま。padding・refreshInterval は、元のまま設定の側に残る。
      const orig = JSON.parse(c.text.replace(/^﻿/, "")) as { statusLine?: { padding?: number; refreshInterval?: number } } & Record<string, unknown>;
      if (orig.statusLine?.padding !== undefined) expect(parsed.statusLine.padding).toBe(orig.statusLine.padding);
      if (orig.statusLine?.refreshInterval !== undefined) expect(parsed.statusLine.refreshInterval).toBe(orig.statusLine.refreshInterval);
      for (const [k, v] of Object.entries(orig)) if (k !== "statusLine") expect((parsed as unknown as Record<string, unknown>)[k]).toEqual(v);
      expect((await w.status()).state).toBe("installed");
      expect(await w.uninstall()).toEqual({ ok: true, message: null });
      expect(await readFile(settingsPath(), "utf8")).toBe(c.text); // 1 バイトも違わない
      expect((await w.status()).state).toBe("none");
      expect(existsSync(statusLinePaths({ CLAUDE_CONFIG_DIR: cfg }, "").sidecar)).toBe(false);
    });
  }

  it("設定のファイルが無い: 導入するとファイルができ、外すと、ファイルごと無くなる", async () => {
    const w = make();
    expect(await w.install()).toEqual({ ok: true, message: null });
    expect(existsSync(settingsPath())).toBe(true);
    expect(JSON.parse(await readFile(settingsPath(), "utf8")).statusLine.type).toBe("command");
    expect(await w.uninstall()).toEqual({ ok: true, message: null });
    expect(existsSync(settingsPath())).toBe(false);
  });

  it("導入の後に、利用者が別のキーを足していても、外すと、statusLine だけが元に戻り、足したキーは残る", async () => {
    await writeFile(settingsPath(), '{\n  "statusLine": { "type": "command", "command": "orig" },\n  "a": 1\n}\n');
    const w = make();
    await w.install();
    const now = JSON.parse(await readFile(settingsPath(), "utf8"));
    now.added = true;
    await writeFile(settingsPath(), `${JSON.stringify(now, null, 2)}\n`);
    expect(await w.uninstall()).toEqual({ ok: true, message: null });
    const after = JSON.parse(await readFile(settingsPath(), "utf8"));
    expect(after).toEqual({ statusLine: { type: "command", command: "orig" }, a: 1, added: true });
  });
});

describe("元の控え（横のファイルと、command の引数）", () => {
  it("横のファイルが消えていても、設定のファイルだけで、元へ戻せる（引数から）", async () => {
    await writeFile(settingsPath(), '{\n  "statusLine": { "type": "command", "command": "node ~/.claude/statusline.js", "padding": 1 }\n}\n');
    const w = make();
    await w.install();
    await rm(statusLinePaths({ CLAUDE_CONFIG_DIR: cfg }, "").sidecar);
    expect(await w.uninstall()).toEqual({ ok: true, message: null });
    const after = JSON.parse(await readFile(settingsPath(), "utf8"));
    expect(after.statusLine).toEqual({ type: "command", command: "node ~/.claude/statusline.js", padding: 1 });
  });

  it("横のファイルは 0600（利用者と同じ権限でしか書けない）。元の statusLine のオブジェクト全体を持つ", async () => {
    await writeFile(settingsPath(), '{"statusLine":{"type":"command","command":"orig","padding":3,"refreshInterval":9}}');
    const w = make();
    await w.install();
    const side = statusLinePaths({ CLAUDE_CONFIG_DIR: cfg }, "").sidecar;
    expect((await stat(side)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(side, "utf8")).original).toEqual({ type: "command", command: "orig", padding: 3, refreshInterval: 9 });
  });
});

describe("利用者が、後から statusLine を替えたとき", () => {
  it("状態は「外れています」。外すは何もしない。導入は、今の値を新しい元として控える", async () => {
    await writeFile(settingsPath(), '{\n  "statusLine": { "type": "command", "command": "A" }\n}\n');
    const w = make();
    await w.install();
    const userNow = '{\n  "statusLine": { "type": "command", "command": "B-by-user" }\n}\n';
    await writeFile(settingsPath(), userNow);
    expect((await w.status()).state).toBe("detached");
    const u = await w.uninstall();
    expect(u.ok).toBe(true);
    expect(u.message).toContain("外れています");
    expect(await readFile(settingsPath(), "utf8")).toBe(userNow); // 何も変えない
    expect(await w.install()).toEqual({ ok: true, message: null });
    expect((await w.status()).state).toBe("installed");
    expect(await w.uninstall()).toEqual({ ok: true, message: null });
    expect(await readFile(settingsPath(), "utf8")).toBe(userNow); // 新しい元（B）が戻る
  });
});

describe("形が想定と違うとき・壊れているとき", () => {
  for (const [name, text] of [
    ["statusLine が文字列", '{"statusLine":"node x"}'],
    ["statusLine が配列", '{"statusLine":[1]}'],
    ["type が command でない", '{"statusLine":{"type":"static","text":"hi"}}'],
    ["command が文字列でない", '{"statusLine":{"type":"command","command":5}}'],
    ["JSON が壊れている", '{"statusLine": {'],
    ["配列", "[1,2]"],
  ] as const) {
    it(`${name}: 何も変えずに、理由を返す`, async () => {
      await writeFile(settingsPath(), text);
      const w = make();
      const r = await w.install();
      expect(r.ok).toBe(false);
      expect(r.message).toBeTruthy();
      expect(await readFile(settingsPath(), "utf8")).toBe(text);
      expect((await w.status()).state).toBe("invalid");
      expect(existsSync(statusLinePaths({ CLAUDE_CONFIG_DIR: cfg }, "").script)).toBe(false);
    });
  }
});

describe("スクリプトの更新・べき等・権限", () => {
  it("導入済みで、スクリプトが古い → 更新が必要。導入し直すと、スクリプトだけ更新し、設定は変えない", async () => {
    await writeFile(settingsPath(), '{"a":1}\n');
    const w = make();
    await w.install();
    const afterInstall = await readFile(settingsPath(), "utf8");
    await writeFile(script, "// bundled v2\n");
    expect((await w.status()).state).toBe("needs_update");
    expect((await w.install()).message).toContain("更新しました");
    expect(await readFile(settingsPath(), "utf8")).toBe(afterInstall);
    expect(await readFile(statusLinePaths({ CLAUDE_CONFIG_DIR: cfg }, "").script, "utf8")).toBe("// bundled v2\n");
    expect((await w.status()).state).toBe("installed");
  });

  it("2 回導入しても、何も変わらない", async () => {
    await writeFile(settingsPath(), '{"a":1}\n');
    const w = make();
    await w.install();
    const once = await readFile(settingsPath(), "utf8");
    expect(await w.install()).toEqual({ ok: true, message: "既に導入済みです" });
    expect(await readFile(settingsPath(), "utf8")).toBe(once);
  });

  it("設定のファイルのモードを保つ", async () => {
    await writeFile(settingsPath(), '{"a":1}\n');
    await chmod(settingsPath(), 0o640);
    const w = make();
    await w.install();
    expect((await stat(settingsPath())).mode & 0o777).toBe(0o640);
    await w.uninstall();
    expect((await stat(settingsPath())).mode & 0o777).toBe(0o640);
  });

  it("Windows は、導入しない", async () => {
    const w = make("win32");
    expect((await w.status()).state).toBe("unsupported");
    expect((await w.install()).ok).toBe(false);
  });

  it("プロジェクトの設定（.claude/settings.json）には触らない: 設定のフォルダの外に書かない", async () => {
    const proj = join(work, "proj", ".claude");
    await mkdir(proj, { recursive: true });
    await writeFile(join(proj, "settings.json"), '{"statusLine":{"type":"command","command":"proj"}}');
    const w = make();
    await w.install();
    expect(await readFile(join(proj, "settings.json"), "utf8")).toBe('{"statusLine":{"type":"command","command":"proj"}}');
  });
});

describe("statusLineEdit（部品）", () => {
  it("項目の位置を数える（文字列の中の括弧・重複キー・入れ子）", () => {
    const t = '{"a":{"x":"}"},"statusLine":1,"statusLine":{"k":[1,{"z":2}]}}';
    const o = scanTopObject(t)!;
    expect(o.members.map((m) => m.key)).toEqual(["a", "statusLine", "statusLine"]);
    const last = findMember(o, "statusLine")!;
    expect(t.slice(last.valueStart, last.valueEnd)).toBe('{"k":[1,{"z":2}]}');
  });
  it("足す → 消す で、元の文字列に戻る", () => {
    for (const t of ['{"a":1}', '{\n  "a": 1,\n  "b": [1,2]\n}\n', '{\n\t"a": 1\n}']) {
      const o = scanTopObject(t)!;
      const added = appendMember(t, o, "statusLine", { type: "command", command: "x" });
      const o2 = scanTopObject(added)!;
      expect(removeMember(added, o2, findMember(o2, "statusLine")!)).toBe(t);
    }
  });
  it("壊れた入力は null", () => {
    for (const t of ["", "[]", '{"a"', '{"a":}', '{"a":1,}', '{"a":1} x', "nul"]) expect(scanTopObject(t), t).toBeNull();
  });
});
