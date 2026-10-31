import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';
it('imports the actual composed server without evaluating optional desktop engines',async()=>{
 const entry=new URL('../../dist/composeServer.js',import.meta.url).href;
 const source=`import {registerHooks} from 'node:module';
 registerHooks({load(url,context,next){if(/\\/desktop\\/(?:DesktopProvider|DesktopNativeVideo|DesktopMicrophone|DesktopFiles)\\.js$/.test(url))throw Error('optional desktop engine evaluated: '+url);return next(url,context);}});
 await import(${JSON.stringify(entry)});console.log('disabled_desktop_graph_ok');`;
 const result=await promisify(execFile)(process.execPath,['--input-type=module','-e',source],{timeout:20000,cwd:fileURLToPath(new URL('../../../',import.meta.url))});
 expect(result.stdout).toContain('disabled_desktop_graph_ok');
});
