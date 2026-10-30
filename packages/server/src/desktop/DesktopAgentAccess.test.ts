import { afterEach, expect, it, vi } from "vitest";
import { performance } from "node:perf_hooks";
import { DesktopAgentAccess, type AgentTarget, type AgentFrame } from "./DesktopAgentAccess.js";
const key = { kind: "key" as const, code: "KeyA", down: true };
function fixture() {
  let frame: AgentFrame = {
    info: { seq: 1, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
    image: new Uint8Array([1, 2, 3]),
    at: performance.now(),
  };
  const target: AgentTarget = {
    frame: () => frame,
    control: vi.fn(),
    state: vi.fn(),
    input: vi.fn(async () => {}),
    releaseInputs: vi.fn(),
  };
  const api = new DesktopAgentAccess();
  return {
    api,
    target,
    setFrame: (f: Partial<AgentFrame>) => {
      frame = { ...frame, ...f };
    },
  };
}
afterEach(() => vi.restoreAllMocks());
it("requires a one-use viewer grant, binds a lease to one client and releases held inputs", async () => {
  const { api, target } = fixture();
  expect(() => api.attach("agent", "x".repeat(43))).toThrow();
  const grant = api.grant(target),
    lease = api.attach("agent", grant.ticket);
  expect(() => api.attach("agent", grant.ticket)).toThrow();
  expect(() => api.observe("other", lease.leaseId)).toThrow();
  const observed = api.observe("agent", lease.leaseId);
  expect(observed.imageBase64).toBe("AQID");
  expect(await api.act("agent", lease.leaseId, observed.observationId, [key])).toEqual({
    acknowledged: 1,
    afterFrameSeq: 1,
  });
  expect(target.releaseInputs).toHaveBeenCalledOnce();
  await expect(api.act("agent", lease.leaseId, observed.observationId, [key])).rejects.toThrow();
  api.clientGone("agent");
  expect(target.control).toHaveBeenLastCalledWith(false);
  expect(() => api.observe("agent", lease.leaseId)).toThrow();
});
it("accepts newer identical images but rejects changed, missing, or stale frames", async () => {
  const { api, target, setFrame } = fixture();
  const lease = api.attach("agent", api.grant(target).ticket);
  let observation = api.observe("agent", lease.leaseId);
  setFrame({
    info: { seq: 2, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
  });
  await api.act("agent", lease.leaseId, observation.observationId, [key]);
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 201);
  observation = api.observe("agent", lease.leaseId);
  setFrame({ image: new Uint8Array([9]) });
  await expect(api.act("agent", lease.leaseId, observation.observationId, [key])).rejects.toThrow(
    /changed/,
  );
  setFrame({ at: performance.now() - 3000 });
  expect(() => api.observe("agent", lease.leaseId)).toThrow(/Fresh/);
});
it("expires unclaimed tickets and active leases and revokes after an uncertain input failure", async () => {
  const { api, target } = fixture();
  const now = performance.now();
  const clock = vi.spyOn(performance, "now").mockReturnValue(now);
  const grant = api.grant(target);
  clock.mockReturnValue(now + 30001);
  api.tick();
  expect(() => api.attach("a", grant.ticket)).toThrow();
  const lease = api.attach("a", api.grant(target).ticket);
  clock.mockReturnValue(now + 150002);
  api.tick();
  expect(() => api.observe("a", lease.leaseId)).toThrow();
  clock.mockReturnValue(now);
  const second = api.attach("a", api.grant(target).ticket),
    observation = api.observe("a", second.leaseId);
  vi.mocked(target.input).mockRejectedValue(new Error("lost ACK"));
  await expect(api.act("a", second.leaseId, observation.observationId, [key])).rejects.toThrow(
    "lost ACK",
  );
  expect(() => api.observe("a", second.leaseId)).toThrow();
});
it("serializes actions and interrupts an in-flight sequence on human takeover", async () => {
  const { api, target } = fixture();
  let done = () => {};
  vi.mocked(target.input).mockImplementation(
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
  );
  const lease = api.attach("a", api.grant(target).ticket),
    observation = api.observe("a", lease.leaseId);
  const pending = api.act("a", lease.leaseId, observation.observationId, [key, key]);
  await expect(api.act("a", lease.leaseId, observation.observationId, [key])).rejects.toThrow(
    /progress/,
  );
  api.revoke(target);
  done();
  await expect(pending).rejects.toThrow();
  expect(target.input).toHaveBeenCalledTimes(1);
});
it("an interrupted old action cannot revoke a newly issued grant", async () => {
  const { api, target } = fixture();
  let done = () => {};
  vi.mocked(target.input).mockImplementation(
    () =>
      new Promise<void>((r) => {
        done = r;
      }),
  );
  const lease = api.attach("a", api.grant(target).ticket),
    observation = api.observe("a", lease.leaseId);
  const old = api.act("a", lease.leaseId, observation.observationId, [key]);
  const next = api.grant(target);
  done();
  await expect(old).rejects.toThrow();
  expect(api.attach("b", next.ticket).leaseId).toHaveLength(43);
});
it("requires a post-action frame and bounds screenshot polling", () => {
  const { api, target, setFrame } = fixture(),
    lease = api.attach("a", api.grant(target).ticket);
  expect(() => api.observe("a", lease.leaseId, 1)).toThrow(/Wait/);
  api.observe("a", lease.leaseId);
  expect(() => api.observe("a", lease.leaseId)).toThrow(/five/);
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 201);
  setFrame({
    info: { seq: 2, width: 1, height: 1, format: "image/png", captureMs: 0, encodeMs: 0 },
  });
  expect(api.observe("a", lease.leaseId, 1).frameSeq).toBe(2);
});

