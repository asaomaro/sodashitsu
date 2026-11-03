import { it, expect } from "vitest";
import {
  headerActionsFor,
  AGENT_HEADER_ACTIONS,
  loadAgentHeaderActions,
  SummarySettingsSchema,
} from "./conversation.js";
it("only offers supported controls and requires a transcript for history and summary", () => {
  expect(headerActionsFor("unknown", true, AGENT_HEADER_ACTIONS)).toEqual(["notes"]);
  expect(headerActionsFor("codex", false, AGENT_HEADER_ACTIONS)).toEqual([
    "compact",
    "clear",
    "usage",
    "permissions",
  ]);
  expect(headerActionsFor("copilot", true, AGENT_HEADER_ACTIONS)).toEqual([
    "messages", "summary", "notes", "todos",
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

it("separates header and menu visibility and migrates old button settings", async () => {
  const { configuredAgentActions, loadAgentActionSettings } = await import("./conversation.js");
  const prefs = loadAgentActionSettings({ notes: "menu", todos: "hidden" }, [
    "notes",
    "todos",
    "summary",
  ]);
  expect(configuredAgentActions(prefs, [])).toEqual(["summary"]);
  expect(configuredAgentActions(prefs, [], true)).toEqual(["summary", "notes"]);
  expect(loadAgentActionSettings(undefined, []).notes).toBe("hidden");
});

it("offers history, summary and task inspection for all five installed kinds",()=>{
 for(const kind of ["claude","codex","muse","agy","copilot"])expect(headerActionsFor(kind,true,["messages","summary","todos"])).toEqual(["messages","summary","todos"]);
});

it("accepts bounded model IDs and provider-specific effort while preserving old settings",()=>{
 expect(SummarySettingsSchema.parse({kind:"codex",model:"provider/model@version",effort:"xhigh",sessionId:""}).effort).toBe("xhigh");
 expect(SummarySettingsSchema.safeParse({kind:"claude",model:"sonnet",effort:"none",sessionId:""}).success).toBe(false);
 expect(SummarySettingsSchema.safeParse({kind:"codex",model:"m",effort:"unsafe",sessionId:""}).success).toBe(false);
 expect(SummarySettingsSchema.safeParse({kind:"codex",model:"--unsafe",sessionId:""}).success).toBe(false);
 expect(SummarySettingsSchema.safeParse({kind:"claude",model:"",sessionId:""}).success).toBe(true);
});
