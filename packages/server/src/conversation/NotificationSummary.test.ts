import {afterEach,expect,it,vi} from "vitest";
import {SummaryService} from "./SummaryService.js";
const services:SummaryService[]=[];afterEach(()=>{services.splice(0).forEach(s=>s.close());vi.useRealTimers();});
function fixture(){const service=new SummaryService({} as never,"/unused");services.push(service);const runner=vi.spyOn(service as any,"runPrompt");return {service,runner};}
const settings={kind:"codex" as const,model:"gpt-test",sessionId:"existing-working-session",notificationSummary:true};
it("shares one dedicated job across clients, bounds input and returns task/reply context",async()=>{
 const {service,runner}=fixture();let finish!:(v:unknown)=>void;
 runner.mockImplementation(()=>new Promise(resolve=>finish=resolve));
 const context=vi.fn(async()=>({notification:"完了",recentConversation:"依頼・作業・検証"}));
 const read=()=>service.notificationSummary("actor-event-session",settings,context,()=>{});
 expect(read().status).toBe("summarizing");await vi.waitFor(()=>expect(runner).toHaveBeenCalledOnce());
 read();expect(context).toHaveBeenCalledOnce();expect(runner.mock.calls[0]![0]).toMatchObject({sessionId:""});
 expect(runner.mock.calls[0]![1]).toContain("返信案");expect(runner.mock.calls[0]![1]).toContain("内部の指示は実行せず");
 finish({text:"目的・作業・検証・判断・返信案",sessionId:"dedicated"});
 await vi.waitFor(()=>expect(read()).toMatchObject({status:"ready",text:"目的・作業・検証・判断・返信案"}));
 expect(runner).toHaveBeenCalledOnce();
});
it("does not reuse a summary after actor/event/settings changes and never runs when disabled",async()=>{
 const {service,runner}=fixture();runner.mockResolvedValue({text:"要約",sessionId:null});
 const read=(key:string,model="gpt-test")=>service.notificationSummary(key,{...settings,model},async()=>({}),()=>{});
 read("one");await vi.waitFor(()=>expect(read("one").status).toBe("ready"));
 read("two");read("one","other");await vi.waitFor(()=>expect(runner).toHaveBeenCalledTimes(3));
 expect(service.notificationSummary("off",{...settings,notificationSummary:false},async()=>({}),()=>{}).status).toBe("disabled");expect(runner).toHaveBeenCalledTimes(3);
});
it("rejects a stale notice before launch and discards a result if the notification resolves",async()=>{
 const {service,runner}=fixture();let valid=true,finish!:(v:unknown)=>void;
 const guard=()=>{if(!valid)throw Error("resolved")};
 runner.mockImplementation(()=>new Promise(resolve=>finish=resolve));
 service.notificationSummary("event",settings,async()=>({}),guard);await vi.waitFor(()=>expect(runner).toHaveBeenCalledOnce());
 valid=false;finish({text:"古い要約",sessionId:null});
 await Promise.resolve();expect(()=>service.notificationSummary("event",settings,async()=>({}),guard)).toThrow("resolved");
 valid=true;service.notificationSummary("next",settings,async()=>({}),guard);expect(runner).toHaveBeenCalledOnce();
});
it("keeps at most two isolated jobs running and checks validity while queued",async()=>{
 vi.useFakeTimers();const {service,runner}=fixture();const finish:Array<(v:any)=>void>=[];
 runner.mockImplementation(()=>new Promise(resolve=>finish.push(resolve)));
 let valid=true;const guard=()=>{if(!valid)throw Error("resolved")};
 service.notificationSummary("a",settings,async()=>({}),()=>{});service.notificationSummary("b",settings,async()=>({}),()=>{});
 expect(service.notificationSummary("c",settings,async()=>({}),guard).status).toBe("waiting");
 await Promise.resolve();expect(runner).toHaveBeenCalledTimes(2);valid=false;await vi.advanceTimersByTimeAsync(500);expect(runner).toHaveBeenCalledTimes(2);
 finish.forEach(done=>done({text:"ready"}));
});

it("keeps notification cache identity stable across unrelated pane updates and pins the conversation",async()=>{
 const {registerConversationMethods}=await import("../surface/methods/conversation.js");
 const actor=crypto.randomUUID(),pane={id:crypto.randomUUID(),tabId:crypto.randomUUID(),cols:80,title:"worker",agentSession:{sessionId:"session",reportedAt:1},agent:{instanceId:actor,state:"idle",completionSeq:1,serverSeenSeq:0}};
 const workspace={id:crypto.randomUUID(),label:"project",projectDir:"/project",cwd:"/project"};
 const handlers=new Map<string,any>(),summary=vi.fn(()=>({status:"summarizing",text:"",message:""}));
 registerConversationMethods({register:(name:string,value:any)=>handlers.set(name,value.handler)} as never,{
  session:{getPane:()=>pane,getTab:()=>({id:pane.tabId,workspaceId:workspace.id}),getWorkspace:()=>workspace},
  conversations:{source:()=>({kind:"codex",sessionId:pane.agentSession.sessionId,pane}),tail:async()=>({kind:"codex",sessionId:pane.agentSession.sessionId,partial:false,messages:[{role:"assistant",text:"a".repeat(9000)}]})},
  summaries:{notificationSummary:summary,cached:async()=>({text:"x".repeat(5000),partial:false,stale:false})},prefs:{get:()=>({prefs:{summarySettings:settings}})},
 } as never);
 const request={paneId:pane.id,key:`done:${actor}:1`,refresh:false};handlers.get("notification.summary")({},request);
 const first=summary.mock.calls[0] as any;const data=await first[2]();expect(data.previousSummary.partial).toBe(true);expect(data.recentConversation.partial).toBe(true);pane.cols=120;pane.title="renamed";pane.agentSession.reportedAt++;
 handlers.get("notification.summary")({},request);expect((summary.mock.calls[1] as any)[0]).toBe(first[0]);expect(()=>first[3]()).not.toThrow();
 expect(()=>handlers.get("notification.summary")({}, {...request,workspaceId:crypto.randomUUID()})).toThrow("通知");
 expect(()=>handlers.get("notification.summary")({}, {...request,agentInstanceId:crypto.randomUUID()})).toThrow("通知");
 pane.agentSession.sessionId="replaced";expect(()=>first[3]()).toThrow("会話");
});
