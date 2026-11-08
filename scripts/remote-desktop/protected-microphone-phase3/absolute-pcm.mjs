// Generated-only clock. No audio API, OS timer/priority changes, sockets or files.
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
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
   if(lateness>=20){parentPort.postMessage({type:'failed',reason:'worker-deadline'});return;}
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
  if(typeof onFrame!=='function'||!Number.isInteger(frames)||frames<1||frames>300||this.#running||this.#closed)throw Error('clock-run-contract');
  await this.#ready;if(this.#closed)throw Error('clock-closed');this.#running=true;
  return new Promise((resolve,reject)=>{
   let received=0,maxDeliveryLatenessMs=0,maxCallbackMs=0;const wallStart=now();
   const finish=(error,result)=>{clearTimeout(timer);this.#worker.off('message',message);this.#worker.off('error',fail);this.#worker.off('exit',exited);error?reject(error):resolve(result);};
   const fail=error=>finish(error),exited=()=>fail(Error('clock-exit'));
   const timer=setTimeout(()=>fail(Error('clock-total-deadline')),frames*20+2000);
   const message=m=>{try{
    if(m.type==='failed')throw Error('clock-worker-late');
    if(m.type==='tick'){
     const lateness=Number(now()-BigInt(m.deadline))/1e6;maxDeliveryLatenessMs=Math.max(maxDeliveryLatenessMs,lateness);
     if(m.seq!==received||lateness>=20||!Number.isFinite(m.workerLatenessMs)||m.workerLatenessMs>=20)throw Error('clock-delivery-or-order');
     const pcm=generatedFrame(received++,silent),start=now();let result;
     try{result=onFrame(pcm,m.seq);}finally{pcm.fill(0);}
     const elapsed=Number(now()-start)/1e6;maxCallbackMs=Math.max(maxCallbackMs,elapsed);
     if(result&&typeof result.then==='function')throw Error('clock-callback-must-be-sync');if(elapsed>=20)throw Error('clock-callback-late');
    }
    if(m.type==='done'){
     if(received!==frames)throw Error('clock-missing-frame');
     finish(null,{ok:true,frames:received,elapsedMs:m.elapsedMs,mainWallMs:Number(now()-wallStart)/1e6,maxWorkerLatenessMs:m.maxWorkerLatenessMs,maxDeliveryLatenessMs,maxCallbackMs,spinWallMs:m.spinWallMs,periodMs:20,rawAudioStored:false});
    }
   }catch(error){fail(error);}};
   this.#worker.on('message',message);this.#worker.once('error',fail);this.#worker.once('exit',exited);this.#worker.postMessage({type:'run',frames});
  });
 }
 async close(){if(this.#closed)return;this.#closed=true;await this.#worker.terminate();}
}
