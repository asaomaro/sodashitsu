from pathlib import Path
import subprocess,hashlib,json,os
root=Path.cwd();work=root/'.aidev/works/20261108-copilot-child-public-history';backup=Path('/workspaces/sodashitsu/.git/recovery/copilot-public-conflict-negative');backup.mkdir(parents=True,exist_ok=True)
paths=[root/'packages/server/src/agent'/v for v in ['CopilotPublicEntries.ts','NativeSubagentRecords.ts']];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before={str(p.relative_to(root)):sha(p) for p in paths}
for p in paths:(backup/p.name).write_bytes(p.read_bytes())
env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH']};tests=['packages/server/src/agent/'+v for v in ['CopilotPublicEntries.test.ts','CopilotTerminalHistory.test.ts','NativeSubagentRecords.test.ts','NativeSubagentReader.test.ts','SubagentHistoryService.test.ts']]
def run(name):
 with (work/name).open('w') as log:return subprocess.run(['pnpm','exec','vitest','run',*tests],env=env,cwd=root,stdout=log,stderr=subprocess.STDOUT).returncode
try:
 for p in paths:p.write_bytes(subprocess.check_output(['git','show','4e2c1736:'+str(p.relative_to(root))]))
 negative=run('conflict-negative.log')
finally:
 for p in paths:p.write_bytes((backup/p.name).read_bytes())
after={str(p.relative_to(root)):sha(p) for p in paths};assert before==after
restored=run('conflict-restored.log');(work/'conflict-restoration.json').write_text(json.dumps({'negativeExit':negative,'restoredExit':restored,'before':before,'after':after,'byteExact':before==after},indent=2)+'\n');assert negative!=0 and restored==0
