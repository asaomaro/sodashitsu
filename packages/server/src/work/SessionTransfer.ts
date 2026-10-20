import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { link, mkdir, opendir, readdir, rm, unlink } from "node:fs/promises";
import { RpcError, type WorkTransferMeta, type WorkKind } from "@sodashitsu/protocol";
import type { ConversationService } from "../conversation/ConversationService.js";
import type { WorkContext } from "./WorkContext.js";
import { openVerified, readRange } from "../agent/safeFile.js";
import { createExclusive, digest, directoryGuard, privateDirs, textFile } from "./files.js";

const MAX = 32 * 1024 * 1024, CHUNK = 65536, MEMORY_MAX = 512 * 1024;
type Scope = { workspaceId: string; expectedFolder: string; expectedRoot?: string | undefined; expectedIdentity?: string | undefined; agentKind: WorkKind };
type Life = { live: boolean };
type Owned = { owner: string; life: Life; timer: ReturnType<typeof setTimeout>; meta: WorkTransferMeta };
type Export = Owned & { data: Buffer };
type Import = Owned & { scope: Scope; chunks: Buffer[]; offset: number; finishing: boolean };

/** A bounded snapshot, scoped to the authenticated socket. No credentials/configuration transfer. */
export class SessionTransfer {
  private exports = new Map<string, Export>();
  private imports = new Map<string, Import>();
  private owners = new Map<string, Life>();
  private pending = 0;
  private nativeQueue: Promise<unknown> = Promise.resolve();
  constructor(private readonly work: WorkContext, private readonly conversations: Pick<ConversationService, "source" | "locate">,
    private readonly opts: { home?: string; env?: NodeJS.ProcessEnv } = {}) {}
  private timer(id: string) {
    const timer = setTimeout(() => { this.exports.delete(id); this.imports.delete(id); }, 300000);
    timer.unref(); return timer;
  }
  private capacity() {
    if (this.pending + this.exports.size + this.imports.size >= 4) throw new RpcError("server_busy", "同時に転送できる会話は4件までです");
  }
  private life(owner: string): Life {
    let life = this.owners.get(owner);
    if (!life) { life = { live: true }; this.owners.set(owner, life); }
    return life;
  }
  private live(life: Life) { if (!life.live) throw new RpcError("not_found", "転送元の接続が終了しました"); }
  private owned<T extends Owned>(map: Map<string, T>, owner: string, id: string): T {
    const item = map.get(id);
    if (!item || item.owner !== owner) throw new RpcError("not_found", "転送が終了したか、別の接続の転送です");
    return item;
  }
  async exportStart(owner: string, paneId: string) {
    this.capacity();
    const life = this.life(owner); this.pending++;
    try {
    const source = this.conversations.source(paneId);
    if (!/^[0-9a-f-]{36}$/i.test(source.sessionId)) throw new RpcError("invalid_params", "UUIDの会話だけを引き継げます");
      const file = await this.conversations.locate(source.kind, source.sessionId);
    this.live(life);
    const opened = await openVerified(file);
    if (!opened) throw new RpcError("not_found", "会話記録がありません");
    let data: Buffer;
    const warnings: string[] = [];
    try {
      if (opened.st.size > MAX) throw new RpcError("invalid_params", "会話記録は32MiBまでです。メモで引き継いでください");
      data = await readRange(opened.fd, 0, opened.st.size);
      if (data.length && data[data.length - 1] !== 10) {
        data = data.subarray(0, data.lastIndexOf(10) + 1);
        warnings.push("書き込み途中の最終行は転送していません");
      }
      validateTranscript(data, source.kind, source.sessionId);
    } finally { await opened.fd.close(); }
    this.live(life);
    const memories: WorkTransferMeta["memories"] = [];
    if (source.kind === "claude") {
      const dir = join(dirname(file), "memory");
      let bytes = 0;
      for (const e of (await readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!e.isFile() || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}\.md$/.test(e.name) || e.name.toLowerCase() === "sodashitsu-handoff.md") continue;
        try {
          const text = await textFile(join(dir, e.name), 65536), size = Buffer.byteLength(text);
          this.live(life);
          if (memories.length >= 32 || bytes + size > MEMORY_MAX) { warnings.push("プロジェクトのメモが上限を超えたため一部を除外しました"); break; }
          memories.push({ name: e.name, text }); bytes += size;
        } catch { warnings.push("読み込めないプロジェクトメモを除外しました"); if (warnings.length >= 10) break; }
      }
    } else warnings.push("Codexのグローバルメモリは他のPJを含むため自動転送しません。作業メモはwork memoryで保存してください");
    const current = this.conversations.source(paneId);
    if (current.kind !== source.kind || current.sessionId !== source.sessionId) throw new RpcError("invalid_params", "転送中に会話が変わりました");
    this.live(life);
    const id = randomUUID(), meta: WorkTransferMeta = { kind: source.kind, sessionId: source.sessionId, sourcePaneId: paneId, bytes: data.length, sha256: digest(data), memories, warnings };
    this.exports.set(id, { owner, life, meta, data, timer: this.timer(id) });
    return { id, meta };
    } finally { this.pending--; }
  }
  exportRead(owner: string, id: string, offset: number) {
    const item = this.owned(this.exports, owner, id);
    if (offset > item.data.length) throw new RpcError("invalid_params", "会話のoffsetが不正です");
    const end = Math.min(offset + CHUNK, item.data.length);
    return { data: item.data.subarray(offset, end).toString("base64"), done: end === item.data.length };
  }
  async importStart(owner: string, p: Scope & { meta: WorkTransferMeta }) {
    this.capacity(); const life = this.life(owner); this.pending++;
    try {
    await this.work.scope(p); this.live(life);
    if (p.meta.kind !== p.agentKind || p.meta.memories.reduce((n, m) => n + Buffer.byteLength(m.text), 0) > MEMORY_MAX || new Set(p.meta.memories.map(m => m.name.toLowerCase())).size !== p.meta.memories.length)
      throw new RpcError("invalid_params", "エージェントの種類またはメモの合計サイズが不正です");
    const id = randomUUID();
    this.imports.set(id, { owner, life, meta: p.meta, scope: p, chunks: [], offset: 0, finishing: false, timer: this.timer(id) });
    return { id };
    } finally { this.pending--; }
  }
  importChunk(owner: string, id: string, offset: number, data: string) {
    const item = this.owned(this.imports, owner, id), bytes = Buffer.from(data, "base64");
    if (item.finishing || offset !== item.offset || bytes.length === 0 || bytes.length > CHUNK || item.offset + bytes.length > item.meta.bytes || bytes.toString("base64") !== data)
      throw new RpcError("invalid_params", "転送の順序・サイズが不正です");
    item.chunks.push(bytes); item.offset += bytes.length;
    return { offset: item.offset };
  }
  async importFinish(owner: string, id: string) {
    const item = this.owned(this.imports, owner, id);
    if (item.finishing) throw new RpcError("invalid_params", "転送の保存中です");
    item.finishing = true;
    const live = () => {
      this.live(item.life);
      if (this.imports.get(id) !== item) throw new RpcError("not_found", "転送の有効期限が切れました");
    };
    const validate = async () => { await this.work.scope(item.scope); live(); };
    let archive: string | null = null, published: string | null = null;
    try {
      const folder = await this.work.scope(item.scope), data = Buffer.concat(item.chunks);
      live();
      if (data.length !== item.meta.bytes || digest(data) !== item.meta.sha256) throw new RpcError("invalid_params", "会話記録のサイズまたはハッシュが一致しません");
      const records = validateTranscript(data, item.meta.kind, item.meta.sessionId);
      const workMemory = await this.work.memory({ ...item.scope, sourcePaneId: item.meta.sourcePaneId, action: "list", name: "MEMORY.md" });
      live();
      const directory = await privateDirs(folder, [".soda", "agent-memory", item.meta.sourcePaneId, "handoff-" + id]);
      archive = directory; await validate();
      for (const m of item.meta.memories) { await validate(); await createExclusive(join(directory, m.name), m.text); live(); }
      await validate();
      await createExclusive(join(directory, "transcript.jsonl"), data.toString("utf8"));
      live();
      const note = `# 接続先への引継ぎ\n\n現在の作業先: ${item.scope.expectedFolder}\nエージェント: ${item.meta.kind}\n会話: ${item.meta.sessionId}\n\nこのフォルダのメモ、親フォルダに保存したwork memory、現在のPJのAGENTS.md/CLAUDE.mdを読んで再開してください。過去の会話にあるローカルパス・machine ID・work bindingを現在の実行先として使わないでください。現在はこのPCのネイティブツールで作業します。\n\nwork memoryの場所: ${workMemory.directory}\n読む作業メモ: ${workMemory.files?.join(", ") || "なし"}\n\n転送したプロジェクトメモ: ${item.meta.memories.map(m => m.name).join(", ") || "なし"}\n`;
      await validate(); await createExclusive(join(directory, "SODASHITSU-HANDOFF.md"), note);
      live();
      const warnings = [...item.meta.warnings, "履歴形式・ツール・MCP・過去の絶対パスの互換性は接続先エージェントのバージョンに依存します"];
      let nativePath: string | null = null, resumeArgv: string[] | null = null;
      try {
        const install = this.nativeQueue.then(() => this.installNative(records, item.meta.kind, item.meta.sessionId, folder, live, validate, file => { published = file; }));
        this.nativeQueue = install.catch(() => {});
        nativePath = await install;
        const prompt = `作業先は${folder}です。${join(directory, "SODASHITSU-HANDOFF.md")}と同じフォルダのメモを読み、現在の環境で作業を再開してください。`;
        resumeArgv = item.meta.kind === "claude" ? ["claude", "--resume", item.meta.sessionId, prompt] : ["codex", "resume", item.meta.sessionId, "-C", folder, prompt];
      } catch {
        live();
        warnings.push("既存の会話記録、または保存先の制約によりnative resume用の登録はしていません。転送先のメモ・transcript.jsonlを参照して新しい会話で引き継いでください");
      }
      await validate();
      return { directory, nativePath, resumeArgv, cwd: item.scope.expectedFolder, warnings };
    } catch (error) {
      if (published) await unlink(published).catch(() => {});
      if (archive) await rm(archive, { recursive: true, force: true }).catch(() => {});
      throw error;
    } finally { clearTimeout(item.timer); this.imports.delete(id); }
  }
  private async installNative(records: Record<string, unknown>[], kind: WorkKind, sessionId: string, folder: string, live: () => void, validate: () => Promise<void>, published: (path: string) => void): Promise<string> {
    live(); await validate();
    const home = this.opts.home ?? homedir(), env = this.opts.env ?? process.env;
    const root = kind === "claude" ? env.CLAUDE_CONFIG_DIR || join(home, ".claude") : env.CODEX_HOME || join(home, ".codex");
    await mkdir(root, { recursive: true, mode: 0o700 });
    live();
    let directory: string, filename: string;
    if (kind === "claude") {
      await assertAbsent(join(root, "projects"), kind, sessionId, 1);
      if (root !== join(home, ".claude")) await assertAbsent(join(home, ".claude", "projects"), kind, sessionId, 1);
      const project = env.CLAUDE_CODE_PROJECT_DIR_NAME || folder.replace(/[^A-Za-z0-9]/g, "-");
      if (project.length > 200) throw new Error("long project name");
      directory = await privateDirs(root, ["projects", project]); filename = sessionId + ".jsonl";
      for (const record of records) if (typeof record.cwd === "string") record.cwd = folder;
    } else {
      await assertAbsent(join(root, "sessions"), kind, sessionId, 3);
      await assertAbsent(join(root, "archived_sessions"), kind, sessionId, 3);
      const stamp = new Date().toISOString();
      directory = await privateDirs(root, ["sessions", stamp.slice(0, 4), stamp.slice(5, 7), stamp.slice(8, 10)]);
      filename = `rollout-${stamp.slice(0, 19).replace(/:/g, "-")}-${sessionId}.jsonl`;
      for (const record of records) {
        if ((record.type === "session_meta" || record.type === "turn_context") && record.payload && typeof record.payload === "object" && !Array.isArray(record.payload))
          (record.payload as Record<string, unknown>).cwd = folder;
      }
    }
    const file = join(directory, filename);
    live();
    const check = await directoryGuard(directory);
    const temporary = join(directory, ".soda-import-" + randomUUID());
    try {
      await createExclusive(temporary, records.map(r => JSON.stringify(r)).join("\n") + "\n");
      live();
      await check(); await validate(); live();
      await link(temporary, file); published(file); live();
    } finally { await unlink(temporary).catch(() => {}); }
    live();
    return file;
  }
  clientGone(owner: string) {
    const life = this.owners.get(owner); if (life) life.live = false;
    this.owners.delete(owner);
    for (const map of [this.exports, this.imports] as const) for (const [id, value] of map) if (value.owner === owner) { clearTimeout(value.timer); map.delete(id); }
  }
  dispose() {
    for (const life of this.owners.values()) life.live = false;
    this.owners.clear();
    for (const map of [this.exports, this.imports] as const) { for (const item of map.values()) clearTimeout(item.timer); map.clear(); }
  }
}
function validateTranscript(data: Buffer, kind: WorkKind, id: string): Record<string, unknown>[] {
  if (!data.length || data[data.length - 1] !== 10) throw new RpcError("invalid_params", "完結したJSONL会話記録が必要です");
  let records: Record<string, unknown>[];
  try {
    records = new TextDecoder("utf-8", { fatal: true }).decode(data).trimEnd().split("\n").map(line => {
      const record: unknown = JSON.parse(line);
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error();
      return record as Record<string, unknown>;
    });
  } catch { throw new RpcError("invalid_params", "会話記録の形式が正しくありません"); }
  if (kind === "codex") {
    const first = records[0]!;
    if (first.type !== "session_meta" || !first.payload || typeof first.payload !== "object" || (first.payload as Record<string, unknown>).id !== id)
      throw new RpcError("invalid_params", "Codexの会話IDが一致しません");
  } else {
    const ids = records.map(r => r.sessionId).filter(v => typeof v === "string");
    if (!ids.length || ids.some(value => value !== id)) throw new RpcError("invalid_params", "Claudeの会話IDが一致しません");
  }
  return records;
}

/** Native history protection must distinguish an exhaustive miss from a bounded/incomplete scan. */
async function assertAbsent(root: string, kind: WorkKind, id: string, depth: number): Promise<void> {
  const deadline = Date.now() + 5000; let visited = 0;
  const walk = async (dir: string, left: number): Promise<void> => {
    let entries;
    try { entries = await opendir(dir); } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return; throw e; }
    for await (const entry of entries) {
      if (++visited > 100000 || Date.now() > deadline) throw new Error("history scan incomplete");
      if (entry.isSymbolicLink()) throw new Error("unknown linked history");
      const name = entry.name.toLowerCase();
      if ((kind === "claude" && name === `${id.toLowerCase()}.jsonl`) || (kind === "codex" && name.endsWith(`-${id.toLowerCase()}.jsonl`))) throw new Error("existing transcript");
      if (entry.isDirectory() && left > 0) await walk(join(dir, entry.name), left - 1);
    }
  };
  await walk(root, depth);
}
