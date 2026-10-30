import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const Note = z
  .object({
    id: z.uuid(),
    text: z.string().trim().min(1).max(8192),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();
const Notes = z.object({ version: z.literal(1), notes: z.array(Note).max(200) }).strict();
export const NoteSave = z
  .object({ id: z.uuid().optional(), text: z.string().trim().min(1).max(8192) })
  .strict();
export type AssistantNote = z.infer<typeof Note>;

/** Local notes never enter a server/model unless the user explicitly sends their text. */
export class NotesFile {
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  constructor(private readonly path: string) {}
  async read(): Promise<AssistantNote[]> {
    try {
      const st = await lstat(this.path);
      if (!st.isFile() || st.isSymbolicLink() || st.size > 8 * 1024 * 1024)
        throw Error("メモファイルを確認できません。");
      const file = await open(this.path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
      let text: string;
      try {
        const current = await file.stat();
        if (!current.isFile() || current.size > 8 * 1024 * 1024)
          throw Error("メモファイルが大きすぎます。");
        const buffer = Buffer.alloc(current.size + 1);
        let used = 0;
        while (used < buffer.length) {
          const result = await file.read(buffer, used, buffer.length - used, null);
          if (!result.bytesRead) break;
          used += result.bytesRead;
        }
        if (used > current.size) throw Error("読み取り中にメモが変更されました。");
        text = buffer.subarray(0, used).toString("utf8");
      } finally {
        await file.close();
      }
      return Notes.parse(JSON.parse(text)).notes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  save(input: unknown): Promise<AssistantNote[]> {
    const note = NoteSave.parse(input);
    return this.mutate((notes) => {
      const existing = note.id ? notes.findIndex((item) => item.id === note.id) : -1;
      if (note.id && existing < 0) throw Error("このメモは削除されています。");
      const next = { id: note.id ?? randomUUID(), text: note.text, updatedAt: Date.now() };
      if (existing >= 0) notes[existing] = next;
      else notes.push(next);
      return Notes.parse({ version: 1, notes }).notes;
    });
  }
  delete(input: unknown): Promise<AssistantNote[]> {
    const { id } = z.object({ id: z.uuid() }).strict().parse(input);
    return this.mutate((notes) => notes.filter((note) => note.id !== id));
  }
  private mutate(change: (notes: AssistantNote[]) => AssistantNote[]): Promise<AssistantNote[]> {
    if (this.pending >= 16) throw Error("前のメモ操作が完了するまでお待ちください。");
    ++this.pending;
    const operation = this.queue
      .then(async () => {
        const notes = change(await this.read());
        const content = JSON.stringify({ version: 1, notes }) + "\n";
        if (Buffer.byteLength(content) > 8 * 1024 * 1024)
          throw Error("メモの合計容量が大きすぎます。");
        const parent = dirname(this.path);
        await mkdir(parent, { recursive: true, mode: 0o700 });
        const temporary = join(parent, `.assistant-notes-${randomUUID()}.tmp`);
        try {
          const file = await open(temporary, "wx", 0o600);
          try {
            await file.writeFile(content);
            await file.sync();
          } finally {
            await file.close();
          }
          await rename(temporary, this.path);
        } finally {
          await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
          });
        }
        return notes;
      })
      .finally(() => {
        --this.pending;
      });
    this.queue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
}
