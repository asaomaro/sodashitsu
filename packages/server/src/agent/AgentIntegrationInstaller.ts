import { access, copyFile, mkdir, readFile, rm, constants as fsConstants } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { homedir } from "node:os";
import type { AgentIntegrationKind } from "@sodashitsu/protocol";
import { writeFileAtomic } from "../persist/atomicFile.js";

/** 導入・解除・状態判定（20260923-agent-session-resume design「振る舞いの詳細・導入/解除」）。 */
export interface AgentIntegrationInstaller {
  status(
    kind: AgentIntegrationKind,
  ): Promise<{ cliDetected: boolean; installed: boolean; needsUpdate: boolean }>;
  install(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }>;
  uninstall(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }>;
}

/** 本製品の hook エントリだと分かる目印。install/uninstall/status のすべてがこれで一致を見る（design D4）。 */
const HOOK_SCRIPT_NAME = "soda-agent-report.cjs";
const MATCHER = "startup|resume";

/** 削除した後に残す、何もしないスクリプト（標準出力にも書かず、正常に終わる）。 */
const NOOP_HOOK_SCRIPT =
  '#!/usr/bin/env node\n"use strict";\n// 本製品のフック連携は削除されました。何もしません（導入し直すと、本物のスクリプトに写し直されます）。\n';

type JsonObject = Record<string, unknown>;

/** 以前の版が入れた形・場所（20261007-agent-hook-drift）。見つけたら「更新が必要」にし、install が入れ直して除く。 */
interface LegacyHookSpec {
  configFile(env: NodeJS.ProcessEnv, home: string): string;
  hooksDir(env: NodeJS.ProcessEnv, home: string): string;
  entriesPath: string[];
  isOurs(entry: unknown): boolean;
}

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
  /** `binName` のほかに、CLI の検出に使う名前。 */
  altBinNames?: string[];
  /** 以前の版が入れた形・場所。status は「更新が必要」、install は入れ直して除く、uninstall は一緒に除く。 */
  legacy?: LegacyHookSpec[];
  /** 設定ファイルを解釈できなかったときに、知らせに足す一言。 */
  unparsableHint?: string;
  /** SessionStart 相当の配列が、設定ファイルのオブジェクト内のどこにあるか（ネストしたキーの経路）。 */
  entriesPath: string[];
  /** 1エントリを組み立てる。 */
  buildEntry(scriptPath: string, kind: AgentIntegrationKind): JsonObject;
  /**
   * `entriesPath` のほかに入れるエントリ（20261004-subagent-display。サブエージェントの表示に使うイベント）。持つのは claude だけ。
   * 導入済みの利用者には `needsUpdate` で知らせ、［更新］で足りない分だけ足す。
   */
  extraEntries?: {
    path: string[];
    build(scriptPath: string, kind: AgentIntegrationKind): JsonObject;
  }[];
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
  const child =
    typeof childRaw === "object" && childRaw !== null && !Array.isArray(childRaw)
      ? (childRaw as JsonObject)
      : {};
  return { ...root, [head]: setPath(child, rest, entries) };
}

/** 経路が「配列」「無い」「配列でない値（途中がオブジェクトでないのも含む）」のどれか。配列でなければ、書き込むと利用者の設定を壊すので断る。 */
function pathShape(root: JsonObject, path: readonly string[]): "array" | "absent" | "invalid" {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === undefined) return "absent";
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return "invalid";
    cur = (cur as JsonObject)[key];
  }
  if (cur === undefined) return "absent";
  return Array.isArray(cur) ? "array" : "invalid";
}

/** ネストした経路のキーを消す（他のキーは保つ。経路が無ければそのまま）。 */
function deletePath(root: JsonObject, path: readonly string[]): JsonObject {
  const [head, ...rest] = path as [string, ...string[]];
  if (rest.length === 0) {
    const others = { ...root };
    delete others[head];
    return others;
  }
  const child = root[head];
  if (typeof child !== "object" || child === null || Array.isArray(child)) return root;
  return { ...root, [head]: deletePath(child as JsonObject, rest) };
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
  return {
    matcher: MATCHER,
    hooks: [{ type: "command", command: hookCommand(scriptPath, kind), async: true }],
  };
}

/** Devin CLI・Droid と同じ形（`{matcher, hooks:[{type:"command",command,timeout}]}`。`async`ではなく`timeout`）。 */
function nestedTimeoutEntry(scriptPath: string, kind: AgentIntegrationKind): JsonObject {
  return {
    matcher: "",
    hooks: [{ type: "command", command: hookCommand(scriptPath, kind), timeout: 10 }],
  };
}

