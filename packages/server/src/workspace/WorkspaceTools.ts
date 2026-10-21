import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, opendir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { openVerified, readRange } from "../agent/safeFile.js";
import { folderIdentity } from "../work/files.js";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  RpcError,
  type WorkspaceToolsParams,
  type WorkspaceToolsResult,
} from "@sodashitsu/protocol";
const execute = promisify(execFile);
const MAX_BYTES = 512 * 1024;
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function within(root: string, path: string) {
  const rel = relative(root, path);
  return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
}
export class WorkspaceTools {
  private writes = new Map<string, Promise<unknown>>();
  constructor(private folder: (id: string) => string | undefined) {}
  async run(p: WorkspaceToolsParams, guard:()=>void = ()=>{}): Promise<WorkspaceToolsResult> {
    guard();
    const folder = this.folder(p.workspaceId);
    if (!folder)
      throw new RpcError("invalid_params", "ワークスペースのPJフォルダを設定してください");
    if (p.expectedFolder !== undefined && p.expectedFolder !== folder)
      throw new RpcError(
        "invalid_params",
        "PJフォルダが変更されました。ビューを開き直してください",
      );
    let root: string;
    try {
      root = await realpath(folder);
    } catch {
      throw new RpcError("not_found", "PJフォルダが見つかりません");
    }
    if ((p.expectedRoot && p.expectedRoot !== root) || (p.expectedIdentity && p.expectedIdentity !== await folderIdentity(root)))
      throw new RpcError("invalid_params", "PJフォルダの実体が変わりました。作業先を選び直してください");
    if (
      p.path.split(/[\\/]/).some((part) => part.toLowerCase() === ".git") ||
      p.path.includes("\0") ||
      isAbsolute(p.path) ||
      /^[A-Za-z]:|^\\/.test(p.path)
    )
      throw new RpcError("invalid_params", "PJ内の相対パスを指定してください");
    const lexical = resolve(root, p.path);
    if (!within(root, lexical))
      throw new RpcError("invalid_params", "PJフォルダの外にはアクセスできません");
    const checked = async () => {
      const path = await realpath(lexical);
      guard();
      if (
        relative(root, path)
          .split(sep)
          .some((part) => part.toLowerCase() === ".git")
      )
        throw new RpcError("invalid_params", "Git管理ファイルは開けません");
      if (!within(root, path))
        throw new RpcError("invalid_params", "PJの外を指すリンクは開けません");
      return path;
    };
    const read = async () => {
      const path = await checked();
      const opened = await openVerified(path);
      if (!opened)
        throw new RpcError("invalid_params", "通常の単一リンクのファイルを指定してください");
      const handle = opened.fd;
      try {
        const info = opened.st;
        const now = await lstat(path);
        if (
          (await checked()) !== path ||
          now.ino !== info.ino ||
          now.dev !== info.dev ||
          now.isSymbolicLink()
        )
          throw new RpcError("invalid_params", "ファイルの場所が変更されました");
        if (!info.isFile() || info.size > MAX_BYTES)
          throw new RpcError("invalid_params", "512 KiB以下の通常ファイルを指定してください");
        const content = await readRange(handle, 0, MAX_BYTES + 1);
        guard();
        const bytesRead = content.length;
        if (bytesRead > MAX_BYTES || content.includes(0))
          throw new RpcError("invalid_params", "大きなファイル・バイナリは編集できません");
        let text: string;
        try {
          text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
        } catch {
          throw new RpcError("invalid_params", "UTF-8のテキストファイルを指定してください");
        }
        return { path, text, version: hash(content), info };
      } finally {
        await handle.close();
      }
    };
    try {
      if (p.operation === "search") {
        if (!p.query) throw new RpcError("invalid_params", "検索語を入力してください");
        const base = await checked(),
          deadline = Date.now() + 5000;
        let visited = 0,
          truncated = false;
        const matches: NonNullable<WorkspaceToolsResult["matches"]> = [];
        const needle = p.caseSensitive ? p.query : p.query.toLowerCase();
        const includes = (s: string) => (p.caseSensitive ? s : s.toLowerCase()).includes(needle);
        const walk = async (dir: string, depth: number): Promise<void> => {
          if (depth > 24 || Date.now() > deadline || visited >= 5000 || matches.length >= 100) {
            truncated = true;
            return;
          }
          for await (const e of await opendir(dir)) {
            if (Date.now() > deadline || visited >= 5000 || matches.length >= 100) {
              truncated = true;
              return;
            }
            visited++;
            if (
              e.name === ".git" ||
              e.name === "node_modules" ||
              e.name.startsWith(".soda-edit-") ||
              e.isSymbolicLink()
            )
              continue;
            const abs = join(dir, e.name),
              path = relative(root, abs).split(sep).join("/");
            if (e.isDirectory()) {
              await walk(abs, depth + 1);
              continue;
            }
            if (!e.isFile()) continue;
            if (!p.grep) {
              if (includes(path)) matches.push({ path });
              continue;
            }
            try {
              const found = await this.run({ ...p, operation: "read", path },guard);
              const lines = (found.text ?? "").split("\n");
              for (let i = 0; i < lines.length && matches.length < 100; i++)
                if (includes(lines[i]!))
                  matches.push({ path, line: i + 1, text: lines[i]!.slice(0, 500) });
            } catch {
              /* unreadable, binary and outside links are skipped */
            }
          }
        };
        await walk(base, 0);
        return { matches, truncated };
      }
      if (p.operation === "list") {
        const path = await checked();
        const dir = [];
        for await (const entry of await opendir(path)) {
          dir.push(entry);
          if (dir.length > 2000) break;
        }
        if (dir.length > 2000)
          throw new RpcError("invalid_params", "このフォルダは項目が多すぎます（上限2000件）");
        const entries = await Promise.all(
          dir
            .filter((e) => e.name !== ".git")
            .map(async (e) => ({
              name: e.name,
              path: join(p.path, e.name).split(sep).join("/"),
              directory:
                e.isDirectory() ||
                (e.isSymbolicLink() &&
                  (await stat(join(path, e.name)).catch(() => null))?.isDirectory() === true),
              link: e.isSymbolicLink(),
            })),
        );
        entries.sort(
          (a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name),
        );
        return { path: p.path, entries };
      }
      if (p.operation === "read") {
        const data = await read();
        return { path: p.path, text: data.text, version: data.version };
      }
      if (p.operation === "write") {
        if (p.content === undefined || !p.version || Buffer.byteLength(p.content) > MAX_BYTES)
          throw new RpcError(
            "invalid_params",
            "保存内容と読込時のversionが必要です（512 KiBまで）",
          );
        const canonical = await checked();
        if (canonical !== lexical)
          throw new RpcError(
            "invalid_params",
            "編集にはリンクを含まない実体のパスを指定してください",
          );
        const previous = this.writes.get(canonical) ?? Promise.resolve();
        const job = previous
          .catch(() => {})
          .then(async () => {
            if ((await lstat(lexical)).isSymbolicLink())
              throw new RpcError(
                "invalid_params",
                "リンク先の編集には実体のパスを指定してください",
              );
            const data = await read();
            if (data.version !== p.version)
              throw new RpcError(
                "invalid_params",
                "ファイルが変更されています。内容を控え、再読込して差分を確認してください",
              );
            if (this.folder(p.workspaceId) !== folder)
              throw new RpcError("invalid_params", "PJフォルダが変更されました");
            const temporary = join(dirname(data.path), `.soda-edit-${randomUUID()}`);
            try {
              guard();
              await writeFile(temporary, p.content!, { flag: "wx", mode: data.info.mode & 0o777 });
              // 保存を準備している間の外部変更も検出する。
              const latest = await read();
              if (latest.version !== p.version || latest.path !== data.path)
                throw new RpcError(
                  "invalid_params",
                  "保存中にファイルが変更されました。再読込してください",
                );
              const currentPath = await checked();
              if (this.folder(p.workspaceId) !== folder || currentPath !== data.path)
                throw new RpcError("invalid_params", "保存中にPJフォルダが変更されました");
              guard();await rename(temporary, data.path);
            } finally {
              await unlink(temporary).catch(() => {});
            }
            return { path: p.path, text: p.content!, version: hash(Buffer.from(p.content!)) };
          });
        this.writes.set(canonical, job);
        try {
          return await job;
        } finally {
          if (this.writes.get(canonical) === job) this.writes.delete(canonical);
        }
      }
      const git = async (args: string[]) =>
        (
          await execute(
            "git",
            [
              "--literal-pathspecs",
              "-C",
              root,
              "-c",
              "core.fsmonitor=false",
              "-c",
              "status.relativePaths=true",
              "--no-pager",
              ...args,
            ],
            {
              timeout: 8000,
              maxBuffer: 1024 * 1024,
              env: {
                ...process.env,
                GIT_OPTIONAL_LOCKS: "0",
                GIT_TERMINAL_PROMPT: "0",
                LC_ALL: "C",
              },
            },
          )
        ).stdout;
      if (p.operation === "git-log")
        return {
          text: await git([
            "log",
            "--graph",
            "--format=%H %s %d",
            "--decorate",
            "--all",
            "--no-color",
            "-n",
            "150",
            "--",
            ".",
          ]),
        };
      if (p.operation === "git-status") {
        const prefix = (await git(["rev-parse", "--show-prefix"])).replace(/\r?\n$/, "");
        const items = (
            await git(["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--", "."])
          ).split("\0"),
          files: NonNullable<WorkspaceToolsResult["files"]> = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          if (!item) continue;
          const status = item.slice(0, 2);
          const raw = item.slice(3);
          if (!raw.startsWith(prefix))
            throw new RpcError("invalid_params", "GitのパスがPJの範囲外です");
          files.push({ path: raw.slice(prefix.length), status });
          if (status.includes("R") || status.includes("C")) i++;
        }
        return { files };
      }
      if (p.operation === "git-diff") {
        if (p.commit)
          return {
            text: await git([
              "show",
              "--format=fuller",
              "--no-ext-diff",
              "--no-textconv",
              "--no-color",
              "--relative",
              p.commit,
              "--",
              p.path || ".",
            ]),
          };
        const text = await git([
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-color",
          "--relative",
          ...(p.staged ? ["--cached"] : []),
          "--",
          p.path || ".",
        ]);
        if (!text && p.path && !p.staged) {
          const tracked = await git(["ls-files", "--error-unmatch", "--", p.path]).catch(() => "");
          if (!tracked) {
            const data = await read();
            return {
              text:
                `未追跡: ${p.path}\n` +
                data.text
                  .split("\n")
                  .map((l) => `+${l}`)
                  .join("\n"),
            };
          }
        }
        return { text };
      }
      throw new RpcError("invalid_params", "不明な操作です");
    } catch (error) {
      if (error instanceof RpcError) throw error;
      throw new RpcError(
        "invalid_params",
        "ファイルまたはGitを読み込めません。パス・権限・Gitリポジトリを確認してください",
      );
    }
  }
}
