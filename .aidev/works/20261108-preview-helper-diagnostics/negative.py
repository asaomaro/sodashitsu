from pathlib import Path
import subprocess,os,json,hashlib
root=Path.cwd();out=root/'.aidev/works/20261108-preview-helper-diagnostics';recovery=Path('/workspaces/sodashitsu/.git/recovery/preview-diagnostics-negative');recovery.mkdir(parents=True,exist_ok=True)
files=['packages/web/src/components/WebPreview.vue','packages/web/src/store/viewerTabs.ts','packages/web/src/preview/helperProbe.ts'];saved={p:(root/p).read_bytes() for p in files};env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH']};sha=lambda b:hashlib.sha256(b).hexdigest()
for i,(p,b)in enumerate(saved.items()):(recovery/f'{i}.source').write_bytes(b)
tests=['packages/web/src/components/WebPreview.test.ts','packages/web/src/store/viewerTabs.test.ts','packages/web/src/preview/helperStartError.test.ts','packages/web/src/preview/helperProbe.test.ts']
def run(name,args):
 with(out/name).open('w')as f:return subprocess.run(args,env=env,stdout=f,stderr=subprocess.STDOUT).returncode
negative=browser=None
try:
 for p in files:(root/p).write_bytes(subprocess.check_output(['git','show','d3e2aeee:'+p]))
 negative=run('negative.log',['pnpm','exec','vitest','run',*tests]);browser=run('browser-negative.log',['node',str(out/'browser.mjs')]);assert negative and browser
finally:
 for p,b in saved.items():(root/p).write_bytes(b)
 before={p:sha(b)for p,b in saved.items()};after={p:sha((root/p).read_bytes())for p in files};assert before==after
 restored=run('restored.log',['pnpm','exec','vitest','run',*tests]);dom=run('browser-restored.log',['node',str(out/'browser.mjs')]);(out/'restoration.json').write_text(json.dumps({'negativeExit':negative,'browserNegativeExit':browser,'restoredExit':restored,'browserRestoredExit':dom,'before':before,'after':after,'byteExact':before==after},indent=2)+'\n');assert restored==0 and dom==0