/** 同期で動かす（`timeout` 秒で打ち切る）。実行前 → 起動の報告が順に届くようにするため（design「フックごとに同期・非同期を決める」）。 */
function nestedSyncEntry(
  matcher: string,
): (scriptPath: string, kind: AgentIntegrationKind) => JsonObject {
  return (scriptPath, kind) => ({
    matcher,
    hooks: [{ type: "command", command: hookCommand(scriptPath, kind), timeout: 5 }],
  });
}

/** 非同期で動かす（順序に頼らない報告）。 */
function nestedAsyncAnyEntry(scriptPath: string, kind: AgentIntegrationKind): JsonObject {
  return {
    matcher: "",
    hooks: [{ type: "command", command: hookCommand(scriptPath, kind), async: true }],
  };
}

/** Devin CLI の利用者の設定の場所（research D1・D6）。`XDG_CONFIG_HOME`・`DEVIN_CONFIG_DIR` は見ない（decisions D2）。 */
export function devinUserConfigDir(
  env: NodeJS.ProcessEnv,
  home: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32" && env.APPDATA) return join(env.APPDATA, "devin");
  return join(home, ".config", "devin");
}

const HOOK_SPECS: Record<AgentIntegrationKind, HookSpec> = {
  claude: {
    configFile: (env, home) =>
      join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "settings.json"), // research.md F4.5（旧 F4.5 相当）
    hooksDir: (env, home) => join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "hooks"),
    binName: "claude",
    entriesPath: ["hooks", "SessionStart"],
    buildEntry: nestedAsyncEntry,
    isOurs: isOursNested,
    extraEntries: [
      { path: ["hooks", "PreToolUse"], build: nestedSyncEntry("Agent|Task") },
      { path: ["hooks", "SubagentStart"], build: nestedSyncEntry("") },
      { path: ["hooks", "Stop"], build: nestedSyncEntry("") },
      { path: ["hooks", "SubagentStop"], build: nestedAsyncAnyEntry },
      { path: ["hooks", "SessionEnd"], build: nestedAsyncAnyEntry },
    ],
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
    // 公式文書（research D1・D2。2026-10-07。文書だけで確認、実機は未確認）: 利用者の設定 `config.json` の `hooks` キー。
    configFile: (env, home) => join(devinUserConfigDir(env, home), "config.json"),
    hooksDir: (env, home) => join(devinUserConfigDir(env, home), "hooks"),
    binName: "devin",
    entriesPath: ["hooks", "SessionStart"],
    buildEntry: nestedTimeoutEntry,
    isOurs: isOursNested,
    unparsableHint:
      "Devin CLI の設定はコメントつきの JSON を許しますが、本製品はコメントの入ったファイルを書き換えられません",
    // 以前の版が書いた `hooks.json`（推測した場所。decisions D2）。
    legacy: [
      {
        configFile: (env, home) => join(env.DEVIN_CONFIG_DIR || join(home, ".devin"), "hooks.json"),
        hooksDir: (env, home) => join(env.DEVIN_CONFIG_DIR || join(home, ".devin"), "hooks"),
        entriesPath: ["SessionStart"],
        isOurs: isOursNested,
      },
    ],
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
    // 現行の公式文書の形（入れ子。`matcher` は省く）。20261007-agent-hook-drift の research G2・G3、decisions D1。
    buildEntry: (scriptPath, kind) => ({
      hooks: [{ type: "command", command: hookCommand(scriptPath, kind), timeout: 10 }],
    }),
    isOurs: isOursNested,
    // 以前の版が書いた平らな形（同じファイル・同じ経路）。
    legacy: [
      {
        configFile: (_env, home) => join(home, ".grok", "hooks", "soda-agent-report.json"),
        hooksDir: (_env, home) => join(home, ".grok", "hooks"),
        entriesPath: ["hooks", "SessionStart"],
        isOurs: isOursField("command"),
      },
    ],
  },
  qwen: {
    configFile: (_env, home) => join(home, ".qwen", "settings.json"),
    hooksDir: (_env, home) => join(home, ".qwen", "hooks"),
    binName: "qwen",
    entriesPath: ["hooks", "SessionStart"],
    buildEntry: (scriptPath, kind) => ({
      type: "command",
      command: hookCommand(scriptPath, kind),
      name: "soda-agent-report",
      async: true,
    }),
    isOurs: isOursField("command"),
  },
};

async function readJsonObject(
  path: string,
): Promise<{ ok: true; data: JsonObject } | { ok: false }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if (isEnoent(err)) return { ok: true, data: {} };
    return { ok: false };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return { ok: false };
    return { ok: true, data: parsed as JsonObject };
  } catch {
    return { ok: false };
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}

function hookScriptPathFor(hooksDir: string): string {
  return join(hooksDir, HOOK_SCRIPT_NAME);
}

