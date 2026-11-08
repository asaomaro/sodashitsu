from pathlib import Path
import subprocess,json,hashlib,os
root=Path.cwd();work=root/'.aidev/works/20261108-copilot-child-public-history';backup=Path('/workspaces/sodashitsu/.git/recovery/copilot-public-negative');backup.mkdir(parents=True,exist_ok=True)
files=['CopilotPublicEntries.ts','CopilotTerminalBindings.ts','NativeSubagentRecords.ts','NativeSubagentReader.ts','SubagentTerminalBinding.ts','SubagentHistoryService.ts'];paths=[root/'packages/server/src/agent'/f for f in files]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for p in paths:(backup/p.name).write_bytes(p.read_bytes())
before={str(p.relative_to(root)):sha(p) for p in paths}
env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH']}
tests=['packages/server/src/agent/'+v for v in ['CopilotPublicEntries.test.ts','CopilotTerminalHistory.test.ts','NativeSubagentRecords.test.ts','NativeSubagentReader.test.ts','SubagentHistoryService.test.ts']]
run=lambda name:subprocess.run(['pnpm','exec','vitest','run',*tests],cwd=root,env=env,stdout=(work/name).open('w'),stderr=subprocess.STDOUT).returncode
codes={}
try:
 for p in paths[1:]:p.write_bytes(subprocess.check_output(['git','show','b54a4942:'+str(p.relative_to(root))]))
 codes['oldRuntime']=run('negative-old.log')
 for p in paths:p.write_bytes((backup/p.name).read_bytes())
 p=paths[1];s=p.read_text();assert '&&messages.has(message.fingerprint)' in s;p.write_text(s.replace('&&messages.has(message.fingerprint)',''))
 codes['noFingerprint']=run('negative-fingerprint.log')
finally:
 for p in paths:p.write_bytes((backup/p.name).read_bytes())
after={str(p.relative_to(root)):sha(p) for p in paths};assert before==after
codes['restored']=run('restored.log')
(work/'restoration.json').write_text(json.dumps({'codes':codes,'before':before,'after':after,'byteExact':before==after},indent=2)+'\n')
assert codes['oldRuntime']!=0 and codes['noFingerprint']!=0 and codes['restored']==0
