"""Regression: a backpressured native stdin must not hide owning-process EOF."""
import os,sys,tempfile,subprocess,time,shutil,signal,unittest
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]/'packages/server/assets/voice-core'
def alive(pid):
 try:return Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].strip()[0]!='Z'
 except FileNotFoundError:return False
@unittest.skipUnless(sys.platform=='linux','native child identity verification uses procfs')
class LeaseTests(unittest.TestCase):
 def test_parent_death_with_a_full_inference_pipe(self):
  with tempfile.TemporaryDirectory(prefix='voice-lease-') as folder:
   root=Path(folder);source=(ROOT/'resident.py').read_text().split('# Native logging never')[0]
   (root/'resident.py').write_text(source+'\nimport time\ntime.sleep(30)\n')
   shutil.copyfile(ROOT/'native_env.py',root/'native_env.py')
   owner_code="import subprocess,sys,json; p=subprocess.Popen([sys.executable,sys.argv[1]],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL);print(p.pid,flush=True);p.stdin.write((json.dumps({'runtimeDir':sys.argv[2]})+'\\n').encode());p.stdin.flush();p.stdin.write(b'x'*(8*1024*1024));p.stdin.flush()"
   owner=subprocess.Popen([sys.executable,'-c',owner_code,str(root/'resident.py'),str(root)],stdout=subprocess.PIPE)
   supervisor=int(owner.stdout.readline());child=None
   try:
    for _ in range(100):
     children=Path(f'/proc/{supervisor}/task/{supervisor}/children').read_text().strip()
     if children:child=int(children.split()[0]);break
     time.sleep(.02)
    self.assertIsNotNone(child);time.sleep(.1);owner.kill();owner.wait()
    for _ in range(100):
     if not alive(supervisor) and not alive(child):break
     time.sleep(.02)
    self.assertFalse(alive(supervisor),'supervisor blocked behind inference stdin')
    self.assertFalse(alive(child),'native inference orphaned')
   finally:
    if owner.poll() is None:owner.kill();owner.wait()
    owner.stdout.close()
    for pid in (supervisor,child):
     if pid and alive(pid):
      try:os.kill(pid,signal.SIGKILL)
      except ProcessLookupError:pass
if __name__=='__main__':unittest.main()
