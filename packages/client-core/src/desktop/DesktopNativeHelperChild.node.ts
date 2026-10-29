import {DesktopNativeGateway} from "./DesktopNativeGateway.node.js";
// Fixed managed child entry. IPC carries discovery/shutdown only, never file bytes.
if(process.argv.length!==3||!process.send)process.exit(2);
let gateway:DesktopNativeGateway|undefined,stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;try{await gateway?.close();process.exit(gateway&&!(await gateway.done)?3:0);}catch{process.exit(3);}};
process.on("disconnect",()=>{void stop();});process.on("message",value=>{if(value&&typeof value==="object"&&Object.keys(value).length===1&&(value as{type?:unknown}).type==="stop")void stop();else void stop();});
try{gateway=await DesktopNativeGateway.listen(process.argv[2]!);if(stopping){await gateway.close();process.exit(0);}process.send!({type:"ready",descriptor:gateway.descriptor()});void gateway.done.then(ok=>process.exit(ok?0:3));}catch{process.exit(3);}
