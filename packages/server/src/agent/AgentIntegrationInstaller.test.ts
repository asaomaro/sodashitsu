import { chmod, lstat, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import {
  AGENT_INTEGRATION_KINDS,
  FsAgentIntegrationInstaller,
  devinUserConfigDir,
  isAgentIntegrationKind,
} from "./AgentIntegrationInstaller.js";

// テストは常に `CLAUDE_CONFIG_DIR`/`CODEX_HOME` を一時ディレクトリへ向け、実際の
// `~/.claude`/`~/.codex` には一切触れない（このテストが誤って利用者の環境を書き換えないため）。

describe("FsAgentIntegrationInstaller", () => {
  let workDir: string;
  let hookScriptSource: string;
  let claudeDir: string;
  let codexDir: string;

  beforeEach(async () => {
    workDir = await makeTempDir("soda-integration-installer-");
    hookScriptSource = join(workDir, "agent-hook-report.cjs");
    await writeFile(hookScriptSource, "// fake hook script\n");
    claudeDir = join(workDir, "claude-home");
    codexDir = join(workDir, "codex-home");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function makeInstaller(env: Partial<NodeJS.ProcessEnv> = {}) {
    return new FsAgentIntegrationInstaller(
      hookScriptSource,
      { PATH: "", CLAUDE_CONFIG_DIR: claudeDir, CODEX_HOME: codexDir, ...env } as NodeJS.ProcessEnv,
      join(workDir, "unused-home"),
    );
  }

  it("reports not installed / cliDetected false before anything is set up", async () => {
    const installer = makeInstaller();
    expect(await installer.status("claude")).toEqual({
      cliDetected: false,
      installed: false,
      needsUpdate: false,
    });
  });

  it("installs into a fresh (missing) settings.json for Claude Code", async () => {
    const installer = makeInstaller();
    const result = await installer.install("claude");
    expect(result).toEqual({ ok: true, message: null });

    const status = await installer.status("claude");
    expect(status.installed).toBe(true);

    const settings = JSON.parse(await readFile(join(claudeDir, "settings.json"), "utf8"));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain("soda-agent-report.cjs");
    expect(settings.hooks.SessionStart[0].hooks[0].command).toContain("claude");
    expect(settings.hooks.SessionStart[0].hooks[0].async).toBe(true);
    // サブエージェントの表示（20261004-subagent-display）のフックも入る。SessionStart と合わせて 6 つ。
    expect(Object.keys(settings.hooks).sort()).toEqual([
      "PreToolUse",
      "SessionEnd",
      "SessionStart",
      "Stop",
      "SubagentStart",
      "SubagentStop",
    ]);
    expect(status.needsUpdate).toBe(false);

    // hook スクリプトが実際にコピーされている
    const copied = await readFile(join(claudeDir, "hooks", "soda-agent-report.cjs"), "utf8");
    expect(copied).toContain("fake hook script");
  });

  it("installs into the dedicated hooks.json for Codex without touching config.toml", async () => {
    const installer = makeInstaller();
    const result = await installer.install("codex");
    expect(result).toEqual({ ok: true, message: null });

    const hooksJson = JSON.parse(await readFile(join(codexDir, "hooks.json"), "utf8"));
    expect(hooksJson.hooks.SessionStart[0].hooks[0].command).toContain("codex");
  });

  it("is idempotent: installing twice does not duplicate the entry", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    const second = await installer.install("claude");
    expect(second).toEqual({ ok: true, message: "既に導入済みです" });

    const settings = JSON.parse(await readFile(join(claudeDir, "settings.json"), "utf8"));
    expect(settings.hooks.SessionStart).toHaveLength(1);
  });

  it("preserves unrelated existing settings and hooks (non-destructive merge)", async () => {
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        someOtherSetting: true,
        hooks: {
          SessionStart: [{ matcher: "compact", hooks: [{ type: "command", command: "echo hi" }] }],
        },
      }),
    );
    const installer = makeInstaller();
    await installer.install("claude");

    const settings = JSON.parse(await readFile(join(claudeDir, "settings.json"), "utf8"));
    expect(settings.someOtherSetting).toBe(true);
    expect(settings.hooks.SessionStart).toHaveLength(2);
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("echo hi");
  });

  it("refuses to write over a corrupt settings.json", async () => {
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, "settings.json"), "{ not json");
    const installer = makeInstaller();

    const result = await installer.install("claude");
    expect(result.ok).toBe(false);
    expect(await readFile(join(claudeDir, "settings.json"), "utf8")).toBe("{ not json");
  });

  it("uninstall removes only our entries from every path, leaving other hooks intact, and blanks the copied script", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    await mkdir(join(claudeDir, "hooks"), { recursive: true });
    const settingsPath = join(claudeDir, "settings.json");
    const before = JSON.parse(await readFile(settingsPath, "utf8"));
    const userHook = { matcher: "compact", hooks: [{ type: "command", command: "echo hi" }] };
    before.hooks.SessionStart.push(userHook);
    before.hooks.Stop.unshift(userHook);
    await writeFile(settingsPath, JSON.stringify(before));

    const result = await installer.uninstall("claude");
    expect(result).toEqual({ ok: true, message: null });

    const after = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(after.hooks.SessionStart).toEqual([userHook]);
    expect(after.hooks.Stop).toEqual([userHook]);
    for (const ev of ["PreToolUse", "SubagentStart", "SubagentStop", "SessionEnd"])
      expect(after.hooks, ev).not.toHaveProperty(ev); // 自分のエントリだけで空になった経路は、キーごと消える
    expect(await installer.status("claude")).toMatchObject({
      installed: false,
      needsUpdate: false,
    });
    // 動いている Claude Code が古いフックのまま呼び続けても失敗しないよう、消さずに何もしない中身へ差し替える（decisions D9）。
    const script = await readFile(join(claudeDir, "hooks", "soda-agent-report.cjs"), "utf8");
    expect(script).not.toContain("fake hook script");
    expect(script).toContain("何もしません");
  });

  it("uninstall: 元から空だった経路（自分のエントリが無かった経路）と、利用者のエントリが残る経路は触らない", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    const settingsPath = join(claudeDir, "settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    settings.hooks.Notification = []; // 元から空だった経路（本製品のものではない）
    settings.hooks.Stop.push({ matcher: "", hooks: [{ type: "command", command: "echo mine" }] });
    await writeFile(settingsPath, JSON.stringify(settings));
    await installer.uninstall("claude");
    const after = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(after.hooks.Notification).toEqual([]);
    expect(after.hooks.Stop).toEqual([
      { matcher: "", hooks: [{ type: "command", command: "echo mine" }] },
    ]);
    expect(after.hooks).not.toHaveProperty("PreToolUse");
  });

  it("uninstall は SessionStart のエントリだけを手で消した状態からも、残りの経路から外す", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    const settingsPath = join(claudeDir, "settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf8"));
    settings.hooks.SessionStart = [];
    await writeFile(settingsPath, JSON.stringify(settings));
    expect(await installer.uninstall("claude")).toEqual({ ok: true, message: null });
    const after = JSON.parse(await readFile(settingsPath, "utf8"));
    for (const ev of ["PreToolUse", "SubagentStart", "Stop", "SubagentStop", "SessionEnd"])
      expect(after.hooks, ev).not.toHaveProperty(ev); // 自分のエントリだけで空になった経路は、キーごと消える
  });

  it("uninstall の後に install し直すと、本物のスクリプトに写し直される", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    await installer.uninstall("claude");
    expect(await installer.install("claude")).toEqual({ ok: true, message: null });
    expect(await readFile(join(claudeDir, "hooks", "soda-agent-report.cjs"), "utf8")).toContain(
      "fake hook script",
    );
    expect(await installer.status("claude")).toMatchObject({ installed: true, needsUpdate: false });
  });

  it("追加のエントリを持たない kind（codex）の uninstall は、今までどおりスクリプトを消す", async () => {
    const installer = makeInstaller();
    await installer.install("codex");
    expect(await installer.uninstall("codex")).toEqual({ ok: true, message: null });
    await expect(readFile(join(codexDir, "hooks", "soda-agent-report.cjs"))).rejects.toThrow();
  });

  it("uninstall reports 未導入 when nothing was installed", async () => {
    const installer = makeInstaller();
    expect(await installer.uninstall("claude")).toEqual({ ok: true, message: "未導入でした" });
  });
});

