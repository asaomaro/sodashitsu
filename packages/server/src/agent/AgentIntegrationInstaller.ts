import { access, copyFile, mkdir, readFile, rm, constants as fsConstants } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AgentIntegrationKind } from "@sodashitsu/protocol";
import { writeFileAtomic } from "../persist/atomicFile.js";

/** 導入・解除・状態判定（20260923-agent-session-resume design「振る舞いの詳細・導入/解除」）。 */
export interface AgentIntegrationInstaller {
  status(kind: AgentIntegrationKind): Promise<{ cliDetected: boolean; installed: boolean }>;
  install(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }>;
  uninstall(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }>;
}

/** 本製品の hook エントリだと分かる目印。install/uninstall/status のすべてがこれで一致を見る（design D4）。 */
const HOOK_SCRIPT_NAME = "soda-agent-report.cjs";
const MATCHER = "startup|resume";

type JsonObject = Record<string, unknown>;

/**
 * kind ごとの hook 設定の違い（20260923-other-agents-session-resume design「HookSpec」）。research.md F4
 * で判明したとおり、設定ファイルのトップレベル構造（3パターン）・hook エントリの形（5パターン以上）は
 * エージェントごとに異なるため、この4点（+configFile/hooksDir/binName）だけを kind ごとに持たせ、
 * 読み込み・書き込み・マージ・アトミック書き出しは共通のまま保つ。
 */
interface HookSpec {
  configFile(env: NodeJS.ProcessEnv, home: string): string;
  hooksDir(env: NodeJS.ProcessEnv, home: string): string;
  binName: string;
  /** SessionStart 相当の配列が、設定ファイルのオブジェクト内のどこにあるか（ネストしたキーの経路）。 */
  entriesPath: string[];
  /** 1エントリを組み立てる。 */
  buildEntry(scriptPath: string, kind: AgentIntegrationKind): JsonObject;
  /** そのエントリが本製品の hook か判定する（コマンド文字列に `HOOK_SCRIPT_NAME` を含むか）。 */
  isOurs(entry: unknown): boolean;
}

/** ネストした経路を辿って配列を取り出す。存在しない・形が違えば空配列（＝「本製品のエントリは無い」扱い）。 */
function getPath(root: JsonObject, path: readonly string[]): unknown[] {
  let cur: unknown = root;
  for (const key of path) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return [];
    cur = (cur as JsonObject)[key];
  }
  return Array.isArray(cur) ? cur : [];
}

/** ネストした経路へ配列を書き戻す。途中のオブジェクトが無ければ作る。他のキーは保つ（非破壊マージ）。 */
function setPath(root: JsonObject, path: readonly string[], entries: unknown[]): JsonObject {
  if (path.length === 0) return root;
  const [head, ...rest] = path as [string, ...string[]];
  if (rest.length === 0) return { ...root, [head]: entries };
  const childRaw = root[head];
  const child = typeof childRaw === "object" && childRaw !== null && !Array.isArray(childRaw) ? (childRaw as JsonObject) : {};
  return { ...root, [head]: setPath(child, rest, entries) };
}

/** `{hooks:[{command}]}` のようにコマンドが1段ネストしているエントリからコマンド文字列を集める。 */
function nestedCommandsOf(entry: unknown): string[] {
  if (typeof entry !== "object" || entry === null) return [];
  const hooks = (entry as JsonObject).hooks;
  if (!Array.isArray(hooks)) return [];
  return hooks
    .map((h) => (typeof h === "object" && h !== null ? (h as JsonObject).command : undefined))
    .filter((c): c is string => typeof c === "string");
}
function isOursNested(entry: unknown): boolean {
  return nestedCommandsOf(entry).some((c) => c.includes(HOOK_SCRIPT_NAME));
}

/** エントリ直下の `field` にコマンド文字列を持つ形（ネスト無し。Cursor・Grok・Qwen Code・Copilot の bash/powershell）。 */
function isOursField(field: string): (entry: unknown) => boolean {
  return (entry: unknown): boolean => {
    if (typeof entry !== "object" || entry === null) return false;
    const c = (entry as JsonObject)[field];
    return typeof c === "string" && c.includes(HOOK_SCRIPT_NAME);
  };
}

