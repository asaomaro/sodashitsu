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
    expect(await installer.status("claude")).toEqual({ cliDetected: false, installed: false });
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

  it("uninstall removes only our entry and the copied script, leaving other hooks intact", async () => {
    const installer = makeInstaller();
    await installer.install("claude");
    await mkdir(join(claudeDir, "hooks"), { recursive: true });
    const settingsPath = join(claudeDir, "settings.json");
    const before = JSON.parse(await readFile(settingsPath, "utf8"));
    before.hooks.SessionStart.push({ matcher: "compact", hooks: [{ type: "command", command: "echo hi" }] });
    await writeFile(settingsPath, JSON.stringify(before));

    const result = await installer.uninstall("claude");
    expect(result).toEqual({ ok: true, message: null });

    const after = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(after.hooks.SessionStart).toHaveLength(1);
    expect(after.hooks.SessionStart[0].hooks[0].command).toBe("echo hi");
    await expect(readFile(join(claudeDir, "hooks", "soda-agent-report.cjs"))).rejects.toThrow();
  });

  it("uninstall reports 未導入 when nothing was installed", async () => {
    const installer = makeInstaller();
    expect(await installer.uninstall("claude")).toEqual({ ok: true, message: "未導入でした" });
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
