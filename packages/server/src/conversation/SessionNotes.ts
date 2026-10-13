import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  RpcError,
  SessionNoteSchema,
  type Pane,
  type SessionNotes,
  type SessionNoteSaveParams,
  type SessionNoteDeleteParams,
} from "@sodashitsu/protocol";
import type { z } from "zod";
import { openVerified, readRange } from "../agent/safeFile.js";
import { writeFileAtomic } from "../persist/atomicFile.js";

/** Server-owned files, keyed by agent kind + session, never by a client path. */
export class SessionNotesService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly pane: (id: string) => Pane | undefined,
    private readonly stateDir: string,
  ) {}
  private source(paneId: string) {
    const pane = this.pane(paneId),
      ref = pane?.agentSession;
    if (!pane?.agent || !ref || pane.agent.kind !== ref.kind)
      throw new RpcError("not_found", "エージェントのセッションがありません");
    return { kind: ref.kind, sessionId: ref.sessionId };
  }
  private file(ref: { kind: string; sessionId: string }) {
    const key = createHash("sha256")
      .update(JSON.stringify([ref.kind, ref.sessionId]))
      .digest("hex");
    return join(this.stateDir, "session-notes", key + ".json");
  }
  private async read(ref: { kind: string; sessionId: string }): Promise<SessionNotes> {
    try {
      const file = await openVerified(this.file(ref));
      if (!file) throw new Error();
      let raw;
      try {
        if (file.st.size > 4 * 1024 * 1024) throw new Error();
        raw = JSON.parse((await readRange(file.fd, 0, file.st.size)).toString("utf8"));
      } finally {
        await file.fd.close();
      }
      if (raw.kind !== ref.kind || raw.sessionId !== ref.sessionId || !Array.isArray(raw.notes))
        throw new Error();
      return { ...ref, notes: raw.notes.map((n: unknown) => SessionNoteSchema.parse(n)) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { ...ref, notes: [] };
      throw new RpcError("invalid_params", "保存されたメモを読み取れません");
    }
  }
  async list(paneId: string): Promise<SessionNotes> {
    const ref = this.source(paneId),
      data = await this.read(ref);
    this.check({ paneId, ...ref });
    return data;
  }
  private mutate<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }
  private check(p: { paneId: string; kind: string; sessionId: string }) {
    const ref = this.source(p.paneId);
    if (ref.kind !== p.kind || ref.sessionId !== p.sessionId)
      throw new RpcError(
        "invalid_params",
        "セッションが切り替わりました。メモを開き直してください",
      );
    return ref;
  }
  private async persist(data: SessionNotes) {
    const json = JSON.stringify(data);
    if (data.notes.length > 200 || Buffer.byteLength(json) > 4 * 1024 * 1024)
      throw new RpcError("invalid_params", "メモは200件・合計4MiBまでです");
    await mkdir(join(this.stateDir, "session-notes"), { recursive: true, mode: 0o700 });
    await writeFileAtomic(this.file(data), json);
    return data;
  }
  save(p: z.infer<typeof SessionNoteSaveParams>): Promise<SessionNotes> {
    return this.mutate(async () => {
      const ref = this.check(p),
        data = await this.read(ref);
      const old = p.id ? data.notes.find((n) => n.id === p.id) : undefined;
      if (p.id && (!old || old.revision !== p.revision))
        throw new RpcError("invalid_params", "別の画面でメモが更新されました。再読込してください");
      const now = Date.now();
      const note = SessionNoteSchema.parse({
        id: old?.id ?? crypto.randomUUID(),
        title: p.title,
        body: p.body,
        tags: [...new Set(p.tags)],
        group: p.group,
        revision: (old?.revision ?? 0) + 1,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
      });
      data.notes = [...data.notes.filter((n) => n.id !== note.id), note];
      this.check(p);
      return this.persist(data);
    });
  }
  delete(p: z.infer<typeof SessionNoteDeleteParams>): Promise<SessionNotes> {
    return this.mutate(async () => {
      const data = await this.read(this.check(p));
      const old = data.notes.find((n) => n.id === p.id);
      if (!old || old.revision !== p.revision)
        throw new RpcError("invalid_params", "別の画面でメモが更新されました。再読込してください");
      data.notes = data.notes.filter((n) => n.id !== p.id);
      this.check(p);
      return this.persist(data);
    });
  }
}