function hookCommand(scriptPath: string, kind: AgentIntegrationKind): string {
  // 素の二重引用符で囲む（`JSON.stringify` の `\`エスケープは POSIX シェル・cmd.exe のどちらの
  // クォート規則とも一致しない。パスに空白を含む場合の対策としては、これで両方に通る）。
  return `node "${scriptPath}" ${kind}`;
}

/** Claude Code・Codex と同じ形（`{matcher, hooks:[{type:"command",command,async:true}]}`）。 */
function nestedAsyncEntry(scriptPath: string, kind: AgentIntegrationKind): JsonObject {
  return { matcher: MATCHER, hooks: [{ type: "command", command: hookCommand(scriptPath, kind), async: true }] };
}

/** Devin CLI・Droid と同じ形（`{matcher, hooks:[{type:"command",command,timeout}]}`。`async`ではなく`timeout`）。 */
function nestedTimeoutEntry(scriptPath: string, kind: AgentIntegrationKind): JsonObject {
  return { matcher: "", hooks: [{ type: "command", command: hookCommand(scriptPath, kind), timeout: 10 }] };
}

const HOOK_SPECS: Record<AgentIntegrationKind, HookSpec> = {
  claude: {
    configFile: (env, home) => join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "settings.json"), // research.md F4.5（旧 F4.5 相当）
    hooksDir: (env, home) => join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "hooks"),
    binName: "claude",
    entriesPath: ["hooks", "SessionStart"],
    buildEntry: nestedAsyncEntry,
    isOurs: isOursNested,
  },
  codex: {
    configFile: (env, home) => join(env.CODEX_HOME || join(home, ".codex"), "hooks.json"), // research.md F5.5（旧 F5.5 相当）
    hooksDir: (env, home) => join(env.CODEX_HOME || join(home, ".codex"), "hooks"),
    binName: "codex",
    entriesPath: ["hooks", "SessionStart"],
    buildEntry: nestedAsyncEntry,
    isOurs: isOursNested,
  },
  // 20260923-other-agents-session-resume（design「8 kind の HookSpec 一覧」）。
  cursor: {
    configFile: (_env, home) => join(home, ".cursor", "hooks.json"),
    hooksDir: (_env, home) => join(home, ".cursor", "hooks"),
    binName: "cursor-agent",
    entriesPath: ["hooks", "sessionStart"], // 小文字始まり（research F4）
    buildEntry: (scriptPath, kind) => ({ type: "command", command: hookCommand(scriptPath, kind) }),
    isOurs: isOursField("command"),
  },
  copilot: {
    // glob ディレクトリ（`~/.copilot/hooks/*.json`）なので、利用者の既存ファイルは読まず専用ファイルを置く（design「振る舞いの詳細」）。
    configFile: (_env, home) => join(home, ".copilot", "hooks", "soda-agent-report.json"),
    hooksDir: (_env, home) => join(home, ".copilot", "hooks"),
    binName: "copilot",
    entriesPath: ["hooks", "sessionStart"],
    buildEntry: (scriptPath, kind) => {
      const command = hookCommand(scriptPath, kind);
      return { type: "command", bash: command, powershell: command, timeoutSec: 10 };
    },
    isOurs: isOursField("bash"),
  },
  devin: {
    // 設定ファイルパスは公式ドキュメントに記載が無く推測値（decisions D4）。他5エージェントとは確度が異なる。
    configFile: (env, home) => join(env.DEVIN_CONFIG_DIR || join(home, ".devin"), "hooks.json"),
    hooksDir: (env, home) => join(env.DEVIN_CONFIG_DIR || join(home, ".devin"), "hooks"),
    binName: "devin",
    entriesPath: ["SessionStart"], // `hooks` ラップ無し（research F4）
    buildEntry: nestedTimeoutEntry,
    isOurs: isOursNested,
  },
  droid: {
    configFile: (_env, home) => join(home, ".factory", "hooks.json"),
    hooksDir: (_env, home) => join(home, ".factory", "hooks"),
    binName: "droid",
    entriesPath: ["SessionStart"],
    buildEntry: nestedTimeoutEntry,
    isOurs: isOursNested,
  },
  grok: {
    // glob ディレクトリ（`~/.grok/hooks/*.json`）なので copilot と同じく専用ファイルを置く。
    configFile: (_env, home) => join(home, ".grok", "hooks", "soda-agent-report.json"),
    hooksDir: (_env, home) => join(home, ".grok", "hooks"),
    binName: "grok",
    entriesPath: ["hooks", "SessionStart"],
    buildEntry: (scriptPath, kind) => ({ matcher: "", type: "command", command: hookCommand(scriptPath, kind), timeout: 10 }),
    isOurs: isOursField("command"),
  },
  qwen: {
    configFile: (_env, home) => join(home, ".qwen", "settings.json"),
    hooksDir: (_env, home) => join(home, ".qwen", "hooks"),
    binName: "qwen",
    entriesPath: ["hooks", "SessionStart"],
    buildEntry: (scriptPath, kind) => ({ type: "command", command: hookCommand(scriptPath, kind), name: "soda-agent-report", async: true }),
    isOurs: isOursField("command"),
  },
};

