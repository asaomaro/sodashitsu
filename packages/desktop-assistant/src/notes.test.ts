import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { NotesFile } from "./notes.js";

it("serializes parallel saves, atomically persists edits/deletes and keeps notes local", async () => {
  const root = await mkdtemp(join(tmpdir(), "soda-assistant-notes-"));
  try {
    const file = new NotesFile(join(root, "notes.json"));
    expect(await file.read()).toEqual([]);
    await Promise.all(
      Array.from({ length: 12 }, (_, index) => file.save({ text: `note${index}` })),
    );
    const notes = await file.read();
    expect(notes).toHaveLength(12);
    await file.save({ id: notes[0]!.id, text: "edited" });
    expect((await new NotesFile(join(root, "notes.json")).read())[0]!.text).toBe("edited");
    await file.delete({ id: notes[0]!.id });
    expect(await file.read()).toHaveLength(11);
    expect(await readdir(root)).toEqual(["notes.json"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("rejects stale ids and oversized input without changing the persisted notes", async () => {
  const root = await mkdtemp(join(tmpdir(), "soda-assistant-notes-"));
  try {
    const path = join(root, "notes.json"),
      file = new NotesFile(path);
    await file.save({ text: "keep" });
    const original = await readFile(path);
    await expect(file.save({ id: randomUUID(), text: "stale" })).rejects.toThrow("削除");
    expect(() => file.save({ text: "x".repeat(8193) })).toThrow();
    expect(await readFile(path)).toEqual(original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("preserves a corrupt file for recovery instead of overwriting it with an empty list", async () => {
  const root = await mkdtemp(join(tmpdir(), "soda-assistant-notes-"));
  try {
    const path = join(root, "notes.json");
    await writeFile(path, "{broken");
    await expect(new NotesFile(path).save({ text: "new" })).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("{broken");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
