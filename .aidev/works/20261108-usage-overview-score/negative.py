from pathlib import Path
import subprocess,os,json,hashlib
root=Path.cwd();out=root/'.aidev/works/20261108-usage-overview-score';recovery=Path('/workspaces/sodashitsu/.git/recovery/usage-overview-negative');recovery.mkdir(parents=True,exist_ok=True)
files=['packages/client-core/src/agent/usageOverviewAssessment.ts','packages/web/src/dashboard/UsageInsightsPanel.vue','packages/tui/src/modes/MonitorView.ts'];saved={p:(root/p).read_bytes() for p in files}
for i,(p,b) in enumerate(saved.items()):(recovery/f'{i}.source').write_bytes(b)
sha=lambda b:hashlib.sha256(b).hexdigest();env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH']}
tests=['packages/client-core/src/agent/usageOverviewAssessment.test.ts','packages/web/src/dashboard/UsageInsightsPanel.test.ts','packages/tui/src/modes/MonitorView.test.ts']
def run(name):
 with (out/name).open('w') as f:return subprocess.run(['pnpm','exec','vitest','run',*tests],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT).returncode
negative=None
try:
 p=files[0];s=saved[p].decode();s=s.replace('valid && knownResults >= 10','valid && tools >= 10').replace('BigInt(knownResults - errors) * 100n / BigInt(knownResults)','BigInt(tools - errors) * 100n / BigInt(tools)');(root/p).write_text(s)
 for p in files[1:]:(root/p).write_bytes(subprocess.check_output(['git','show','c9003083:'+p],cwd=root))
 negative=run('negative.log');assert negative!=0
finally:
 for p,b in saved.items():(root/p).write_bytes(b)
 after={p:sha((root/p).read_bytes()) for p in files};before={p:sha(b) for p,b in saved.items()};assert before==after
 restored=run('restored.log');(out/'restoration.json').write_text(json.dumps({'negativeExit':negative,'restoredExit':restored,'before':before,'after':after,'byteExact':before==after},indent=2)+'\n')
 assert restored==0
