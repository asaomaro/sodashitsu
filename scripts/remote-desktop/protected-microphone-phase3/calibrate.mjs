// Memory-only zero/tone calibration; never opens an endpoint or sends frames to a server.
import {AbsolutePcm} from './absolute-pcm.mjs';import {metrics} from './detector.mjs';import {fileURLToPath} from 'node:url';
export async function calibrate(mode='silence'){
 if(!['silence','generated-tone'].includes(mode))throw Error('calibration-mode');const clock=new AbsolutePcm();let frames=0,maxRms=0,maxMagnitude=0,clips=0,heartbeat=0;const timer=setInterval(()=>heartbeat++,5);
 try{await clock.ready();const result=await clock.run(bytes=>{frames++;const sample=Array.from({length:960},(_,n)=>bytes.readInt16LE(n*2)),m=metrics(sample);maxRms=Math.max(maxRms,m.rms);maxMagnitude=Math.max(maxMagnitude,m.magnitude);clips+=m.clips;sample.fill(0);},{silent:mode==='silence',frames:mode==='silence'?100:300});return{...result,mode,frames,maxRms,maxMagnitude,clips,heartbeat,endpointOpened:false,framesSent:false,rawAudioStored:false};}
 finally{clearInterval(timer);await clock.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length>3)throw Error('one-calibration-mode');console.log(JSON.stringify(await calibrate(process.argv[2]??'silence')));}
