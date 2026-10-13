import { mkdtemp, mkdir, writeFile, rm, symlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import type { Pane } from "@sodashitsu/protocol";
import { ConversationService } from "./ConversationService.js";
import { readAgentTodos, todoSnapshot } from "./AgentTodos.js";
it("reads Codex update_plan and Claude TodoWrite, including completed and empty plans", () => {
  expect(
    todoSnapshot({
      type: "response_item",
      payload: {
        type: "function_call",
        name: "update_plan",
        arguments: JSON.stringify({ plan: [{ step: "検証", status: "in_progress" }] }),
      },
    }),
  ).toEqual([{ id: "0", text: "検証", status: "in_progress" }]);
  expect(
    todoSnapshot({
      message: { content: [{ type: "tool_use", name: "TodoWrite", input: { todos: [] } }] },
    }),
  ).toEqual([]);
  expect(
    todoSnapshot({ message: { content: [{ type: "tool_result", content: "TodoWrite" }] } }),
  ).toBeNull();
});
it("takes latest complete todo snapshot, skips oversized records and reads task files without mutating them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-todo-")),
    root = join(dir, "projects"),
    sid = "session-1";
  const record = (status: string) =>
    JSON.stringify({
      message: {
        content: [
          {
            type: "tool_use",
            name: "TodoWrite",
            input: { todos: [{ content: "仕上げ", status }] },
          },
        ],
      },
    }) + "\n";
  try {
    await mkdir(join(root, "example"), { recursive: true });
    const file = join(root, "example", sid + ".jsonl");
    await writeFile(
      file,
      record("pending") +
        JSON.stringify({ image: "x".repeat(2_000_000) }) +
        "\n" +
        record("completed") +
        '{"message":',
    );
    const service = new ConversationService(
      () =>
        ({ agent: { kind: "claude" }, agentSession: { kind: "claude", sessionId: sid } }) as Pane,
      { claudeRoots: [root] },
    );
    expect(await readAgentTodos(service, "p1")).toMatchObject({
      items: [{ text: "仕上げ", status: "completed" }],
      partial: true,
    });
    const tasks = join(dir, "tasks", sid);
    await mkdir(tasks, { recursive: true });
    const contents = JSON.stringify({
      id: "1",
      subject: "公開",
      description: "レビュー後",
      status: "in_progress",
    });
    await writeFile(join(tasks, "1.json"), contents);
    await symlink(file, join(tasks, "bad.json"));
    expect(await readAgentTodos(service, "p1")).toMatchObject({
      items: [{ id: "1", text: "公開", status: "in_progress", description: "レビュー後" }],
      partial: true,
    });
    expect(await readFile(join(tasks, "1.json"), "utf8")).toBe(contents);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
