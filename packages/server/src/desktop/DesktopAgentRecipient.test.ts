import {afterEach,expect,it,vi} from "vitest";
import {performance} from "node:perf_hooks";
import {DesktopAgentAccess,type AgentTarget} from "./DesktopAgentAccess.js";
import {DesktopEndpointAgentRpc} from "./DesktopEndpointAgentRpc.js";
const fingerprint="a".repeat(64),other="b".repeat(64),key={kind:"key" as const,code:"KeyA",down:true};
function fixture(){
 let revision=0;const issued=revision;
 const recipient={fingerprint,active:()=>revision===issued};
 const target:AgentTarget={frame:()=>({info:{seq:1,width:1,height:1,format:"image/png",captureMs:0,encodeMs:0},image:new Uint8Array([1,2,3]),at:performance.now()}),control:vi.fn(),state:vi.fn(),input:vi.fn(async()=>{}),releaseInputs:vi.fn()};
 const api=new DesktopAgentAccess();return{api,target,recipient,revokeAndRetrust:()=>{revision+=2;}};
}
const rpcs:DesktopEndpointAgentRpc[]=[];
afterEach(()=>{for(const rpc of rpcs.splice(0))rpc.close();vi.useRealTimers();vi.restoreAllMocks();});
const request=(id:number,method:string,params:unknown)=>JSON.stringify({id:String(id),method,params});
it("requires the bound authenticated recipient and does not let legacy/wrong attach consume the ticket",()=>{
 const f=fixture(),grant=f.api.grant(f.target,f.recipient);
 expect(()=>f.api.attach("legacy",grant.ticket)).toThrow();expect(()=>f.api.attachRecipient("wrong",grant.ticket,other)).toThrow();
 const lease=f.api.attachRecipient("right",grant.ticket,fingerprint);expect(lease.leaseId).toHaveLength(43);expect(()=>f.api.attachRecipient("twice",grant.ticket,fingerprint)).toThrow();
 const legacy=f.api.grant(f.target);expect(()=>f.api.attachRecipient("e2e",legacy.ticket,fingerprint)).toThrow();expect(f.api.attach("plain",legacy.ticket).leaseId).toHaveLength(43);
});
it("invalidates both unused tickets and active leases across recipient revoke/retrust",()=>{
 const f=fixture(),grant=f.api.grant(f.target,f.recipient);f.revokeAndRetrust();expect(()=>f.api.attachRecipient("old",grant.ticket,fingerprint)).toThrow();
 const second=fixture(),lease=second.api.attachRecipient("agent",second.api.grant(second.target,second.recipient).ticket,fingerprint);second.revokeAndRetrust();expect(second.api.occupied(second.target)).toBe(false);expect(()=>second.api.observe("agent",lease.leaseId)).toThrow();expect(second.target.releaseInputs).toHaveBeenCalledOnce();
});
it("does not publish a refreshed image or send another input after recipient revocation",async()=>{
 const f=fixture(),lease=f.api.attachRecipient("agent",f.api.grant(f.target,f.recipient).ticket,fingerprint);let done!:()=>void;
 vi.mocked(f.target.input).mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));
 const observed=f.api.observe("agent",lease.leaseId),pending=f.api.act("agent",lease.leaseId,observed.observationId,[key,key]);f.revokeAndRetrust();done();await expect(pending).rejects.toThrow();expect(f.target.input).toHaveBeenCalledTimes(1);expect(f.target.releaseInputs).toHaveBeenCalledOnce();
 const second=fixture(),active=second.api.attachRecipient("agent",second.api.grant(second.target,second.recipient).ticket,fingerprint);second.target.capture=()=>new Promise<void>(resolve=>{done=resolve;});const refresh=second.api.refresh("agent",active.leaseId);second.revokeAndRetrust();done();await expect(refresh).rejects.toThrow();
});
it("completes all revocation cleanup when a helper callback throws",()=>{
 const f=fixture(),lease=f.api.attachRecipient("agent",f.api.grant(f.target,f.recipient).ticket,fingerprint);
 vi.mocked(f.target.releaseInputs).mockImplementation(()=>{throw Error("helper stopped");});vi.mocked(f.target.control).mockImplementation(()=>{throw Error("helper stopped");});f.revokeAndRetrust();f.api.tick();expect(()=>f.api.observe("agent",lease.leaseId)).toThrow();expect(f.target.state).toHaveBeenLastCalledWith(false,0);
});
it("provides only a finite private RPC owner and rejects duplicate IDs or general RPC",async()=>{
 const f=fixture(),grant=f.api.grant(f.target,f.recipient),rpc=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(rpc);
 const attached=JSON.parse(await rpc.request(request(1,"desktop.agent.attach",{ticket:grant.ticket})));const leaseId=attached.result.leaseId;
 const observed=JSON.parse(await rpc.request(request(2,"desktop.agent.observe",{leaseId})));expect(observed.result.imageBase64).toBe("AQID");
 await expect(rpc.request(request(2,"desktop.agent.observe",{leaseId}))).rejects.toThrow();expect(()=>f.api.observe("other",leaseId)).toThrow();expect(f.target.releaseInputs).toHaveBeenCalledOnce();
 const second=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(second);await expect(second.request(request(1,"desktop.start",{}))).rejects.toThrow();
});
it("timeout rejects the pending operation, releases input and rejects its delayed result without retry",async()=>{
 vi.useFakeTimers();const f=fixture(),rpc=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(rpc);let done!:()=>void;
 const {leaseId}=JSON.parse(await rpc.request(request(1,"desktop.agent.attach",{ticket:f.api.grant(f.target,f.recipient).ticket}))).result;
 const observed=JSON.parse(await rpc.request(request(2,"desktop.agent.observe",{leaseId}))).result;
 vi.mocked(f.target.input).mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));
 const pending=rpc.request(request(3,"desktop.agent.act",{leaseId,observationId:observed.observationId,inputs:[key,key]})),rejected=expect(pending).rejects.toThrow();await vi.advanceTimersByTimeAsync(60001);await rejected;expect(f.target.releaseInputs).toHaveBeenCalledOnce();done();await Promise.resolve();await Promise.resolve();expect(f.target.input).toHaveBeenCalledTimes(1);await expect(rpc.request(request(4,"desktop.agent.observe",{leaseId}))).rejects.toThrow();
});
it("close cancels pending refresh even when cleanup callbacks throw",async()=>{
 const f=fixture(),rpc=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(rpc);let done!:()=>void;
 const {leaseId}=JSON.parse(await rpc.request(request(1,"desktop.agent.attach",{ticket:f.api.grant(f.target,f.recipient).ticket}))).result;
 f.target.capture=()=>new Promise<void>(resolve=>{done=resolve;});vi.mocked(f.target.control).mockImplementation(()=>{throw Error("stop");});
 const pending=rpc.request(request(2,"desktop.agent.observe",{leaseId})),rejected=expect(pending).rejects.toThrow();rpc.close();await rejected;expect(f.target.state).toHaveBeenLastCalledWith(false,0);done();await Promise.resolve();
});
it("stops a multi-input action immediately when the private owner loses its outer scope",async()=>{
 const f=fixture();let active=true,done!:()=>void;const rpc=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>active);rpcs.push(rpc);
 const {leaseId}=JSON.parse(await rpc.request(request(1,"desktop.agent.attach",{ticket:f.api.grant(f.target,f.recipient).ticket}))).result;
 const observation=JSON.parse(await rpc.request(request(2,"desktop.agent.observe",{leaseId}))).result;
 vi.mocked(f.target.input).mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));
 const pending=rpc.request(request(3,"desktop.agent.act",{leaseId,observationId:observation.observationId,inputs:[key,key]})),rejected=expect(pending).rejects.toThrow();active=false;done();await rejected;expect(f.target.input).toHaveBeenCalledTimes(1);expect(f.target.releaseInputs).toHaveBeenCalledOnce();
});
it("enforces operation and owner deadlines before timer callbacks get a chance to run",async()=>{
 const f=fixture(),start=performance.now(),clock=vi.spyOn(performance,"now").mockReturnValue(start);let done!:()=>void;
 const rpc=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(rpc);
 const {leaseId}=JSON.parse(await rpc.request(request(1,"desktop.agent.attach",{ticket:f.api.grant(f.target,f.recipient).ticket}))).result;
 const observation=JSON.parse(await rpc.request(request(2,"desktop.agent.observe",{leaseId}))).result;
 vi.mocked(f.target.input).mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));
 const pending=rpc.request(request(3,"desktop.agent.act",{leaseId,observationId:observation.observationId,inputs:[key,key]})),rejected=expect(pending).rejects.toThrow();clock.mockReturnValue(start+60001);done();await rejected;expect(f.target.input).toHaveBeenCalledTimes(1);
 clock.mockReturnValue(start);const next=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(next);clock.mockReturnValue(start+120001);await expect(next.request(request(1,"desktop.agent.attach",{ticket:"x".repeat(43)}))).rejects.toThrow();
});
it("returns a structured observation wait without consuming the grant or retrying an action",async()=>{
 const f=fixture(),rpc=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(rpc);
 const {leaseId}=JSON.parse(await rpc.request(request(1,"desktop.agent.attach",{ticket:f.api.grant(f.target,f.recipient).ticket}))).result;
 expect(JSON.parse(await rpc.request(request(2,"desktop.agent.observe",{leaseId}))).result.imageBase64).toBe("AQID");
 expect(JSON.parse(await rpc.request(request(3,"desktop.agent.observe",{leaseId}))).error.code).toBe("server_busy");
 vi.spyOn(performance,"now").mockReturnValue(performance.now()+201);expect(JSON.parse(await rpc.request(request(4,"desktop.agent.observe",{leaseId}))).result.imageBase64).toBe("AQID");expect(f.target.input).not.toHaveBeenCalled();
});
it("requires the exact private viewer scope without consuming the rightful ticket",()=>{
 const f=fixture(),scope="s".repeat(43),grant=f.api.grant(f.target,{...f.recipient,scope});
 expect(()=>f.api.attachRecipient("absent",grant.ticket,fingerprint)).toThrow();expect(()=>f.api.attachRecipient("wrong",grant.ticket,fingerprint,()=>true,"w".repeat(43))).toThrow();
 expect(f.api.attachRecipient("right",grant.ticket,fingerprint,()=>true,scope).leaseId).toHaveLength(43);
});
it("rejects pending capture immediately on human revoke and still delivers an explicit release response",async()=>{
 const f=fixture(),closed=vi.fn(()=>{throw Error("generated close callback");}),rpc=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true,{onClose:closed});rpcs.push(rpc);let done!:()=>void;
 const {leaseId}=JSON.parse(await rpc.request(request(1,"desktop.agent.attach",{ticket:f.api.grant(f.target,f.recipient).ticket}))).result;
 f.target.capture=()=>new Promise<void>(resolve=>{done=resolve;});const pending=rpc.request(request(2,"desktop.agent.observe",{leaseId})),rejected=expect(pending).rejects.toThrow();let cancelled=false;void pending.catch(()=>{cancelled=true;});f.api.revoke(f.target);await Promise.resolve();const immediately=cancelled;done();await rejected;expect(immediately).toBe(true);expect(closed).toHaveBeenCalledOnce();await Promise.resolve();
 const next=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(next);const grant=f.api.grant(f.target,f.recipient),attached=JSON.parse(await next.request(request(1,"desktop.agent.attach",{ticket:grant.ticket}))).result;expect(JSON.parse(await next.request(request(2,"desktop.agent.release",{leaseId:attached.leaseId}))).result).toEqual({released:true});
});

it("private recipient RPC forwards regional observations without weakening the owner binding",async()=>{
 const f=fixture(),rpc=new DesktopEndpointAgentRpc(f.api,fingerprint,()=>true);rpcs.push(rpc);
 const {leaseId}=JSON.parse(await rpc.request(request(1,"desktop.agent.attach",{ticket:f.api.grant(f.target,f.recipient).ticket}))).result;
 const refresh=vi.spyOn(f.api,"refresh").mockResolvedValue(),region={x:0,y:0,width:1,height:1};
 expect(JSON.parse(await rpc.request(request(2,"desktop.agent.observe",{leaseId,region}))).result.imageBase64).toBe("AQID");
 expect(refresh).toHaveBeenCalledWith(expect.any(String),leaseId,undefined,region);
});
