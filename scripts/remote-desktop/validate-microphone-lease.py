"""Own Windows processes and in-memory sinks only; never opens an audio endpoint."""
import argparse,hashlib,os,pathlib,shutil,subprocess,tempfile,uuid
parser=argparse.ArgumentParser()
parser.add_argument('--windows-temp',type=pathlib.Path,help='Windows-visible temporary directory when running from WSL')
parser.add_argument('--negative-controls',action='store_true')
args=parser.parse_args()
source=pathlib.Path(__file__).resolve().parent
root=pathlib.Path(tempfile.mkdtemp(prefix='soda-mic-lease-',dir=args.windows_temp))
names=['WindowsDesktopPipeKernel.cs','WindowsDesktopMicrophone.cs','WindowsMicrophoneLeaseChecks.cs']
original={name:(source/name).read_bytes() for name in names}
children=[]
csc=str(pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'Microsoft.NET/Framework64/v4.0.30319/csc.exe') if os.name=='nt' else '/mnt/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
def win(path):return str(path) if os.name=='nt' else subprocess.check_output(['wslpath','-w',str(path)],text=True).strip()
def compile_fixture(mutation=None):
 namespace='SodashitsuMicrophoneFixture-'+uuid.uuid4().hex+'-'
 for name,raw in original.items():
  text=raw.decode().replace('SodashitsuMicrophone-',namespace).replace('SODA_MICROPHONE_MUTEX_PREFIX',namespace)
  if name=='WindowsDesktopMicrophone.cs' and mutation:
   before,after=mutation;assert text.count(before)==1;text=text.replace(before,after)
  (root/name).write_text(text)
 executable=root/('lease-'+uuid.uuid4().hex+'.exe')
 result=subprocess.run([csc,'/nologo','/noconfig','/warnaserror+','/target:exe','/main:SodaMicrophoneLeaseChecks','/out:'+win(executable),'/r:System.dll','/r:System.Core.dll','/r:System.Security.dll']+[win(root/name) for name in names],capture_output=True)
 print((result.stdout+result.stderr).decode('cp932',errors='replace'),end='');assert result.returncode==0
 return executable

def child(executable,mode):
 process=subprocess.Popen([str(executable),mode],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 children.append(process);return process

def line(process):
 value=process.stdout.readline().decode('cp932',errors='replace').strip();print(value)
 if not value:raise AssertionError('Fixture ended before expected event, status='+str(process.poll()))
 return value

def request(executable,guarded,expected):
 process=child(executable,'try-protected' if guarded else 'try-normal');out=process.communicate(timeout=8)[0].decode('cp932',errors='replace').strip();print(out);assert process.returncode==0 and out==expected,(process.returncode,out,expected)

def close(process,command='release',expected=0):
 if process.poll() is None:process.stdin.write((command+'\n').encode());process.stdin.flush()
 process.wait(timeout=8)
 if expected==0:assert process.returncode==0
 else:assert process.returncode!=0

def run_suite(executable):
 for guarded in [False,True]:
  owner=child(executable,'owner-protected' if guarded else 'owner-normal');assert line(owner)=='dispose_pending'
  request(executable,False,'contended');request(executable,True,'contended')
  owner.stdin.write(b'release\n');owner.stdin.flush();assert line(owner)=='disposed';assert owner.poll() is None
  request(executable,False,'acquired');request(executable,True,'acquired');close(owner,'exit')
  print('same-thread sink retirement before cross-thread/process normal+protected reacquisition passed')
 # Retain a non-owning kernel handle so actual process death leaves an observable abandoned mutex.
 owner=child(executable,'owner-protected');assert line(owner)=='dispose_pending'
 keeper=child(executable,'keeper');assert line(keeper)=='keeper_ready'
 request(executable,False,'contended');close(owner,'kill',1)
 request(executable,True,'contended') # reject abandoned; no sink is opened
 request(executable,False,'acquired') # next explicit start, after the old process physically exited
 close(keeper)
 print('old actor process death, abandoned rejection and later explicit reacquisition passed')
 for guarded in [False,True]:
  failing=child(executable,'failure-protected' if guarded else 'failure-normal');assert line(failing)=='sink_activated';failing.wait(timeout=8);assert failing.returncode!=0
  request(executable,False,'acquired')
 print('unconfirmed sink Dispose kills only its owning fixture process before permitting a new start')

def reap():
 for process in children:
  if process.poll() is None:
   try:process.stdin.write(b'kill\n');process.stdin.flush();process.wait(timeout=5)
   except (BrokenPipeError,subprocess.TimeoutExpired):process.kill();process.wait(timeout=22)
 children.clear()
try:
 executable=compile_fixture();run_suite(executable);reap()
 if args.negative_controls:
  print('negative: remove native endpoint lease admission')
  executable=compile_fixture(('endpointOwned=TakeEndpointLease(out endpointLease);if(!endpointOwned||!Alive())return;','if(!Alive())return;'))
  failed=False
  try:run_suite(executable)
  except AssertionError as error:print('expected negative assertion:',error);failed=True
  finally:reap()
  assert failed,'Native lease guard negative did not fail'
  for name,raw in original.items():(root/name).write_bytes(raw);assert (root/name).read_bytes()==raw
  executable=compile_fixture();run_suite(executable);reap()
  print('native lease source negative and byte-exact fixture restore passed')
 for name,raw in original.items():assert (source/name).read_bytes()==raw
 print('production source SHA256 unchanged:',hashlib.sha256(original['WindowsDesktopMicrophone.cs']).hexdigest())
finally:
 reap();shutil.rmtree(root)
