import { constants as fsConstants } from "node:fs";
import { open as fsOpen, type FileHandle } from "node:fs/promises";
import { COMMAND_ID_RE, COMMAND_TYPES, parsePopupDimension, type CommandInfo } from "@wtm/protocol";
import { z } from "zod";

/**
 * 独自コマンドの設定ファイル（20260927-custom-command-keys。herdr の `[[keys.command]]`）。状態ディレクトリの `commands.json` にサーバの持ち主が書く
 * （名前付き session ではその session の状態ディレクトリ）。**1 つでも規則外ならファイル全体を採らない**（design「設計方針」）。
 * 採らなかった理由（`problem`）は path と種類だけから作り、**コマンドの文字列を入れない**。
 */

export const COMMANDS_FILE_NAME = "commands.json";
export const COMMANDS_FILE_MAX_BYTES = 65_536;
export const COMMANDS_MAX = 100;
export const COMMAND_TEXT_MAX = 4096;
export const COMMAND_DESCRIPTION_MAX = 200;

/** サーバの中だけで使う定義（`command` を持つ）。ブラウザへは `toCommandInfo` で落としてから渡す。 */
export interface CommandDef extends CommandInfo {
  command: string;
}

export interface CommandCatalog {
  commands: CommandDef[];
  /** 採らなかった理由（採ったなら null）。 */
  problem: string | null;
}

/** 改行（`\n`）以外の制御文字（U+0000〜U+001F・U+007F）。 */
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_ANY = /[\u0000-\u001f\u007f]/;

const dimension = z.union([z.number(), z.string()]).refine((v) => parsePopupDimension(v) !== null, {
  message: 'セル数（1〜1000 の整数）か "N%"（1〜100）にしてください',
});

const CommandEntry = z
  .strictObject({
    id: z.string().regex(COMMAND_ID_RE, {
      message: "id は小文字・数字・-・_ の 1〜64 文字（先頭は小文字か数字）にしてください",
    }),
    type: z.enum(COMMAND_TYPES, { message: "知らない種類です（popup・pane・shell のどれか）" }),
    command: z
      .string()
      .min(1, { message: "空のコマンドは使えません" })
      .max(COMMAND_TEXT_MAX, { message: `コマンドは ${COMMAND_TEXT_MAX} 文字までです` })
      .refine((v) => v.trim() !== "", { message: "空のコマンドは使えません" })
      .refine((v) => !CONTROL_EXCEPT_NEWLINE.test(v), {
        message: "コマンドに改行以外の制御文字は使えません",
      }),
    description: z
      .string()
      .min(1, { message: "説明が空です" })
      .max(COMMAND_DESCRIPTION_MAX, { message: `説明は ${COMMAND_DESCRIPTION_MAX} 文字までです` })
      .refine((v) => !CONTROL_ANY.test(v), { message: "説明に制御文字は使えません" })
      .optional(),
    width: dimension.optional(),
    height: dimension.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "popup" && (v.width !== undefined || v.height !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "width・height は popup にだけ書けます",
        path: [v.width !== undefined ? "width" : "height"],
      });
    }
  });

const CommandsFile = z
  .strictObject({
    commands: z
      .array(CommandEntry)
      .max(COMMANDS_MAX, { message: `コマンドは ${COMMANDS_MAX} 件までです` }),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.commands.forEach((c, i) => {
      if (seen.has(c.id))
        ctx.addIssue({
          code: "custom",
          message: "id が重複しています",
          path: ["commands", i, "id"],
        });
      seen.add(c.id);
    });
  });

function pathText(path: readonly PropertyKey[]): string {
  let out = "";
  for (const p of path)
    out += typeof p === "number" ? `[${p}]` : `${out === "" ? "" : "."}${String(p)}`;
  return out === "" ? "(全体)" : out;
}

/**
 * 知らない項目の名前を理由の文に出す形にする。名前は持ち主が書いたものだが、制御文字・長い名前はログ・トーストを汚すので、項目名らしい形
 * （英数字・`_`・`-` の 1〜32 文字）だけを出し、それ以外は伏せる。
 */
function safeKeyName(key: string): string {
  return /^[A-Za-z0-9_-]{1,32}$/.test(key) ? key : "（名前は省略）";
}

/** zod の issue を、値を含まない 1 行にする（`unrecognized_keys` は持ち主が書いた項目名だけを出す）。 */
function issueText(issue: z.core.$ZodIssue): string {
  const where = pathText(issue.path);
  if (issue.code === "unrecognized_keys")
    return `${where}: 知らない項目です（${issue.keys.map(safeKeyName).join(", ")}）`;
  if (issue.code === "invalid_type")
    return `${where}: 型が違います（${issue.expected} にしてください）`;
  if (
    issue.code === "custom" ||
    issue.code === "invalid_format" ||
    issue.code === "too_big" ||
    issue.code === "too_small" ||
    issue.code === "invalid_value"
  ) {
    return `${where}: ${issue.message}`;
  }
  return `${where}: 規則に合いません（${issue.code}）`;
}

