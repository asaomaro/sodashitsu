"""Serialize shared dictionary/preset mutations across independent CORE versions."""
from contextlib import contextmanager
import os
@contextmanager
def state_lock(directory):
 path=directory/'.state.lock'
 with open(path,'a+b') as file:
  os.chmod(path,0o600)
  if file.tell()==0:file.write(b'0');file.flush()
  file.seek(0)
  if os.name=='nt':
   import msvcrt;msvcrt.locking(file.fileno(),msvcrt.LK_LOCK,1)
  else:
   import fcntl;fcntl.flock(file.fileno(),fcntl.LOCK_EX)
  try:yield
  finally:
   file.seek(0)
   if os.name=='nt':msvcrt.locking(file.fileno(),msvcrt.LK_UNLCK,1)
   else:fcntl.flock(file.fileno(),fcntl.LOCK_UN)
def mutation(method):
 def apply(self,*args,**kwargs):
  with state_lock(self.directory):
   self.refresh()
   return method(self,*args,**kwargs)
 return apply
