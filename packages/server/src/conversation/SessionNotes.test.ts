import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { Pane } from "@sodashitsu/protocol";
import { SessionNotesService } from "./SessionNotes.js";
it("persists multiple tagged/grouped notes by session, guards concurrent edits and session switches", async () => {
  const root = await mkdtemp(join(tmpdir(), "soda-session-notes-"));
  let sessionId = "session-1";
  const pane = () =>
    ({ agent: { kind: "claude" }, agentSession: { kind: "claude", sessionId } }) as Pane;
  try {
    const service = new SessionNotesService(pane, root);
    const draft = {
      paneId: "p1",
      kind: "claude",
      sessionId,
      title: "日本語メモ",
      body: "複数行\n本文",
      tags: ["設計", "設計"],
      group: "仕様",
    };
    const saved = await service.save(draft),
      note = saved.notes[0]!;
    expect(note.tags).toEqual(["設計"]);
    const reopened = await new SessionNotesService(pane, root).list("other-pane");
    expect(reopened.notes[0]).toEqual(note);
    const outcomes = await Promise.allSettled([
      service.save({ ...draft, id: note.id, revision: note.revision, body: "更新A" }),
      service.save({ ...draft, id: note.id, revision: note.revision, body: "更新B" }),
    ]);
    expect(outcomes.map((o) => o.status)).toEqual(["fulfilled", "rejected"]);
    await service.save({ ...draft, title: "二つ目", tags: ["確認"], group: "レビュー" });
    expect((await service.list("p1")).notes).toHaveLength(2);
    sessionId = "session-2";
    expect((await service.list("p1")).notes).toEqual([]);
    await expect(service.save(draft)).rejects.toThrow(/セッション/);
    sessionId = "session-1";
    await expect(
      service.delete({ paneId: "p1", kind: "claude", sessionId, id: note.id, revision: 1 }),
    ).rejects.toThrow(/更新/);
    const current = (await service.list("p1")).notes.find((n) => n.id === note.id)!;
    expect(
      (
        await service.delete({
          paneId: "p1",
          kind: "claude",
          sessionId,
          id: note.id,
          revision: current.revision,
        })
      ).notes,
    ).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
