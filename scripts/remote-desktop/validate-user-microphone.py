import argparse,pathlib,subprocess,tempfile,shutil,os
parser=argparse.ArgumentParser(description='Generated Windows microphone checks; no audio device or privileged worker')
parser.add_argument('--windows-temp',type=pathlib.Path,help='Windows-visible temporary directory when run from WSL')
parser.add_argument('--negative-controls',action='store_true')
args=parser.parse_args()
repo=pathlib.Path(__file__).resolve().parent
csc=str(pathlib.Path(os.environ.get('SystemRoot','C:/Windows'))/'Microsoft.NET/Framework64/v4.0.30319/csc.exe') if os.name=='nt' else '/mnt/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe'
root=pathlib.Path(tempfile.mkdtemp(prefix='soda-user-microphone-',dir=args.windows_temp))
names=['WindowsDesktopPipeKernel.cs','WindowsDesktopMicrophone.cs','WindowsMicrophoneChecks.cs','WindowsUserMicrophonePolicy.cs','WindowsUserMicrophoneRole.cs']
original={n:(repo/n).read_bytes() for n in names}
for n,b in original.items():(root/n).write_bytes(b)
(root/'Validator.cs').write_text('using System;class Validator{static int Main(){try{SodaDesktopUserMicrophonePolicy.GeneratedChecks();Console.WriteLine(SodaMicrophoneChecks.Run());return 0;}catch(Exception e){Console.WriteLine(e.ToString());return 1;}}}')
def win(p):return str(p) if os.name=='nt' else subprocess.check_output(['wslpath','-w',str(p)],text=True).strip()
def run():
 executable=root/('validator-'+str(len(list(root.glob('validator-*.exe')))+1)+'.exe')
 args=[csc,'/nologo','/noconfig','/warnaserror+','/target:exe','/main:Validator','/out:'+win(executable),'/r:System.dll','/r:System.Core.dll','/r:System.Web.Extensions.dll','/r:System.Security.dll']+[win(root/n) for n in names+['Validator.cs']]
 p=subprocess.run(args,capture_output=True);print(p.stdout.decode('cp932',errors='replace'),end='');print(p.stderr.decode('cp932',errors='replace'),end='')
 if p.returncode:raise Exception('C# compilation failed')
 p=subprocess.run([str(executable)],capture_output=True);out=p.stdout.decode('cp932',errors='replace')+p.stderr.decode('cp932',errors='replace');print(out,end='');return p.returncode,out
try:
 code,out=run();assert code==0
 variants=[('WindowsUserMicrophonePolicy.cs','lock','facts.LockState==1','facts.LockState>=0','Microphone survived lock'),('WindowsUserMicrophonePolicy.cs','system','!facts.System&&','true&&','SYSTEM audio actor admitted'),('WindowsUserMicrophonePolicy.cs','elevation','!facts.Elevated&&','true&&','Elevated audio actor admitted'),('WindowsUserMicrophonePolicy.cs','logon','facts.Logon==logon&&','true&&','Other logon microphone admitted'),('WindowsUserMicrophonePolicy.cs','startup','now-started<2500','now-started<250000','Microphone startup extended'),('WindowsUserMicrophonePolicy.cs','heartbeat','now-heartbeat<2000','now-heartbeat<2000000','Microphone heartbeat expired'),('WindowsDesktopMicrophone.cs','peer','||peerGuard!=null&&!peerGuard((int)pid)','', 'Unverified peer activated microphone endpoint')]
 for name,label,before,after,assertion in (variants if args.negative_controls else []):
  s=original[name].decode();assert s.count(before)==1
  try:
   (root/name).write_text(s.replace(before,after));print('negative',label);code,out=run();assert code==1 and assertion in out
  finally:
   (root/name).write_bytes(original[name]);assert (root/name).read_bytes()==original[name]
 code,out=run();assert code==0
 for n,b in original.items():assert (repo/n).read_bytes()==b
 print('user_microphone_7_source_negative_controls_and_byte_exact_restore_passed' if args.negative_controls else 'user_microphone_generated_checks_passed')
finally:shutil.rmtree(root)
