// Source-bound broker policy checks. Native/COM/C# execution is a separate gate.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),unlock=readFileSync(new URL('WindowsDesktopUnlock.cs',root),'utf8'),scope=unlock,checks=readFileSync(new URL('WindowsProtectedScopeChecks.cs',root),'utf8');
function nativeReturn(name){const start=unlock.indexOf('static bool '+name+'(');assert(start>=0,'native method present');const text=unlock.slice(start,unlock.indexOf('\n    }',start));assert.match(text,/if\(!Live\(\)\)return false;/);return 'Live()&&('+text.match(/try\{return ([^;]+);/)?.[1]+')';}
function evaluate(name,{exited=false,locked=false,changed=false,clientChanged=false,pipeChanged=false,lease=true}={}){
 const worker={HasExited:exited,Handle:123},pipe={},client={HasExited:false,StartTime:{ToUniversalTime(){return{Ticks:456};}}};
 const expression=nativeReturn(name).replaceAll('IntPtr.Zero','0').replaceAll('Guid.Empty','0').replaceAll('Object.ReferenceEquals','same').replaceAll('(uint)Session','Session');
 return runInNewContext(expression,{generation:7,Generation:changed?8:7,nonce:11,WorkerNonce:11,Job:1,Worker:worker,worker,handle:123,WorkerPipe:pipe,pipe:pipeChanged?{}:pipe,client,clientStarted:clientChanged?457:456,Session:1,LockStateOf:()=>locked?0:1,same:(a,b)=>a===b,Live:()=>lease});
}
test('buffered terminal provenance survives worker exit and lock transition without weakening content scope',()=>{
 assert.equal(evaluate('CurrentProtectedWorker',{exited:true}),false);assert.equal(evaluate('CurrentProtectedWorker',{locked:true}),false);
 assert.equal(evaluate('ProtectedRetirementCurrent',{exited:true}),true);assert.equal(evaluate('ProtectedRetirementCurrent',{locked:true}),true);
 for(const facts of [{changed:true},{clientChanged:true},{pipeChanged:true},{lease:false}])assert.equal(evaluate('ProtectedRetirementCurrent',facts),false);
});
test('broker drains only known exact terminal records with notice before first ACK and captured generation deadline',()=>{
 assert.match(unlock,/drain\.Input\(input\)\)workerWriter\.WriteLine\(input\)/);
 assert.match(unlock,/drain\.Output\(output,CurrentProtectedWorker\(generation,nonce\)&&!client.HasExited,ProtectedRetirementCurrent\(/);
 const loop=unlock.slice(unlock.indexOf('bool outputSeen=false;string output;'));
 assert(loop.indexOf('if(notice)')<loop.indexOf('if(!forward)continue;'));assert(loop.indexOf('if(!forward)continue;')<loop.indexOf('writer.WriteLine(output);'));
 assert.match(unlock,/boundPipe\.Dispose\(\).*EndWorker\(generation\)/);
 assert.match(scope,/if\(!retiring&&\(!current\|\|terminal\)\)/);assert.match(scope,/now-started>=750\|\|records>32\|\|bytes>4\*1024\*1024/);
 assert.match(scope,/epochs\.ContainsValue\(id\)&&!delivered\.Contains\(id\)/);assert.match(scope,/if\(retiring\|\|ended\)return false/);
 assert(!unlock.includes('if(protectedWorker)Require(CurrentProtectedWorker(generation,nonce)&&!client.HasExited);'));
});
test('existing generated C# pure entry covers terminal replay, schema, source, budgets and clock without native execution',()=>{
 assert.match(checks,/CheckEpochFence\(\);CheckRetirementOutput\(\);/);
 for(const witness of ['Buffered terminal ACK after worker exit lost','First terminal must notify before ACK even while worker live','Old generation provenance accepted','Unknown epoch started drain','Replaced epoch forwarded','Malformed terminal accepted','Retirement deadline exceeded','Retirement record bound exceeded','Retirement byte bound exceeded','Clock rollback accepted'])assert(checks.includes(witness));
});
