import {desktopSigninCycle} from './DesktopSigninRuntime.js';
export interface DesktopSigninStartupDependencies {
 cycle:typeof desktopSigninCycle;
 pause(signal:AbortSignal):Promise<void>;
}
const defaults:DesktopSigninStartupDependencies={cycle:desktopSigninCycle,pause:signal=>new Promise(resolve=>{
 const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
 const timer=setTimeout(done,5000);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();
})};
/** Native host owns package/runtime lifetime and Jobs. Normal startup never
 * consumes administration files or edits credentials. */
export async function desktopSigninStartup(ownerSid:string,signal:AbortSignal,deps=defaults):Promise<'normal'>{
 while(!signal.aborted){await deps.cycle(ownerSid,signal);if(!signal.aborted)await deps.pause(signal);}
 return 'normal';
}
