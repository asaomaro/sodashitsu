import {it,expect} from 'vitest';
import {writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {makeHost,ext} from './hostHarness.js';
import {ArtifactFiles} from '../http/ArtifactFiles.js';
it('artifact registration requires an enabled script extension and its own scoped pane, and revoke is owner-bound',async()=>{
 const files=new ArtifactFiles(),h=await makeHost({artifacts:files,tabPlugins:{w1:{extensionKey:'user:a',display:'studio'}}});
 try{
  h.workspaces.set('w1',{cwd:h.dir,projectDir:h.dir});await h.writeConfig([ext('a',{allow:['script-html']}),ext('b',{allow:['script-html']})]);await h.host.start();
  await h.until(()=>h.children.every(c=>c.lines().length>=2));
  const a=h.children[0]!,b=h.children[1]!,path=join(h.dir,'video.html');await writeFile(path,'<h1>Preview</h1>');const st=await stat(path),params={paneId:'p1',path,kind:'html',stamp:{size:st.size,mtimeMs:st.mtimeMs,ino:st.ino}};
  expect(a.lines()[0]).toMatchObject({methods:expect.arrayContaining(['artifact.open','artifact.close'])});
  a.stdout.write(JSON.stringify({id:1,method:'artifact.open',params})+'\n');await h.until(()=>a.lines().some(l=>l['id']===1));
  const success=a.lines().find(l=>l['id']===1)!;expect(success['ok']).toBe(true);
  b.stdout.write(JSON.stringify({id:2,method:'artifact.open',params})+'\n');await h.until(()=>b.lines().some(l=>l['id']===2));expect(b.lines().find(l=>l['id']===2)).toMatchObject({ok:false,error:{code:'not_found'}});
  h.scriptEnabled.value=false;a.stdout.write(JSON.stringify({id:3,method:'artifact.open',params})+'\n');await h.until(()=>a.lines().some(l=>l['id']===3));expect(a.lines().find(l=>l['id']===3)).toMatchObject({ok:false});
 }finally{await h.cleanup();files.close();}
});
