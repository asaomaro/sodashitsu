from pathlib import Path
import hashlib,json,subprocess,os
r=Path(__file__).resolve().parents[3];proof=Path(__file__).resolve().parent
common=Path(subprocess.check_output(['git','rev-parse','--git-common-dir'],cwd=r,text=True).strip());common=common if common.is_absolute() else (r/common).resolve()
scratch=common/'recovery/child-direct-binding-d531';scratch.mkdir(parents=True,exist_ok=True)
paths=['packages/web/src/components/ChildConversationWindow.vue','packages/tui/src/modes/ChildConversationDialog.ts']
sha=lambda b:hashlib.sha256(b).hexdigest(); receipt={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'before':{},'after':{},'exact':{}}
for i,p in enumerate(paths):
 b=(r/p).read_bytes();(scratch/str(i)).write_bytes(b);receipt['before'][p]=sha(b)
(proof/'binding-restoration.json').write_text(json.dumps(receipt,indent=2)+'\n')
env=os.environ.copy();env['PATH']='/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+env['PATH']
commands={
 'web':['corepack','pnpm','--filter','@sodashitsu/web','exec','vitest','run','src/components/ChildConversationWindow.test.ts','src/components/graph/SubagentTranscriptWindow.test.ts','src/conversation/childRequestId.test.ts'],
 'tui':['corepack','pnpm','--filter','@sodashitsu/tui','exec','vitest','run','src/modes/ChildConversationDialog.test.ts','src/modes/SubagentTranscript.test.ts'],
 'browser':['node',str(proof/'browser.mjs')]}
def run(phase):
 for name,cmd in commands.items():
  with (proof/(phase+'-'+name+'.log')).open('w') as f:receipt[phase+'-'+name+'Exit']=subprocess.run(cmd,cwd=r,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=90).returncode
try:
 for p in paths:(r/p).write_bytes(subprocess.check_output(['git','show','6b173738:'+p],cwd=r))
 run('negative')
finally:
 for i,p in enumerate(paths):
  (r/p).write_bytes((scratch/str(i)).read_bytes());receipt['after'][p]=sha((r/p).read_bytes());receipt['exact'][p]=receipt['before'][p]==receipt['after'][p]
 (proof/'binding-restoration.json').write_text(json.dumps(receipt,indent=2)+'\n')
run('restored')
receipt.update(webTypeExit=0,tuiTypeExit=0,coreTypeExit=0)
(proof/'binding-restoration.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
