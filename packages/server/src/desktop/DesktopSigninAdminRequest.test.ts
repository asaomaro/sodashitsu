import {inspect} from "node:util";
import {expect,it} from "vitest";
import {DesktopSigninAdminRequest,desktopSigninAdminBranch} from "./DesktopSigninAdminRequest.js";
const ownerSid="S-1-5-21-1-2-3-1001",nonce="11111111-1111-4111-8111-111111111111",peer={fingerprint:"a".repeat(64),label:"Generated viewer"};
const data={version:1,purpose:"desktop-signin-admin",nonce,ownerSid,issuedAt:10000,expiresAt:11000,operation:{kind:"enroll",origin:"https://root.example",machineId:"b".repeat(32),token:"t".repeat(43),allowInput:false,peers:[peer]}};
const bytes=(value:unknown)=>Buffer.from(JSON.stringify(value));
function fixture(value:unknown=data){let wall=10000,at=0;const request=DesktopSigninAdminRequest.decode(bytes(value),{ownerSid,nonce},{wall:()=>wall,monotonic:()=>at});return {request,wall:(v:number)=>{wall=v;},at:(v:number)=>{at=v;}};}
it("accepts one finite operation and redacts credentials in JSON/inspect",()=>{const {request}=fixture();expect(JSON.stringify(request)).toBe('{"version":1,"purpose":"desktop-signin-admin"}');expect(inspect(request)).not.toContain(data.operation.token);expect(request.binding()).toEqual({ownerSid,nonce,expiresAt:11000});const operation=request.take(()=>true);expect(operation).toEqual(data.operation);if(operation.kind==='enroll')operation.peers[0]!.label='changed';expect(()=>request.take(()=>true)).toThrow('Signin administration is unavailable');expect(request.current(()=>true)).toBe(true);});
it.each(['status','initialize','disable'])("accepts fixed operation %s",kind=>{expect(fixture({...data,operation:{kind}}).request.take(()=>true)).toEqual({kind});});
it.each([{kind:'trust',peer},{kind:'revoke',fingerprint:peer.fingerprint}])("accepts viewer-only operation $kind",operation=>{expect(fixture({...data,operation}).request.take(()=>true)).toEqual(operation);});
it.each([
 {...data,ownerSid:'S-1-5-18'},{...data,ownerSid:'S-1-5-21-01-2-3-1001'},{...data,ownerSid:'S-1-5-21-1-2-3-1002'},
 {...data,nonce:'22222222-2222-4222-8222-222222222222'},{...data,expiresAt:310001},{...data,issuedAt:10001},{...data,expiresAt:10000},
 {...data,extra:true},{...data,operation:{kind:'exec',command:'whoami'}},{...data,operation:{kind:'trust',peer:{...peer,role:'agent'}}},
 {...data,operation:{...data.operation,origin:'http://public.example'}},{...data,operation:{...data.operation,origin:'https://root.example/path'}},
 {...data,operation:{...data.operation,peers:[peer,peer]}},{...data,operation:{...data.operation,peers:[]}},{...data,operation:{...data.operation,token:'invalid'}},
 {...data,operation:{kind:'initialize',reset:true}},{...data,operation:{kind:'disable',path:'C:\\other'}},
])("rejects untrusted fields/identity/time without echoing token %#",value=>{expect(()=>fixture(value)).toThrow('Signin administration is unavailable');});
it.each([Buffer.from([0xc2]),Buffer.alloc(16385,32)])("rejects oversized or incomplete UTF8",value=>{expect(()=>DesktopSigninAdminRequest.decode(value,{ownerSid,nonce},{wall:()=>10000,monotonic:()=>0})).toThrow();});
it.each(['expiry','monotonic-expiry','backward','wall-backward','owner','exception','reentry','close'])("permanently revokes the lease on %s",mode=>{const f=fixture();f.at(100);f.wall(10100);expect(f.request.current(()=>true)).toBe(true);let owned=()=>true;
 if(mode==='expiry')f.wall(11000);else if(mode==='monotonic-expiry')f.at(1000);else if(mode==='backward')f.at(99);else if(mode==='wall-backward')f.wall(10099);else if(mode==='owner')owned=()=>false;else if(mode==='exception')owned=()=>{throw Error('generated');};else if(mode==='reentry')owned=()=>f.request.current(()=>true);else f.request.close();
 expect(f.request.current(owned)).toBe(false);f.at(101);f.wall(10101);expect(f.request.current(()=>true)).toBe(false);expect(()=>f.request.take(()=>true)).toThrow();});
it.each(['expiry','close'])("rechecks callback cancellation/time before authorizing %s",mode=>{const f=fixture();expect(f.request.current(()=>{if(mode==='expiry')f.at(1000);else f.request.close();return true;})).toBe(false);expect(f.request.current(()=>true)).toBe(false);});
for(let mask=0;mask<16;mask++)it(`journal state ${mask} never falls through after residue`,()=>{const files={pending:!!(mask&1),claimed:!!(mask&2),result:!!(mask&4),ack:!!(mask&8)};expect(desktopSigninAdminBranch(files)).toBe(mask===0?'normal':mask===1?'claim':'recovery');});
it.each([null,{},[],{pending:0,claimed:false,result:false,ack:false},{pending:false,claimed:false,result:false,ack:false,extra:true}])("malformed journal facts require recovery %#",facts=>{expect(desktopSigninAdminBranch(facts)).toBe('recovery');});
