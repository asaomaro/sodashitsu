import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { FsAgentIntegrationInstaller } from "./AgentIntegrationInstaller.js";

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
    expect(await installer.status("claude")).toEqual({ cliDetected: false, installed: false, needsUpdate: false });
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
    expect(Object.keys(settings.hooks).sort()).toEqual(["PreToolUse", "SessionEnd", "SessionStart", "Stop", "SubagentStart", "SubagentStop"]);
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
        hooks: { SessionStart: [{ matcher: "compact", hooks: [{ type: "command", command: "echo hi" }] }] },
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
    for (const ev of ["PreToolUse", "SubagentStart", "SubagentStop", "SessionEnd"]) expect(after.hooks[ev]).toEqual([]);
    expect(await installer.status("claude")).toMatchObject({ installed: false, needsUpdate: false });
    // 動いている Claude Code が古いフックのまま呼び続けても失敗しないよう、消さずに何もしない中身へ差し替える（decisions D9）。
    const script = await readFile(join(claudeDir, "hooks", "soda-agent-report.cjs"), "utf8");
    expect(script).not.toContain("fake hook script");
    expect(script).toContain("何もしません");
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
    for (const ev of ["PreToolUse", "SubagentStart", "Stop", "SubagentStop", "SessionEnd"]) expect(after.hooks[ev]).toEqual([]);
  });

  it("uninstall の後に install し直すと、本物のスクリプトに写し直される", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    await installer.uninstall("claude");
    expect(await installer.install("claude")).toEqual({ ok: true, message: null });
    expect(await readFile(join(claudeDir, "hooks", "soda-agent-report.cjs"), "utf8")).toContain("fake hook script");
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
    new FsAgentIntegrationInstaller(source, { PATH: "", CLAUDE_CONFIG_DIR: claudeDir } as NodeJS.ProcessEnv, join(workDir, "unused-home"));

  /** 旧版（SessionStart だけ）の導入済みの状態を作る。 */
  async function installOldVersion(extraHooks: Record<string, unknown> = {}): Promise<void> {
    await mkdir(join(claudeDir, "hooks"), { recursive: true });
    await writeFile(installedScript, "// old hook script\n");
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: "startup|resume", hooks: [{ type: "command", command: `node "${installedScript}" claude`, async: true }] }],
          ...extraHooks,
        },
      }),
    );
  }
  const readSettings = async () => JSON.parse(await readFile(settingsPath, "utf8"));

  it("追加のエントリの形: PreToolUse・SubagentStart・Stop は同期（timeout 5）、SubagentStop・SessionEnd は async", async () => {
    await makeInstaller().install("claude");
    const { hooks } = await readSettings();
    expect(hooks.PreToolUse).toEqual([{ matcher: "Agent|Task", hooks: [{ type: "command", command: `node "${installedScript}" claude`, timeout: 5 }] }]);
    for (const ev of ["SubagentStart", "Stop"]) {
      expect(hooks[ev]).toEqual([{ matcher: "", hooks: [{ type: "command", command: `node "${installedScript}" claude`, timeout: 5 }] }]);
    }
    for (const ev of ["SubagentStop", "SessionEnd"]) {
      expect(hooks[ev]).toEqual([{ matcher: "", hooks: [{ type: "command", command: `node "${installedScript}" claude`, async: true }] }]);
    }
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
    expect(await installer.status("claude")).toMatchObject({ installed: false, needsUpdate: false });
    await installer.install("claude");
    const { hooks } = await readSettings();
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(1);
  });

  it("同梱のスクリプトが読めないときは needsUpdate を出さない（押しても直らない）", async () => {
    await installOldVersion();
    expect((await makeInstaller(join(workDir, "missing.cjs")).status("claude")).needsUpdate).toBe(false);
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
    expect(await makeInstaller().status("claude")).toMatchObject({ installed: true, needsUpdate: false });
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
    const installer = new FsAgentIntegrationInstaller(hookScriptSource, { PATH: "", CODEX_HOME: join(workDir, "codex") } as NodeJS.ProcessEnv, home);
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
    return new FsAgentIntegrationInstaller(hookScriptSource, { PATH: "" } as NodeJS.ProcessEnv, home);
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
    expect(after.hooks.sessionStart).toHaveLength(0);
  });

  it("copilot: writes a dedicated file in the hooks directory and never touches other *.json files there", async () => {
    const hooksDir = join(home, ".copilot", "hooks");
    await mkdir(hooksDir, { recursive: true });
    await writeFile(join(hooksDir, "someone-elses-hook.json"), JSON.stringify({ hooks: { preToolUse: ["untouched"] } }));

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

  it("devin: installs at a top-level SessionStart key (no hooks wrapper), with timeout not async", async () => {
    const installer = makeInstaller();
    expect(await installer.install("devin")).toEqual({ ok: true, message: null });

    const settings = JSON.parse(await readFile(join(home, ".devin", "hooks.json"), "utf8"));
    expect(settings.SessionStart).toHaveLength(1); // トップレベル直下（`hooks` ラップ無し）
    expect(settings.hooks).toBeUndefined();
    const entry = settings.SessionStart[0];
    expect(entry.hooks[0].command).toContain("soda-agent-report.cjs");
    expect(entry.hooks[0].timeout).toBe(10);
    expect(entry.hooks[0].async).toBeUndefined();

    expect(await installer.uninstall("devin")).toEqual({ ok: true, message: null });
  });

  it("devin: honors DEVIN_CONFIG_DIR override", async () => {
    const override = join(workDir, "devin-override");
    const installer = new FsAgentIntegrationInstaller(hookScriptSource, { PATH: "", DEVIN_CONFIG_DIR: override } as NodeJS.ProcessEnv, home);
    await installer.install("devin");
    const settings = JSON.parse(await readFile(join(override, "hooks.json"), "utf8"));
    expect(settings.SessionStart).toHaveLength(1);
  });

  it("droid: installs at a top-level SessionStart key (same shape as devin, different path)", async () => {
    const installer = makeInstaller();
    expect(await installer.install("droid")).toEqual({ ok: true, message: null });

    const settings = JSON.parse(await readFile(join(home, ".factory", "hooks.json"), "utf8"));
    expect(settings.SessionStart).toHaveLength(1);
    expect(settings.SessionStart[0].hooks[0].command).toContain("droid");
  });

  it("grok: writes a dedicated file with a flat entry under hooks.SessionStart (PascalCase, no hooks[] nesting)", async () => {
    const hooksDir = join(home, ".grok", "hooks");
    await mkdir(hooksDir, { recursive: true });
    await writeFile(join(hooksDir, "unrelated.json"), JSON.stringify({ some: "thing" }));

    const installer = makeInstaller();
    expect(await installer.install("grok")).toEqual({ ok: true, message: null });

    const dedicated = JSON.parse(await readFile(join(hooksDir, "soda-agent-report.json"), "utf8"));
    expect(dedicated.hooks.SessionStart).toHaveLength(1);
    const entry = dedicated.hooks.SessionStart[0];
    expect(entry.command).toContain("soda-agent-report.cjs");
    expect(entry.hooks).toBeUndefined();
    expect(entry.timeout).toBe(10);

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
