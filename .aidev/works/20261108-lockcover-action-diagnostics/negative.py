from pathlib import Path
import subprocess,json,hashlib,os
root=Path.cwd();work=root/'.aidev/works/20261108-lockcover-action-diagnostics';backup=Path('/workspaces/sodashitsu/.git/recovery/lockcover-action-negative');backup.mkdir(parents=True,exist_ok=True)
files=['packages/server/src/desktop/DesktopLockCoverDiagnostics.ts','packages/server/src/desktop/DesktopProvider.ts','packages/server/src/desktop/LazyDesktopProvider.ts'];paths=[root/p for p in files]
for path in paths:(backup/path.name).write_bytes(path.read_bytes())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before={str(p.relative_to(root)):sha(p) for p in paths}
env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH']}
tests=['packages/server/src/desktop/'+n for n in ['DesktopLockCoverDiagnostics.test.ts','DesktopProvider.lockCoverDiagnostics.test.ts','LazyDesktopProvider.test.ts']]
def restore():
 for path in paths:path.write_bytes((backup/path.name).read_bytes())
def run(name):
 with (work/name).open('w') as out:return subprocess.run(['pnpm','exec','vitest','run',*tests],cwd=root,env=env,stdout=out,stderr=subprocess.STDOUT).returncode
codes={}
try:
 for path in paths[1:]:path.write_bytes(subprocess.check_output(['git','show','66d876c7:'+str(path.relative_to(root))]))
 codes['old-wiring']=run('negative-old-wiring.log');restore()
 for name,old,new,path in [('epoch','&&this.config===cfg&&this.sourceEpoch===sourceEpoch);','&&this.config===cfg);',paths[1]),('config','raw.signalCode===null&&this.config===cfg&&this.sourceEpoch===sourceEpoch','raw.signalCode===null&&this.sourceEpoch===sourceEpoch',paths[1]),('count','([0-2])','([0-9])',paths[0]),('enum','!(stages as readonly string[]).includes(stage)','false',paths[0]),('bound','remaining=8','remaining=64',paths[0])]:
  source=path.read_text();assert source.count(old)==1,(name,source.count(old));path.write_text(source.replace(old,new));codes[name]=run('negative-'+name+'.log');restore()
finally:restore()
after={str(p.relative_to(root)):sha(p) for p in paths};assert before==after
codes['restored']=run('restored.log');(work/'restoration.json').write_text(json.dumps({'codes':codes,'before':before,'after':after,'byteExact':before==after},indent=2)+'\n');assert all(v!=0 for k,v in codes.items() if k!='restored') and codes['restored']==0
