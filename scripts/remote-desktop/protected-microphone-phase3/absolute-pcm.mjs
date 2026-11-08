// Generated-only clock. No audio API, OS timer/priority changes, sockets or files.
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
export const CLOCK_FAILURE_CODES=Object.freeze(['worker_late','delivery_late','delivery_order','worker_protocol','callback_late','callback_async','callback_send_not_live','callback_ui_budget','callback_other','timeout','worker_error','worker_exit','missing_frame','contract','closed','unknown']);
const clockFailures=new WeakMap();
const boundedMs=v=>Number.isFinite(v)&&v>=0?Math.min(60000,Math.round(v*1000)/1000):undefined;
function clockFailure(code,metrics={}){const error=Error('generated-clock-failure'),value={code:CLOCK_FAILURE_CODES.includes(code)?code:'unknown',receivedFrames:Number.isSafeInteger(metrics.receivedFrames)?Math.min(300,Math.max(0,metrics.receivedFrames)):0};for(const key of ['maxWorkerLatenessMs','maxDeliveryLatenessMs','maxCallbackMs']){const n=boundedMs(metrics[key]);if(n!==undefined)value[key]=n;}clockFailures.set(error,Object.freeze(value));return error;}
export function clockFailureEvidence(error){return error&&typeof error==='object'?clockFailures.get(error):undefined;}
function callbackFailureCode(error){return error?.message==='microphone-send-not-live'?'callback_send_not_live':error?.message==='microphone-ui-budget'?'callback_ui_budget':'callback_other';}
export const RATE=48000,SAMPLES=960,FRAMES=300,PERIOD_MS=20;
export function generatedFrame(index,silent=false){
 const bytes=Buffer.alloc(SAMPLES*2);
 if(!silent)for(let n=0;n<SAMPLES;n++)bytes.writeInt16LE(Math.round(8000*Math.sin(2*Math.PI*997*(index*SAMPLES+n)/RATE)),2*n);
 return bytes;
}
const now=()=>process.hrtime.bigint();
if(!isMainThread){
 const sleeper=new Int32Array(new SharedArrayBuffer(4));
 parentPort.on('message',m=>{
  if(m.type!=='run')return;
  const origin=now()+50_000_000n,late=[];let spinNs=0n;
  for(let seq=0;seq<m.frames;seq++){
   const deadline=origin+BigInt((seq+1)*20)*1_000_000n;
   while(true){const remaining=deadline-now();if(remaining<=0n)break;
    if(remaining>16_000_000n)Atomics.wait(sleeper,0,0,Math.max(1,Number(remaining-16_000_000n)/1e6));
    else{const start=now();while(now()<deadline){}spinNs+=now()-start;break;}
   }
   const at=now(),lateness=Number(at-deadline)/1e6;late.push(lateness);
   if(lateness>=20){parentPort.postMessage({type:'failed',reason:'worker-deadline',workerLatenessMs:lateness});return;}
   parentPort.postMessage({type:'tick',seq,deadline:String(deadline),workerLatenessMs:lateness});
  }
  parentPort.postMessage({type:'done',elapsedMs:Number(now()-origin)/1e6,maxWorkerLatenessMs:Math.max(...late),spinWallMs:Number(spinNs)/1e6});
 });parentPort.postMessage({type:'ready'});
}
export class AbsolutePcm {
 #worker;#ready;#closed=false;#running=false;
 constructor(){
  this.#worker=new Worker(new URL(import.meta.url),{env:{}});
  this.#ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('clock-prewarm-timeout')),5000);this.#worker.once('error',reject);this.#worker.once('message',m=>{clearTimeout(timer);m.type==='ready'?resolve():reject(Error('clock-not-ready'));});});
 }
 ready(){return this.#ready;}
 async run(onFrame,{silent=false,frames=FRAMES}={}){
  if(typeof onFrame!=='function'||!Number.isInteger(frames)||frames<1||frames>300||this.#running||this.#closed)throw clockFailure('contract');
  try{await this.#ready;}catch(error){throw clockFailure(error?.message==='clock-prewarm-timeout'?'timeout':error?.message==='clock-not-ready'?'worker_protocol':'worker_error');}if(this.#closed)throw clockFailure('closed');this.#running=true;
  return new Promise((resolve,reject)=>{
   let received=0,maxWorkerLatenessMs=0,maxDeliveryLatenessMs=0,maxCallbackMs=0,settled=false,reason;const wallStart=now();
   const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);this.#worker.off('message',message);this.#worker.off('error',fail);this.#worker.off('exit',exited);error?reject(clockFailure(reason??'worker_error',{receivedFrames:received,maxWorkerLatenessMs,maxDeliveryLatenessMs,maxCallbackMs})):resolve(result);};
   const fail=error=>finish(error),exited=()=>{reason='worker_exit';fail(Error('clock-exit'));};
   const timer=setTimeout(()=>{reason='timeout';fail(Error('clock-total-deadline'));},frames*20+2000);
   const message=m=>{try{
    if(m.type==='failed'){if(Number.isFinite(m.workerLatenessMs))maxWorkerLatenessMs=Math.max(maxWorkerLatenessMs,m.workerLatenessMs);reason=m.reason==='worker-deadline'?'worker_late':'worker_protocol';throw Error('clock-worker-late');}
    if(m.type==='tick'){
     const lateness=Number(now()-BigInt(m.deadline))/1e6;if(Number.isFinite(m.workerLatenessMs))maxWorkerLatenessMs=Math.max(maxWorkerLatenessMs,m.workerLatenessMs);maxDeliveryLatenessMs=Math.max(maxDeliveryLatenessMs,lateness);
     if(m.seq!==received||lateness>=20||!Number.isFinite(m.workerLatenessMs)||m.workerLatenessMs>=20){reason=m.seq!==received?'delivery_order':lateness>=20?'delivery_late':Number.isFinite(m.workerLatenessMs)?'worker_late':'worker_protocol';throw Error('clock-delivery-or-order');}
     const pcm=generatedFrame(received++,silent),start=now();let result;
     let elapsed;try{result=onFrame(pcm,m.seq);}catch(error){reason=callbackFailureCode(error);throw error;}finally{pcm.fill(0);elapsed=Number(now()-start)/1e6;maxCallbackMs=Math.max(maxCallbackMs,elapsed);}
     if(result&&typeof result.then==='function'){reason='callback_async';throw Error('clock-callback-must-be-sync');}if(elapsed>=20){reason='callback_late';throw Error('clock-callback-late');}
    }
    if(m.type==='done'){
     if(received!==frames){reason='missing_frame';throw Error('clock-missing-frame');}
     finish(null,{ok:true,frames:received,elapsedMs:m.elapsedMs,mainWallMs:Number(now()-wallStart)/1e6,maxWorkerLatenessMs:m.maxWorkerLatenessMs,maxDeliveryLatenessMs,maxCallbackMs,spinWallMs:m.spinWallMs,periodMs:20,rawAudioStored:false});
    }
   }catch(error){reason??='unknown';fail(error);}};
   this.#worker.on('message',message);this.#worker.once('error',fail);this.#worker.once('exit',exited);try{this.#worker.postMessage({type:'run',frames});}catch(error){reason='worker_error';fail(error);}
  });
 }
 async close(){if(this.#closed)return;this.#closed=true;await this.#worker.terminate();}
}
