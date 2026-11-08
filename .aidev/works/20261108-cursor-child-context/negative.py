from pathlib import Path
import subprocess,os,json,hashlib
r=Path.cwd();out=r/'.aidev/works/20261108-cursor-child-context';recovery=Path('/workspaces/sodashitsu/.git/recovery/cursor-context-negative');recovery.mkdir(parents=True,exist_ok=True)
paths=['packages/server/src/agent/CursorChildMetadataQuery.ts','packages/server/src/agent/CursorChildRecord.ts','packages/server/src/agent/CursorChildObservations.ts','packages/server/src/agent/CursorTerminalBindings.ts','packages/server/src/agent/SubagentHistoryService.ts','packages/server/src/agent/SubagentTerminalBinding.ts','packages/server/src/agent/CursorChildContext.ts','packages/client-core/src/agent/subagentUsageView.ts'];saved={p:(r/p).read_bytes()for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest();env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH']}
for i,(p,b)in enumerate(saved.items()):(recovery/f'{i}.source').write_bytes(b)
tests=['packages/server/src/agent/CursorChildContext.test.ts','packages/server/src/agent/CursorChildContextHistory.test.ts','packages/server/src/agent/CursorChildRecord.test.ts','packages/server/src/agent/CursorChildObservations.test.ts','packages/server/src/agent/CursorChildMetadata.test.ts','packages/server/src/agent/CursorChildReports.test.ts','packages/server/src/agent/SubagentHistoryService.test.ts','packages/server/src/agent/CursorTerminalContext.test.ts','packages/client-core/src/agent/subagentUsageView.test.ts']
results={}
def restore():
 for p,b in saved.items():(r/p).write_bytes(b)
def run(name,args):
 with(out/(name+'.log')).open('w')as f:return subprocess.run(['pnpm','exec','vitest','run',*args],env=env,stdout=f,stderr=subprocess.STDOUT).returncode
try:
 for p in paths:
  if p.endswith('CursorChildContext.ts'):continue
  (r/p).write_bytes(subprocess.check_output(['git','show','b54a4942:'+p]))
 results['old']=run('negative-old',tests);assert results['old']!=0;restore()
 p=paths[3];s=saved[p].decode().replace('opened.snapshotSeal===binding.snapshotSeal&&context&&context.rootId===binding.context?.rootId','context');assert s!=saved[p].decode();(r/p).write_text(s)
 results['seal']=run('negative-seal',[tests[1],'-t','never captures a later latest-root']);assert results['seal']!=0;restore()
 for p in paths[1:4:2]:(r/p).write_bytes(subprocess.check_output(['git','show','2258713f:'+p]))
 results['lateClose']=run('negative-late-close',[tests[1],'-t','while the numeric record FD is closing']);assert results['lateClose']!=0;restore()
 p=paths[6];s=saved[p].decode().replace('  if(used===undefined||max===undefined','  used ??= 0;\n  if(used===undefined||max===undefined');assert s!=saved[p].decode();(r/p).write_text(s)
 results['presence']=run('negative-presence',[tests[0]]);assert results['presence']!=0
finally:
 restore();before={p:sha(b)for p,b in saved.items()};after={p:sha((r/p).read_bytes())for p in paths};assert before==after
 results['restored']=run('restored',tests);results['publicAPI']=run('public-api-final',['packages/server/src/composeServer.cursorChildObservations.integration.test.ts']);(out/'restoration.json').write_text(json.dumps({'results':results,'before':before,'after':after,'byteExact':before==after},indent=2)+'\n');assert results['restored']==0 and results['publicAPI']==0
