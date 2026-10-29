import { expect, it, vi } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import { registerDesktopMethods } from "./desktop.js";
import type { MethodDeps } from "./deps.js";
import { DesktopAgentAccess, type AgentTarget } from "../../desktop/DesktopAgentAccess.js";
import { performance } from "node:perf_hooks";
it("revokes a congested agent before encoding another screenshot", async () => {
  const api = new DesktopAgentAccess(),
    frame = vi.fn(() => ({
      info: {
        seq: 1,
        width: 1,
        height: 1,
        format: "image/png" as const,
        captureMs: 0,
        encodeMs: 0,
      },
      image: new Uint8Array([1]),
      at: performance.now(),
    }));
  const target: AgentTarget = {
    frame,
    control: vi.fn(),
    state: vi.fn(),
    input: vi.fn(async () => {}),
    releaseInputs: vi.fn(),
  };
  const lease = api.attach("a", api.grant(target).ticket);
  const surface = new ControlSurface();
  registerDesktopMethods(surface, { desktopRelay: { agents: api } } as unknown as MethodDeps);
  const ctx = {
    clientId: "a",
    sink: { clientId: "a", bufferedAmount: 300000, sendOutput() {}, sendSnapshot() {} },
  };
  const result = await surface.invoke(ctx, "desktop.agent.observe", { leaseId: lease.leaseId });
  expect(result).toMatchObject({ ok: false, error: { code: "server_busy" } });
  expect(frame).not.toHaveBeenCalled();
  expect(() => api.observe("a", lease.leaseId)).toThrow(/lease/);
  expect(target.control).toHaveBeenLastCalledWith(false);
});

it("allows permission changes only through the local-settings connection, never bridges or sameMachine alone", async () => {
  const surface = new ControlSurface(), set = vi.fn(async p => ({ permissions: p, supported: true, canConfigure: true }));
  registerDesktopMethods(surface, { desktopSettings: { set, get: vi.fn() } } as unknown as MethodDeps);
  const base = { clientId: "local", sink: { clientId: "local", bufferedAmount: 0, sendOutput() {}, sendSnapshot() {} } };
  const p = { enabled: true, allowInput: true, allowClipboard: false, allowDisplayResize: false };
  for (const ctx of [base, { ...base, sameMachine: true }, { ...base, connection: { localSettings: false } }]) {
    const result = await surface.invoke(ctx as Parameters<typeof surface.invoke>[0], "desktop.settings.set", p);
    expect(result).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  }
  expect(set).not.toHaveBeenCalled();
  const result = await surface.invoke({ ...base, connection: { localSettings: true } } as unknown as Parameters<typeof surface.invoke>[0], "desktop.settings.set", p);
  expect(result.ok).toBe(true); expect(set).toHaveBeenCalledWith(p);
});

it("restricts all endpoint identity and trust management to the local settings connection",async()=>{
 const surface=new ControlSurface(),desktopEndpoint={status:vi.fn(async()=>({})),initialize:vi.fn(async()=>({})),setRequired:vi.fn(async()=>({})),trust:vi.fn(async()=>({})),revoke:vi.fn(async()=>({}))};registerDesktopMethods(surface,{desktopEndpoint}as unknown as MethodDeps);
 const base={clientId:"generated",sink:{clientId:"generated",bufferedAmount:0,sendOutput(){},sendSnapshot(){}}},peer={fingerprint:"ab".repeat(32),role:"viewer",label:"generated"};
 for(const[method,params]of[["desktop.endpoint.status",{}],["desktop.endpoint.initialize",{}],["desktop.endpoint.required",{required:true}],["desktop.endpoint.trust",peer],["desktop.endpoint.revoke",{fingerprint:peer.fingerprint,role:peer.role}]]as const){for(const context of[base,{...base,sameMachine:true},{...base,connection:{localSettings:false}}])expect(await surface.invoke(context as Parameters<typeof surface.invoke>[0],method,params)).toMatchObject({ok:false,error:{code:"unauthorized"}});expect((await surface.invoke({...base,connection:{localSettings:true}}as unknown as Parameters<typeof surface.invoke>[0],method,params)).ok).toBe(true);}
 for(const call of Object.values(desktopEndpoint))expect(call).toHaveBeenCalledTimes(1);
});

it("starts native helpers only for an admitted direct browser origin and scopes stop to its client",async()=>{
 const start=vi.fn(async()=>({})),stop=vi.fn(async()=>{}),surface=new ControlSurface();registerDesktopMethods(surface,{desktopNativeHelpers:{start,stop}} as unknown as MethodDeps);
 const base={clientId:"browser-owner",sink:{clientId:"browser-owner",bufferedAmount:0,sendOutput(){},sendSnapshot(){}}},viewerId=crypto.randomUUID();
 for(const ctx of [base,{...base,sameMachine:true},{...base,connection:{localSettings:true}},{...base,connection:{browserOrigin:"https://app.example"},connectionAuthorized:()=>false}])expect(await surface.invoke(ctx as unknown as Parameters<typeof surface.invoke>[0],"desktop.native_helper.start",{viewerId})).toMatchObject({ok:false,error:{code:"unauthorized"}});
 expect(start).not.toHaveBeenCalled();const ctx={...base,connection:{browserOrigin:"https://app.example"},connectionAuthorized:()=>true};expect((await surface.invoke(ctx as unknown as Parameters<typeof surface.invoke>[0],"desktop.native_helper.start",{viewerId})).ok).toBe(true);expect(start).toHaveBeenCalledWith("browser-owner",viewerId,"https://app.example",expect.any(Function));
 expect(await surface.invoke(ctx as unknown as Parameters<typeof surface.invoke>[0],"desktop.native_helper.start",{viewerId,origin:"https://forged.example"})).toMatchObject({ok:false,error:{code:"invalid_params"}});expect(start).toHaveBeenCalledTimes(1);
 expect((await surface.invoke(base,"desktop.native_helper.stop",{viewerId})).ok).toBe(true);expect(stop).toHaveBeenCalledWith("browser-owner",viewerId);
});
