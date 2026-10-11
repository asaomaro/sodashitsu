import { it, expect } from "vitest";
import {
  headerActionsFor,
  AGENT_HEADER_ACTIONS,
  loadAgentHeaderActions,
  SummarySettingsSchema,
} from "./conversation.js";
it("only offers supported controls and requires a transcript for history and summary", () => {
  expect(headerActionsFor("unknown", true, AGENT_HEADER_ACTIONS)).toEqual([]);
  expect(headerActionsFor("codex", false, AGENT_HEADER_ACTIONS)).toEqual([
    "compact",
    "clear",
    "usage",
    "permissions",
  ]);
  expect(headerActionsFor("copilot", true, AGENT_HEADER_ACTIONS)).toEqual([
    "compact",
    "clear",
    "usage",
    "permissions",
    "fork",
  ]);
  expect(headerActionsFor("claude", true, ["messages", "summary"])).toEqual([
    "messages",
    "summary",
  ]);
  expect(loadAgentHeaderActions([])).toEqual([]);
  expect(
    SummarySettingsSchema.safeParse({ kind: "codex", model: "m", sessionId: "../work" }).success,
  ).toBe(false);
});
