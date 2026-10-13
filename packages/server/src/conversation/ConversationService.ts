import { readdir, realpath, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type {
  ConversationKind,
  ConversationMessage,
  ConversationPage,
  PastAgentSession,
  Pane,
} from "@sodashitsu/protocol";
import { RpcError } from "@sodashitsu/protocol";
import { claudeRoots, locateClaudeMain, SESSION_ID_RE } from "../usage/claudeSource.js";
import { findCodexRecordFile, newestCodexRecordFiles } from "../agent/codexSession.js";
import {
  openVerified,
  readRange,
  realRootsOf,
  underRoot,
  lstatRegular,
} from "../agent/safeFile.js";

const WINDOW = 1024 * 1024,
  TEXT_MAX = 8192,
  MESSAGE_MAX = 100;
export function recordMessage(
  row: Record<string, any>,
  kind: ConversationKind,
): { role: "user" | "assistant"; text: string; at?: string } | null {
  const message =
    kind === "claude" ? row.message : row.type === "response_item" ? row.payload : null;
  if (row.isMeta || !message || !["user", "assistant"].includes(message.role)) return null;
  const content = message.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((b: any) => ["text", "input_text", "output_text"].includes(b?.type))
            .map((b: any) => b.text ?? "")
            .join("\n")
        : "";
  if (!text.trim()) return null;
  // システムが入れる環境説明・tool resultは送信メッセージに含めない。
  if (
    message.role === "user" &&
    /^\s*(<environment_context>|<permissions instructions>|<turn_aborted>|<local-command-caveat>)/.test(
      text,
    )
  )
    return null;
  return {
    role: message.role,
    text: text.slice(0, TEXT_MAX),
    ...(typeof row.timestamp === "string" ? { at: row.timestamp } : {}),
  };
}
export class ConversationService {
  private cache: { at: number; sessions: PastAgentSession[]; partial: boolean } | null = null;
  constructor(
    private readonly pane: (id: string) => Pane | undefined,
    private readonly opts: {
      claudeRoots?: string[];
      codexHome?: string;
      activeSession?: (kind: ConversationKind, id: string) => boolean;
    } = {},
  ) {}
  isActive(kind: ConversationKind, id: string): boolean {
    return this.opts.activeSession?.(kind, id) ?? false;
  }
  private roots() {
    return this.opts.claudeRoots ?? claudeRoots();
  }
  taskRoots() { return this.roots().map(root => join(dirname(root), "tasks")); }
  private codexHome() {
    return this.opts.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex");
  }
  async locate(kind: ConversationKind, id: string): Promise<string> {
    if (!SESSION_ID_RE.test(id)) throw new RpcError("invalid_params", "会話IDが正しくありません");
    const file =
      kind === "claude"
        ? await locateClaudeMain(id, undefined, this.roots())
        : await findCodexRecordFile(this.codexHome(), id);
    if (!file) throw new RpcError("not_found", "会話記録が見つかりません");
    if (kind === "codex") {
      const roots = await realRootsOf([join(this.codexHome(), "sessions")]);
      const dir = await realpath(dirname(file)).catch(() => null);
      if (!dir || !underRoot(dir, roots))
        throw new RpcError("not_found", "会話記録の場所を確認できません");
      const target = join(dir, basename(file));
      if ((await lstatRegular(target)) !== "ok")
        throw new RpcError("not_found", "会話記録を読めません");
      return target;
    }
    return file;
  }
  source(paneId: string): { kind: ConversationKind; sessionId: string; pane: Pane } {
    const pane = this.pane(paneId),
      ref = pane?.agentSession;
    if (!pane || !ref || !["claude", "codex"].includes(ref.kind) || pane.agent?.kind !== ref.kind)
      throw new RpcError("not_found", "このペインの会話記録は取得できません");
    return { kind: ref.kind as ConversationKind, sessionId: ref.sessionId, pane };
  }
  async revision(kind: ConversationKind, sessionId: string, checkpoint?: number) {
    const f = await openVerified(await this.locate(kind, sessionId));
    if (!f) throw new RpcError("not_found", "会話記録を読めません");
    try {
      const size = f.st.size;
      const end = Math.min(checkpoint ?? size, size);
      const head = await readRange(f.fd, 0, Math.min(4096, end));
      const tail = await readRange(f.fd, Math.max(0, end - 4096), Math.min(end, 4096));
      const identity = createHash("sha256")
        .update(`${f.st.dev}:${f.st.ino}:`)
        .update(head)
        .update(tail)
        .digest("hex");
      return { size, identity };
    } finally {
      await f.fd.close();
    }
  }
  async page(paneId: string, offset = 0): Promise<ConversationPage> {
    const source = this.source(paneId);
    const page = await this.read(source.kind, source.sessionId, offset);
    const now = this.source(paneId);
    if (now.kind !== source.kind || now.sessionId !== source.sessionId)
      throw new RpcError("not_found", "会話が切り替わりました。読み直してください");
    return page;
  }
  async read(
    kind: ConversationKind,
    sessionId: string,
    offset = 0,
    maxBytes = 16 * WINDOW,
  ): Promise<ConversationPage> {
    const opened = await openVerified(await this.locate(kind, sessionId));
    if (!opened) throw new RpcError("not_found", "会話記録を読めません");
    try {
      const { fd, st } = opened;
      if (offset > st.size)
        throw new RpcError("invalid_params", "会話記録が更新されました。読み直してください");
      if (offset && (await readRange(fd, offset - 1, 1))[0] !== 10)
        throw new RpcError("invalid_params", "会話記録の位置が正しくありません");
      const limit = Math.min(st.size, offset + maxBytes);
      const bytes = await readRange(fd, offset, Math.min(WINDOW, limit - offset));
      const messages: ConversationMessage[] = [];
      let used = 0,
        partial = false;
      while (used < bytes.length) {
        const end = bytes.indexOf(10, used);
        if (end < 0) break;
        try {
          const row = JSON.parse(bytes.subarray(used, end).toString("utf8"));
          const m = recordMessage(row, kind);
          if (m) {
            messages.push({ id: `${kind}:${sessionId}:${offset + used}`, ...m });
            if (m.text.length === TEXT_MAX) partial = true;
          }
        } catch {
          partial = true;
        }
        used = end + 1;
        if (messages.length >= MESSAGE_MAX) break;
      }
      if (!used && bytes.length && offset + bytes.length < st.size) {
        // Skip oversized records (images/tool output can exceed a page) without retaining them.
        // Only return a continuation at a complete newline; cap scanning at 16 MiB per record.
        let cursor = offset + bytes.length;
        for (let scan = 1; scan < 16 && cursor < limit; scan++) {
          const chunk = await readRange(fd, cursor, Math.min(WINDOW, limit - cursor));
          if (!chunk.length) break;
          const end = chunk.indexOf(10);
          if (end >= 0) {
            const next = cursor + end + 1;
            return {
              kind,
              sessionId,
              messages,
              nextOffset: next < st.size ? next : null,
              endOffset: next,
              partial: true,
            };
          }
          cursor += chunk.length;
        }
        return { kind, sessionId, messages, nextOffset: null, partial: true, endOffset: offset };
      }
      return {
        kind,
        sessionId,
        messages,
        nextOffset: used && offset + used < st.size ? offset + used : null,
        endOffset: offset + used,
        partial: partial || (bytes.length > used && offset + bytes.length === st.size),
      };
    } finally {
      await opened.fd.close();
    }
  }
  async sessions(params: {
    kind?: ConversationKind | undefined;
    query?: string;
    limit?: number;
  }): Promise<{ sessions: PastAgentSession[]; partial: boolean }> {
    if (!this.cache || Date.now() - this.cache.at > 5000) {
      const files: { kind: ConversationKind; id: string; file: string; mtime: number }[] = [];
      let partial = false;
      const deadline = Date.now() + 2500;
      let candidates = 0;
      for (const root of await realRootsOf(this.roots())) {
        for (const name of (await readdir(root).catch(() => [])).slice(0, 5000)) {
          if (Date.now() > deadline || files.length >= 1000) {
            partial = true;
            break;
          }
          const dir = join(root, name),
            real = await realpath(dir).catch(() => null);
          if (real !== dir || underRoot(real, [root]) === null) continue;
          for (const n of await readdir(dir).catch(() => [])) {
            if (Date.now() > deadline || ++candidates > 5000) {
              partial = true;
              break;
            }
            if (!n.endsWith(".jsonl") || !SESSION_ID_RE.test(n.slice(0, -6))) continue;
            const file = join(dir, n),
              st = await lstat(file).catch(() => null);
            if (st?.isFile() && !st.isSymbolicLink() && st.nlink === 1)
              files.push({ kind: "claude", id: n.slice(0, -6), file, mtime: st.mtimeMs });
            if (files.length >= 1000) {
              partial = true;
              break;
            }
          }
        }
      }
      const codexRoot = await realpath(join(this.codexHome(), "sessions")).catch(() => null);
      for (const file of await newestCodexRecordFiles(this.codexHome(), 1000, 400)) {
        const dir = await realpath(dirname(file)).catch(() => null);
        if (!codexRoot || dir !== dirname(file) || underRoot(dir, [codexRoot]) === null) continue;
        const id = /([0-9a-f-]{36})\.jsonl$/.exec(basename(file))?.[1];
        const st = await lstat(file).catch(() => null);
        if (id && st?.isFile() && !st.isSymbolicLink() && st.nlink === 1)
          files.push({ kind: "codex", id, file, mtime: st.mtimeMs });
      }
      const sessions: PastAgentSession[] = [];
      const seen = new Set<string>();
      for (const f of files.sort((a, b) => b.mtime - a.mtime).slice(0, 300)) {
        if (seen.has(f.kind + f.id)) continue;
        seen.add(f.kind + f.id);
        const opened = await openVerified(f.file).catch(() => null);
        if (!opened) continue;
        try {
          const text = (
            await readRange(opened.fd, 0, Math.min(128 * 1024, opened.st.size))
          ).toString("utf8");
          let cwd: string | null = null,
            title = "";
          for (const line of text.split("\n")) {
            try {
              const row = JSON.parse(line);
              const value = row.cwd ?? (row.type === "session_meta" ? row.payload?.cwd : undefined);
              if (typeof value === "string") cwd ??= value.slice(0, 4096);
              const m = recordMessage(row, f.kind);
              if (m?.role === "user" && !title) title = m.text.replace(/\s+/g, " ").slice(0, 150);
            } catch {}
          }
          sessions.push({
            kind: f.kind,
            sessionId: f.id,
            title: title || f.id.slice(0, 8),
            cwd,
            updatedAt: f.mtime,
          });
        } finally {
          await opened.fd.close();
        }
      }
      this.cache = { at: Date.now(), sessions, partial: partial || files.length > 300 };
    }
    const q = (params.query ?? "").toLocaleLowerCase();
    const matching = this.cache.sessions.filter(
      (s) =>
        (!params.kind || s.kind === params.kind) &&
        [s.title, s.cwd ?? "", s.sessionId, s.kind].some((t) => t.toLocaleLowerCase().includes(q)),
    );
    return {
      sessions: matching.slice(0, params.limit ?? 100),
      partial: this.cache.partial || matching.length > (params.limit ?? 100),
    };
  }
}