async function readJsonObject(path: string): Promise<{ ok: true; data: JsonObject } | { ok: false }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (isEnoent(err)) return { ok: true, data: {} };
    return { ok: false };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ok: false };
    return { ok: true, data: parsed as JsonObject };
  } catch {
    return { ok: false };
  }
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "ENOENT";
}

function hookScriptPathFor(hooksDir: string): string {
  return join(hooksDir, HOOK_SCRIPT_NAME);
}

async function isOnPath(binName: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  const candidates = process.platform === "win32" ? [binName, `${binName}.cmd`, `${binName}.exe`, `${binName}.bat`] : [binName];
  for (const dir of dirs) {
    for (const name of candidates) {
      try {
        await access(join(dir, name), fsConstants.X_OK);
        return true;
      } catch {
        // 次の候補へ
      }
    }
  }
  return false;
}

export class FsAgentIntegrationInstaller implements AgentIntegrationInstaller {
  constructor(
    /** 同梱の hook スクリプト本体（`packages/server/assets/agent-hook-report.cjs`）のパス。 */
    private readonly hookScriptSource: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly home: string = homedir(),
  ) {}

  async status(kind: AgentIntegrationKind): Promise<{ cliDetected: boolean; installed: boolean }> {
    const spec = HOOK_SPECS[kind];
    const configFile = spec.configFile(this.env, this.home);
    const [cliDetected, read] = await Promise.all([isOnPath(spec.binName, this.env), readJsonObject(configFile)]);
    const installed = read.ok && getPath(read.data, spec.entriesPath).some(spec.isOurs);
    return { cliDetected, installed };
  }

  async install(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }> {
    const spec = HOOK_SPECS[kind];
    const configFile = spec.configFile(this.env, this.home);
    const hooksDir = spec.hooksDir(this.env, this.home);
    const read = await readJsonObject(configFile);
    if (!read.ok) return { ok: false, message: `設定ファイルを解釈できませんでした（${configFile}）` };
    const root = read.data;
    const entries = getPath(root, spec.entriesPath);
    if (entries.some(spec.isOurs)) return { ok: true, message: "既に導入済みです" };

    await mkdir(hooksDir, { recursive: true });
    await copyFile(this.hookScriptSource, hookScriptPathFor(hooksDir));

    const scriptPath = hookScriptPathFor(hooksDir);
    const updated = setPath(root, spec.entriesPath, [...entries, spec.buildEntry(scriptPath, kind)]);
    await mkdir(dirname(configFile), { recursive: true });
    await writeFileAtomic(configFile, JSON.stringify(updated, null, 2));
    return { ok: true, message: null };
  }

  async uninstall(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }> {
    const spec = HOOK_SPECS[kind];
    const configFile = spec.configFile(this.env, this.home);
    const hooksDir = spec.hooksDir(this.env, this.home);
    const read = await readJsonObject(configFile);
    if (!read.ok) return { ok: false, message: `設定ファイルを解釈できませんでした（${configFile}）` };
    const root = read.data;
    const entries = getPath(root, spec.entriesPath);
    if (!entries.some(spec.isOurs)) return { ok: true, message: "未導入でした" };

    const remaining = entries.filter((e) => !spec.isOurs(e));
    const updated = setPath(root, spec.entriesPath, remaining);
    await writeFileAtomic(configFile, JSON.stringify(updated, null, 2));
    await rm(hookScriptPathFor(hooksDir), { force: true });
    return { ok: true, message: null };
  }
}
