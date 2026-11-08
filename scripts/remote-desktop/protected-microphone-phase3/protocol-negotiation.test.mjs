// Generated-only check: evaluate the fixture's offered array/start options against
// the checked-in Relay predicates. No WS, device, native process or media opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const relay=read('packages/server/src/desktop/DesktopRelay.ts');
const assignment=name=>{const match=relay.match(new RegExp(`v\\.${name}=([^;]+);`));assert(match,`real Relay ${name} assignment`);return match[0];};
const microphone=read('packages/protocol/src/desktopMicrophone.ts').match(/DESKTOP_MICROPHONE_PROTOCOL = "([^"]+)"/)[1];
const protectedDesktop=read('packages/protocol/src/desktopProtected.ts').match(/DESKTOP_PROTECTED_PROTOCOL = "([^"]+)"/)[1];
// Feature encoding itself has protocol package tests. Here an opaque marker
// witnesses that the actual fixture calls the encoder with protectedMicrophone.
const p={DESKTOP_MICROPHONE_PROTOCOL:microphone,DESKTOP_PROTECTED_PROTOCOL:protectedDesktop,desktopFeaturesProtocol:features=>'features:'+features.join(',')};
for(const [file,alias] of [['protected-microphone-phase3/run-a.mjs','protocol'],['protected-microphone-phase3-bc/session.mjs','p']]){
 test(`${file}: viewer offers elevated+protected PCM prerequisites while lane stays microphone-only`,()=>{
  const source=read('scripts/remote-desktop/'+file);
  const array=source.match(/viewer=await connect\((?:'\/desktop-share',)?(\[[^\n]+?\])\);/);
  assert(array,'actual viewer connection array');
  const offered=runInNewContext(array[1],{[alias]:p},{timeout:100});
  const options=runInNewContext('('+source.match(/viewer.send\(JSON.stringify\(\{type:'start',machineId:'local',options:(\{[^}]+\})\}\)\)/)[1]+')',{}, {timeout:100});
  function accepted(change={}){
   const v={microphoneRequested:offered.includes(microphone),elevatedRequested:offered.includes(protectedDesktop),protectedMicrophoneRequested:offered.includes('features:protectedMicrophone'),...change};
   const caps={elevatedDesktop:true,features:true,microphone:true,protectedMicrophone:true};
   runInNewContext(assignment('elevatedDesktop')+assignment('protectedMicrophone'),{v,caps,options},{timeout:100});
   return v.elevatedDesktop===true&&v.protectedMicrophone===true;
  }
  assert(accepted(),'real Relay predicates accept explicit fixture opt-ins');
  assert.equal(offered.length,3,'only microphone, protected desktop and protectedMicrophone feature');
  assert.equal(new Set(offered).size,3);
  assert(offered.includes(protectedDesktop),'explicit protected desktop offer is required');
  assert(offered.includes(microphone));assert(offered.includes('features:protectedMicrophone'));
  assert.equal(options.features,true);assert.equal(options.microphone,true);
  for(const flag of ['elevatedRequested','microphoneRequested','protectedMicrophoneRequested'])assert.equal(accepted({[flag]:false}),false,flag+' remains required');
  const lane=alias==='p'?/(?:mic=await |connect:\(\)=>)connect\(\[p.DESKTOP_MICROPHONE_PROTOCOL\]\)/:/(?:mic=await |connect:\(\)=>)connect\('\/desktop-share',\[protocol.DESKTOP_MICROPHONE_PROTOCOL\]\)/;
  assert.match(source,lane,'resource lane remains its dedicated single protocol');
 });
}