function rejected(problem: string): CommandCatalog {
  return { commands: [], problem: `${COMMANDS_FILE_NAME}: ${problem}` };
}

/** JSON の文字列を検証する（純粋）。規則外は 0 件と理由。 */
export function parseCommandsJson(text: string): CommandCatalog {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return rejected("JSON として読めません");
  }
  const r = CommandsFile.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    return rejected(first ? issueText(first) : "規則に合いません");
  }
  const commands: CommandDef[] = r.data.commands.map((c) => ({
    id: c.id,
    type: c.type,
    command: c.command,
    ...(c.description !== undefined ? { description: c.description } : {}),
    ...(c.width !== undefined ? { width: c.width as CommandInfo["width"] & {} } : {}),
    ...(c.height !== undefined ? { height: c.height as CommandInfo["height"] & {} } : {}),
  }));
  return { commands, problem: null };
}

/** ブラウザへ渡す形（**`command` を落とす**）。 */
export function toCommandInfo(def: CommandDef): CommandInfo {
  return {
    id: def.id,
    type: def.type,
    ...(def.description !== undefined ? { description: def.description } : {}),
    ...(def.width !== undefined ? { width: def.width } : {}),
    ...(def.height !== undefined ? { height: def.height } : {}),
  };
}

export interface CommandFileDeps {
  open: (path: string, flags: number) => Promise<FileHandle>;
  /** Unix の uid（Windows では undefined）。 */
  getuid: (() => number) | undefined;
  platform: NodeJS.Platform;
}

const defaultDeps: CommandFileDeps = {
  open: (path, flags) => fsOpen(path, flags),
  getuid: typeof process.getuid === "function" ? () => process.getuid!() : undefined,
  platform: process.platform,
};

/**
 * 設定ファイルを読む。無ければ 0 件（問題なし）。**開いた fd の `fstat` で検査し、同じ fd から読む**（検査と読み込みの間の差し替えを塞ぐ）。
 * Unix：`O_NOFOLLOW`（リンクは `ELOOP` で開けない）・`O_NONBLOCK`（FIFO で書き手を待って止まらない）で開き、通常のファイルでない・持ち主がサーバの uid でない・
 * グループかその他が書ける（`mode & 0o022`）・64 KiB を超える、を拒否する。グループかその他が読める（`mode & 0o044`）だけなら採って `warning` を返す。
 * Windows：持ち主・権限は検査しない（種類と大きさは見る）。
 */
export async function loadCommandsFile(
  path: string,
  deps: Partial<CommandFileDeps> = {},
): Promise<CommandCatalog & { warning?: string }> {
  const d = { ...defaultDeps, ...deps };
  const unix = d.platform !== "win32";
  const flags = fsConstants.O_RDONLY | (unix ? fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK : 0);
  let handle: FileHandle;
  try {
    handle = await d.open(path, flags);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { commands: [], problem: null };
    if (code === "ELOOP")
      return rejected("シンボリックリンクは使えません（ファイルそのものを置いてください）");
    return rejected(`開けません（${code ?? "不明なエラー"}）`);
  }
  try {
    const st = await handle.stat();
    if (!st.isFile()) return rejected("通常のファイルではありません");
    if (unix) {
      const uid = d.getuid?.();
      if (uid !== undefined && st.uid !== uid)
        return rejected("サーバを動かしているユーザーの持ち物ではありません");
      if ((st.mode & 0o022) !== 0)
        return rejected("グループかその他のユーザーが書き込めます（chmod 600 にしてください）");
    }
    if (st.size > COMMANDS_FILE_MAX_BYTES)
      return rejected(`大きすぎます（${COMMANDS_FILE_MAX_BYTES} バイトまで）`);
    // 読む量も上限で切る（stat の後に伸びても上限を超えて読まない）。短い読み（NFS 等）に備えて終わりまで繰り返す。
    const buf = Buffer.alloc(COMMANDS_FILE_MAX_BYTES + 1);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buf, total, buf.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total >= buf.length) break;
    }
    if (total > COMMANDS_FILE_MAX_BYTES)
      return rejected(`大きすぎます（${COMMANDS_FILE_MAX_BYTES} バイトまで）`);
    let text: string;
    try {
      // 不正な UTF-8 は置き換えずに断る。先頭の BOM（Windows のメモ帳等）は TextDecoder が落とす。
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, total));
    } catch {
      return rejected("UTF-8 として読めません");
    }
    const result = parseCommandsJson(text);
    if (result.problem === null && unix && (st.mode & 0o044) !== 0) {
      return {
        ...result,
        warning: `${COMMANDS_FILE_NAME} はグループかその他のユーザーが読めます（chmod 600 を勧めます）`,
      };
    }
    return result;
  } catch (err) {
    return rejected(`読めません（${(err as NodeJS.ErrnoException).code ?? "不明なエラー"}）`);
  } finally {
    await handle.close().catch(() => undefined);
  }
}