it("serializes snapshot preparation and rechecks revocation after a pending keyframe", async () => {
  const { api, target } = fixture();
  let done = () => {};
  target.capture = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        done = resolve;
      }),
  );
  const lease = api.attach("a", api.grant(target).ticket);
  const observed = api.observe("a", lease.leaseId);
  vi.spyOn(performance, "now").mockReturnValue(performance.now() + 201);
  const pending = api.refresh("a", lease.leaseId, 1);
  await expect(api.refresh("a", lease.leaseId)).rejects.toThrow(/progress/);
  expect(() => api.observe("a", lease.leaseId)).toThrow(/progress/);
  await expect(api.act("a", lease.leaseId, observed.observationId, [key])).rejects.toThrow(
    /progress/,
  );
  const next = api.grant(target);
  done();
  await expect(pending).rejects.toThrow(/expired/);
  expect(api.attach("b", next.ticket).leaseId).toHaveLength(43);
  expect(target.input).not.toHaveBeenCalled();
});

function regionalFixture() {
  const f=fixture();
  const rect={x:2,y:2,width:4,height:4};
  let spec: import("@sodashitsu/protocol").DesktopRegionSpec|undefined;
  let current: AgentFrame["info"]={seq:1,width:10,height:10,format:"image/png",captureMs:0,encodeMs:0};
  const region={
    capture:vi.fn(async(s:import("@sodashitsu/protocol").DesktopRegionSpec)=>{spec=s;current={...current,seq:current.seq+1,regions:[{...s,digest:"a".repeat(64)}]};f.setFrame({info:current});}),
    frame:()=>({info:current,at:performance.now()}),clear:vi.fn(),
  };
  f.target.region=region;
  const lease=f.api.attach("a",f.api.grant(f.target).ticket).leaseId;
  return {...f,rect,region,lease,setCurrent:(value:Partial<AgentFrame["info"]>)=>{current={...current,...value};},proof:()=>({...spec!,digest:"a".repeat(64)})};
}
it("regional verification permits background changes but restricts input to the observed rectangle",async()=>{
 const f=regionalFixture();await f.api.refresh("a",f.lease,undefined,f.rect);
 const observed=f.api.observe("a",f.lease);
 expect(observed.verification).toEqual({kind:"region",region:f.rect,pointerOnly:true});
 f.setFrame({image:new Uint8Array([99])});f.setCurrent({seq:8,contentId:"b".repeat(64)});
 expect(await f.api.act("a",f.lease,observed.observationId,[{kind:"pointer",x:3/9,y:3/9,event:"down",button:0}])).toEqual({acknowledged:1,afterFrameSeq:8});
 expect(f.target.input).toHaveBeenCalledOnce();
});
it.each(["changed","nonce","geometry","missing","outside","key","wheel"])("rejects %s under regional verification without sending input",async failure=>{
 const f=regionalFixture();await f.api.refresh("a",f.lease,undefined,f.rect);const observed=f.api.observe("a",f.lease);
 if(failure==="changed")f.setCurrent({regions:[{...f.proof(),digest:"b".repeat(64)}]});
 if(failure==="nonce")f.setCurrent({regions:[{...f.proof(),id:crypto.randomUUID()}]});
 if(failure==="geometry")f.setCurrent({width:11});
 if(failure==="missing")f.setCurrent({regions:[]});
 const inputs:Parameters<typeof f.api.act>[3]=failure==="key"?[key]:failure==="wheel"?[{kind:"wheel",delta:1}]:[{kind:"pointer",x:failure==="outside"?1:3/9,y:3/9,event:"down",button:0}];
 await expect(f.api.act("a",f.lease,observed.observationId,inputs)).rejects.toThrow(/changed|inside/);expect(f.target.input).not.toHaveBeenCalled();
});
it("clears regional authority when reverting to whole-image observations or revoking",async()=>{
 const f=regionalFixture();await f.api.refresh("a",f.lease,undefined,f.rect);const first=f.proof().id;
 await f.api.refresh("a",f.lease);expect(f.region.clear).toHaveBeenCalledWith(first);
 expect(f.api.observe("a",f.lease)).not.toHaveProperty("verification");
 vi.spyOn(performance,"now").mockReturnValue(performance.now()+201);
 await f.api.refresh("a",f.lease,undefined,f.rect);const second=f.proof().id;expect(second).not.toBe(first);
 f.api.revoke(f.target);expect(f.region.clear).toHaveBeenLastCalledWith(second);
});
it("does not silently fall back when regional capture is unsupported",async()=>{
 const f=fixture(),lease=f.api.attach("a",f.api.grant(f.target).ticket).leaseId;
 await expect(f.api.refresh("a",lease,undefined,{x:0,y:0,width:1,height:1})).rejects.toThrow(/unavailable/);
});

it("rejects stale regional proofs and cannot return an old pending observation after a new grant",async()=>{
 const f=regionalFixture();await f.api.refresh("a",f.lease,undefined,f.rect);const observed=f.api.observe("a",f.lease);
 f.target.region!.frame=()=>({info:{seq:2,width:10,height:10,format:"image/png",captureMs:0,encodeMs:0,regions:[f.proof()]},at:performance.now()-2000});
 await expect(f.api.act("a",f.lease,observed.observationId,[{kind:"pointer",x:3/9,y:3/9,event:"move",button:0}])).rejects.toThrow(/changed/);
 vi.spyOn(performance,"now").mockReturnValue(performance.now()+201);
 let done!:()=>void;f.region.capture.mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));
 const pending=f.api.refresh("a",f.lease,undefined,f.rect);const rejection=expect(pending).rejects.toThrow(/expired/);
 const next=f.api.grant(f.target);done();await rejection;
 expect(f.api.attach("b",next.ticket).leaseId).toHaveLength(43);expect(f.target.input).not.toHaveBeenCalled();
});
