import { expect, it } from "vitest";
import { assistantLaunchArgs, DesktopAssistantPreferences, AssistantSessionEnsureParams } from "./desktopAssistant.js";
it("uses per-agent session arguments and delegates empty settings to CLI defaults", () => {
 expect(assistantLaunchArgs("claude", {})).toEqual([]);
 expect(assistantLaunchArgs("claude", {model:"sonnet",effort:"high"})).toEqual(["--model","sonnet","--effort","high"]);
 expect(assistantLaunchArgs("codex", {model:"custom-model",effort:"low"})).toEqual(["--model","custom-model","-c",'model_reasoning_effort="low"']);
 expect(assistantLaunchArgs("gemini", {})).toEqual([]);
 expect(() => assistantLaunchArgs("gemini", {model:"test"})).toThrow();
 expect(() => assistantLaunchArgs("claude", {effort:"ultra"})).toThrow();
 for (const model of ["--help", "model\nexit", "$(touch /tmp/x)", "a;echo", " ", "a".repeat(201)])
  expect(() => assistantLaunchArgs("claude", {model})).toThrow();
 expect(() => AssistantSessionEnsureParams.parse({deviceId:crypto.randomUUID(), kind:"claude",launchSettings:{args:["--dangerously-skip-permissions"]}})).toThrow();
});
it("persists independent profiles while rejecting unsupported combinations", () => {
 const value=DesktopAssistantPreferences.parse({agentProfiles:{claude:{model:"sonnet",effort:"medium"},codex:{model:"custom-model",effort:"xhigh"}}});
 expect(DesktopAssistantPreferences.parse(JSON.parse(JSON.stringify(value))).agentProfiles).toEqual(value.agentProfiles);
 expect(DesktopAssistantPreferences.parse({}).agentProfiles.claude).toEqual({model:"",effort:""});
 expect(() => DesktopAssistantPreferences.parse({agentProfiles:{claude:{effort:"ultra"}}})).toThrow();
});
