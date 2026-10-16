/**
 * `ProcessMatcher.match`/`lookupAgentKind` のテスト。一部は herdr のソース（`da6bcd5`。Apache-2.0・D5）の
 * `src/detect/mod.rs` の `identify_known_agents`・`identify_agent_in_job` 系のテストケースを、本製品の
 * `ForegroundJob`/`ForegroundProcess` の形に書き換えて移植した（T11。移植元は各 `describe` に herdr 側の
 * 関数名で明記する）。原文の Rust コードそのままではなく、TypeScript として書き直している。
 */
import { describe, expect, it } from "vitest";
import type { ForegroundJob, ForegroundProcess } from "../platform/ProcessInspector.js";
import { lookupAgentKind } from "./agents.js";
import { agentProcessPids, match } from "./ProcessMatcher.js";

/** `LinuxProcessInspector`/`WindowsProcessInspector` が実際に作る形（`exe` は argv[0] があればそれ）に合わせる。 */
function proc(pid: number, argv: string[]): ForegroundProcess {
  return { pid, exe: argv[0] ?? "", argv, cwd: null };
}
function job(processGroupId: number, processes: ForegroundProcess[]): ForegroundJob {
  return { processGroupId, processes };
}

describe("lookupAgentKind — herdr の identify_known_agents を移植（alias 表）", () => {
  it.each([
    ["pi", "pi"],
    ["claude", "claude"],
    ["claude-code", "claude"],
    ["codex", "codex"],
    ["gemini", "gemini"],
    ["cursor", "cursor"],
    ["cursor-agent", "cursor"],
    ["devin", "devin"],
    ["devin-cli", "devin"],
    ["agy", "agy"],
    ["antigravity-cli", "agy"],
    ["cline", "cline"],
    [".cline", "cline"],
    ["opencode", "opencode"],
    ["opencode.exe", "opencode"],
    ["opencode2", "opencode"],
    ["kimi", "kimi"],
    ["Kimi Code", "kimi"],
    ["kiro", "kiro"],
    ["kiro-cli", "kiro"],
    ["copilot", "copilot"],
    ["ghcs", "copilot"],
    ["github-copilot", "copilot"],
    ["grok", "grok"],
    ["grok-build", "grok"],
    ["hermes", "hermes"],
    ["hermes-agent", "hermes"],
    ["kilo", "kilo"],
    ["kilo-code", "kilo"],
    ["qwen", "qwen"],
    ["Qwen Code", "qwen"],
    ["letta", "letta"],
    ["Letta Code", "letta"],
    ["maki", "maki"],
    ["muse", "muse"],
    ["muse-code", "muse"],
    ["muse-bin-0.1.0-R708.1", "muse"],
    ["/home/user/.local/bin/muse-bin-0.2.1-R1215.1", "muse"],
    ["C:\\Users\\user\\muse-bin-0.2.1-R1215.1.exe", "muse"],
  ])("%s -> %s", (name, expected) => {
    expect(lookupAgentKind(name)).toBe(expected);
  });

  it("omp・mastracode は対象外（画面マニフェストが無い。D46）", () => {
    expect(lookupAgentKind("omp")).toBeNull();
    expect(lookupAgentKind("mastracode")).toBeNull();
  });

  it("未知の実行ファイル名は null", () => {
    expect(lookupAgentKind("bash")).toBeNull();
    expect(lookupAgentKind("random-tool")).toBeNull();
  });

  it("末尾が区切り文字のパスでも basename を正しく取れる（herdr の path_basename。review 指摘。nit）", () => {
    expect(lookupAgentKind("/usr/local/bin/claude/")).toBe("claude");
    expect(lookupAgentKind("C:\\tools\\codex\\")).toBe("codex");
  });
});

