import {homedir} from "node:os";
import {isAbsolute,join} from "node:path";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";

/** Local metadata only: no Root credentials, grant, session or network access. */
export async function desktopIdentity(options:{initialize:boolean;identityDir?:string|undefined}):Promise<{initialized:boolean;role:"agent";fingerprint?:string}> {
 const path=desktopIdentityDirectory(options.identityDir);
 const store=new DesktopEndpointStore({stateDir:path});
 try{
  if(options.initialize){await store.prepareDirectory();return{initialized:true,role:"agent",fingerprint:(await store.initialize()).fingerprint};}
  if(!await store.directoryAvailable())return{initialized:false,role:"agent"};
  const status=await store.status();return status.initialized?{initialized:true,role:"agent",fingerprint:status.fingerprint}:{initialized:false,role:"agent"};
 }finally{store.close();await store.settled();}
}

export function desktopIdentityDirectory(identityDir?:string):string{
 const path=identityDir??join(homedir(),".sodactl","desktop-agent");
 if(path.length>4096||path.includes("\0")||!isAbsolute(path)||process.platform==="win32"&&(!/^[A-Za-z]:\\/.test(path)||path.includes("/")))throw Error("Desktop identity directory must be an absolute local path");
 return path;
}
