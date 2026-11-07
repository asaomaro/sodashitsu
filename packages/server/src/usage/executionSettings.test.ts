import { describe, expect, it } from "vitest";
import { codexTurnSettings, observedSetting, reportedSettings } from "./executionSettings.js";
describe("provider observation projection", () => {
  it("keeps turn effort/approval/sandbox separate and never reads requested or nested tool values", () => {
    const value = codexTurnSettings({ type: "turn_context", timestamp: "2026-11-07T00:00:00Z", payload: { effort: "medium", approval_policy: "never", sandbox_policy: { type: "workspace-write", writable_roots: ["SECRET"] }, desired_effort: "max" } });
    expect(value).toEqual({ reasoningEffort: { value: "medium", source: "rollout", basis: "turn", observedAt: 1794009600000 }, approvalPolicy: { value: "never", source: "rollout", basis: "turn", observedAt: 1794009600000 }, sandboxMode: { value: "workspace-write", source: "rollout", basis: "turn", observedAt: 1794009600000 } });
    expect(JSON.stringify(value)).not.toContain("SECRET");
    expect(codexTurnSettings({ type: "session_meta", payload: { effort: "high" } })).toBeUndefined();
    expect(codexTurnSettings({ type: "turn_context", payload: { approval_policy: { reject: { commands: "SECRET" } } } })).toEqual({});
  });
  it("does not invent a timestamp, accept bodies/control chars, or trust a report as a session projection", () => {
    expect(observedSetting("plan", "hook", "hook")).toEqual({ value: "plan", source: "hook", basis: "hook" });
    expect(observedSetting("SECRET\nmode", "hook", "hook")).toBeUndefined();
    expect(reportedSettings({ permissionMode: { value: "plan", source: "hook", basis: "hook", prompt: "SECRET" }, sandboxMode: { value: "read-only", source: "rollout", basis: "session" } })).toEqual({ permissionMode: { value: "plan", source: "hook", basis: "hook" } });
    expect(reportedSettings({ approvalPolicy: { value: "never", source: "launch-profile", basis: "session" } })).toBeUndefined();
  });
});