describe("match — herdr の identify_agent_in_job を移植（実行時のラッパー越しの識別）", () => {
  it("実物の claude・codex の cmdline（このマシンで実測。D49）をそのまま識別できる", () => {
    expect(match(job(20563, [proc(20563, ["claude", "--version"])]))).toBe("claude");
    expect(match(job(20564, [proc(20564, ["codex"])]))).toBe("codex");
  });

  it("node 越しに起動された codex を見つける（identify_agent_in_job_prefers_wrapped_codex）", () => {
    const j = job(1, [proc(1, ["node", "/path/to/bin/codex"]), proc(2, ["bash"])]);
    expect(match(j)).toBe("codex");
  });

  it("node 越しに起動された qwen を見つける（identify_agent_in_job_detects_node_wrapped_qwen）", () => {
    const linux = job(123, [proc(123, ["node", "/home/user/.fnm/bin/qwen"])]);
    expect(match(linux)).toBe("qwen");

    const windows = job(123, [proc(123, ["node.exe", "C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@qwen-code\\qwen-code\\dist\\index.js"])]);
    expect(match(windows)).toBe("qwen");
  });

  // 20261016-bob-shell（実機 2.0.6: `node <prefix>/bin/bob` が、同じ形の子を起こし直す。Windows は npm の shim が `node <...>\\bob.js`）。
  it("node 越しに起動された Bob Shell を見つけ、親子の両方を前面のエージェントの pid に含める", () => {
    const parent = { ...proc(10, ["node", "/home/user/.nvm/versions/node/v24.15.0/bin/bob"]), ppid: 1 };
    const child = { ...proc(11, ["/home/user/.nvm/versions/node/v24.15.0/bin/node", "/home/user/.nvm/versions/node/v24.15.0/bin/bob"]), ppid: 10 };
    expect(match(job(10, [parent, child]))).toBe("bob");
    expect(agentProcessPids(job(10, [parent, child]), "bob").sort()).toEqual([10, 11]);

    const windows = job(123, [proc(123, ["node.exe", "C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\bobshell\\dist\\bob.js"])]);
    expect(match(windows)).toBe("bob");
  });

  it("cline のネイティブバイナリを basename から見つける（identify_agent_in_job_detects_cline_native_binaries）", () => {
    for (const executable of [
      "/home/user/.npm/lib/node_modules/cline/bin/.cline",
      "/usr/local/lib/node_modules/@cline/cli-darwin-arm64/bin/cline",
      "C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@cline\\cli-windows-x64\\bin\\cline.exe",
    ]) {
      const j = job(123, [proc(123, [executable, "--tui"])]);
      expect(match(j)).toBe("cline");
    }
  });

  it("node 越しに起動された cline を見つける（identify_agent_in_job_detects_cline_node_wrapper）", () => {
    const j = job(123, [proc(123, ["node", "/home/user/.fnm/bin/cline", "--tui"])]);
    expect(match(j)).toBe("cline");
  });

  it("グループリーダーがシェルで、他のメンバーにエージェントがいれば見つける（優先度によるスコアリング）", () => {
    const j = job(1, [proc(1, ["bash"]), proc(2, ["claude"])]);
    expect(match(j)).toBe("claude");
  });

  it("フルパスで直接起動されたエージェント（ラップ無し）と node 越しにラップされたエージェントが同じジョブに\
いれば、ラップされた方が優先度で勝つ——配列の順序に依らない（review 指摘。must。processPriority の\
「自分自身の名前と一致するか」の比較が basename 化されておらず、フルパス実行のときだけ誤って同点扱いに\
なっていた）", () => {
    const leader = proc(1, ["bash"]); // リーダー自身はエージェントに一致しない
    // cline を「ラップ無し」で直接、フルパスの exe で起動（herdr の identify_agent_in_job_detects_cline_native_binaries
    // と同じ形。own name と一致するので score=2 のはず）。
    const clineDirect = proc(2, ["/usr/local/lib/node_modules/@cline/cli-darwin-arm64/bin/cline", "--tui"]);
    // codex を node 越しにラップして起動（own name（"node"）と一致しないので score=3 のはず）。
    const codexWrapped = proc(3, ["node", "/home/user/.fnm/bin/codex"]);

    expect(match(job(1, [leader, clineDirect, codexWrapped]))).toBe("codex");
    expect(match(job(1, [leader, codexWrapped, clineDirect]))).toBe("codex"); // 配列の順序を入れ替えても結果は同じ
  });

  it("エージェントが1つも見つからなければ null", () => {
    const j = job(1, [proc(1, ["bash"]), proc(2, ["vim", "file.txt"])]);
    expect(match(j)).toBeNull();
  });

  it("空のジョブは null", () => {
    expect(match(job(1, []))).toBeNull();
  });

  it("Windows の cmd /c 越しの起動を見つける", () => {
    const j = job(1, [proc(1, ["cmd.exe", "/c", "claude --resume"])]);
    expect(match(j)).toBe("claude");
  });

  it("Windows の powershell -Command 越しの起動を見つける", () => {
    const j = job(1, [proc(1, ["powershell.exe", "-Command", "codex --version"])]);
    expect(match(j)).toBe("codex");
  });
});
