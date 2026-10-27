import {expect,it} from "vitest";
import {DesktopEndpointAgentRequest,formatDesktopAgentGrant,parseDesktopAgentGrant,isDesktopAgentEncryptedGrant} from "./desktopAgentEndpoint.js";
import {desktopFeaturesProtocol,desktopFeaturesFromProtocols} from "./desktopFeatures.js";
const grant={version:1 as const,machineId:"a".repeat(32),origin:"https://root.example",provider:"a".repeat(64),recipient:"b".repeat(64),scope:"s".repeat(43),ticket:"t".repeat(43),expiresAt:Date.now()+30000};
it("round trips only a canonical strict encrypted grant and reserves unknown versions",()=>{
 const code=formatDesktopAgentGrant(grant);expect(parseDesktopAgentGrant(code)).toEqual(grant);expect(isDesktopAgentEncryptedGrant("soda-e2e-agent-v99.invalid")).toBe(true);expect(()=>parseDesktopAgentGrant("soda-e2e-agent-v99.invalid")).toThrow();
 for(const bad of [code+"=",code+"\n",code+"!","soda-e2e-agent-v1.","x".repeat(9000)])expect(()=>parseDesktopAgentGrant(bad)).toThrow();
 for(const origin of ["http://elsewhere.example","https://root.example/","https://user:secret@root.example","https://root.example?token=secret","file:///tmp/a"])expect(()=>formatDesktopAgentGrant({...grant,origin})).toThrow();
 expect(()=>formatDesktopAgentGrant({...grant,secret:"private"} as typeof grant)).toThrow();
 expect(()=>formatDesktopAgentGrant({...grant,ticket:"wrong"})).toThrow();
});
it("negotiates the new hint without exceeding the fixed128-bit budget and requires an explicit recipient",()=>{
 const hint=desktopFeaturesProtocol(["endpointClose","endpointAgent"]);expect(hint.endsWith("00000000000000000000000000000018")).toBe(true);expect([...desktopFeaturesFromProtocols([hint])]).toEqual(["endpointClose","endpointAgent"]);
 expect(()=>DesktopEndpointAgentRequest.parse({type:"agent_endpoint_grant",enabled:true})).toThrow();expect(()=>DesktopEndpointAgentRequest.parse({type:"agent_endpoint_grant",enabled:false,recipient:grant.recipient})).toThrow();expect(DesktopEndpointAgentRequest.parse({type:"agent_endpoint_grant",enabled:true,recipient:grant.recipient})).toMatchObject({enabled:true});
});

it("accepts finite fractional lease expiry from the monotonic-to-wall-clock conversion",async()=>{
 const {DesktopAgentEndpointResults}=await import("./desktopAgentEndpoint.js");expect(()=>DesktopAgentEndpointResults["desktop.agent.attach"].parse({leaseId:"l".repeat(43),expiresAt:Date.now()+0.5})).not.toThrow();
 for(const expiresAt of [NaN,Infinity,-1])expect(()=>DesktopAgentEndpointResults["desktop.agent.attach"].parse({leaseId:"l".repeat(43),expiresAt})).toThrow();
});

it("rejects agent child routing before endpoint work starts",async()=>{
 const {DesktopEndpointStart}=await import("./desktopEndpoint.js"),session=crypto.randomUUID(),request={url:"wss://root.example/desktop-e2e",ticket:"t".repeat(43),machineId:grant.machineId,session,hello:{version:"soda-desktop-e2e-v1",generation:1,session,role:"agent",identity:"04"+"a".repeat(128),ephemeral:"04"+"b".repeat(128),nonce:"c".repeat(64)}};
 expect(()=>DesktopEndpointStart.parse(request)).not.toThrow();expect(()=>DesktopEndpointStart.parse({...request,parent:crypto.randomUUID(),attachment:crypto.randomUUID(),binding:"d".repeat(64)})).toThrow();
});
