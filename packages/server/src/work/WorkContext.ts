import { lstat, readdir, realpath, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { RpcError, WorkBinding, type Pane, type WorkInspection, type WorkMemory } from "@sodashitsu/protocol";
import type { z } from "zod";
import type { WorkMethods } from "@sodashitsu/protocol";
import { writeFileAtomic } from "../persist/atomicFile.js";
import { createExclusive, digest, directoryGuard, folderIdentity, inside, privateDirs, textFile } from "./files.js";
import { FileTransfer } from "./FileTransfer.js";
import { discoverSkills } from "./skills.js";

type Scope = z.infer<(typeof WorkMethods)["work.inspect"]>;
export class WorkContext {
  private readonly fileTransfers = new FileTransfer();
  async transfer(p: z.infer<(typeof WorkMethods)["work.file_transfer"]>, owner: string, guard: () => void = () => {}) {
    const root = await this.scope(p);
    return this.fileTransfers.run(owner, root, p.request, async () => { await this.scope(p); guard(); });
  }
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly stateDir: string, private readonly pane: (id: string) => Pane | undefined,
    private readonly folder: (id: string) => string | undefined,
    private readonly options: { home?: string; env?: NodeJS.ProcessEnv } = {}) {}
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn); this.queue = next.catch(() => {}); return next;
  }
  async binding(p: z.infer<(typeof WorkMethods)["work.binding"]>): Promise<{ binding: WorkBinding | null }> {
    return this.serial(async () => {
      const pane = this.pane(p.paneId);
      if (!pane) throw new RpcError("not_found", "呼出元のpaneがありません");
      const dir = await privateDirs(this.stateDir, ["work-bindings"]), file = join(dir, p.paneId + ".json");
      let old: WorkBinding | null = null;
      try { const raw: unknown = JSON.parse(await textFile(file, 65536)); old = raw === null ? null : WorkBinding.parse(raw); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw new RpcError("invalid_params", "作業先の保存情報を読み込めません"); }
      if (p.action === "clear") { await writeFileAtomic(file, "null"); return { binding: null }; }
      if (p.action === "set") {
        const source = pane.agentSession;
        if (source && source.kind !== p.binding.agentKind) throw new RpcError("invalid_params", "呼出元と接続先のエージェント種類が異なります");
        const binding = { ...p.binding, sourceSession: source?.sessionId ?? null };
        await writeFileAtomic(file, JSON.stringify(binding)); return { binding };
      }
      if (old && (old.sourceSession !== (pane.agentSession?.sessionId ?? null) || (pane.agentSession && old.agentKind !== pane.agentSession.kind)))
        throw new RpcError("invalid_params", "エージェントの会話が変わりました。work bindをやり直してください");
      return { binding: old };
    });
  }
  async scope(p: Scope): Promise<string> {
    const folder = this.folder(p.workspaceId);
    if (!folder || folder !== p.expectedFolder) throw new RpcError("invalid_params", "接続先のPJが変わりました。work bindをやり直してください");
    let root: string;
    try { root = await realpath(folder); } catch { throw new RpcError("not_found", "接続先のPJがありません"); }
    if ((p.expectedRoot && p.expectedRoot !== root) || (p.expectedIdentity && p.expectedIdentity !== await folderIdentity(root)))
      throw new RpcError("invalid_params", "接続先PJの実体が変わりました。work bindをやり直してください");
    if (this.folder(p.workspaceId) !== folder)
      throw new RpcError("invalid_params", "検証中に接続先PJが変わりました。work bindをやり直してください");
    return root;
  }
  async inspect(p: Scope): Promise<WorkInspection> {
    const folder = await this.scope(p);
    const catalog = await discoverSkills(folder, p.agentKind, this.options.home, this.options.env);
    const instructions: { path: string; text: string }[] = [];
    for (const name of ["AGENTS.md", "CLAUDE.md", ".claude/CLAUDE.md"]) {
      try {
        const file = await realpath(join(folder, name));
        if (inside(folder, file)) instructions.push({ path: name, text: await textFile(file, 65536) });
      } catch { /* optional project instructions */ }
    }
    return { folder: p.expectedFolder, root: folder, identity: await folderIdentity(folder), platform: process.platform, ...catalog, instructions };
  }
  async skill(p: Scope & { id: string; path: string }) {
    const folder = await this.scope(p), catalog = await discoverSkills(folder, p.agentKind, this.options.home, this.options.env);
    const skill = catalog.skills.find(s => s.id === p.id);
    if (!skill) throw new RpcError("not_found", "接続先のスキルがありません。一覧を再取得してください");
    if (p.path.includes("\0") || /^(?:[\\/]|[A-Za-z]:)/.test(p.path) || p.path.split(/[\\/]/).includes(".."))
      throw new RpcError("invalid_params", "スキル内の相対パスを指定してください");
    const lexical = resolve(skill.directory, p.path), file = await realpath(lexical);
    if (!inside(skill.directory, file)) throw new RpcError("invalid_params", "スキルの外にはアクセスできません");
    return { text: await textFile(file), directory: skill.directory, path: p.path };
  }
  async memory(p: z.infer<(typeof WorkMethods)["work.memory"]>,guard:()=>void=()=>{}): Promise<WorkMemory> {
    return this.serial(async () => {
      const folder = await this.scope(p);
      guard();
      const directory = await privateDirs(folder, [".soda", "agent-memory", p.sourcePaneId]);
      if (p.action === "list") return { directory, files: (await readdir(directory, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name).sort().slice(0, 200) };
      const file = join(directory, p.name);
      let old: string | undefined;
      try { old = await textFile(file); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      if (p.action === "read") {
        if (old === undefined) throw new RpcError("not_found", "メモがありません");
        return { directory, text: old, version: digest(old) };
      }
      if (p.content === undefined || Buffer.byteLength(p.content) > 262144) throw new RpcError("invalid_params", "メモ本文は256KiBまでです");
      if (old === undefined) {
        if (p.version) throw new RpcError("invalid_params", "メモが削除されています");
        if ((await readdir(directory)).length >= 200) throw new RpcError("invalid_params", "メモは200件までです");
        await this.scope(p);
        guard();
        await createExclusive(file, p.content);
      } else {
        if (!p.version || p.version !== digest(old)) throw new RpcError("invalid_params", "メモを再読込し、最新versionを指定してください");
        if ((await lstat(file)).isSymbolicLink()) throw new RpcError("invalid_params", "リンクには書き込めません");
        const check = await directoryGuard(directory), temporary = join(directory, ".soda-memory-" + randomUUID());
        try {
          await createExclusive(temporary, p.content);
          if (digest(await textFile(file)) !== p.version) throw new RpcError("invalid_params", "保存中にメモが変更されました");
          await this.scope(p); await check();
          guard();
          await rename(temporary, file);
        } finally { await check().then(() => unlink(temporary)).catch(() => {}); }
      }
      return { directory, text: p.content, version: digest(p.content) };
    });
  }
}