// 20261004-subagent-display。導入済みの利用者には、足りないフックを［更新］で足す（押すまで設定ファイルは書き換えない）。
describe("FsAgentIntegrationInstaller — Claude Code のフックの追加と更新", () => {
  let workDir: string;
  let hookScriptSource: string;
  let claudeDir: string;
  let settingsPath: string;
  let installedScript: string;

  beforeEach(async () => {
    workDir = await makeTempDir("soda-integration-update-");
    hookScriptSource = join(workDir, "agent-hook-report.cjs");
    await writeFile(hookScriptSource, "// new hook script\n");
    claudeDir = join(workDir, "claude-home");
    settingsPath = join(claudeDir, "settings.json");
    installedScript = join(claudeDir, "hooks", "soda-agent-report.cjs");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  const makeInstaller = (source = hookScriptSource) =>
    new FsAgentIntegrationInstaller(
      source,
      { PATH: "", CLAUDE_CONFIG_DIR: claudeDir } as NodeJS.ProcessEnv,
      join(workDir, "unused-home"),
    );

  /** 旧版（SessionStart だけ）の導入済みの状態を作る。 */
  async function installOldVersion(extraHooks: Record<string, unknown> = {}): Promise<void> {
    await mkdir(join(claudeDir, "hooks"), { recursive: true });
    await writeFile(installedScript, "// old hook script\n");
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup|resume",
              hooks: [
                { type: "command", command: `node "${installedScript}" claude`, async: true },
              ],
            },
          ],
          ...extraHooks,
        },
      }),
    );
  }
  const readSettings = async () => JSON.parse(await readFile(settingsPath, "utf8"));

  it("追加のエントリの形: PreToolUse・SubagentStart・Stop は同期（timeout 5）、SubagentStop・SessionEnd は async", async () => {
    await makeInstaller().install("claude");
    const { hooks } = await readSettings();
    expect(hooks.PreToolUse).toEqual([
      {
        matcher: "Agent|Task",
        hooks: [{ type: "command", command: `node "${installedScript}" claude`, timeout: 5 }],
      },
    ]);
    for (const ev of ["SubagentStart", "Stop"]) {
      expect(hooks[ev]).toEqual([
        {
          matcher: "",
          hooks: [{ type: "command", command: `node "${installedScript}" claude`, timeout: 5 }],
        },
      ]);
    }
    for (const ev of ["SubagentStop", "SessionEnd"]) {
      expect(hooks[ev]).toEqual([
        {
          matcher: "",
          hooks: [{ type: "command", command: `node "${installedScript}" claude`, async: true }],
        },
      ]);
    }
  });

  it("claude の SessionStart の matcher は fork・clear・compact も拾う。matcher だけ古い導入済みは「更新が必要」になり、［更新］で matcher だけ直る（20261009-agent-fork T0b）", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    const fresh = await readSettings();
    expect(fresh.hooks.SessionStart[0].matcher).toBe("startup|resume|fork|clear|compact");
    // 空の matcher にはしない（知らない source を黙って拾わない）。
    expect(fresh.hooks.SessionStart[0].matcher).not.toBe("");
    // matcher だけ古い（ほかは最新）: 利用者のほかの SessionStart のフックは保つ。
    const mine = { matcher: "compact", hooks: [{ type: "command", command: "echo mine" }] };
    fresh.hooks.SessionStart[0].matcher = "startup|resume";
    fresh.hooks.SessionStart.push(mine);
    await writeFile(settingsPath, JSON.stringify(fresh));
    expect(await installer.status("claude")).toMatchObject({ installed: true, needsUpdate: true });
    expect(await installer.install("claude")).toEqual({ ok: true, message: null });
    expect(await installer.status("claude")).toMatchObject({ installed: true, needsUpdate: false });
    const after = await readSettings();
    expect(after.hooks.SessionStart).toHaveLength(2);
    expect(after.hooks.SessionStart[0].matcher).toBe("startup|resume|fork|clear|compact");
    expect(after.hooks.SessionStart[1]).toEqual(mine);
  });

  it("旧版の導入済み → needsUpdate が true → install で更新される（スクリプトを写し直し、足りない分だけ足す）", async () => {
    await installOldVersion();
    const installer = makeInstaller();
    expect(await installer.status("claude")).toMatchObject({ installed: true, needsUpdate: true });
    expect(await installer.install("claude")).toEqual({ ok: true, message: null });
    expect(await installer.status("claude")).toMatchObject({ installed: true, needsUpdate: false });
    const { hooks } = await readSettings();
    expect(hooks.SessionStart).toHaveLength(1); // 重ねない
    expect(Object.keys(hooks)).toHaveLength(6);
    expect(await readFile(installedScript, "utf8")).toBe("// new hook script\n");
    expect(await installer.install("claude")).toEqual({ ok: true, message: "既に導入済みです" });
  });

  it("status() は設定ファイルを書き換えない（押すまで）", async () => {
    await installOldVersion();
    const before = await readFile(settingsPath, "utf8");
    await makeInstaller().status("claude");
    expect(await readFile(settingsPath, "utf8")).toBe(before);
    expect(await readFile(installedScript, "utf8")).toBe("// old hook script\n");
  });

  it("エントリは揃っているがスクリプトが古い／無い → needsUpdate が true。install で写し直す", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    await writeFile(installedScript, "// stale\n");
    expect((await installer.status("claude")).needsUpdate).toBe(true);
    await rm(installedScript);
    expect((await installer.status("claude")).needsUpdate).toBe(true);
    await installer.install("claude");
    expect(await readFile(installedScript, "utf8")).toBe("// new hook script\n");
    expect((await installer.status("claude")).needsUpdate).toBe(false);
  });

  it("利用者の既存の PreToolUse・Stop 等のフックを保つ", async () => {
    const mine = { matcher: "Bash", hooks: [{ type: "command", command: "echo mine" }] };
    await installOldVersion({ PreToolUse: [mine], Stop: [mine] });
    await makeInstaller().install("claude");
    const { hooks } = await readSettings();
    expect(hooks.PreToolUse).toHaveLength(2);
    expect(hooks.PreToolUse[0]).toEqual(mine);
    expect(hooks.Stop).toHaveLength(2);
    expect(hooks.Stop[0]).toEqual(mine);
  });

  it("SessionStart のエントリだけを手で消した状態: installed は false。install で全部が揃い、重ならない", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    const settings = await readSettings();
    settings.hooks.SessionStart = [];
    await writeFile(settingsPath, JSON.stringify(settings));
    expect(await installer.status("claude")).toMatchObject({
      installed: false,
      needsUpdate: false,
    });
    await installer.install("claude");
    const { hooks } = await readSettings();
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(1);
  });

  it("同梱のスクリプトが読めないときは needsUpdate を出さない（押しても直らない）", async () => {
    await installOldVersion();
    expect((await makeInstaller(join(workDir, "missing.cjs")).status("claude")).needsUpdate).toBe(
      false,
    );
  });

  it("経路の値が配列でないときは、何も変えずに断る", async () => {
    await installOldVersion({ PreToolUse: { not: "an array" } });
    const before = await readFile(settingsPath, "utf8");
    const result = await makeInstaller().install("claude");
    expect(result.ok).toBe(false);
    expect(await readFile(settingsPath, "utf8")).toBe(before);
    expect(await readFile(installedScript, "utf8")).toBe("// old hook script\n");
  });

  it("経路の値が配列でないとき、押しても直らない「更新が必要」を出さない", async () => {
    await installOldVersion({ Stop: { not: "an array" } });
    expect(await makeInstaller().status("claude")).toMatchObject({
      installed: true,
      needsUpdate: false,
    });
  });

  it("hooks 自体がオブジェクトでないときも、何も変えずに断る", async () => {
    await mkdir(claudeDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ hooks: [] }));
    const result = await makeInstaller().install("claude");
    expect(result.ok).toBe(false);
    expect(await readFile(settingsPath, "utf8")).toBe(JSON.stringify({ hooks: [] }));
  });

  it("ほかの 7 種は追加のエントリを持たず、needsUpdate は常に false", async () => {
    const home = join(workDir, "other-home");
    const installer = new FsAgentIntegrationInstaller(
      hookScriptSource,
      { PATH: "", CODEX_HOME: join(workDir, "codex") } as NodeJS.ProcessEnv,
      home,
    );
    for (const kind of ["codex", "cursor", "copilot", "devin", "droid", "grok", "qwen"] as const) {
      await installer.install(kind);
      expect(await installer.status(kind)).toMatchObject({ installed: true, needsUpdate: false });
    }
    const codex = JSON.parse(await readFile(join(workDir, "codex", "hooks.json"), "utf8"));
    expect(Object.keys(codex.hooks)).toEqual(["SessionStart"]);
  });
});

