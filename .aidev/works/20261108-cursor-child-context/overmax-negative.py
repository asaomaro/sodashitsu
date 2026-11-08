from pathlib import Path
import subprocess,os,json,hashlib
r=Path.cwd();out=r/'.aidev/works/20261108-cursor-child-context';recovery=Path('/workspaces/sodashitsu/.git/recovery/cursor-context-overmax');recovery.mkdir(parents=True,exist_ok=True);paths=['packages/server/src/agent/CursorChildContext.ts','packages/server/src/agent/CursorTerminalBindings.ts'];saved={p:(r/p).read_bytes()for p in paths};sha=lambda b:hashlib.sha256(b).hexdigest();env={**os.environ,'PATH':'/home/asaomaro/.local/share/node/node-v24.15.0-linux-x64/bin:'+os.environ['PATH']}
for i,(p,b)in enumerate(saved.items()):(recovery/f'{i}.source').write_bytes(b)
def run(name):
 with(out/name).open('w')as f:return subprocess.run(['pnpm','exec','vitest','run','packages/server/src/agent/CursorChildContext.test.ts','packages/server/src/agent/CursorChildContextHistory.test.ts','packages/server/src/agent/CursorTerminalContext.test.ts','packages/client-core/src/agent/subagentUsageView.test.ts'],env=env,stdout=f,stderr=subprocess.STDOUT).returncode
negative=None
try:
 for p in paths:(r/p).write_bytes(subprocess.check_output(['git','show','f32c86e3:'+p]))
 negative=run('overmax-negative.log');assert negative
finally:
 for p,b in saved.items():(r/p).write_bytes(b)
 before={p:sha(b)for p,b in saved.items()};after={p:sha((r/p).read_bytes())for p in paths};assert before==after
 restored=run('overmax-restored.log');(out/'overmax-restoration.json').write_text(json.dumps({'negativeExit':negative,'restoredExit':restored,'before':before,'after':after,'byteExact':before==after},indent=2)+'\n');assert restored==0
