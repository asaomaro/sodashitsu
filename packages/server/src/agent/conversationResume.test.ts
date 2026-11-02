import { expect, it } from "vitest";
import { conversationResumeArgs } from "./conversationResume.js";
it("resumes each CLI using its native arguments, without leaking Codex flags to other kinds", () => {
  expect(conversationResumeArgs("claude", "id", "/work")).toEqual(["--resume", "id"]);
  expect(conversationResumeArgs("codex", "id", "/work")).toEqual(["resume", "id", "--cd", "/work"]);
  expect(conversationResumeArgs("muse", "id", "/work")).toEqual(["resume", "id"]);
  expect(conversationResumeArgs("agy", "id", "/work")).toEqual(["--conversation", "id"]);
  expect(conversationResumeArgs("copilot", "id", "/work")).toEqual(["--resume", "id"]);
});
