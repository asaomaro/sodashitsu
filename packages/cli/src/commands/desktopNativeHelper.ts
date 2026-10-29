import {DesktopNativeGateway} from "@sodashitsu/client-core/desktop/DesktopNativeGateway.node";
type Gateway=Pick<DesktopNativeGateway,"descriptor"|"close"|"done">;
/** Serverless local command. Discovery/claim occurs on this browser PC only. */
export async function runDesktopNativeHelper(options:{origin:string},deps:{listen?(origin:string):Promise<Gateway>;write?(value:string):void;signals?:{once(event:string,listener:()=>void):unknown;removeListener(event:string,listener:()=>void):unknown}}={}){
 const url=new URL(options.origin);if(!["http:","https:"].includes(url.protocol)||url.origin!==options.origin||options.origin.length>2048)throw Error("--origin requires the browser origin without a path");
 const gateway=await(deps.listen??DesktopNativeGateway.listen)(options.origin),signals=deps.signals??process;
 const stop=()=>{void gateway.close();};signals.once("SIGINT",stop);signals.once("SIGTERM",stop);
 try{(deps.write??(value=>process.stdout.write(value)))(gateway.descriptor().url+"\n");if(!(await gateway.done))throw Error("補助プログラムの終了処理を完了できませんでした");}
 finally{signals.removeListener("SIGINT",stop);signals.removeListener("SIGTERM",stop);await gateway.close();}
}
