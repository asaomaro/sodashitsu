/**
 * 前面プロセスの情報 → エージェントの種類（純関数。architecture.md「agent/ProcessMatcher」・design「ProcessMatcher」）。
 * herdr のソース（`da6bcd5`。Apache-2.0・D5）の `src/detect/mod.rs` を移植した（decisions.md D46・D49）。
 *
 * architecture.md の元のシグネチャ（`match(fg: ForegroundProcess): string | null`）を、
 * 前面プロセスグループの全メンバー（`ForegroundJob`）を受け取る形に広げてある（D45）——
 * npm/node のラッパーや Windows の cmd/powershell 越しの起動を見分けるには、シェルの直接の子だけでは
 * 足りず、ジョブ全体（グループリーダー・全メンバー）を見る必要があるため。
 *
 * **意図的に省いた herdr の挙動**（D49）:
 * - `resolved_agent_name_from_path_token`（シンボリックリンクをファイルシステムで解決する）：
 *   `ProcessMatcher` を純関数に保つ（architecture.md の依存の規則）ため、ファイル I/O をしない。
 * - Letta 専用の「対話的な起動か」の追加判定（`is_interactive_letta_process`）：他のエージェントと
 *   同じ扱いにする（誤検出の抑制が主目的の細部で、MVP の検証対象（claude・codex）には関係しない）。
 * - `Agent::Omp`・`Agent::Mastracode`：画面マニフェストが無いので対象外のまま（D46）。
 */
import type { ForegroundJob, ForegroundProcess } from "../platform/ProcessInspector.js";
import { codexResumeIdFromArgv } from "./codexSession.js";
import { lookupAgentKind, normalizedAgentLookupName, pathBasename } from "./agents.js";

/** 前面プロセスグループ（ジョブ）からエージェントの種類を決める。見つからなければ null。 */
export function match(job: ForegroundJob): string | null {
  // グループリーダー自身をまず見る（herdr の identify_agent_in_job）。
  const leader = job.processes.find((p) => p.pid === job.processGroupId);
  if (leader !== undefined) {
    const kind = lookupAgentKind(normalizedProcessName(leader));
    if (kind !== null) return kind;
  }

  // だめなら全プロセスを優先度でスコアリングし、最良のものを採る（同点は先に見つかった方）。
  let best: { score: number; kind: string } | null = null;
  for (const process of job.processes) {
    const candidate = normalizedProcessName(process);
    const kind = lookupAgentKind(candidate);
    if (kind === null) continue;
    const score = processPriority(process, candidate);
    if (best === null || best.score < score) best = { score, kind };
  }
  return best?.kind ?? null;
}

/**
 * 前面のジョブのうち、その pane の**エージェント自身**のプロセスの pid（20261009-agent-session-attribution）。種類が `kind` と判定されるプロセスのうち、
 * ジョブの中に、同じ種類と判定される祖先が居ないもの（いちばん外側）と、その直の子（親が同じ種類。ランタイムの包みと、その中の本体）。
 * **エージェントが Bash ツールなどで起動した子の同じ種類のプロセス**（間に別のプロセスを挟む）は入らない。親子の情報（`ppid`）が取れない環境は、種類が合う全部。
 */
export function agentProcessPids(job: ForegroundJob, kind: string): number[] {
  const matched = job.processes.filter((p) => lookupAgentKind(normalizedProcessName(p)) === kind);
  if (matched.length === 0) return [];
  if (matched.some((p) => p.ppid === undefined)) return matched.map((p) => p.pid);
  const byPid = new Map(job.processes.map((p) => [p.pid, p] as const));
  const matchedPids = new Set(matched.map((p) => p.pid));
  const hasMatchedAncestor = (p: ForegroundProcess): boolean => {
    let cur = p.ppid !== undefined ? byPid.get(p.ppid) : undefined;
    for (let i = 0; cur !== undefined && i < 64; i++) {
      if (matchedPids.has(cur.pid)) return true;
      cur = cur.ppid !== undefined ? byPid.get(cur.ppid) : undefined;
    }
    return false;
  };
  const cluster = new Set(matched.filter((p) => !hasMatchedAncestor(p)).map((p) => p.pid));
  for (const p of matched) if (p.ppid !== undefined && cluster.has(p.ppid)) cluster.add(p.pid);
  return [...cluster];
}

