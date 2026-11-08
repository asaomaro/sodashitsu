from pathlib import Path
import subprocess,hashlib,json,os
r=Path(__file__).resolve().parents[3];proof=Path(__file__).resolve().parent
common=Path(subprocess.check_output(['git','rev-parse','--git-common-dir'],cwd=r,text=True).strip());common=common if common.is_absolute() else (r/common).resolve();scratch=common/'recovery/child-usage-521318';scratch.mkdir(parents=True,exist_ok=True)
paths=['packages/client-core/src/agent/SubagentUsageReader.ts','packages/client-core/src/agent/subagentUsageView.ts','packages/web/src/dashboard/PaneInfoView.vue','packages/tui/src/modes/ChildConversationDialog.ts','packages/tui/src/modes/UsageView.ts']
sha=lambda v:hashlib.sha256(v).hexdigest();receipt={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'before':{},'after':{},'exact':{}}
for i,p in enumerate(paths):
 b=(r/p).read_bytes();(scratch/str(i)).write_bytes(b);receipt['before'][p]=sha(b)
(proof/'restoration.json').write_text(json.dumps(receipt,indent=2)+'\n')
env=os.environ.copy();env['PATH']='/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+env['PATH']
cmds={'core':['corepack','pnpm','--filter','@sodashitsu/client-core','exec','vitest','run','src/agent/SubagentUsageReader.test.ts','src/agent/subagentUsageView.test.ts'],'web':['corepack','pnpm','--filter','@sodashitsu/web','exec','vitest','run','src/components/SubagentUsagePanel.test.ts','src/components/ChildConversationWindow.test.ts','src/dashboard/PaneInfoView.test.ts'],'tui':['corepack','pnpm','--filter','@sodashitsu/tui','exec','vitest','run','src/modes/ChildConversationDialog.test.ts','src/modes/UsageView.test.ts'],'browser':['node',str(proof/'browser.mjs')]}
def run(phase):
 for k,cmd in cmds.items():
  with (proof/(phase+'-'+k+'.log')).open('w') as f:receipt[phase+'-'+k+'Exit']=subprocess.run(cmd,cwd=r,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=90).returncode
try:
 p=r/paths[0];s=p.read_text();old='return !this.dead && this.openedScope !== null && this.scope() === this.openedScope;';assert old in s;p.write_text(s.replace(old,'return !this.dead;'))
 p=r/paths[1];s=p.read_text();old='add("合計", tokens.total);';assert old in s;p.write_text(s.replace(old,'add("合計", tokens.total ?? ((tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.cacheRead ?? 0)));'))
 for p in paths[2:]:(r/p).write_bytes(subprocess.check_output(['git','show','d442a6c3:'+p],cwd=r))
 run('negative')
finally:
 for i,p in enumerate(paths):
  (r/p).write_bytes((scratch/str(i)).read_bytes());receipt['after'][p]=sha((r/p).read_bytes());receipt['exact'][p]=receipt['before'][p]==receipt['after'][p]
 (proof/'restoration.json').write_text(json.dumps(receipt,indent=2)+'\n')
# Rebuild helpers after exact restoration; browser loads the real Vue files through Vite.
with (proof/'core-build.log').open('w') as f:receipt['coreBuildExit']=subprocess.run(['corepack','pnpm','--filter','@sodashitsu/client-core','build'],cwd=r,env=env,stdout=f,stderr=subprocess.STDOUT).returncode
run('restored')
(proof/'restoration.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
