from pathlib import Path
import subprocess,json,hashlib,os
root=Path(__file__).resolve().parents[3];proof=Path(__file__).resolve().parent
common=Path(subprocess.check_output(['git','rev-parse','--git-common-dir'],cwd=root,text=True).strip());common=common if common.is_absolute() else (root/common).resolve();scratch=common/'recovery/child-terminal-f376-negative';scratch.mkdir(parents=True,exist_ok=True)
H='packages/client-core/src/agent/SubagentHistoryReader.ts';U='packages/client-core/src/agent/SubagentUsageReader.ts';WG='packages/web/src/components/graph/SubagentTranscriptWindow.vue';WC='packages/web/src/components/ChildConversationWindow.vue';WH='packages/web/src/components/SubagentHistoryList.vue';WA='packages/web/src/actions/ActionDispatcher.ts';WM='packages/web/src/components/ContextMenu.vue';TG='packages/tui/src/modes/SubagentTranscript.ts';TC='packages/tui/src/modes/ChildConversationDialog.ts';TA='packages/tui/src/actions/TuiDispatcher.ts';TM='packages/tui/src/modes/ContextMenu.ts'
paths=[H,U,WG,WC,WH,WA,WM,TG,TC,TA,TM];sha=lambda b:hashlib.sha256(b).hexdigest();receipt={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'before':{},'after':{},'exact':{}}
for i,p in enumerate(paths):
 b=(root/p).read_bytes();(scratch/str(i)).write_bytes(b);receipt['before'][p]=sha(b)
(proof/'restoration.json').write_text(json.dumps(receipt,indent=2)+'\n');env=os.environ.copy();env['PATH']='/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+env['PATH']
def restore():
 for i,p in enumerate(paths):(root/p).write_bytes((scratch/str(i)).read_bytes())
def replace(path,a,b):
 p=root/path;s=p.read_text();assert a in s,(path,a);p.write_text(s.replace(a,b,1))
def run(name,command,timeout=120):
 with (proof/(name+'.log')).open('w') as f:receipt[name+'Exit']=subprocess.run(command,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=timeout).returncode
core=['corepack','pnpm','--filter','@sodashitsu/client-core','exec','vitest','run','src/agent/SubagentHistoryReader.test.ts','src/agent/SubagentUsageReader.test.ts','src/sidebar/observedAgentModel.test.ts']
web=['corepack','pnpm','--filter','@sodashitsu/web','exec','vitest','run','src/components/SubagentHistoryList.test.ts','src/components/ChildConversationWindow.test.ts','src/components/SubagentListDialog.test.ts','src/actions/ActionDispatcher.test.ts','src/components/ContextMenu.test.ts','src/components/graph/SubagentTranscriptWindow.test.ts']
tui=['corepack','pnpm','--filter','@sodashitsu/tui','exec','vitest','run','src/modes/SubagentHistoryList.test.ts','src/modes/ChildConversationDialog.test.ts','src/modes/SubagentTranscript.test.ts','src/app/TuiApp.subagents.test.ts','src/actions/TuiDispatcher.test.ts']
browser=['node',str(proof/'browser.mjs')]
try:
 replace(H,'return !this.dead && this.openedScope !== null && this.scope() === this.openedScope;','return !this.dead;')
 replace(H,'value.terminalStatus === "error"','(value.terminalStatus === "error" || value.terminalStatus === "unknown")')
 replace(H,'throw Error("Invalid history offset");','void 0;')
 replace(U,'this.target.entryId !== undefined','false')
 run('negative-core',core);restore()
 for p in [WA,WM,TA,TM]:(root/p).write_bytes(subprocess.check_output(['git','show','86192d93:'+p],cwd=root))
 replace(WH,'@click="select(item)"','@click="emit(\'select\',item)"')
 replace(WC,'if (t && conn && !t.historical)','if (t && conn)')
 replace(TC,'if (!this.historicalMode) this.control.start();','this.control.start();')
 replace(WG,'if(!stopped&&props.historyEntryId!==undefined&&r.status==="unreadable")','if(false)')
 replace(WG,'if(props.historyEntryId!==undefined){rows.value=[];','if(false){rows.value=[];')
 replace(TG,'if (this.historyEntryId !== undefined && result.status === "unreadable")','if (false)')
 run('negative-web',web);run('negative-tui',tui);run('negative-browser',browser);restore()
 replace(WG,'const r = props.historyEntryId!==undefined','const r = false')
 replace(TG,'this.historyEntryId !== undefined','false')
 pattern='never retries an unavailable historical transcript|stops an old peer historical read'
 run('negative-route-web',web+['--testNamePattern',pattern]);run('negative-route-tui',tui+['--testNamePattern',pattern])
finally:
 restore()
 for p in paths:receipt['after'][p]=sha((root/p).read_bytes());receipt['exact'][p]=receipt['before'][p]==receipt['after'][p]
 (proof/'restoration.json').write_text(json.dumps(receipt,indent=2)+'\n')
run('restored-core-build',['corepack','pnpm','--filter','@sodashitsu/client-core','build'],240)
run('restored-core',core);run('restored-web',web);run('restored-tui',tui);run('restored-browser',browser)
(proof/'restoration.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
