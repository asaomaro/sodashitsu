import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * スクロールバックを `$EDITOR` で開く（20260926-edit-scrollback。herdr の `edit_scrollback`）ための部品。
 * パスは script に埋め込まず `$1` で渡す（パスが何を含んでもシェルの構文にならない）。`EDITOR` は herdr と同じく
 * シェルの語として解釈する（`code -w` のような引数付きを許す。サーバの運用者が決める値で、ブラウザからは来ない）。
 */
const UNIX_SCRIPT = 'eval "${EDITOR:-vi} \\"\\$1\\""';

/** エディタを起動する argv。Windows で `VISUAL`・`EDITOR` のどちらも無い（空白だけを含む）なら null。 */
export function scrollbackEditorArgv(
  path: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] | null {
  if (platform !== "win32") return ["/bin/sh", "-c", UNIX_SCRIPT, "soda-edit-scrollback", path];
  const editor = [env["VISUAL"], env["EDITOR"]].find((v) => v !== undefined && v.trim() !== "");
  if (editor === undefined) return null;
  const argv = splitWindowsCommandLine(editor);
  return argv.length === 0 ? null : [...argv, path];
}

/** 空白で区切り、`"` で囲んだ区間は空白を含めて 1 語にする（`"` 自体は落とす。`\` はパスの区切りなのでそのまま）。 */
export function splitWindowsCommandLine(s: string): string[] {
  const out: string[] = [];
  let word = "";
  let inWord = false;
  let quoted = false;
  for (const ch of s) {
    if (ch === '"') {
      quoted = !quoted;
      inWord = true;
    } else if (!quoted && (ch === " " || ch === "\t")) {
      if (inWord) out.push(word);
      word = "";
      inWord = false;
    } else {
      word += ch;
      inWord = true;
    }
  }
  if (inWord) out.push(word);
  return out;
}

/**
 * OS の一時ディレクトリの下に専用のディレクトリ（名前は推測できない。POSIX では 0700）を作り、その中へ 0600 の新規ファイルとして書く。
 * 書けなければ作ったディレクトリを消してから投げる。
 */
export async function writeScrollbackFile(
  text: string,
  root: string = tmpdir(),
  write: typeof writeFile = writeFile,
): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(join(root, "soda-scrollback-"));
  const path = join(dir, "scrollback.txt");
  try {
    await write(path, text, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (err) {
    await removeScrollbackDir(dir);
    throw err;
  }
  return { dir, path };
}

export async function removeScrollbackDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
