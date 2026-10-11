import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, it, expect } from "vitest";
import { ConversationService, recordMessage } from "./ConversationService.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
async function fixture(content: string) {
  const dir = await mkdtemp(join(tmpdir(), "soda-conversation-test-"));
  roots.push(dir);
  const root = join(dir, "projects");
  await mkdir(join(root, "example"), { recursive: true });
  const file = join(root, "example", "session-1.jsonl");
  await writeFile(file, content);
  return {
    file,
    root,
    service: new ConversationService(() => undefined, {
      claudeRoots: [root],
      codexHome: join(dir, "codex"),
    }),
  };
}
const row = (text: string, role = "user") =>
  JSON.stringify({
    timestamp: "2026-10-11T00:00:00Z",
    cwd: "/work/test",
    message: { role, content: [{ type: "text", text }] },
  }) + "\n";
it("paginates at byte boundaries with stable message IDs and excludes tool/system content", async () => {
  const text = Array.from({ length: 105 }, (_, i) => row(`質問${i}`)).join("");
  const f = await fixture(text);
  const first = await f.service.read("claude", "session-1");
  expect(first.messages).toHaveLength(100);
  expect(first.nextOffset).not.toBeNull();
  const second = await f.service.read("claude", "session-1", first.nextOffset!);
  expect(second.messages.map((m) => m.text)).toEqual([
    "質問100",
    "質問101",
    "質問102",
    "質問103",
    "質問104",
  ]);
  expect(second.nextOffset).toBeNull();
  expect(new Set([...first.messages, ...second.messages].map((m) => m.id)).size).toBe(105);
  await expect(f.service.read("claude", "session-1", 2)).rejects.toThrow(/位置/);
  expect(
    recordMessage(
      { message: { role: "user", content: [{ type: "tool_result", content: "secret" }] } },
      "claude",
    ),
  ).toBeNull();
  expect(
    recordMessage(
      {
        type: "response_item",
        payload: { role: "user", content: [{ type: "input_text", text: "質問" }] },
      },
      "codex",
    )?.text,
  ).toBe("質問");
});
it("marks incomplete records and handles malformed JSON without exposing them as user messages", async () => {
  const f = await fixture(row("完成") + 'broken\n{"message":');
  const page = await f.service.read("claude", "session-1");
  expect(page.messages.map((m) => m.text)).toEqual(["完成"]);
  expect(page.partial).toBe(true);
});
it("searches title and project directory and refuses linked transcripts", async () => {
  const f = await fixture(row("動画を作る"));
  expect((await f.service.sessions({ query: "動画" })).sessions[0]?.cwd).toBe("/work/test");
  expect((await f.service.sessions({ query: "/work/test" })).sessions).toHaveLength(1);
  const linked = join(f.root, "example", "linked.jsonl");
  await symlink(f.file, linked);
  await expect(f.service.read("claude", "linked")).rejects.toThrow();
});
it("refuses a linked Codex record before returning its path for resume", async () => {
  const f = await fixture(row("private"));
  const home = join(f.root, "codex");
  const records = join(home, "sessions", "2026", "10", "11");
  await mkdir(records, { recursive: true });
  const id = "11111111-1111-4111-8111-111111111111";
  await symlink(f.file, join(records, `rollout-2026-10-11T00-00-00-${id}.jsonl`));
  const service = new ConversationService(() => undefined, { codexHome: home });
  await expect(service.locate("codex", id)).rejects.toThrow();
});
