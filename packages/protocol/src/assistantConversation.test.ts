import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { AssistantConversationKind, AssistantConversationParams } from "./assistantConversation.js";
it("pins conversation requests to device and actor instead of a caller-selected record", () => {
  const input = { deviceId: randomUUID(), instanceId: randomUUID() };
  expect(AssistantConversationParams.parse(input)).toEqual({ ...input, offset: 0 });
  for (const extra of [{ paneId: randomUUID() }, { path: "/tmp/private" }, { sessionId: randomUUID() }, { offset: -1 }, { offset: 1.5 }, { offset: 2 ** 31 }])
    expect(AssistantConversationParams.safeParse({ ...input, ...extra }).success).toBe(false);
  expect(AssistantConversationParams.safeParse({ ...input, instanceId: "latest" }).success).toBe(false);
});
it("keeps the supported conversation providers explicit", () => {
  for (const kind of ["claude", "codex", "copilot", "agy", "muse", "grok", "cursor"]) expect(AssistantConversationKind.safeParse(kind).success).toBe(true);
  expect(AssistantConversationKind.safeParse("bob").success).toBe(false);
});
