import subprocess,os,json
from pathlib import Path
p=Path('.aidev/works/20261108-usage-overview-score');env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH'],'NODE_OPTIONS':'--max-old-space-size=8192'}
results={}
for name,args in [('core-build',['--filter','@sodashitsu/client-core','build']),('tui-build',['--filter','@sodashitsu/tui','build']),('tui-type',['--filter','@sodashitsu/tui','typecheck']),('web-build',['--filter','@sodashitsu/web','build'])]:
 with (p/(name+'-final.log')).open('w') as f:results[name]=subprocess.run(['pnpm',*args],env=env,stdout=f,stderr=subprocess.STDOUT).returncode
 (p/'build-results.json').write_text(json.dumps(results,indent=2)+'\n')
 if results[name]:raise SystemExit(results[name])
