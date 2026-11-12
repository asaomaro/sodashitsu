import {expect,it} from "vitest";
import {DesktopSourceIdle} from "./DesktopSourceIdle.js";
const context={backend:"linux-portal" as const,ready:true,pending:0,seq:1};
const notice=(counter=1,seq=1)=>({type:"platform_idle",backend:"linux-portal",seq,counter});
it("deduplicates informational notices without changing an image sequence",()=>{const idle=new DesktopSourceIdle();expect(idle.receive(notice(),context)).toEqual(notice());expect(idle.receive(notice(),context)).toBeUndefined();expect(idle.receive(notice(2),context)).toEqual(notice(2));expect(context.seq).toBe(1);});
it("rejects unknown fields and different backends while discarding notices overtaken by images or ACKs",()=>{for(const changed of [{backend:undefined},{backend:"macos-sck" as const}]){const idle=new DesktopSourceIdle();expect(()=>idle.receive(notice(),{...context,...changed})).toThrow();}for(const changed of [{ready:false},{pending:1},{seq:2}]){const idle=new DesktopSourceIdle();expect(idle.receive(notice(),{...context,...changed})).toBeUndefined();expect(idle.receive(notice(),context)).toBeUndefined();}const idle=new DesktopSourceIdle();expect(()=>idle.receive({...notice(),captureMs:0},context)).toThrow();});
