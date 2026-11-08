import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import { startAgentReportSocket, type AgentReport } from "./AgentReportSocket.js";
import { MemoryLogger } from "../log/Logger.js";
it("piggybacks only parent permission-mode facts and never hook input/child overrides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-hook-observed-")), path = join(dir, "r.sock"), reports: AgentReport[] = [];
  const server = await startAgentReportSocket(path, r => reports.push(r), new MemoryLogger());
  try {
    const run = (payload: object) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL("../../assets/agent-hook-report.cjs", import.meta.url)), "claude"], { env: { ...process.env, SODA_PANE_ID: "fixture-pane", SODA_AGENT_REPORT_SOCKET: path }, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = ""; child.stdout.on("data", b => { stdout += b }); child.stderr.resume();
      child.on("error", reject); child.on("close", code => { try { expect(code).toBe(0); expect(stdout).toBe(""); resolve() } catch(e) { reject(e) } });
      child.stdin.end(JSON.stringify({ session_id: "11111111-1111-4111-8111-111111111111", hook_event_name: "Stop", permission_mode: "plan", prompt: "SECRET", last_assistant_message: "SECRET", ...payload }));
    });
    await run({}); expect(reports.at(-1)?.executionSettings).toEqual({ permissionMode: { value: "plan", source: "hook", basis: "hook" } });
    await run({ agent_id: "child", permission_mode: "bypassPermissions" }); expect(reports.at(-1)?.executionSettings).toBeUndefined();
    await run({ permission_mode: "future-policy" }); expect(reports.at(-1)?.executionSettings).toBeUndefined();
    await run({ permission_mode: "bypassPermissions" }); expect(reports.at(-1)?.executionSettings?.permissionMode?.value).toBe("bypassPermissions");
    expect(JSON.stringify(reports)).not.toContain("SECRET");
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});
it('Cursor generated after-response fixture sends only scoped numeric/model/explicit effort metadata',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'soda-cursor-hook-')),path=join(dir,'r.sock'),reports:AgentReport[]=[];
 const server=await startAgentReportSocket(path,r=>reports.push(r),new MemoryLogger());
 try{
  const run=(payload:object)=>new Promise<void>((resolve,reject)=>{
   const child=spawn(process.execPath,[fileURLToPath(new URL('../../assets/agent-hook-report.cjs',import.meta.url)),'cursor'],{env:{...process.env,SODA_PANE_ID:'fixture-pane',SODA_AGENT_REPORT_SOCKET:path},stdio:['pipe','pipe','pipe']});
   let stdout='';child.stdout.on('data',b=>{stdout+=b});child.stderr.resume();child.on('error',reject);child.on('close',code=>{try{expect(code).toBe(0);expect(stdout).toBe('');resolve()}catch(e){reject(e)}});
   child.stdin.end(JSON.stringify({hook_event_name:'afterAgentResponse',conversation_id:'11111111-1111-4111-8111-111111111111',generation_id:'generation-1',model:'model-high',model_id:'explicit-model',model_params:[{id:'effort',value:'low'}],input_tokens:100,output_tokens:20,cache_read_tokens:30,cache_write_tokens:10,text:'SECRET',user_email:'SECRET',transcript_path:'/SECRET',...payload}));
  });
  await run({});expect(reports.filter(r=>r.type==='cursor_turn_usage')).toHaveLength(1);expect(reports.find(r=>r.type==='cursor_turn_usage')).toMatchObject({type:'cursor_turn_usage',kind:'cursor',generationId:'generation-1',model:'explicit-model',reasoningEffort:'low',inputTokens:100});expect(JSON.stringify(reports)).not.toContain('SECRET');
  for(const payload of [{subagent_id:'child'},{parent_conversation_id:'other-parent'},{session_id:'other-parent'},{input_tokens:39},{output_tokens:-1},{text:'x'.repeat(2*1024*1024+1)}])await run(payload);
  expect(reports.filter(r=>r.type==='cursor_turn_usage')).toHaveLength(1);
  expect(reports.filter(r=>r.type==='cursor_child')).toHaveLength(4);expect(reports.filter(r=>r.type==='cursor_child')).toEqual(expect.arrayContaining([expect.objectContaining({phase:'observation',childId:'11111111-1111-4111-8111-111111111111',model:'explicit-model'})]));
  await run({model_params:[],reasoningEffort:'max'});expect(reports.at(-1)).not.toHaveProperty('reasoningEffort');expect(reports.at(-1)).toMatchObject({model:'explicit-model'});
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});
it("Cursor child hook channel retains formal Stop identity and only explicit child-self settings",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"soda-cursor-child-hook-")),path=join(dir,"r.sock"),reports:AgentReport[]=[];
 const parent="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222";
 const server=await startAgentReportSocket(path,r=>reports.push(r),new MemoryLogger());
 try{
  const run=(extra:object)=>new Promise<void>((resolve,reject)=>{
   const child=spawn(process.execPath,[fileURLToPath(new URL("../../assets/agent-hook-report.cjs",import.meta.url)),"cursor"],{env:{...process.env,SODA_PANE_ID:"fixture-pane",SODA_AGENT_REPORT_SOCKET:path},stdio:["pipe","pipe","pipe"]});
   let stdout="";child.stdout.on("data",b=>stdout+=b);child.stderr.resume();child.once("error",reject);child.once("close",code=>{try{expect(code).toBe(0);expect(stdout).toBe("");resolve();}catch(e){reject(e);}});
   child.stdin.end(JSON.stringify({hook_event_name:"subagentStop",parent_conversation_id:parent,child_conversation_id:id,conversation_id:parent,session_id:parent,subagent_id:"logical",subagent_type:"Explore",status:"completed",model_id:"parent-model",model_params:[{id:"effort",value:"high"}],prompt:"SECRET",summary:"SECRET",...extra}));
  });
  await run({});expect(reports[0]).toMatchObject({type:"cursor_child",phase:"stop",sessionId:parent,parentId:parent,childId:id,settingsObserved:false});expect(reports[0]).not.toHaveProperty("model");
  await run({conversation_id:id,session_id:id,model_id:"own-child"});expect(reports[1]).toMatchObject({type:"cursor_child",phase:"stop",settingsObserved:true,model:"own-child",reasoningEffort:"high"});
  await run({conversation_id:id});expect(reports[2]).toMatchObject({type:"cursor_child",phase:"stop",settingsObserved:false});expect(reports[2]).not.toHaveProperty("model");
  await run({hook_event_name:"afterAgentResponse",conversation_id:id,session_id:id,generation_id:"self-generation",model_id:"own-child",model_params:[]});expect(reports[3]).toMatchObject({type:"cursor_child",phase:"observation",settingsObserved:true,model:"own-child"});expect(reports[3]).not.toHaveProperty("reasoningEffort");
  await run({hook_event_name:"afterAgentResponse",parent_conversation_id:undefined,child_conversation_id:undefined,subagent_id:undefined,conversation_id:id,session_id:id,generation_id:"empty-generation",model_id:undefined,model_params:[]});expect(reports[4]).toMatchObject({type:"cursor_child",phase:"observation",settingsObserved:true});expect(reports[4]).not.toHaveProperty("model");
  await run({hook_event_name:"afterAgentResponse",parent_conversation_id:undefined,child_conversation_id:undefined,subagent_id:undefined,conversation_id:id,session_id:id,generation_id:"long-model",model_id:"x".repeat(201),model_params:[]});
  expect(reports.filter(r=>r.type==="cursor_child").at(-1)).toMatchObject({phase:"observation",generationId:"long-model",settingsObserved:true});expect(reports.filter(r=>r.type==="cursor_child").at(-1)).not.toHaveProperty("model");
  expect(JSON.stringify(reports)).not.toContain("SECRET");expect(reports.filter(r=>r.type==="cursor_turn_usage")).toHaveLength(1);
 }finally{await server.close();await rm(dir,{recursive:true,force:true});}
});