// 20260923-other-agents-session-resume（design「8 kind の HookSpec 一覧」・research.md F4）。
// 6エージェントとも設定ファイルの構造・hook エントリの形が異なるため、各 kind ごとに
// 「書き込み内容が research F4 の表と一致するか」を確認する最小セット（fresh install・idempotent・
// uninstall）で検証する。ホームディレクトリは一時ディレクトリへ差し替える（`home` 引数。実際の
// `~/.cursor` 等には一切触れない）。
describe("FsAgentIntegrationInstaller — 6エージェントの追加分", () => {
  let workDir: string;
  let hookScriptSource: string;
  let home: string;

  beforeEach(async () => {
    workDir = await makeTempDir("soda-integration-installer-other-");
    hookScriptSource = join(workDir, "agent-hook-report.cjs");
    await writeFile(hookScriptSource, "// fake hook script\n");
    home = join(workDir, "home");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function makeInstaller() {
    return new FsAgentIntegrationInstaller(
      hookScriptSource,
      { PATH: "" } as NodeJS.ProcessEnv,
      home,
    );
  }

  it("cursor: installs a flat entry under hooks.sessionStart (lowercase, no hooks[] nesting)", async () => {
    const installer = makeInstaller();
    expect(await installer.install("cursor")).toEqual({ ok: true, message: null });

    const settings = JSON.parse(await readFile(join(home, ".cursor", "hooks.json"), "utf8"));
    expect(settings.hooks.sessionStart).toHaveLength(1);
    const entry = settings.hooks.sessionStart[0];
    expect(entry.command).toContain("soda-agent-report.cjs");
    expect(entry.command).toContain("cursor");
    expect(entry.hooks).toBeUndefined(); // ネスト無し（research F4）

    expect(await installer.install("cursor")).toEqual({ ok: true, message: "既に導入済みです" });
    const status = await installer.status("cursor");
    expect(status.installed).toBe(true);

    expect(await installer.uninstall("cursor")).toEqual({ ok: true, message: null });
    const after = JSON.parse(await readFile(join(home, ".cursor", "hooks.json"), "utf8"));
    expect(after.hooks).not.toHaveProperty("sessionStart"); // 自分のエントリだけで空になった経路は、キーごと消える
  });

  it("copilot: writes a dedicated file in the hooks directory and never touches other *.json files there", async () => {
    const hooksDir = join(home, ".copilot", "hooks");
    await mkdir(hooksDir, { recursive: true });
    await writeFile(
      join(hooksDir, "someone-elses-hook.json"),
      JSON.stringify({ hooks: { preToolUse: ["untouched"] } }),
    );

    const installer = makeInstaller();
    expect(await installer.install("copilot")).toEqual({ ok: true, message: null });

    const dedicated = JSON.parse(await readFile(join(hooksDir, "soda-agent-report.json"), "utf8"));
    expect(dedicated.hooks.sessionStart).toHaveLength(1);
    const entry = dedicated.hooks.sessionStart[0];
    expect(entry.bash).toContain("soda-agent-report.cjs");
    expect(entry.powershell).toContain("soda-agent-report.cjs");
    expect(entry.timeoutSec).toBe(10);

    // 既存の他のファイルは無変更
    const others = JSON.parse(await readFile(join(hooksDir, "someone-elses-hook.json"), "utf8"));
    expect(others).toEqual({ hooks: { preToolUse: ["untouched"] } });

    expect(await installer.install("copilot")).toEqual({ ok: true, message: "既に導入済みです" });
  });

  it("devin: installs into config.json's hooks.SessionStart (nested, timeout not async)", async () => {
    const installer = makeInstaller();
    expect(await installer.install("devin")).toEqual({ ok: true, message: null });

    const cfgDir = join(home, ".config", "devin");
    const settings = JSON.parse(await readFile(join(cfgDir, "config.json"), "utf8"));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    expect(settings.SessionStart).toBeUndefined();
    const entry = settings.hooks.SessionStart[0];
    expect(entry.matcher).toBe("");
    expect(entry.hooks[0].type).toBe("command");
    expect(entry.hooks[0].command).toContain("soda-agent-report.cjs");
    expect(entry.hooks[0].command).toContain("devin");
    expect(entry.hooks[0].timeout).toBe(10);
    expect(entry.hooks[0].async).toBeUndefined();
    expect(await readFile(join(cfgDir, "hooks", "soda-agent-report.cjs"), "utf8")).toContain(
      "fake",
    );

    expect(await installer.uninstall("devin")).toEqual({ ok: true, message: null });
    await expect(stat(join(cfgDir, "hooks", "soda-agent-report.cjs"))).rejects.toThrow();
  });

  it("devin: ignores DEVIN_CONFIG_DIR for new installs (documented location only)", async () => {
    const override = join(workDir, "devin-override");
    const installer = new FsAgentIntegrationInstaller(
      hookScriptSource,
      { PATH: "", DEVIN_CONFIG_DIR: override } as NodeJS.ProcessEnv,
      home,
    );
    await installer.install("devin");
    const settings = JSON.parse(
      await readFile(join(home, ".config", "devin", "config.json"), "utf8"),
    );
    expect(settings.hooks.SessionStart).toHaveLength(1);
    await expect(stat(override)).rejects.toThrow();
  });

  it("droid: installs at a top-level SessionStart key (same shape as devin, different path)", async () => {
    const installer = makeInstaller();
    expect(await installer.install("droid")).toEqual({ ok: true, message: null });

    const settings = JSON.parse(await readFile(join(home, ".factory", "hooks.json"), "utf8"));
    expect(settings.SessionStart).toHaveLength(1);
    expect(settings.SessionStart[0].hooks[0].command).toContain("droid");
  });

  it("grok: writes a dedicated file with a nested entry under hooks.SessionStart (no matcher)", async () => {
    const hooksDir = join(home, ".grok", "hooks");
    await mkdir(hooksDir, { recursive: true });
    await writeFile(join(hooksDir, "unrelated.json"), JSON.stringify({ some: "thing" }));

    const installer = makeInstaller();
    expect(await installer.install("grok")).toEqual({ ok: true, message: null });

    const dedicated = JSON.parse(await readFile(join(hooksDir, "soda-agent-report.json"), "utf8"));
    expect(dedicated.hooks.SessionStart).toHaveLength(1);
    const entry = dedicated.hooks.SessionStart[0];
    expect(entry.hooks).toHaveLength(1);
    expect(entry.hooks[0]).toEqual({
      type: "command",
      command: expect.stringMatching(/soda-agent-report\.cjs.* grok$/),
      timeout: 10,
    });
    expect(entry.matcher).toBeUndefined();
    expect(entry.command).toBeUndefined();
    expect(entry.type).toBeUndefined();

    const unrelated = JSON.parse(await readFile(join(hooksDir, "unrelated.json"), "utf8"));
    expect(unrelated).toEqual({ some: "thing" });
  });

  it("qwen: installs a flat entry under hooks.SessionStart with async:true", async () => {
    const installer = makeInstaller();
    expect(await installer.install("qwen")).toEqual({ ok: true, message: null });

    const settings = JSON.parse(await readFile(join(home, ".qwen", "settings.json"), "utf8"));
    expect(settings.hooks.SessionStart).toHaveLength(1);
    const entry = settings.hooks.SessionStart[0];
    expect(entry.command).toContain("soda-agent-report.cjs");
    expect(entry.name).toBe("soda-agent-report");
    expect(entry.async).toBe(true);
  });

  it("uninstall leaves other kinds' entries untouched when they happen to share no state (per-kind isolation)", async () => {
    const installer = makeInstaller();
    await installer.install("droid");
    await installer.install("devin");
    await installer.uninstall("droid");
    expect((await installer.status("droid")).installed).toBe(false);
    expect((await installer.status("devin")).installed).toBe(true);
  });
});

// 20261007-agent-hook-drift: 以前の版が入れた形・場所の検出と入れ直し。
describe("FsAgentIntegrationInstaller — 古い形・場所の移行（agent-hook-drift）", () => {
  let workDir: string;
  let hookScriptSource: string;
  let home: string;

  beforeEach(async () => {
    workDir = await makeTempDir("soda-integration-installer-legacy-");
    hookScriptSource = join(workDir, "agent-hook-report.cjs");
    await writeFile(hookScriptSource, "// fake hook script\n");
    home = join(workDir, "home");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function makeInstaller(env: Partial<NodeJS.ProcessEnv> = {}) {
    return new FsAgentIntegrationInstaller(
      hookScriptSource,
      { PATH: "", ...env } as NodeJS.ProcessEnv,
      home,
    );
  }

  const exists = (p: string) =>
    stat(p).then(
      () => true,
      () => false,
    );

  // --- grok（同じファイルの平らな形） ---
  const grokFile = () => join(home, ".grok", "hooks", "soda-agent-report.json");
  async function putFlatGrok(): Promise<string> {
    const flat = JSON.stringify({
      hooks: {
        SessionStart: [
          {
            matcher: "",
            type: "command",
            command: `node "${join(home, ".grok", "hooks", "soda-agent-report.cjs")}" grok`,
            timeout: 10,
          },
        ],
      },
    });
    await mkdir(join(home, ".grok", "hooks"), { recursive: true });
    await writeFile(grokFile(), flat);
    await writeFile(join(home, ".grok", "hooks", "soda-agent-report.cjs"), "// old\n");
    return flat;
  }

  it("grok: 平らな形は installed かつ needsUpdate で、status は何も書かない", async () => {
    const flat = await putFlatGrok();
    const installer = makeInstaller();
    expect(await installer.status("grok")).toMatchObject({ installed: true, needsUpdate: true });
    expect(await readFile(grokFile(), "utf8")).toBe(flat);
  });

  it("grok: install で入れ子に入れ直し、2 回目は既に導入済み", async () => {
    await putFlatGrok();
    const installer = makeInstaller();
    expect(await installer.install("grok")).toEqual({
      ok: true,
      message: "古い形のフックを、現行の形に入れ直しました",
    });
    const root = JSON.parse(await readFile(grokFile(), "utf8"));
    expect(root.hooks.SessionStart).toHaveLength(1);
    expect(root.hooks.SessionStart[0].hooks).toHaveLength(1);
    expect(root.hooks.SessionStart[0].command).toBeUndefined();
    expect(await installer.status("grok")).toMatchObject({ installed: true, needsUpdate: false });
    expect(await installer.install("grok")).toEqual({ ok: true, message: "既に導入済みです" });
  });

  it("grok: 平らな形のままの uninstall で、エントリもスクリプトも消える", async () => {
    await putFlatGrok();
    const installer = makeInstaller();
    expect(await installer.uninstall("grok")).toEqual({ ok: true, message: null });
    const root = JSON.parse(await readFile(grokFile(), "utf8"));
    expect(root.hooks?.SessionStart).toBeUndefined();
    expect(await exists(join(home, ".grok", "hooks", "soda-agent-report.cjs"))).toBe(false);
    expect((await installer.status("grok")).installed).toBe(false);
  });

  // --- devin ---
  const newCfg = () => join(home, ".config", "devin", "config.json");
  const legacyEntry = (dir: string) => ({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: `node "${join(dir, "hooks", "soda-agent-report.cjs")}" devin`,
        timeout: 10,
      },
    ],
  });
  async function putLegacyDevin(dir: string, extra: Record<string, unknown> = {}) {
    await mkdir(join(dir, "hooks"), { recursive: true });
    const root = { SessionStart: [legacyEntry(dir)], ...extra };
    await writeFile(join(dir, "hooks.json"), JSON.stringify(root));
    await writeFile(join(dir, "hooks", "soda-agent-report.cjs"), "// old\n");
    return root;
  }

  it("devin: 利用者の config.json の他のキーを保って導入し、解除で元に戻る", async () => {
    const original = {
      agent: { model: "x" },
      permissions: { allow: ["a"] },
      hooks: {
        PreToolUse: [{ matcher: "exec", hooks: [{ type: "command", command: "./mine.sh" }] }],
      },
    };
    await mkdir(join(home, ".config", "devin"), { recursive: true });
    await writeFile(newCfg(), JSON.stringify(original));
    const installer = makeInstaller();
    await installer.install("devin");
    const after = JSON.parse(await readFile(newCfg(), "utf8"));
    expect(after.agent).toEqual(original.agent);
    expect(after.permissions).toEqual(original.permissions);
    expect(after.hooks.PreToolUse).toEqual(original.hooks.PreToolUse);
    expect(after.hooks.SessionStart).toHaveLength(1);
    await installer.uninstall("devin");
    expect(JSON.parse(await readFile(newCfg(), "utf8"))).toEqual(original);
  });

  it("devinUserConfigDir: Windows は APPDATA、ほかは ~/.config/devin", () => {
    expect(devinUserConfigDir({ APPDATA: "/appdata" }, "/home/u", "win32")).toBe(
      join("/appdata", "devin"),
    );
    expect(devinUserConfigDir({}, "/home/u", "win32")).toBe(join("/home/u", ".config", "devin"));
    expect(devinUserConfigDir({ APPDATA: "/appdata" }, "/home/u", "linux")).toBe(
      join("/home/u", ".config", "devin"),
    );
  });

  for (const viaEnv of [false, true]) {
    const label = viaEnv ? "DEVIN_CONFIG_DIR の古い場所" : "~/.devin の古い場所";
    const legacyDir = () => (viaEnv ? join(workDir, "old-devin") : join(home, ".devin"));
    const envFor = () => (viaEnv ? { DEVIN_CONFIG_DIR: legacyDir() } : {});

    it(`devin: ${label}の hooks.json は更新が必要で、install で新しい場所へ移る`, async () => {
      const root = await putLegacyDevin(legacyDir());
      const installer = makeInstaller(envFor());
      expect(await installer.status("devin")).toMatchObject({ installed: true, needsUpdate: true });
      expect(JSON.parse(await readFile(join(legacyDir(), "hooks.json"), "utf8"))).toEqual(root);

      expect(await installer.install("devin")).toEqual({
        ok: true,
        message: "古い形のフックを、現行の形に入れ直しました",
      });
      expect(JSON.parse(await readFile(newCfg(), "utf8")).hooks.SessionStart).toHaveLength(1);
      expect(await exists(join(legacyDir(), "hooks.json"))).toBe(false);
      expect(await exists(join(legacyDir(), "hooks", "soda-agent-report.cjs"))).toBe(false);
      expect(await installer.status("devin")).toMatchObject({
        installed: true,
        needsUpdate: false,
      });
    });

    it(`devin: ${label}だけにある状態の uninstall は message null で、新しい config.json を作らない`, async () => {
      await putLegacyDevin(legacyDir());
      const installer = makeInstaller(envFor());
      expect(await installer.uninstall("devin")).toEqual({ ok: true, message: null });
      expect(await exists(join(legacyDir(), "hooks.json"))).toBe(false);
      expect(await exists(join(legacyDir(), "hooks", "soda-agent-report.cjs"))).toBe(false);
      expect(await exists(newCfg())).toBe(false);
      expect((await installer.status("devin")).installed).toBe(false);
    });
  }

  it("devin: 古い hooks.json の利用者のエントリは残り、ファイルは消えない", async () => {
    const dir = join(home, ".devin");
    const mine = { matcher: "x", hooks: [{ type: "command", command: "./mine.sh" }] };
    const other = {
      PreToolUse: [{ matcher: "exec", hooks: [{ type: "command", command: "./p.sh" }] }],
    };
    await mkdir(join(dir, "hooks"), { recursive: true });
    await writeFile(
      join(dir, "hooks.json"),
      JSON.stringify({ ...other, SessionStart: [mine, legacyEntry(dir)] }),
    );
    const installer = makeInstaller();
    await installer.install("devin");
    expect(JSON.parse(await readFile(join(dir, "hooks.json"), "utf8"))).toEqual({
      ...other,
      SessionStart: [mine],
    });
  });

  it("devin: 新旧の両方にある状態の uninstall は両方から消す", async () => {
    await putLegacyDevin(join(home, ".devin"));
    const installer = makeInstaller();
    // 新しい場所にも導入（古いものがあるので install は入れ直す。その後、古いものを再び置く）
    await installer.install("devin");
    await putLegacyDevin(join(home, ".devin"));
    expect(await installer.uninstall("devin")).toEqual({ ok: true, message: null });
    expect(await exists(join(home, ".devin", "hooks.json"))).toBe(false);
    const cfg = JSON.parse(await readFile(newCfg(), "utf8"));
    expect(cfg.hooks?.SessionStart).toBeUndefined();
    expect((await installer.status("devin")).installed).toBe(false);
  });

  it("devin: コメントつきの config.json は書き換えず断り、押しても直らない更新を出さない", async () => {
    const dir = join(home, ".devin");
    await putLegacyDevin(dir);
    await mkdir(join(home, ".config", "devin"), { recursive: true });
    const commented = '{\n  // comment\n  "agent": {}\n}\n';
    await writeFile(newCfg(), commented);
    const legacyBefore = await readFile(join(dir, "hooks.json"), "utf8");
    const installer = makeInstaller();
    expect(await installer.status("devin")).toMatchObject({ installed: true, needsUpdate: false });
    const result = await installer.install("devin");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("コメント");
    expect(await readFile(newCfg(), "utf8")).toBe(commented);
    expect(await readFile(join(dir, "hooks.json"), "utf8")).toBe(legacyBefore);
    expect(await exists(join(dir, "hooks", "soda-agent-report.cjs"))).toBe(true);
    expect(await exists(join(home, ".config", "devin", "hooks"))).toBe(false);
  });
});

// 20261007-agent-hook-drift の独立点検（T1・T2）の指摘への対応。
describe("FsAgentIntegrationInstaller — 点検の指摘（リンク・権限・古い場所 2 か所・空・BOM）", () => {
  let workDir: string;
  let hookScriptSource: string;
  let home: string;

  beforeEach(async () => {
    workDir = await makeTempDir("soda-integration-installer-review-");
    hookScriptSource = join(workDir, "agent-hook-report.cjs");
    await writeFile(hookScriptSource, "// fake hook script\n");
    home = join(workDir, "home");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function makeInstaller(env: Partial<NodeJS.ProcessEnv> = {}) {
    return new FsAgentIntegrationInstaller(
      hookScriptSource,
      { PATH: "", ...env } as NodeJS.ProcessEnv,
      home,
    );
  }
  const cfg = () => join(home, ".config", "devin", "config.json");
  const exists = (p: string) =>
    stat(p).then(
      () => true,
      () => false,
    );

  it.skipIf(process.platform === "win32")(
    "シンボリックリンクの設定は、リンクの先を書き換えてリンクを残し、元の権限を保つ",
    async () => {
      const real = join(workDir, "dotfiles", "devin-config.json");
      await mkdir(join(workDir, "dotfiles"), { recursive: true });
      await writeFile(real, JSON.stringify({ agent: { model: "x" } }));
      await chmod(real, 0o644);
      await mkdir(join(home, ".config", "devin"), { recursive: true });
      await symlink(real, cfg());
      const installer = makeInstaller();
      await installer.install("devin");
      expect((await lstat(cfg())).isSymbolicLink()).toBe(true);
      const body = JSON.parse(await readFile(real, "utf8"));
      expect(body.agent).toEqual({ model: "x" });
      expect(body.hooks.SessionStart).toHaveLength(1);
      expect((await stat(real)).mode & 0o777).toBe(0o644);
      await installer.uninstall("devin");
      expect((await lstat(cfg())).isSymbolicLink()).toBe(true);
      expect(JSON.parse(await readFile(real, "utf8"))).toEqual({
        agent: { model: "x" },
        hooks: {},
      });
      expect((await stat(real)).mode & 0o777).toBe(0o644);
    },
  );

  it("古い場所が DEVIN_CONFIG_DIR と ~/.devin の両方にあるとき、両方を見つけて片づける", async () => {
    const envDir = join(workDir, "old-devin");
    for (const dir of [envDir, join(home, ".devin")]) {
      await mkdir(join(dir, "hooks"), { recursive: true });
      await writeFile(
        join(dir, "hooks.json"),
        JSON.stringify({
          SessionStart: [
            {
              matcher: "",
              hooks: [
                { type: "command", command: `node "${dir}/hooks/soda-agent-report.cjs" devin` },
              ],
            },
          ],
        }),
      );
      await writeFile(join(dir, "hooks", "soda-agent-report.cjs"), "// old\n");
    }
    const installer = makeInstaller({ DEVIN_CONFIG_DIR: envDir });
    expect(await installer.status("devin")).toMatchObject({ installed: true, needsUpdate: true });
    expect((await installer.install("devin")).message).toBe(
      "古い形のフックを、現行の形に入れ直しました",
    );
    for (const dir of [envDir, join(home, ".devin")]) {
      expect(await exists(join(dir, "hooks.json"))).toBe(false);
      expect(await exists(join(dir, "hooks", "soda-agent-report.cjs"))).toBe(false);
    }
    expect(await installer.status("devin")).toMatchObject({ installed: true, needsUpdate: false });
  });

  it("DEVIN_CONFIG_DIR が ~/.devin と同じ場所でも二重に数えない", async () => {
    const dir = join(home, ".devin");
    await mkdir(join(dir, "hooks"), { recursive: true });
    await writeFile(
      join(dir, "hooks.json"),
      JSON.stringify({
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "node soda-agent-report.cjs devin" }],
          },
        ],
      }),
    );
    const installer = makeInstaller({ DEVIN_CONFIG_DIR: dir });
    expect((await installer.install("devin")).ok).toBe(true);
    expect(await exists(join(dir, "hooks.json"))).toBe(false);
  });

  it("空・空白だけの設定ファイルは {} として扱い、先頭の BOM は除いて読む", async () => {
    await mkdir(join(home, ".config", "devin"), { recursive: true });
    for (const body of ["", "  \n\t", "\uFEFF" + JSON.stringify({ agent: { a: 1 } })]) {
      await writeFile(cfg(), body);
      const installer = makeInstaller();
      expect(await installer.install("devin")).toEqual({ ok: true, message: null });
      const root = JSON.parse(await readFile(cfg(), "utf8")); // BOM を足していない
      expect(root.hooks.SessionStart).toHaveLength(1);
      await installer.uninstall("devin");
    }
    await writeFile(cfg(), "\uFEFF" + JSON.stringify({ agent: { a: 1 } }));
    await makeInstaller().install("devin");
    expect(JSON.parse(await readFile(cfg(), "utf8")).agent).toEqual({ a: 1 });
  });

  it("解釈できないときの知らせは「コメント」と決めつけず、JSON として解釈できないことを言う", async () => {
    await mkdir(join(home, ".config", "devin"), { recursive: true });
    await writeFile(cfg(), "{ not json");
    const r = await makeInstaller().install("devin");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("コメントなどがあって JSON として解釈できない");
  });

  it("grok: 自分の平らなエントリ・利用者の平らなエントリ・別のフック（Stop）が混ざっても、自分の分だけ入れ直す", async () => {
    const dir = join(home, ".grok", "hooks");
    await mkdir(dir, { recursive: true });
    const mine = {
      matcher: "",
      type: "command",
      command: 'node "/x/soda-agent-report.cjs" grok',
      timeout: 10,
    };
    const users = { matcher: "", type: "command", command: "./users.sh" };
    const stop = [{ hooks: [{ type: "command", command: "./stop.sh" }] }];
    await writeFile(
      join(dir, "soda-agent-report.json"),
      JSON.stringify({ hooks: { SessionStart: [users, mine], Stop: stop } }),
    );
    const installer = makeInstaller();
    await installer.install("grok");
    const root = JSON.parse(await readFile(join(dir, "soda-agent-report.json"), "utf8"));
    expect(root.hooks.Stop).toEqual(stop);
    expect(root.hooks.SessionStart).toHaveLength(2);
    expect(root.hooks.SessionStart[0]).toEqual(users);
    expect(root.hooks.SessionStart[1].hooks).toHaveLength(1);
  });

  it("設定の親（hooks）がオブジェクトでないときは、何も変えずに断る", async () => {
    await mkdir(join(home, ".config", "devin"), { recursive: true });
    const body = JSON.stringify({ hooks: "oops" });
    await writeFile(cfg(), body);
    const installer = makeInstaller();
    const r = await installer.install("devin");
    expect(r.ok).toBe(false);
    expect(await readFile(cfg(), "utf8")).toBe(body);
    expect(await exists(join(home, ".config", "devin", "hooks"))).toBe(false);
    expect((await installer.status("devin")).needsUpdate).toBe(false);
  });

  it("読めない設定（ディレクトリ）は、コメントの案内ではなく読めない理由を伝え、何も書かない", async () => {
    await mkdir(cfg(), { recursive: true });
    const installer = makeInstaller();
    const r = await installer.install("devin");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("設定ファイルを読めません");
    expect(r.message).not.toContain("コメント");
    expect((await stat(cfg())).isDirectory()).toBe(true);
    expect(await exists(join(home, ".config", "devin", "hooks"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "行き先の無いシンボリックリンクは、リンクを保って行き先に作る",
    async () => {
      const real = join(workDir, "dotfiles", "later.json");
      await mkdir(join(home, ".config", "devin"), { recursive: true });
      await symlink(real, cfg());
      expect((await makeInstaller().install("devin")).ok).toBe(true);
      expect((await lstat(cfg())).isSymbolicLink()).toBe(true);
      expect(JSON.parse(await readFile(real, "utf8")).hooks.SessionStart).toHaveLength(1);
    },
  );

  it.skipIf(process.platform === "win32")(
    "循環するシンボリックリンクは、何も書かずに断る",
    async () => {
      await mkdir(join(home, ".config", "devin"), { recursive: true });
      await symlink(cfg(), cfg());
      const r = await makeInstaller().install("devin");
      expect(r.ok).toBe(false);
      expect(r.message).toContain("設定ファイルを読めません");
    },
  );

  it("新しい設定が解釈できず古いものだけ片づけたとき、ok:true で触っていないことを知らせる", async () => {
    const dir = join(home, ".devin");
    await mkdir(join(dir, "hooks"), { recursive: true });
    await writeFile(
      join(dir, "hooks.json"),
      JSON.stringify({
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "node soda-agent-report.cjs devin" }],
          },
        ],
      }),
    );
    await mkdir(join(home, ".config", "devin"), { recursive: true });
    await writeFile(cfg(), "{ // c\n}");
    const r = await makeInstaller().uninstall("devin");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("解釈できないので触っていません");
    expect(r.message).toContain(cfg());
    expect(await readFile(cfg(), "utf8")).toBe("{ // c\n}");
  });

  it("uninstall の後、空になった hooks のキーは残る（既存の kind と同じ決まりを固定する）", async () => {
    const installer = makeInstaller();
    await installer.install("devin");
    await installer.uninstall("devin");
    expect(JSON.parse(await readFile(cfg(), "utf8"))).toEqual({ hooks: {} });
  });
});

