$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$owner='S-1-5-21-2255109513-3773794534-3440117263-1001';$manifest='8e6d72110ffafcbfbe4b8e4e582dcecf83976e8a2d645a2c37066a31cb8429d9';$root='C:\Program Files\Sodashitsu\.claimed-boot-46a1398019ed4525b5d870262fc5f66e'
$names=@('WindowsSigninVault.cs','WindowsSigninPackage.cs','WindowsSigninPackageNative.cs','WindowsSigninRunRecord.cs','WindowsSigninRunJournal.cs','WindowsSigninProcessEvidence.cs','WindowsSigninServicePolicy.cs','WindowsSigninQuiescence.cs','WindowsSigninAdminEnvelope.cs','WindowsSigninControllerMutex.cs','WindowsSigninScm.cs','WindowsSigninInstallFiles.cs','WindowsSigninUnclaimedRecovery.cs','WindowsSigninRestartRecovery.cs','WindowsSigninPartialIdentityProof.cs')
$source=@'
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using R=SodaDesktopSigninRestartRecovery;
public static class TrustCaseSnapshot {
 public static object Read(){string owner="S-1-5-21-2255109513-3773794534-3440117263-1001",manifest="8e6d72110ffafcbfbe4b8e4e582dcecf83976e8a2d645a2c37066a31cb8429d9",slot=SodaDesktopSigninVault.StateDirectory(owner);
 using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
 Func<bool> active=()=>mutex.Current()&&package.Current();using(var scm=SodaDesktopSigninScm.Open(owner,false,active))using(var critical=new R.ScmInstance(active))using(var pin=SodaDesktopSigninQuiescence.Open(owner))using(var exclusive=pin.Exclusive()){
 Func<bool> current=()=>active()&&critical.Current()&&exclusive.Current()&&scm.Query().State==1&&scm.Query().Pid==0;
 Func<string,byte[],bool> policy=(p,a)=>p==slot||p.StartsWith(slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninQuiescence.StateAncestor(p,a);
 using(var tree=new R.Tree(slot,policy,current))using(var runtime=new R.Tree(Path.Combine(slot,"runtime"),policy,current)){
 byte[] input=null,decoded=null;bool twoPeerResult=false;
 var probe=SodaDesktopSigninPartialIdentityProof.Parse(File.ReadAllBytes("C:\\Program Files\\Sodashitsu\\.vault-readonly-26a0e2514b1b4940ba8eda87a5e17d01\\result.json"),65536);
 var sample=(Dictionary<string,object>)((object[])probe["results"])[0];
 var fields=new SortedDictionary<string,object>{{"version",1},{"purpose","desktop-signin-admin-result"},{"ownerSid",owner},{"nonce","653618a8-191d-4951-9e05-947bd56d55ac"},{"cipherSha256","8e46881372d00a51b1c2d50b2a6ea4caf017c1614b9ba0840f96783761c54b5b"},{"outcome","success"},{"status",sample["status"]}};
 try{input=R.Encode(fields);decoded=SodaDesktopSigninAdminResult.Decode(input,owner,"653618a8-191d-4951-9e05-947bd56d55ac","8e46881372d00a51b1c2d50b2a6ea4caf017c1614b9ba0840f96783761c54b5b");twoPeerResult=decoded.Length>0;}finally{if(input!=null)Array.Clear(input,0,input.Length);if(decoded!=null)Array.Clear(decoded,0,decoded.Length);}
 var files=new List<object>();foreach(string f in Directory.GetFiles(slot,"*",SearchOption.AllDirectories).OrderBy(f=>f,StringComparer.Ordinal)){if(f==Path.Combine(slot,"quiescence.lock"))continue;byte[] b=R.Read(f,policy);try{files.Add(new{path=f.Substring(slot.Length+1),bytes=b.Length,sha256=R.Hash(b)});}finally{Array.Clear(b,0,b.Length);}}
 var intent=SodaDesktopSigninRunRecord.Unprotect(R.Read(Path.Combine(slot,"runs","intent.claimed"),policy),owner,"intent");
 using(var journal=new SodaDesktopSigninRunJournal(Path.Combine(slot,"runs"),owner,manifest,exclusive.Fingerprint,SodaDesktopSigninRunJournal.Role.Reader,current,a=>policy(Path.Combine(slot,"runs"),a),new string[0]))if(journal.State()!="observed")throw new InvalidOperationException("Observed trust required");
 using(var fresh=new R.Tree(slot,policy,current))tree.Same(fresh);
 return new{twoPeerResultSchemaValid=twoPeerResult,inventorySha256=tree.Digest(),runtimeSha256=runtime.Digest(),barrierSha256=exclusive.Fingerprint,scmInstance=critical.Identity,runId=intent.RunId,files=files.ToArray()};
 }}}}
}
'@


$names+=@('WindowsSigninAdminResult.cs')
$all=(@($names|ForEach-Object{[IO.File]::ReadAllText((Join-Path $root $_))})+@($source)) -join "`n"
$using=@([regex]::Matches($all,'(?m)^using [^;]+;')|ForEach-Object {$_.Value}|Select-Object -Unique)
$all=($using -join "`n")+"`n"+[regex]::Replace($all,'(?m)^using [^;]+;','')
Add-Type -TypeDefinition $all -ReferencedAssemblies System.dll,System.Core.dll,System.Security.dll,System.Web.Extensions.dll
$body=[TrustCaseSnapshot]::Read()
$outRoot='C:\Program Files\Sodashitsu\.trust-case-snapshot-20261106';if(Test-Path $outRoot){throw 'Fresh snapshot required'};$ds=New-Object Security.AccessControl.DirectorySecurity;$ds.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)');$null=[IO.Directory]::CreateDirectory($outRoot,$ds)
$fs=New-Object Security.AccessControl.FileSecurity;$fs.SetSecurityDescriptorSddlForm('O:BAG:BAD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;S-1-5-21-2255109513-3773794534-3440117263-1001)');$f=New-Object IO.FileStream((Join-Path $outRoot 'public.json'),[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::FullControl,[IO.FileShare]::Read,4096,[IO.FileOptions]::WriteThrough,$fs);try{$b=[Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json -Depth 12));$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
