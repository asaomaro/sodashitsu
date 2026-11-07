import {withSession} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/withSession.js';
import {FsSessionStore} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/session.js';
import {DesktopAgentSession} from '/workspaces/sodashitsu-main-live-assistant-agents/packages/cli/dist/desktopSession.js';
const started=Date.now(),durationMs=720000;let session,timer,released=false,checks=0,lastFrame=0;
try{
 timer=setTimeout(()=>session?.close(),800000);
 await withSession({url:'http://127.0.0.1:7780',machine:'83858eaa9958385975aef2760a164a00'},new FsSessionStore(),async client=>{
  await client.hello();session=await DesktopAgentSession.headless(client,false);if(session.expiresAt!==0)throw Error('Unexpected lease expiry');
  const attached=Date.now();for(let elapsed=0;elapsed<=durationMs;elapsed+=45000){await new Promise(r=>setTimeout(r,Math.max(0,attached+elapsed-Date.now())));const image=await session.observe();if(!image.imageBase64||image.width<1||image.height<1||image.frameSeq<lastFrame||image.latestFrameMaxAgeMs>2000)throw Error('Image proof unavailable');lastFrame=image.frameSeq;image.imageBase64='';checks++;console.log(JSON.stringify({elapsedSeconds:Math.floor((Date.now()-attached)/1000),checks,frameSeq:lastFrame,connected:true}));}
  await session.release();released=true;
 });
 console.log(JSON.stringify({passed:true,durationSeconds:Math.floor((Date.now()-started)/1000),checks,released,rawImagesStored:false,osInputSent:false}));
}catch(error){console.log(JSON.stringify({passed:false,durationSeconds:Math.floor((Date.now()-started)/1000),checks,released,errorType:error?.name??'Error',message:error?.message,code:error?.code,rawImagesStored:false,osInputSent:false}));process.exitCode=1;}
finally{clearTimeout(timer);session?.close();}
