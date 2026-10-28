import {desktopSigninStartup} from './DesktopSigninStartup.js';
import {desktopSigninStopSignal} from './DesktopSigninStopSignal.js';
/** Installed main's lifecycle, separated only for generated tests. A cancelled
 * readonly epoch may finish cleanly after teardown; malformed parent input or
 * an uncertain claimed administration outcome must still reject. */
export async function desktopSigninEntry(ownerSid:string,input:Parameters<typeof desktopSigninStopSignal>[0],controller:AbortController,startup:typeof desktopSigninStartup=desktopSigninStartup):Promise<'normal'|'admin'>{
 const monitor=desktopSigninStopSignal(input,()=>controller.abort());
 try{return await startup(ownerSid,controller.signal);}
 finally{controller.abort();monitor.close();if(monitor.failed())throw new Error('Signin stop signal is unavailable');}
}