// 20261007-agent-hook-drift: Qoder CLI（qodercli）。
describe("FsAgentIntegrationInstaller — qodercli", () => {
  let workDir: string;
  let hookScriptSource: string;
  let home: string;

  beforeEach(async () => {
    workDir = await makeTempDir("soda-integration-installer-qoder-");
    hookScriptSource = join(workDir, "agent-hook-report.cjs");
    await writeFile(hookScriptSource, "// fake hook script\n");
    home = join(workDir, "home");
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  function makeInstaller(env: Partial<NodeJS.ProcessEnv> = {}) {
    return new FsAgentIntegrationInstaller(
      hookScriptSource,
      { PATH: "", ...env } as NodeJS.ProcessEnv,
      home,
    );
  }

  it("settings.json の hooks.SessionStart に matcher なし・async:true の入れ子で入る。2 回目は導入済み、解除でスクリプトも消える", async () => {
    const installer = makeInstaller();
    expect(await installer.install("qodercli")).toEqual({ ok: true, message: null });
    const file = join(home, ".qoder", "settings.json");
    const root = JSON.parse(await readFile(file, "utf8"));
    expect(root.hooks.SessionStart).toHaveLength(1);
    const entry = root.hooks.SessionStart[0];
    expect(entry.matcher).toBeUndefined();
    expect(entry.hooks).toEqual([
      {
        type: "command",
        command: expect.stringMatching(/soda-agent-report\.cjs.* qodercli$/),
        async: true,
      },
    ]);
    expect(await installer.install("qodercli")).toEqual({ ok: true, message: "既に導入済みです" });
    expect(await installer.status("qodercli")).toMatchObject({
      installed: true,
      needsUpdate: false,
    });
    expect(await installer.uninstall("qodercli")).toEqual({ ok: true, message: null });
    expect((await installer.status("qodercli")).installed).toBe(false);
    await expect(stat(join(home, ".qoder", "hooks", "soda-agent-report.cjs"))).rejects.toThrow();
  });

  it("既存の settings.json のほかのキー・ほかのフックを保つ", async () => {
    const original = {
      model: "x",
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./p.sh" }] }] },
    };
    await mkdir(join(home, ".qoder"), { recursive: true });
    await writeFile(join(home, ".qoder", "settings.json"), JSON.stringify(original));
    const installer = makeInstaller();
    await installer.install("qodercli");
    const after = JSON.parse(await readFile(join(home, ".qoder", "settings.json"), "utf8"));
    expect(after.model).toBe("x");
    expect(after.hooks.PreToolUse).toEqual(original.hooks.PreToolUse);
    expect(after.hooks.SessionStart).toHaveLength(1);
    await installer.uninstall("qodercli");
    expect(JSON.parse(await readFile(join(home, ".qoder", "settings.json"), "utf8"))).toEqual(
      original,
    );
  });

  it("QODER_CONFIG_DIR があればそこへ書く", async () => {
    const dir = join(workDir, "qoder-dir");
    await makeInstaller({ QODER_CONFIG_DIR: dir }).install("qodercli");
    expect(
      JSON.parse(await readFile(join(dir, "settings.json"), "utf8")).hooks.SessionStart,
    ).toHaveLength(1);
    await expect(stat(join(home, ".qoder"))).rejects.toThrow();
  });

  it.skipIf(process.platform === "win32")(
    "cliDetected: qoder だけ・qodercli だけのどちらでも true、無ければ false",
    async () => {
      for (const name of ["qoder", "qodercli"]) {
        const bin = join(workDir, `bin-${name}`);
        await mkdir(bin, { recursive: true });
        await writeFile(join(bin, name), "#!/bin/sh\n");
        await chmod(join(bin, name), 0o755);
        const s = await makeInstaller({ PATH: bin }).status("qodercli");
        expect(s.cliDetected).toBe(true);
      }
      expect((await makeInstaller({ PATH: workDir }).status("qodercli")).cliDetected).toBe(false);
    },
  );

  it("isAgentIntegrationKind・AGENT_INTEGRATION_KINDS", () => {
    expect(AGENT_INTEGRATION_KINDS).toHaveLength(9);
    expect(AGENT_INTEGRATION_KINDS).toContain("qodercli");
    for (const kind of AGENT_INTEGRATION_KINDS) expect(isAgentIntegrationKind(kind)).toBe(true);
    for (const bad of ["gemini", "__proto__", "constructor", "toString", ""])
      expect(isAgentIntegrationKind(bad)).toBe(false);
  });
});