/**
 * 前面のジョブの、`kind` のエージェントのプロセスの引数にある、会話の id（Codex の `codex resume <id>`）。無ければ undefined。
 * 復元で打ち込んだ・利用者が打った `codex resume <id>` の pane は、daemon の報告を待たずに、どの会話かが分かる（20261010-codex-multi-pane）。
 */
export function agentResumeSessionId(job: ForegroundJob, kind: string): string | undefined {
  if (kind !== "codex") return undefined;
  const pids = new Set(agentProcessPids(job, kind));
  for (const p of job.processes) {
    if (!pids.has(p.pid)) continue;
    const id = codexResumeIdFromArgv(p.argv);
    if (id !== undefined) return id;
  }
  return undefined;
}

/**
 * 実際に使う「候補名」を決める（herdr の `normalized_process_name`）。
 * `process.exe` は `LinuxProcessInspector`/`WindowsProcessInspector` が既に「argv[0] か、それが
 * 無ければプロセス名」として組み立てている（herdr の `argv0.unwrap_or(name)` に相当する値）。
 */
function normalizedProcessName(process: ForegroundProcess): string {
  const effective = process.exe;
  const lowerEffective = effective.toLowerCase();

  if (isGenericRuntimeOrShell(lowerEffective)) {
    const wrapped = wrappedAgentNameFromRuntimeArgv(lowerEffective, process.argv);
    if (wrapped !== null) return wrapped;
  }

  // `effective` が既に既知のエージェント名に一致するなら、そのまま返す——ただし `lookupAgentKind` 自身は
  // 内部で basename 化して照合している（`process.exe` はフルパスのことがある。argv[0] 由来。herdr の
  // Linux 実装は argv0 が常に無く、ここで扱う値は元から短い comm なのでこの問題が無い）。ここで basename
  // 化せずにフルパスのまま返すと、`processPriority` の「自分自身の名前と一致するか」の比較
  // （`ownName` も basename 化済み）が常に不一致になり、ラップされていない検出まで「ラップされている」
  // ものと同点（3点）にされてしまう——同点は先に見つかった方が勝つので、結果が配列の順序に左右される
  // 誤検出になる（review 指摘。must）。
  if (lookupAgentKind(effective) !== null) return normalizedAgentLookupName(pathBasename(effective));

  const runtime = process.argv[0];
  if (runtime !== undefined) {
    const runtimeName = normalizedAgentLookupName(pathBasename(runtime));
    if (runtimeName === "node" || runtimeName === "bun") {
      const wrapped = wrappedAgentNameFromRuntimeArgv(runtime, process.argv);
      if (wrapped !== null) {
        const kind = lookupAgentKind(wrapped);
        if (kind === "qwen" || kind === "cline" || kind === "letta") return wrapped;
      }
    }
  }

  const wrapped = argv0AgentName(process.argv);
  if (wrapped !== null) return wrapped;

  return effective;
}

function processPriority(process: ForegroundProcess, normalizedName: string): 1 | 2 | 3 {
  const ownName = normalizedAgentLookupName(pathBasename(process.exe));
  if (normalizedName.toLowerCase() !== ownName) return 3;
  if (!isGenericRuntimeOrShell(normalizedName)) return 2;
  return 1;
}

function isGenericRuntimeOrShell(name: string): boolean {
  const n = normalizedAgentLookupName(pathBasename(name));
  return isPythonRuntime(n) || ["sh", "bash", "zsh", "fish", "tmux", "node", "bun", "cmd", "powershell", "pwsh"].includes(n);
}

function isPythonRuntime(name: string): boolean {
  if (name === "python") return true;
  if (!name.startsWith("python")) return false;
  const version = name.slice("python".length);
  return version.length > 0 && version.split(".").every((part) => part.length > 0 && /^[0-9]+$/.test(part));
}

// --- ランタイム越しのラッパー引数からの抽出（herdr の `wrapped_agent_name_from_runtime_argv` ほか） -------

