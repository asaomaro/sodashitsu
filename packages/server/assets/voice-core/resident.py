"""Leased JSON-lines CORE process. No TCP listener; native inference is isolated."""
import os,sys,json,subprocess,threading,queue
sys.dont_write_bytecode=True
if '--execute' not in sys.argv:
 config_line=sys.stdin.buffer.readline()
 if not config_line:sys.exit(1)
 config=json.loads(config_line)
 from native_env import library_environment
 env,_=library_environment(config['runtimeDir'])
 child=subprocess.Popen([sys.executable,__file__,'--execute'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=env)
 child.stdin.write(config_line);child.stdin.flush()
 pending=queue.SimpleQueue()
 def write_requests():
  try:
   while True:
    data=pending.get()
    if data is None:return
    child.stdin.write(data);child.stdin.flush()
  except (BrokenPipeError,OSError):pass
 def lease():
  try:
   while True:
    data=sys.stdin.buffer.read1(65536)
    if not data:break
    pending.put(data)
  finally:
   try:child.kill()
   except OSError:pass
   pending.put(None)
 threading.Thread(target=write_requests,daemon=True).start()
 threading.Thread(target=lease,daemon=True).start()
 code=1
 try:
  while True:
   data=child.stdout.read1(65536)
   if not data:break
   sys.stdout.buffer.write(data);sys.stdout.buffer.flush()
  code=child.wait()
 finally:
  if child.poll() is None:child.kill();child.wait()
 os._exit(0 if code==0 else 1)

if sys.platform=='linux':
 import ctypes,signal
 parent=os.getppid();ctypes.CDLL(None).prctl(1,signal.SIGTERM)
 if os.getppid()!=parent:sys.exit(1)

# Native logging never enters the structured result stream.
output=os.fdopen(os.dup(1),'w',encoding='utf-8',buffering=1);os.dup2(2,1)
config=json.loads(sys.stdin.buffer.readline())
try:
 from native_env import configure
 configure(config['runtimeDir'])
 from runtime import Runtime
 from dispatch import execute
 rt=Runtime(config['runtimeDir'],config.get('threads',2),config['dataDir'],config.get('accelerationMode','CPU'))
 if config.get('version') and config['version']!=rt.version:raise ValueError('installed CORE version differs from selected version')
 output.write(json.dumps({'ready':True,'version':rt.version,'gpu':rt.synth.is_gpu_mode})+'\n')
except Exception as error:
 output.write(json.dumps({'ready':False,'error':type(error).__name__+': '+str(error)[:400]})+'\n');sys.exit(1)
work=queue.Queue();events={};events_lock=threading.Lock()
def requests():
 try:
  for line in sys.stdin.buffer:
   packet=json.loads(line)
   with events_lock:
    if packet.get('cancel'):
     event=events.get(packet['cancel'])
     if event:event.set()
     continue
    if packet.get('shutdown'):break
    event=threading.Event();events[packet['id']]=event
   work.put((packet,event))
 finally:work.put(None)
threading.Thread(target=requests,daemon=True).start()
while True:
 item=work.get()
 if item is None:break
 packet,event=item
 try:
  if event.is_set():raise ConnectionAbortedError('CORE request cancelled')
  result=execute(rt,packet['request'],event.is_set)
  if event.is_set():raise ConnectionAbortedError('CORE request cancelled')
  reply={'id':packet['id'],'ok':True,'result':result}
 except Exception as error:
  reply={'id':packet['id'],'ok':False,'error':str(error)[:1000]}
 finally:
  with events_lock:events.pop(packet['id'],None)
 output.write(json.dumps(reply,ensure_ascii=False,allow_nan=False)+'\n')
