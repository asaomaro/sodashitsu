import { expect, it } from "vitest";
import { AssistantModelCatalogParams,AssistantModelCatalog,assistantLaunchArgs, DesktopAssistantPreferences, AssistantSessionEnsureParams } from "./desktopAssistant.js";
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

it("offers all seven independent profiles with their native model/effort flags",()=>{
 for(const kind of ["muse","agy","copilot"]){
  expect(assistantLaunchArgs(kind,{model:"test-model",effort:"high"})).toEqual(["--model","test-model",kind==="agy"?"--effort":"--reasoning-effort","high"]);
 }
 const profiles=DesktopAssistantPreferences.parse({}).agentProfiles;
 expect(Object.keys(profiles)).toEqual(["claude","codex","muse","agy","copilot","grok","cursor"]);
 expect(()=>assistantLaunchArgs("agy",{effort:"ultra"})).toThrow();
 expect(()=>assistantLaunchArgs("copilot",{effort:"ultra"})).toThrow();
});

it("preserves Grok launch choices without treating them as observations",()=>{
 expect(assistantLaunchArgs("grok",{model:"grok-custom",effort:"xhigh"})).toEqual(["--model","grok-custom","--reasoning-effort","xhigh"]);
 const legacy=DesktopAssistantPreferences.parse({agentProfiles:{codex:{model:"old",effort:"low"}}});
 expect(legacy.agentProfiles.grok).toEqual({model:"",effort:""});
 const saved=DesktopAssistantPreferences.parse({...legacy,agentProfiles:{...legacy.agentProfiles,grok:{model:"grok-custom",effort:"medium"}}});
 expect(DesktopAssistantPreferences.parse(JSON.parse(JSON.stringify(saved))).agentProfiles).toEqual(saved.agentProfiles);
 expect(()=>assistantLaunchArgs("grok",{effort:"ultra"})).toThrow();
});

it("launches a Cursor catalog variant without inventing a separate effort flag",()=>{
 expect(assistantLaunchArgs("cursor",{model:"gpt-generated-high"})).toEqual(["--model","gpt-generated-high"]);
 expect(()=>assistantLaunchArgs("cursor",{model:"gpt-generated-high",effort:"high"})).toThrow();
 expect(DesktopAssistantPreferences.parse({}).agentProfiles.cursor).toEqual({model:"",effort:""});
});

it("bounds large advertised model catalogs at 512 entries",()=>{
 const rows=Array.from({length:512},(_,i)=>({id:`generated-${i}`,label:`Model ${i}`,efforts:[]}));
 expect(AssistantModelCatalog.safeParse({models:rows,message:""}).success).toBe(true);
 expect(AssistantModelCatalog.safeParse({models:[...rows,rows[0]],message:""}).success).toBe(false);
});

it("keeps old catalogs compatible and accepts bounded discovery provenance",()=>{
 expect(AssistantModelCatalogParams.parse({kind:"grok",refresh:true})).toEqual({kind:"grok",refresh:true});
 expect(AssistantModelCatalog.safeParse({models:[],message:"old host"}).success).toBe(true);
 expect(AssistantModelCatalog.safeParse({models:[],message:"",source:"cli",fetchedAt:1,cached:false}).success).toBe(true);
 expect(AssistantModelCatalog.safeParse({models:[],message:"",source:"remote-updated",fetchedAt:-1}).success).toBe(false);
 expect(AssistantModelCatalogParams.safeParse({kind:"grok",command:"arbitrary"}).success).toBe(false);
});