function wrappedAgentNameFromRuntimeArgv(runtime: string, argv: string[]): string | null {
  const runtimeName = normalizedAgentLookupName(pathBasename(runtime));
  switch (runtimeName) {
    case "node":
      return cursorAgentNameFromBundledNodeArgv(argv) ?? scriptArgAgentName(argv, ["-e", "--eval", "-p", "--print"], []);
    case "bun":
      return scriptArgAgentName(argv, ["-e", "--eval", "-p", "--print"], []);
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return scriptArgAgentName(argv, ["-c"], []);
    case "cmd":
      return windowsCmdArgAgentName(argv);
    case "powershell":
    case "pwsh":
      return powershellArgAgentName(argv);
    case "tmux":
      return null;
    default:
      return isPythonRuntime(runtimeName) ? scriptArgAgentName(argv, ["-c"], ["-m"]) : null;
  }
}

/** cursor-agent の Windows 版が bundle する node（`<...>/cursor-agent/versions/<v>/{node.exe,index.js}`）。 */
function cursorAgentNameFromBundledNodeArgv(argv: string[]): string | null {
  const first = argv[0];
  const second = argv[1];
  if (first === undefined || second === undefined) return null;
  const runtimePair = pathParentAndBasename(first);
  const scriptPair = pathParentAndBasename(second);
  if (!runtimePair || !scriptPair) return null;
  const [runtimeParent, runtimeName] = runtimePair;
  const [scriptParent, scriptName] = scriptPair;
  if (runtimeName.toLowerCase() !== "node.exe" || scriptName.toLowerCase() !== "index.js" || runtimeParent.toLowerCase() !== scriptParent.toLowerCase()) {
    return null;
  }
  const parts = runtimeParent.split(/[/\\]/).filter((c) => c.length > 0);
  const version = parts[parts.length - 1];
  const versions = parts[parts.length - 2];
  const pkg = parts[parts.length - 3];
  if (version === undefined || versions === undefined || pkg === undefined) return null;
  return pkg.toLowerCase() === "cursor-agent" && versions.toLowerCase() === "versions" && version.trim() !== "" ? "cursor" : null;
}

function pathParentAndBasename(path: string): [parent: string, basename: string] | null {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (idx === -1) return null;
  let parent = path.slice(0, idx);
  while (parent.endsWith("/") || parent.endsWith("\\")) parent = parent.slice(0, -1);
  const basename = path.slice(idx + 1);
  return parent === "" || basename === "" ? null : [parent, basename];
}

function windowsCmdArgAgentName(argv: string[]): string | null {
  const skipFlags = new Set(["/d", "/s", "/q", "/a", "/u", "/e:on", "/e:off", "/f:on", "/f:off", "/v:on", "/v:off"]);
  for (let i = 1; i < argv.length; i++) {
    const flag = trimMatchesAny(argv[i]!, ['"']).toLowerCase();
    if (flag === "/c" || flag === "/k") {
      const command = argv[i + 1];
      return command !== undefined ? commandTextAgentName(command) : null;
    }
    if (skipFlags.has(flag)) continue;
  }
  return null;
}

function powershellArgAgentName(argv: string[]): string | null {
  const passthroughWithValue = new Set(["-configurationname", "-executionpolicy", "-outputformat", "-psconsolefile", "-version", "-windowstyle", "-workingdirectory"]);
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    const flag = trimMatchesAny(arg, ['"']).toLowerCase();
    if (flag === "-file" || flag === "-f" || flag === "/file") {
      const p = argv[i + 1];
      return p !== undefined ? agentNameFromPathToken(p) : null;
    }
    if (flag === "-command" || flag === "-c" || flag === "/command" || flag === "/c") {
      const command = argv[i + 1];
      return command !== undefined ? commandTextAgentName(command) : null;
    }
    if (flag === "-encodedcommand" || flag === "-enc" || flag === "/encodedcommand" || flag === "/enc") return null;
    if (passthroughWithValue.has(flag)) {
      i++;
      continue;
    }
    if (flag.startsWith("-") || flag.startsWith("/")) continue;
    return agentNameFromPathToken(arg);
  }
  return null;
}

