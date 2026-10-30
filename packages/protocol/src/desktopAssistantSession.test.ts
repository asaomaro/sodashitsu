import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  AssistantSessionEnsureParams,
  AssistantSessionGetParams,
  AssistantSessionPromptParams,
  AssistantSessionKeysParams,
  AssistantSessionAdoptParams,
  AssistantWorkspaceBinding,
  assistantAgentName,
} from "./desktopAssistant.js";
import { METHOD_SCHEMAS, WorkspaceCreateParams } from "./messages.js";
import { isValidAgentName } from "./agentName.js";

it("normalizes device identities and accepts only explicit registered agent kinds", () => {
  const deviceId = randomUUID();
  expect(
    AssistantSessionEnsureParams.parse({ deviceId: deviceId.toUpperCase(), kind: "codex" }),
  ).toEqual({ deviceId, kind: "codex", retry: false, activate: false });
  for (const params of [
    { deviceId, kind: "shell" },
    { deviceId, kind: "codex", command: "generated" },
    { deviceId, kind: "codex", args: [] },
  ])
    expect(() => AssistantSessionEnsureParams.parse(params)).toThrow();
  expect(() => AssistantSessionGetParams.parse({ deviceId: "not-a-uuid" })).toThrow();
});
it("keeps full device uniqueness within the existing agent name limit", () => {
  const a = assistantAgentName("deadbeef-1111-4111-8111-111111111111"),
    b = assistantAgentName("deadbeef-2222-4222-8222-222222222222");
  expect(a).not.toBe(b);
  expect(isValidAgentName(a)).toBe(true);
  expect(isValidAgentName(b)).toBe(true);
});
it("does not let ordinary workspace.create claim assistant ownership", () => {
  const deviceId = randomUUID();
  const marker = {
    deviceId,
    paneId: randomUUID(),
    kind: "codex",
    name: assistantAgentName(deviceId),
    launchRequested: true,
  };
  expect(AssistantWorkspaceBinding.parse(marker)).toEqual(marker);
  expect(() =>
    AssistantWorkspaceBinding.parse({ ...marker, name: assistantAgentName(randomUUID()) }),
  ).toThrow();
  expect(WorkspaceCreateParams.parse({ label: "generated", assistant: marker })).not.toHaveProperty(
    "assistant",
  );
});
it("pins inputs to a device and instance instead of accepting an arbitrary pane or command", () => {
  const deviceId = randomUUID(),
    instanceId = randomUUID();
  expect(
    AssistantSessionPromptParams.parse({ deviceId, instanceId, text: "こんにちは" }).text,
  ).toBe("こんにちは");
  expect(() =>
    AssistantSessionPromptParams.parse({ deviceId, instanceId, text: "x", paneId: randomUUID() }),
  ).toThrow();
  expect(() =>
    AssistantSessionPromptParams.parse({ deviceId, instanceId, text: "x".repeat(8193) }),
  ).toThrow();
  expect(() =>
    AssistantSessionKeysParams.parse({ deviceId, instanceId, keys: Array(257).fill("Enter") }),
  ).toThrow();
});
it("registers the assistant request schemas in the shared method catalog", () => {
  expect(METHOD_SCHEMAS["assistant.get"]).toBe(AssistantSessionGetParams);
  expect(METHOD_SCHEMAS["assistant.ensure"]).toBe(AssistantSessionEnsureParams);
  expect(METHOD_SCHEMAS["assistant.prompt"]).toBe(AssistantSessionPromptParams);
  expect(METHOD_SCHEMAS["assistant.send_keys"]).toBe(AssistantSessionKeysParams);
  expect(METHOD_SCHEMAS["assistant.adopt"]).toBe(AssistantSessionAdoptParams);
});
