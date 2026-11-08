import {expect,it} from "vitest";
import {SubagentUsageAccumulator} from "./SubagentUsageAccumulator.js";
const born=Date.parse("2026-11-08T00:00:00Z"),at="2026-11-08T00:00:01Z";
const u={input_tokens:100,cached_input_tokens:30,cache_write_input_tokens:10,output_tokens:20,reasoning_output_tokens:5,total_tokens:120};
const response=(id="response",thread="child",timestamp=at)=>({type:"token_usage_record",timestamp,payload:{thread_id:thread,response_id:id,usage:u,thread_token_usage:{...u,total_tokens:999999},turn_token_usage:{...u,total_tokens:777777}}});
it("counts only post-birth exact child responses once, never inherited thread/turn totals",()=>{
 const a=new SubagentUsageAccumulator("codex","child",born);
 a.consume(response("parent","parent"));a.consume(response("inherited","child","2026-11-07T23:59:59Z"));expect(a.snapshot()).toBeUndefined();
 a.consume(response());a.consume(response());a.consume(response("response-2"));
 expect(a.snapshot()).toMatchObject({consumptionScope:"self",source:"rollout",observedAt:Date.parse(at),tokens:{basis:"transcript",input:120,cacheRead:60,cacheWrite:20,output:40,reasoning:10,total:240}});
 expect(a.snapshot()).not.toHaveProperty("costUsd");expect(a.snapshot()).not.toHaveProperty("weeklyCostUsd");
});
it("separates last context samples from consumption and clears a missing context window",()=>{
 const a=new SubagentUsageAccumulator("codex","child",born),sample=(window?:number)=>({type:"event_msg",timestamp:at,payload:{type:"token_count",info:{total_token_usage:{total_tokens:999999},last_token_usage:{total_tokens:500},model_context_window:window}}});
 a.consume(sample(1000));expect(a.snapshot()).toMatchObject({contextTokens:500,contextWindowTokens:1000,contextUsedPct:50});expect(a.snapshot()).not.toHaveProperty("tokens");
 a.consume(sample());expect(a.snapshot()).not.toHaveProperty("contextWindowTokens");expect(a.snapshot()).not.toHaveProperty("contextUsedPct");
});
it("does not invent zero or a total when counters are missing, negative, unsafe or malformed",()=>{
 const a=new SubagentUsageAccumulator("codex","child",born);for(const usage of [{},{...u,input_tokens:-1},{...u,output_tokens:NaN},{...u,total_tokens:2**53}])a.consume({...response(),payload:{...response().payload,usage}});
 expect(a.snapshot()).toBeUndefined();
 const b=new SubagentUsageAccumulator("claude","child",born);b.consume({type:"assistant",timestamp:at,message:{id:"m",model:"claude-generated",usage:{input_tokens:10,output_tokens:3,cache_read_input_tokens:4,cache_creation_input_tokens:2}}});
 expect(b.snapshot()).toMatchObject({tokens:{input:10,output:3,cacheRead:4,cacheWrite:2},contextTokens:16});expect(b.snapshot()?.tokens).not.toHaveProperty("total");
});
it("keeps conflicting duplicates partial instead of adding them, and preserves explicit reported zero",()=>{
 const a=new SubagentUsageAccumulator("codex","child",born);a.consume(response());a.consume({...response(),payload:{...response().payload,usage:{...u,total_tokens:999}}});expect(a.snapshot()).toMatchObject({tokens:{total:120},partial:true});
 const b=new SubagentUsageAccumulator("codex","child",born);b.consume({...response(),payload:{...response().payload,usage:Object.fromEntries(Object.keys(u).map(k=>[k,0]))}});expect(b.snapshot()?.tokens?.total).toBe(0);
});
it("accepts only formal Muse child streams and AGY completed call counters, not parent settings or nested prose",()=>{
 const a=new SubagentUsageAccumulator("muse","child",born),record={schema_version:1,payload_schema_version:1,stream:{kind:"session",id:"child"},recorded_at:Date.parse(at)*1000,payload_type:"runtime.session",payload:{kind:"run",event:{kind:"goal_usage_attribution",record:{schema_version:1,usage_family:"provider",usage_id:"call",model:"generated",quantity:{reported:true,unit:"tokens",input_tokens:10,output_tokens:2,cached_tokens:3}}}}};
 a.consume({...record,stream:{kind:"session",id:"parent"}});expect(a.snapshot()).toBeUndefined();a.consume(record);a.consume(record);expect(a.snapshot()?.tokens).toMatchObject({input:7,output:2,cacheRead:3});
 const b=new SubagentUsageAccumulator("agy","child",born),row={type:"PLANNER_RESPONSE",status:"DONE",step_index:1,created_at:at,model:"generated",input_tokens:10,output_tokens:2,cache_read_tokens:3};
 b.consume({content:row});b.consume({...row,status:"RUNNING"});expect(b.snapshot()).toBeUndefined();b.consume(row);b.consume(row);expect(b.snapshot()?.tokens).toMatchObject({input:10,output:2,cacheRead:3});expect(b.snapshot()?.tokens).not.toHaveProperty("total");
});
it("bounds response dedup without evicting old proof and double counting repeats",()=>{
 const a=new SubagentUsageAccumulator("codex","child",born);for(let n=0;n<20001;n++)a.consume(response(String(n)));a.consume(response("0"));expect(a.snapshot()).toMatchObject({tokens:{total:20000*120},partial:true});
});
it("rejects an unproven birth time and foreign explicit Claude child IDs",()=>{
 const a=new SubagentUsageAccumulator("codex","child",NaN);a.consume(response());expect(a.snapshot()).toBeUndefined();
 const b=new SubagentUsageAccumulator("claude","child",born);b.consume({type:"assistant",timestamp:at,agentId:"other-child",message:{id:"foreign",usage:{input_tokens:123,output_tokens:5}}});expect(b.snapshot()).toBeUndefined();
});