function commandTextToken(input: string): [token: string, rest: string] | null {
  const trimmed = input.replace(/^\s+/, "");
  if (trimmed.length === 0) return null;
  const first = trimmed[0]!;
  if (first === '"' || first === "'") {
    const rest = trimmed.slice(1);
    const endIdx = rest.indexOf(first);
    return endIdx !== -1 ? [rest.slice(0, endIdx), rest.slice(endIdx + 1)] : [rest, ""];
  }
  const m = /\s/.exec(trimmed);
  const end = m ? m.index : trimmed.length;
  return [trimmed.slice(0, end), trimmed.slice(end)];
}

function commandTextAgentName(command: string): string | null {
  let rest = command;
  for (;;) {
    const tokenPair = commandTextToken(rest);
    if (tokenPair === null) return null;
    const [rawToken, next] = tokenPair;
    const token = rawToken.trim();
    if (token === "&" || token.toLowerCase() === "." || token.toLowerCase() === "call") {
      rest = next;
      continue;
    }
    return agentNameFromPathToken(token);
  }
}

function scriptArgAgentName(argv: string[], evalFlags: string[], moduleFlags: string[]): string | null {
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      const next = argv[i + 1];
      return next !== undefined ? agentNameFromPathToken(next) : null;
    }
    if (flagMatches(arg, evalFlags) || flagMatches(arg, moduleFlags)) return null;
    if (arg.startsWith("-")) {
      if (optionTakesValue(arg)) i++;
      continue;
    }
    return agentNameFromPathToken(arg);
  }
  return null;
}

function flagMatches(arg: string, flags: string[]): boolean {
  return flags.some((flag) => arg === flag || shortFlagPayload(arg, flag) || longFlagValue(arg, flag));
}
function shortFlagPayload(arg: string, flag: string): boolean {
  return flag.startsWith("-") && !flag.startsWith("--") && arg.startsWith(flag) && arg.length > flag.length;
}
function longFlagValue(arg: string, flag: string): boolean {
  return flag.startsWith("--") && arg.startsWith(flag) && arg[flag.length] === "=";
}
function optionTakesValue(arg: string): boolean {
  return ["-r", "--require", "--loader", "--import", "--experimental-loader", "--inspect-port", "-W", "-X", "-S", "-L", "-o"].includes(arg);
}

function argv0AgentName(argv: string[]): string | null {
  const first = argv[0];
  return first !== undefined ? agentNameFromPathToken(first) : null;
}

function agentNameFromPathToken(token: string): string | null {
  const trimmed = trimMatchesAny(token, ['"', "'"]);
  if (trimmed === "" || trimmed.startsWith("-")) return null;
  // herdr の順序：basename 単体での判定 → 既知パッケージのパス → (ファイルシステムでの解決。D49 で省略)。
  return lookupAgentKind(pathBasename(trimmed)) ?? agentNameFromKnownPackagePath(trimmed);
}

/** `node_modules` 配下の既知のパッケージのパス（herdr の `agent_name_from_known_package_path`）。 */
function agentNameFromKnownPackagePath(path: string): string | null {
  const rawComponents = path.split(/[/\\]/).filter((c) => c.length > 0);
  const endsWithRaw = (suffix: string[]): boolean => {
    if (rawComponents.length < suffix.length) return false;
    const tail = rawComponents.slice(rawComponents.length - suffix.length);
    return tail.every((actual, i) => actual.toLowerCase() === suffix[i]!.toLowerCase());
  };
  if (
    endsWithRaw(["node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"]) ||
    endsWithRaw(["node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js"])
  ) {
    return "pi";
  }
  if (endsWithRaw(["node_modules", "@moonshot-ai", "kimi-code", "dist", "main.mjs"])) return "kimi";

  const normalized = rawComponents.map((c) => normalizedAgentLookupName(c));
  for (let i = 0; i + 5 <= normalized.length; i++) {
    if (arrayEquals(normalized.slice(i, i + 5), ["node_modules", "@qwen-code", "qwen-code", "dist", "index"])) return "qwen";
  }
  for (let i = 0; i + 4 <= normalized.length; i++) {
    if (arrayEquals(normalized.slice(i, i + 4), ["node_modules", "@letta-ai", "letta-code", "letta"])) return "letta";
  }
  return null;
}

function arrayEquals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function trimMatchesAny(s: string, chars: string[]): string {
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s[start]!)) start++;
  while (end > start && chars.includes(s[end - 1]!)) end--;
  return s.slice(start, end);
}
