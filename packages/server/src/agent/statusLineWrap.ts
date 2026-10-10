import { readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { StatusLineWrapState } from "@sodashitsu/protocol";
import { writeFileAtomic } from "../persist/atomicFile.js";
import { writeConfigFile } from "./AgentIntegrationInstaller.js";
import { appendMember, findMember, removeMember, renderValue, replaceValue, scanTopObject } from "./statusLineEdit.js";

/**
 * Claude Code のステータスラインの包みの導入・外す・状態（20261010-agent-usage の PR2。AC1〜AC3）。
 * **書き換えるのは、設定画面で押したときだけ**（フックの［導入］とは別の項目）。`~/.claude/settings.json`（`CLAUDE_CONFIG_DIR`）の
 * トップレベルの `statusLine` 1 項目だけを、**文字列のまま**（書式・インデント・並び・末尾の改行を保って）差し替える。導入 → 外す で、設定のファイルは
 * 1 バイトも違わず戻る（`installedText` と今の中身が同じなら、控えた元のファイル全体を戻す。違えば、その 1 項目だけを戻す）。
 * プロジェクトの設定（`.claude/settings.json`）には触らない。
 *
 * 元の控えは 2 か所: 横のファイル（`soda-statusline.orig.json`。0600）と、包みの command の引数（base64url）。包みは引数を先に読む。
 */

export const STATUSLINE_SCRIPT_NAME = "soda-statusline.cjs";
export const STATUSLINE_SIDECAR_NAME = "soda-statusline.orig.json";

interface Sidecar {
  schema: 1;
  /** 元の `statusLine` のオブジェクト全体。無かったなら null。 */
  original: Record<string, unknown> | null;
  /** 元の値の文字列そのもの（戻すとき、そのまま差し戻す）。元が無かったなら null。 */
  originalValueText: string | null;
  /** 元が無く、設定のファイルが「項目の無いオブジェクト」か、ファイル自体が無かったとき、元のファイル全体（戻すとき、そのまま戻す）。 */
  fileBefore: string | null;
  fileMissing: boolean;
  /** 導入のとき書いた、設定のファイル全体（今の中身と同じなら、`fileBefore`／`fileMissing` で元へ戻す）。 */
  installedText: string;
}

export interface StatusLineInfo {
  state: StatusLineWrapState;
  message?: string;
}

type Failure = { ok: false; message: string };

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

/** 設定のフォルダ・フックのフォルダ・スクリプト・控えの場所（`CLAUDE_CONFIG_DIR`。無ければ `~/.claude`）。 */
export function statusLinePaths(env: NodeJS.ProcessEnv, home: string): { configFile: string; hooksDir: string; script: string; sidecar: string } {
  const root = env.CLAUDE_CONFIG_DIR || join(home, ".claude");
  const hooksDir = join(root, "hooks");
  return { configFile: join(root, "settings.json"), hooksDir, script: join(hooksDir, STATUSLINE_SCRIPT_NAME), sidecar: join(hooksDir, STATUSLINE_SIDECAR_NAME) };
}

/** 控え（base64url）の最大の長さ。超えるときは、まず元の値の文字列そのものを、それでも超えるなら元のオブジェクトも、引数に載せず、横のファイルだけに頼る（文書に書く）。 */
export const STATUSLINE_ARG_MAX = 8192;
/** 引数に載せる、元のファイル全体（項目の無いオブジェクトのとき）の最大の長さ。 */
const FILE_BEFORE_ARG_MAX = 512;

/**
 * 包みの command。パスに、シェルが解釈しうる文字があれば undefined（導入しない）。
 * 引数（控え）は `{ soda: 1, original, valueText }`: 元のオブジェクトと、**元の値の文字列そのもの**（横のファイルが無くても、外すと 1 バイトも違わず戻すため）。
 */
function wrapperCommand(script: string, original: Record<string, unknown> | null, valueText: string | null, fileBefore: string | null = null): string | undefined {
  if (/["$`\\\u0000-\u001f]/.test(script)) return undefined;
  const encode = (v: unknown): string => Buffer.from(JSON.stringify(v), "utf8").toString("base64url");
  // `fileBefore`: 元に項目が無く、設定が「項目の無いオブジェクト」だったときの、元のファイル全体（小さいときだけ。横のファイルが無くても戻せるように）。
  let arg = encode({ soda: 1, original, ...(valueText !== null ? { valueText } : {}), ...(fileBefore !== null ? { fileBefore } : {}) });
  if (arg.length > STATUSLINE_ARG_MAX) arg = encode({ soda: 1, original });
  // 元そのものが大きすぎるときは、引数に何も載せない（包みは横のファイルを読む。横のファイルが無いと、外せない旨を返す）。
  if (arg.length > STATUSLINE_ARG_MAX) arg = encode({ soda: 1 });
  return `node "${script}" ${arg}`;
}

/** command から、包みの引数（元の控え）を読む。読めなければ undefined。 */
function originalFromCommand(command: string): { original: Record<string, unknown> | null; valueText?: string; fileBefore?: string } | undefined {
  const m = new RegExp(`${STATUSLINE_SCRIPT_NAME.replace(".", "\\.")}"?\\s+([A-Za-z0-9_-]+)\\s*$`).exec(command);
  if (!m) return undefined;
  try {
    const v: unknown = JSON.parse(Buffer.from(m[1]!, "base64url").toString("utf8"));
    if (v === null) return { original: null };
    if (typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (o["soda"] === 1 && "original" in o) {
        const orig = o["original"];
        const valueText = typeof o["valueText"] === "string" ? o["valueText"] : undefined;
        const fileBefore = typeof o["fileBefore"] === "string" ? o["fileBefore"] : undefined;
        if (orig === null) return { original: null, ...(fileBefore !== undefined ? { fileBefore } : {}) };
        if (typeof orig === "object" && !Array.isArray(orig)) return { original: orig as Record<string, unknown>, ...(valueText !== undefined ? { valueText } : {}) };
        return undefined;
      }
      if (o["soda"] === 1) return undefined; // 引数に載せなかった（大きすぎる）。横のファイルだけが頼り。
      return { original: o };
    }
  } catch {
    /* 読めない */
  }
  return undefined;
}

type Read =
  | { kind: "missing" }
  | { kind: "text"; text: string }
  | { kind: "error"; message: string };

async function readText(file: string): Promise<Read> {
  try {
    return { kind: "text", text: await readFile(file, "utf8") };
  } catch (err) {
    if (isEnoent(err)) return { kind: "missing" };
    return { kind: "error", message: `設定ファイルを読めません（${(err as { code?: string }).code ?? "不明"}）` };
  }
}

type Parsed =
  | { ok: true; text: string; obj: NonNullable<ReturnType<typeof scanTopObject>> }
  | Failure;

function parseSettings(text: string): Parsed {
  const obj = scanTopObject(text);
  if (obj === null) return { ok: false, message: "設定ファイルを解釈できませんでした（JSON の形が壊れています）。何も変えませんでした" };
  try {
    JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, message: "設定ファイルを解釈できませんでした（JSON の形が壊れています）。何も変えませんでした" };
  }
  return { ok: true, text, obj };
}

export class StatusLineWrapper {
  private readonly paths: ReturnType<typeof statusLinePaths>;

  constructor(
    /** 同梱の包みのスクリプト（`packages/server/assets/soda-statusline.cjs`）。 */
    private readonly scriptSource: string,
    env: NodeJS.ProcessEnv = process.env,
    home: string = homedir(),
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    this.paths = statusLinePaths(env, home);
  }

  private async readSidecar(): Promise<Sidecar | null | "absent"> {
    try {
      const v: unknown = JSON.parse(await readFile(this.paths.sidecar, "utf8"));
      if (typeof v === "object" && v !== null && (v as { schema?: unknown }).schema === 1 && "original" in v) return v as Sidecar;
      return null;
    } catch (err) {
      return isEnoent(err) ? "absent" : null;
    }
  }

  async status(): Promise<StatusLineInfo> {
    if (this.platform === "win32") return { state: "unsupported", message: "Windows では、ステータスラインの包みは使えません（sh が無いため）" };
    const read = await readText(this.paths.configFile);
    if (read.kind === "error") return { state: "invalid", message: read.message };
    const sidecar = await this.readSidecar();
    if (read.kind === "missing") return { state: sidecar === "absent" ? "none" : "detached" };
    const parsed = parseSettings(read.text);
    if (!parsed.ok) return { state: "invalid", message: parsed.message };
    const member = findMember(parsed.obj, "statusLine");
    if (!member) return { state: sidecar === "absent" ? "none" : "detached" };
    const value = this.valueOf(parsed.text, member);
    if ("failure" in value) return { state: "invalid", message: value.failure };
    if (!value.ours) return { state: sidecar === "absent" ? "none" : "detached" };
    return { state: (await this.scriptCurrent()) ? "installed" : "needs_update" };
  }

  /** 項目の値を読む。`command` 型のオブジェクトでなければ failure。 */
  private valueOf(text: string, m: { valueStart: number; valueEnd: number }): { failure: string } | { value: Record<string, unknown>; command: string; ours: boolean } {
    let v: unknown;
    try {
      v = JSON.parse(text.slice(m.valueStart, m.valueEnd));
    } catch {
      return { failure: "statusLine の形が想定と違います（何も変えませんでした）" };
    }
    if (typeof v !== "object" || v === null || Array.isArray(v)) return { failure: "statusLine の形が想定と違います（オブジェクトではありません）。何も変えませんでした" };
    const o = v as Record<string, unknown>;
    if (o["type"] !== "command" || typeof o["command"] !== "string") return { failure: "statusLine の形が想定と違います（type が command でない）。何も変えませんでした" };
    return { value: o, command: o["command"], ours: o["command"].includes(STATUSLINE_SCRIPT_NAME) };
  }

  private async scriptCurrent(): Promise<boolean> {
    const [bundled, installed] = await Promise.all([readFile(this.scriptSource).catch(() => undefined), readFile(this.paths.script).catch(() => undefined)]);
    return bundled === undefined || (installed !== undefined && installed.equals(bundled));
  }

  async install(): Promise<{ ok: boolean; message: string | null }> {
    if (this.platform === "win32") return { ok: false, message: "Windows では、ステータスラインの包みは使えません（sh が無いため）" };
    const { configFile, hooksDir, script, sidecar } = this.paths;
    const read = await readText(configFile);
    if (read.kind === "error") return { ok: false, message: read.message };
    let text: string | null = null;
    let obj: NonNullable<ReturnType<typeof scanTopObject>> | null = null;
    if (read.kind === "text") {
      const parsed = parseSettings(read.text);
      if (!parsed.ok) return { ok: false, message: parsed.message };
      text = parsed.text;
      obj = parsed.obj;
    }
    const member = obj ? findMember(obj, "statusLine") : undefined;
    let original: Record<string, unknown> | null = null;
    let originalValueText: string | null = null;
    if (member && text !== null) {
      const v = this.valueOf(text, member);
      if ("failure" in v) return { ok: false, message: v.failure };
      if (v.ours) {
        // すでに包み: スクリプトが古ければ更新するだけ（設定は変えない）。
        if (await this.scriptCurrent()) return { ok: true, message: "既に導入済みです" };
        await this.writeScript();
        return { ok: true, message: "包みのスクリプトを更新しました" };
      }
      original = v.value;
      originalValueText = text.slice(member.valueStart, member.valueEnd);
    }
    const wholeNeeded = original === null && (text === null || obj?.members.length === 0);
    const command = wrapperCommand(script, original, originalValueText, wholeNeeded && text !== null && text.length <= FILE_BEFORE_ARG_MAX ? text : null);
    if (command === undefined) return { ok: false, message: "設定のフォルダのパスに、シェルが解釈しうる文字が含まれるため、導入できません" };
    const wrapped: Record<string, unknown> = original ? { ...original, command } : { type: "command", command };
    let newText: string;
    if (text === null || obj === null) newText = `${JSON.stringify({ statusLine: wrapped }, null, 2)}\n`;
    else if (member) newText = replaceValue(text, member, renderValue(wrapped, text, member.keyStart));
    else newText = appendMember(text, obj, "statusLine", wrapped);
    const side: Sidecar = { schema: 1, original, originalValueText, fileBefore: wholeNeeded ? text : null, fileMissing: text === null, installedText: newText };
    await this.writeScript();
    await writeFileAtomic(sidecar, `${JSON.stringify(side, null, 2)}\n`); // 0600
    await writeConfigFile(configFile, newText);
    void hooksDir;
    return { ok: true, message: null };
  }

  private async writeScript(): Promise<void> {
    const bundled = await readFile(this.scriptSource);
    await writeFileAtomic(this.paths.script, bundled.toString("utf8"));
  }

  async uninstall(): Promise<{ ok: boolean; message: string | null }> {
    if (this.platform === "win32") return { ok: true, message: "未導入でした" };
    const { configFile, sidecar } = this.paths;
    const read = await readText(configFile);
    if (read.kind === "error") return { ok: false, message: read.message };
    const side = await this.readSidecar();
    if (read.kind === "missing") return { ok: true, message: side === "absent" ? "未導入でした" : "外れています（利用者が替えました）。何も変えませんでした" };
    const parsed = parseSettings(read.text);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    const member = findMember(parsed.obj, "statusLine");
    const v = member ? this.valueOf(parsed.text, member) : undefined;
    if (!member || !v || "failure" in v || !v.ours) {
      return { ok: true, message: side === "absent" ? "未導入でした" : "外れています（利用者が替えました）。何も変えませんでした" };
    }
    const sc = side !== "absent" && side !== null ? side : undefined;
    // 信じる順は、包みと同じ: 引数が先・横のファイルが後。
    const fromArg = originalFromCommand(v.command);
    const original = fromArg ? fromArg.original : sc ? sc.original : undefined;
    if (original === undefined) return { ok: false, message: "元の statusLine の控えが読めないため、外せませんでした（設定は変えていません）" };
    if (original === null) {
      if (sc && sc.installedText === parsed.text && (sc.fileMissing || sc.fileBefore !== null)) {
        if (sc.fileMissing) await rm(configFile, { force: true });
        else await writeConfigFile(configFile, sc.fileBefore as string);
      } else {
        // 横のファイルが無くても、引数に元のファイル全体（項目の無いオブジェクト）があり、今の中身が「それに導入が足したもの」と同じなら、そのまま戻す。
        const fb = fromArg?.fileBefore;
        const fbObj = fb !== undefined ? scanTopObject(fb) : null;
        const expected = fb !== undefined && fbObj !== null ? appendMember(fb, fbObj, "statusLine", { type: "command", command: v.command }) : undefined;
        if (fb !== undefined && expected === parsed.text) await writeConfigFile(configFile, fb);
        else await writeConfigFile(configFile, removeMember(parsed.text, parsed.obj, member));
      }
    } else {
      // 戻す文字列: 控え（引数。包みと同じく先）の元の値の文字列 → 横のファイル → 作り直し（書式は整う。意味は同じ）。
      const valueText = fromArg?.valueText ?? sc?.originalValueText ?? renderValue(original, parsed.text, member.keyStart);
      await writeConfigFile(configFile, replaceValue(parsed.text, member, valueText));
    }
    await rm(sidecar, { force: true });
    return { ok: true, message: null };
  }
}
