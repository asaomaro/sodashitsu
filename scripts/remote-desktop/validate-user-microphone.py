import argparse,pathlib,subprocess,tempfile,shutil,os,uuid,hashlib
parser=argparse.ArgumentParser(description='Generated Windows microphone checks; no audio device or privileged worker')
parser.add_argument('--windows-temp',type=pathlib.Path,help='Windows-visible temporary directory when run from WSL')
parser.add_argument('--negative-controls',action='store_true')
args=parser.parse_args()
repo=pathlib.Path(__file__).resolve().parent
csc=str(pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'Microsoft.NET/Framework64/v4.0.30319/csc.exe') if os.name=='nt' else '/mnt/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
root=pathlib.Path(tempfile.mkdtemp(prefix='soda-user-microphone-',dir=args.windows_temp))
names=['WindowsDesktopPipeKernel.cs','WindowsDesktopMicrophone.cs','WindowsMicrophoneChecks.cs','WindowsUserMicrophonePolicy.cs','WindowsUserMicrophoneRole.cs','WindowsMicrophoneTokenChecks.cs']
original={n:(repo/n).read_bytes() for n in names}
for n,b in original.items():(root/n).write_bytes(b)
(root/'Validator.cs').write_text('using System;class Validator{static int Main(){try{SodaMicrophoneTokenChecks.Generated();SodaMicrophoneTokenChecks.Native(0);SodaDesktopUserMicrophonePolicy.GeneratedChecks();Console.WriteLine(SodaMicrophoneChecks.Run());return 0;}catch(Exception e){Console.WriteLine(e.ToString());return 1;}}}')
def win(p):return str(p) if os.name=='nt' else subprocess.check_output(['wslpath','-w',str(p)],text=True).strip()
def run():
 executable=root/('validator-'+str(len(list(root.glob('validator-*.exe')))+1)+'.exe')
 args=[csc,'/nologo','/noconfig','/warnaserror+','/target:exe','/main:Validator','/out:'+win(executable),'/r:System.dll','/r:System.Core.dll','/r:System.Web.Extensions.dll','/r:System.Security.dll']+[win(root/n) for n in names+['Validator.cs']]
 p=subprocess.run(args,capture_output=True);print(p.stdout.decode('cp932',errors='replace'),end='');print(p.stderr.decode('cp932',errors='replace'),end='')
 if p.returncode:raise Exception('C# compilation failed')
 p=subprocess.run([str(executable)],capture_output=True);out=p.stdout.decode('cp932',errors='replace')+p.stderr.decode('cp932',errors='replace');print(out,end='');return p.returncode,out
def host_checks():
 host=root/'soda-native-host.exe'
 def compile_output(output,files,target,main=None):
  command=[csc,'/nologo','/noconfig','/warnaserror+','/target:'+target,'/out:'+win(output),'/r:System.dll','/r:System.Core.dll','/r:System.Security.dll','/r:System.Web.Extensions.dll']
  if main:command.append('/main:'+main)
  result=subprocess.run(command+[win(file) for file in files],capture_output=True);print((result.stdout+result.stderr).decode('cp932',errors='replace'),end='');assert result.returncode==0
 compile_output(host,[repo/'WindowsNativeRoleHost.cs'],'exe','SodaNativeRoleHost')
 stub=root/'Stub.cs';stub.write_text('using System;using System.Threading;public static class SodaDesktopUserMicrophoneRole{public static int Main(string[] args){Console.WriteLine(Thread.CurrentThread.GetApartmentState());return 0;}}')
 for fixture in [True,False]:
  identity=uuid.uuid4().hex;directory=root/('role-'+identity);directory.mkdir();module=directory/'user-microphone.dll'
  files=[stub] if fixture else [root/n for n in names if n!='WindowsMicrophoneChecks.cs']
  compile_output(module,files,'library');sha=hashlib.sha256(module.read_bytes()).hexdigest()
  result=subprocess.run([str(host),'--role','user-microphone','--module',identity,'--sha256',sha]+([] if fixture else ['--preflight']),capture_output=True)
  output=(result.stdout+result.stderr).decode('cp932',errors='replace');print(output,end='');assert result.returncode==0 and output.strip()==('MTA' if fixture else 'soda-user-microphone-preflight-v1')
  rejected=subprocess.run([str(host),'--role','user-microphone','--module',identity,'--sha256','0'*64,'--preflight'],capture_output=True);assert rejected.returncode==2
 print('user_microphone_common_host_MTA_hash_and_actual_preflight_passed: no device activation')
try:
 host_checks()
 code,out=run();assert code==0
 variants=[('WindowsUserMicrophoneRole.cs','native-session','!success||session==0||session>Int32.MaxValue','session>Int32.MaxValue','Malformed microphone session admitted'),('WindowsUserMicrophoneRole.cs','native-logon','facts.Logon=LogonSid(identity.Token);','foreach(IdentityReference group in identity.Groups){string sid=group.Value;if(sid.StartsWith("S-1-5-5-",StringComparison.Ordinal)){if(facts.Logon!=null)throw new InvalidOperationException("Ambiguous microphone logon");facts.Logon=sid;}}','Role facts lost native logon'),('WindowsUserMicrophonePolicy.cs','lock','facts.LockState==1','facts.LockState>=0','Microphone survived lock'),('WindowsUserMicrophonePolicy.cs','system','!facts.System&&','true&&','SYSTEM audio actor admitted'),('WindowsUserMicrophonePolicy.cs','elevation','!facts.Elevated&&','true&&','Elevated audio actor admitted'),('WindowsUserMicrophonePolicy.cs','logon','facts.Logon==logon&&','true&&','Other logon microphone admitted'),('WindowsUserMicrophonePolicy.cs','startup','now-started<2500','now-started<250000','Microphone startup extended'),('WindowsUserMicrophonePolicy.cs','heartbeat','now-heartbeat<2000','now-heartbeat<2000000','Microphone heartbeat expired'),('WindowsDesktopMicrophone.cs','peer','||peerGuard!=null&&!peerGuard((int)pid)','', 'Unverified peer activated microphone endpoint')]
 for name,label,before,after,assertion in (variants if args.negative_controls else []):
  s=original[name].decode();assert s.count(before)==1
  try:
   (root/name).write_text(s.replace(before,after));print('negative',label);code,out=run();assert code==1 and assertion in out
  finally:
   (root/name).write_bytes(original[name]);assert (root/name).read_bytes()==original[name]
 code,out=run();assert code==0
 for n,b in original.items():assert (repo/n).read_bytes()==b
 print('user_microphone_9_source_negative_controls_and_byte_exact_restore_passed' if args.negative_controls else 'user_microphone_generated_checks_passed')
finally:shutil.rmtree(root)
