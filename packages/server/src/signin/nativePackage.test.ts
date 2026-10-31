import {expect,it} from 'vitest';
it('ships one fixed privileged image for the service and session worker roles',async()=>{
 const {signinPackagePaths}=await import(new URL('../../../../scripts/remote-desktop/build-signin-package.mjs',import.meta.url).href);
 expect(signinPackagePaths.filter((name:string)=>name.startsWith('DesktopSignin')&&name.endsWith('.exe'))).toEqual(['DesktopSigninNative.exe']);
 expect(new Set(signinPackagePaths).size).toBe(signinPackagePaths.length);
});
