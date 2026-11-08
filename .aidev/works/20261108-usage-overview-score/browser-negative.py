from pathlib import Path
import subprocess,os,json,hashlib
root=Path.cwd();p=root/'packages/web/src/dashboard/UsageInsightsPanel.vue';out=root/'.aidev/works/20261108-usage-overview-score';recovery=Path('/workspaces/sodashitsu/.git/recovery/usage-overview-browser');recovery.mkdir(parents=True,exist_ok=True);saved=p.read_bytes();(recovery/'panel.vue').write_bytes(saved);sha=lambda b:hashlib.sha256(b).hexdigest();env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH']}
negative=None
try:
 p.write_bytes(subprocess.check_output(['git','show','c9003083:packages/web/src/dashboard/UsageInsightsPanel.vue']))
 with (out/'browser-negative.log').open('w') as f:negative=subprocess.run(['node',str(out/'browser.mjs')],env=env,stdout=f,stderr=subprocess.STDOUT).returncode
 assert negative!=0
finally:
 p.write_bytes(saved);assert p.read_bytes()==saved
 with (out/'browser-final.log').open('w') as f:restored=subprocess.run(['node',str(out/'browser.mjs')],env=env,stdout=f,stderr=subprocess.STDOUT).returncode
 (out/'browser-restoration.json').write_text(json.dumps({'negativeExit':negative,'restoredExit':restored,'beforeSHA':sha(saved),'afterSHA':sha(p.read_bytes()),'byteExact':p.read_bytes()==saved},indent=2)+'\n');assert restored==0
