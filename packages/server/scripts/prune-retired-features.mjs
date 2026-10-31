import {unlink} from 'node:fs/promises';
// Fixed retired generated modules only. Never clean source or a user's state.
for(const name of ['AssistantPackage','AssistantPackageState'])for(const suffix of ['.js','.js.map','.d.ts','.d.ts.map']){
 const path=new URL(`../dist/assistant/${name}${suffix}`,import.meta.url);
 await unlink(path).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
