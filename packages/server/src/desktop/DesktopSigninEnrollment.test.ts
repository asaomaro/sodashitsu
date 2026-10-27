import {inspect} from "node:util";
import {expect,it} from "vitest";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";

const ownerSid="S-1-5-21-1-2-3-1001",token="secret_"+"t".repeat(36),machineId="a".repeat(32);
const fingerprint="1".repeat(64),provider="2".repeat(64),session="11111111-1111-4111-8111-111111111111";
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const record=()=>({version:1,purpose:"desktop-signin",revision:session,ownerSid,origin:"https://root.invalid",machineId,token,provider,allowSignin:true,peers:[{fingerprint,label:"Local approval"}]});
const enrollment=()=>DesktopSigninEnrollment.decode(bytes(record()),ownerSid);
const start=()=>({url:"wss://root.invalid/desktop-e2e",ticket:"q".repeat(43),machineId,session,hello:{version:"soda-desktop-e2e-v1",generation:1,session,role:"viewer",identity:"04"+"a".repeat(128),ephemeral:"04"+"b".repeat(128),nonce:"c".repeat(64)}});
const request=(method:string,params:unknown={})=>bytes({id:"1",method,params});

it("restores only the fixed enrollment, defaults input off and returns detached snapshots",()=>{
 const input=bytes(record()),value=DesktopSigninEnrollment.decode(input,ownerSid);input.fill(0);
 expect(value.delegation()).toEqual({url:"wss://root.invalid/machine-delegation",machineId,token});
 const status=value.publicStatus();expect(status.allowInput).toBe(false);expect(status.provider).toBe(provider);
 status.allowInput=true;status.peers[0]!.fingerprint="f".repeat(64);status.peers.push({fingerprint:"0".repeat(64),label:"forged"});
 expect(value.publicStatus().allowInput).toBe(false);expect(value.publicStatus().peers).toEqual(record().peers);
 const next=value.delegation();next.token="forged";expect(value.delegation().token).toBe(token);
 expect(DesktopSigninEnrollment.decode(bytes({...record(),allowInput:true}),ownerSid).publicStatus().allowInput).toBe(true);
});
it("keeps credentials out of default serialization, inspection and sanitized failures",()=>{
 const value=enrollment();expect(JSON.stringify(value)).toBe('{"version":1,"purpose":"desktop-signin"}');expect({...value}).toEqual({});
 for(const text of [JSON.stringify(value),inspect(value),JSON.stringify(value.publicStatus())]){expect(text).not.toContain(token);expect(text).not.toContain(ownerSid);}
 for(const attempt of [()=>DesktopSigninEnrollment.decode(bytes({...record(),token:"invalid-private-value"}),ownerSid),()=>value.classify(request("exec",{command:token})),()=>DesktopSigninEnrollment.decode(bytes(record()),"wrong-owner")]) {
  let error:unknown;try{attempt();}catch(value){error=value;}
  expect(error).toBeInstanceOf(Error);expect((error as Error).message).toBe("Desktop signin enrollment is unavailable");
  expect(inspect(error)).not.toContain(token);expect(inspect(error)).not.toContain("invalid-private-value");expect((error as Error).cause).toBeUndefined();
 }
});
it("rejects unsupported enrollment fields, owners, peers and unsafe origins",()=>{
 const invalid=[{version:2},{purpose:"desktop"},{revision:"1"},{allowSignin:false},{token:"x".repeat(44)},{provider:"3".repeat(63)},
  {ownerSid:"S-1-5-18"},{ownerSid:"S-1-5-19"},{ownerSid:"S-1-5-20"},{ownerSid:"S-1-5-021-1"},{ownerSid:"S-1-5-4294967296"},{ownerSid:"S-1-281474976710656-1"},
  {peers:[]},{peers:[...record().peers,...record().peers]},{peers:Array.from({length:9},(_,i)=>({fingerprint:String(i).repeat(64),label:"peer"}))},
  {command:"powershell.exe"},{path:"C:\\private"},{extensions:[]},{permissions:{input:true}},
  ...["http://192.0.2.1","http://root.invalid","https://root.invalid/","https://root.invalid:443","https://u:p@root.invalid","https://root.invalid/path","https://root.invalid?token=secret","https://root.invalid#fragment"].map(origin=>({origin}))];
 for(const patch of invalid){const expectedOwner="ownerSid" in patch?patch.ownerSid:ownerSid;expect(()=>DesktopSigninEnrollment.decode(bytes({...record(),...patch}),expectedOwner)).toThrow("Desktop signin enrollment is unavailable");}
 expect(()=>DesktopSigninEnrollment.decode(bytes(record()),"S-1-5-21-1-2-3-1002")).toThrow();
});
it("classifies only the finite desktop metadata and encrypted endpoint requests",()=>{
 const value=enrollment();
 expect(value.classify(request("client.hello",{protocol:1,kind:"external"})).method).toBe("client.hello");
 for(const method of ["desktop.capabilities","desktop.endpoint.status"])expect(value.classify(request(method)).method).toBe(method);
 expect(value.classify(request("desktop.endpoint.start",start()))).toEqual({id:"1",method:"desktop.endpoint.start",params:start()});
 const child={...start(),session:"22222222-2222-4222-8222-222222222222",parent:session,attachment:"33333333-3333-4333-8333-333333333333",binding:"d".repeat(64)};child.hello={...child.hello,session:child.session};
 expect(value.classify(request("desktop.endpoint.start",child)).method).toBe("desktop.endpoint.start");
});
it("never classifies general RPC, initialization, trust or plaintext desktop input",()=>{
 const value=enrollment();
 for(const method of ["exec","workspace.exec","terminal.input","file.read","plugin.call","desktop.start","desktop.input","desktop.agent.act","desktop.endpoint.initialize","desktop.endpoint.trust","desktop.endpoint.required","desktop.endpoint.revoke","__proto__","constructor"])
  expect(()=>value.classify(request(method))).toThrow("Desktop signin enrollment is unavailable");
 expect(()=>value.classify(request("client.hello",{protocol:1,kind:"external",command:"exec"}))).toThrow();
 expect(()=>value.classify(request("desktop.capabilities",{allowSignin:true}))).toThrow();
 expect(()=>value.classify(bytes({id:"1",method:"desktop.endpoint.status",params:{},command:"exec"}))).toThrow();
});
it("binds starts to the configured machine, canonical relay and viewer role",()=>{
 const value=enrollment();
 for(const patch of [{machineId:"b".repeat(32)},{url:"wss://elsewhere.invalid/desktop-e2e"},{url:"wss://root.invalid/desktop-e2e?secret=x"},{url:"wss://root.invalid/desktop-e2e#x"},{url:"wss://root.invalid/desktop%2De2e"},{hello:{...start().hello,role:"agent"}},{hello:{...start().hello,role:"provider"}},{parent:session}])
  expect(()=>value.classify(request("desktop.endpoint.start",{...start(),...patch}))).toThrow();
 for(const origin of ["http://localhost:1234","http://127.0.0.1:1234","http://[::1]:1234"]){
  const local=DesktopSigninEnrollment.decode(bytes({...record(),origin}),ownerSid);
  expect(local.classify(request("desktop.endpoint.start",{...start(),url:origin.replace(/^http/,"ws")+"/desktop-e2e"})).method).toBe("desktop.endpoint.start");
 }
});
it("bounds and validates raw UTF-8 before accepting records or requests",()=>{
 const value=enrollment();
 for(const input of [new Uint8Array(16*1024+1),new Uint8Array([0xff]),new TextEncoder().encode('{"private":"unterminated'),bytes(null)]) {
  expect(()=>DesktopSigninEnrollment.decode(input,ownerSid)).toThrow("Desktop signin enrollment is unavailable");
  expect(()=>value.classify(input)).toThrow("Desktop signin enrollment is unavailable");
 }
 const paddedRecord=new TextEncoder().encode(JSON.stringify(record())+" ".repeat(16*1024));
 const paddedRequest=new TextEncoder().encode(JSON.stringify({id:"1",method:"desktop.endpoint.status",params:{}})+" ".repeat(16*1024));
 expect(()=>DesktopSigninEnrollment.decode(paddedRecord,ownerSid)).toThrow();
 expect(()=>value.classify(paddedRequest)).toThrow();
 expect(()=>value.classify(bytes({id:"x".repeat(129),method:"desktop.endpoint.status",params:{}}))).toThrow();
 expect(()=>value.classify(bytes({id:"control\n",method:"desktop.endpoint.status",params:{}}))).toThrow();
});