async function isOnPath(binNames: readonly string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  const candidates = binNames.flatMap((binName) =>
    process.platform === "win32"
      ? [binName, `${binName}.cmd`, `${binName}.exe`, `${binName}.bat`]
      : [binName],
  );
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

/** 経路から `isOurs` のエントリを除く。除いて空ならキーごと消す。自分のエントリが無ければそのまま返す。 */
function removeOurs(
  root: JsonObject,
  path: readonly string[],
  isOurs: (entry: unknown) => boolean,
): { root: JsonObject; found: boolean } {
  const entries = getPath(root, path);
  if (!entries.some(isOurs)) return { root, found: false };
  const remaining = entries.filter((e) => !isOurs(e));
  return {
    root: remaining.length === 0 ? deletePath(root, path) : setPath(root, path, remaining),
    found: true,
  };
}

interface LegacyHit {
  legacy: LegacyHookSpec;
  file: string;
  root: JsonObject;
}

function unparsable(spec: HookSpec, configFile: string): { ok: false; message: string } {
  return {
    ok: false,
    message:
      `設定ファイルを解釈できませんでした（${configFile}）` +
      (spec.unparsableHint ? `。${spec.unparsableHint}` : ""),
  };
}

export class FsAgentIntegrationInstaller implements AgentIntegrationInstaller {
  constructor(
    /** 同梱の hook スクリプト本体（`packages/server/assets/agent-hook-report.cjs`）のパス。 */
    private readonly hookScriptSource: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly home: string = homedir(),
  ) {}

  async status(
    kind: AgentIntegrationKind,
  ): Promise<{ cliDetected: boolean; installed: boolean; needsUpdate: boolean }> {
    const spec = HOOK_SPECS[kind];
    const configFile = spec.configFile(this.env, this.home);
    const [cliDetected, read, hits] = await Promise.all([
      isOnPath([spec.binName, ...(spec.altBinNames ?? [])], this.env),
      readJsonObject(configFile),
      this.legacyHits(spec),
    ]);
    const current = read.ok && getPath(read.data, spec.entriesPath).some(spec.isOurs);
    const installed = current || hits.length > 0;
    // 今の設定ファイルが読めない・書く先の形が違うときは、押しても直らないので「更新が必要」を出さない。
    const fixable =
      read.ok &&
      [spec.entriesPath, ...(spec.extraEntries ?? []).map((e) => e.path)].every(
        (p) => pathShape(read.data, p) !== "invalid",
      );
    const needsUpdate =
      fixable &&
      read.ok &&
      (hits.length > 0 || (current && (await this.needsUpdate(spec, read.data))));
    return { cliDetected, installed, needsUpdate };
  }

  /** 以前の版のエントリがあるファイル。読めない・無いファイルは「無い」扱い。 */
  private async legacyHits(spec: HookSpec): Promise<LegacyHit[]> {
    const hits: LegacyHit[] = [];
    for (const legacy of spec.legacy ?? []) {
      const file = legacy.configFile(this.env, this.home);
      const read = await readJsonObject(file);
      if (read.ok && getPath(read.data, legacy.entriesPath).some(legacy.isOurs))
        hits.push({ legacy, file, root: read.data });
    }
    return hits;
  }

  /** 別のファイルにある古いエントリを除く。空になったファイルは消す。古い場所のスクリプトも消す。 */
  private async removeLegacyFile(spec: HookSpec, hit: LegacyHit): Promise<void> {
    const { root } = removeOurs(hit.root, hit.legacy.entriesPath, hit.legacy.isOurs);
    if (Object.keys(root).length === 0) await rm(hit.file, { force: true });
    else await writeFileAtomic(hit.file, JSON.stringify(root, null, 2));
    const oldDir = hit.legacy.hooksDir(this.env, this.home);
    if (oldDir !== spec.hooksDir(this.env, this.home))
      await rm(hookScriptPathFor(oldDir), { force: true });
  }

  /**
   * 導入済みで、本製品のフックが足りない（追加のエントリのどれかの経路に自分のエントリが無い）か、写した先のスクリプトが古い。
   * 追加のエントリを持たない kind は常に false。同梱のスクリプトが読めないときも false（押しても直らない「更新が必要」を出さない）。
   */
  private async needsUpdate(spec: HookSpec, root: JsonObject): Promise<boolean> {
    const extras = spec.extraEntries;
    if (!extras || extras.length === 0) return false;
    let bundled: Buffer;
    try {
      bundled = await readFile(this.hookScriptSource);
    } catch {
      return false;
    }
    // 経路の値が配列でないとき、`install()` は断る（直せない）ので、「更新が必要」は出さない。
    if (extras.some((e) => pathShape(root, e.path) === "invalid")) return false;
    if (extras.some((e) => !getPath(root, e.path).some(spec.isOurs))) return true;
    const installedScript = await readFile(
      hookScriptPathFor(spec.hooksDir(this.env, this.home)),
    ).catch(() => undefined);
    return installedScript === undefined || !installedScript.equals(bundled);
  }

  async install(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }> {
    const spec = HOOK_SPECS[kind];
    const configFile = spec.configFile(this.env, this.home);
    const hooksDir = spec.hooksDir(this.env, this.home);
    const read = await readJsonObject(configFile);
    if (!read.ok) return unparsable(spec, configFile);
    const root = read.data;
    const targets = [
      { path: spec.entriesPath, build: spec.buildEntry },
      ...(spec.extraEntries ?? []),
    ];
    if (targets.some((t) => pathShape(root, t.path) === "invalid")) {
      return {
        ok: false,
        message: `設定ファイルの形が想定と違うため、何も変えませんでした（${configFile}）`,
      };
    }
    const hits = await this.legacyHits(spec);
    const installed = getPath(root, spec.entriesPath).some(spec.isOurs);
    if (installed && hits.length === 0 && !(await this.needsUpdate(spec, root)))
      return { ok: true, message: "既に導入済みです" };

    await mkdir(hooksDir, { recursive: true });
    await copyFile(this.hookScriptSource, hookScriptPathFor(hooksDir));

    const scriptPath = hookScriptPathFor(hooksDir);
    let updated = root;
    // 同じファイルにある古いエントリは、足す前に除く。
    for (const hit of hits) {
      if (hit.file === configFile)
        updated = removeOurs(updated, hit.legacy.entriesPath, hit.legacy.isOurs).root;
    }
    for (const t of targets) {
      const entries = getPath(updated, t.path);
      if (entries.some(spec.isOurs)) continue; // 足りない経路にだけ足す（重ねない。利用者のほかのフックは保つ）
      updated = setPath(updated, t.path, [...entries, t.build(scriptPath, kind)]);
    }
    await mkdir(dirname(configFile), { recursive: true });
    await writeFileAtomic(configFile, JSON.stringify(updated, null, 2));
    // 別のファイルの古いものは、新しいほうを書いた後に片づける（途中で失敗しても導入済みの状態が失われない）。
    for (const hit of hits) {
      if (hit.file !== configFile) await this.removeLegacyFile(spec, hit);
    }
    return {
      ok: true,
      message: hits.length > 0 ? "古い形のフックを、現行の形に入れ直しました" : null,
    };
  }

  async uninstall(kind: AgentIntegrationKind): Promise<{ ok: boolean; message: string | null }> {
    const spec = HOOK_SPECS[kind];
    const configFile = spec.configFile(this.env, this.home);
    const hooksDir = spec.hooksDir(this.env, this.home);
    // 1. 別のファイルにある古いものを片づける。
    const hits = await this.legacyHits(spec);
    let otherRemoved = false;
    for (const hit of hits) {
      if (hit.file === configFile) continue;
      await this.removeLegacyFile(spec, hit);
      otherRemoved = true;
    }
    // 2. 今の設定ファイル。
    const read = await readJsonObject(configFile);
    if (!read.ok) return otherRemoved ? { ok: true, message: null } : unparsable(spec, configFile);
    // 3. 全経路から自分のエントリと、同じファイルにある古いエントリを除く。どこにも無いときだけ「未導入でした」。
    let updated = read.data;
    let found = false;
    for (const path of [spec.entriesPath, ...(spec.extraEntries ?? []).map((e) => e.path)]) {
      const r = removeOurs(updated, path, spec.isOurs);
      updated = r.root;
      found ||= r.found;
    }
    for (const legacy of spec.legacy ?? []) {
      if (legacy.configFile(this.env, this.home) !== configFile) continue;
      const r = removeOurs(updated, legacy.entriesPath, legacy.isOurs);
      updated = r.root;
      found ||= r.found;
    }
    if (!found)
      return otherRemoved ? { ok: true, message: null } : { ok: true, message: "未導入でした" };

    await writeFileAtomic(configFile, JSON.stringify(updated, null, 2));
    const scriptPath = hookScriptPathFor(hooksDir);
    if (spec.extraEntries) {
      // 動いている Claude Code は、起動した時点のフックの設定のまま、同期のフックでこのスクリプトを呼び続ける。消すと失敗（exit 1）が続くので、
      // 何もしない中身に差し替える（次の導入で本物に写し直す。20261004-subagent-display の decisions D9）。
      if (
        await access(scriptPath).then(
          () => true,
          () => false,
        )
      )
        await writeFileAtomic(scriptPath, NOOP_HOOK_SCRIPT);
    } else {
      await rm(scriptPath, { force: true });
    }
    return { ok: true, message: null };
  }
}
