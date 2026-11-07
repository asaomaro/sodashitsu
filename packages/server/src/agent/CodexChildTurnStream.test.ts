import {expect,it} from "vitest";
import {CodexChildTurnStream} from "./CodexChildTurnStream.js";
const row=(model:string,effort?:string)=>JSON.stringify({timestamp:"2026-11-08T00:00:01Z",type:"turn_context",payload:{model,effort}})+"\n";
it("observes complete coherent turns and clears missing fields across arbitrary chunk boundaries",()=>{
 const bytes=Buffer.from(row("first","low")+row("changed"));
 for(const step of [1,2,7,33,4096]){const stream=new CodexChildTurnStream(0,0);for(let at=0;at<bytes.length;at+=step)stream.consume(bytes.subarray(at,at+step));expect(stream.invalid).toBe(false);expect(stream.partial).toBe(false);expect(stream.value).toEqual({model:"changed",modelBasis:"turn"});}
});
it("skips validated giant text without retaining or parsing a giant JSON value",()=>{
 const stream=new CodexChildTurnStream(0,0);stream.consume(Buffer.from(row("actual","high")));
 stream.consume(Buffer.from('{"type":"response_item","payload":{"type":"message","content":[{"type":"output_text","text":"'));
 for(let n=0;n<64;n++)stream.consume(Buffer.from('x'.repeat(65536)));
 stream.consume(Buffer.from('"}]}}\n'));expect(stream.invalid).toBe(false);expect(stream.value).toMatchObject({model:"actual",reasoningEffort:"high"});
});
it("extracts model metadata from an oversized turn without copying its private body",()=>{
 const stream=new CodexChildTurnStream(0,0);stream.consume(Buffer.from('{"type":"turn_context","timestamp":"2026-11-08T00:00:01Z","payload":{"instructions":"'));
 for(let n=0;n<5;n++)stream.consume(Buffer.from('x'.repeat(65536)));
 stream.consume(Buffer.from('","model":"actual","effort":"medium"}}\n'));expect(stream.invalid).toBe(false);expect(stream.value).toMatchObject({model:"actual",reasoningEffort:"medium"});
});
it.each([
 '{"type":"response_item","type":"turn_context","payload":{"model":"forged"}}\n',
 '{"type":"turn_context","timestamp":"2026-11-08T00:00:01Z","payload":{"model":"good","model":"forged"}}\n',
 '{"type":"future_unknown","payload":{"model":"forged"}}\n',
 '{"type":"turn_context","payload":{"model":"forged"},broken}\n',
])("invalid or unknown envelopes never inherit or expose settings: %s",text=>{const stream=new CodexChildTurnStream(0,0);stream.consume(Buffer.from(row("old","low")+text));expect(stream.invalid).toBe(true);});
it("ignores nested/escaped fake headers, validates UTF8 and withholds partial rows",()=>{
 const stream=new CodexChildTurnStream(0,0);const fake=JSON.stringify({type:"response_item",payload:{type:"message",content:[{type:"text",text:'{"type":"turn_context","payload":{"model":"forged"}} 日本語'}]}})+"\n";
 const bytes=Buffer.from(row("actual","high")+fake);for(let at=0;at<bytes.length;at++)stream.consume(bytes.subarray(at,at+1));expect(stream.invalid).toBe(false);expect(stream.value.model).toBe("actual");
 stream.consume(Buffer.from('{"type":"turn_context"'));expect(stream.partial).toBe(true);
 const bad=new CodexChildTurnStream(0,0);bad.consume(Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d,0x0a]));expect(bad.invalid).toBe(true);
});
it("never uses a turn before the child creation floor",()=>{const stream=new CodexChildTurnStream(0,Date.parse("2026-11-08T00:00:02Z"));stream.consume(Buffer.from(row("inherited","high")));expect(stream.seenTurn).toBe(true);expect(stream.value).toEqual({});});

it.each(["world_state","dynamic_tools_updated","inter_agent_communication","inter_agent_communication_metadata","token_usage_record","retained_context","security_risk_score","realtime_item"])("validates formal non-turn root %s without applying turn field guards",type=>{
 const stream=new CodexChildTurnStream(0,0);stream.consume(Buffer.from(row("actual","high")));
 stream.consume(Buffer.from(JSON.stringify({type,payload:{type:{nested:"not a discriminator"},model:"x".repeat(300000),state:{type:"turn_context",model:"forged"}}})+"\n"));
 expect(stream.invalid).toBe(false);expect(stream.value).toMatchObject({model:"actual",reasoningEffort:"high"});
});
