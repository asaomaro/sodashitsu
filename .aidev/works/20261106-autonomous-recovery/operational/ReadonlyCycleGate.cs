using System;using System.IO;using System.Diagnostics;using System.Threading;
using R=SodaDesktopSigninRestartRecovery;
// Adapter for the reviewed production job launcher; no service/command entry.
internal static class SodaDesktopSigninHost {
 internal static Exception Failure(){return new InvalidOperationException("Readonly job unavailable");}
 internal sealed class Plan {
  internal readonly string Application,Arguments,WorkingDirectory,EnvironmentBlock;
  internal Plan(){Application="C:\\Program Files\\Sodashitsu\\DesktopSignin-68f6fb663a79fe1678d88cde0d7b34d23fa8c55adae6cfad3033cf20a8f8664d\\node.exe";Arguments="--no-addons \"C:\\Program Files\\Sodashitsu\\.vault-readonly-f39904f8c6d443e8b169fe76a23f3d5f\\bootstrap.cjs\"";WorkingDirectory="C:\\Windows\\System32";EnvironmentBlock="PATH=C:\\Windows\\System32\0SystemRoot=C:\\Windows\0TEMP=C:\\Program Files\\Sodashitsu\\.vault-readonly-f39904f8c6d443e8b169fe76a23f3d5f\0TMP=C:\\Program Files\\Sodashitsu\\.vault-readonly-f39904f8c6d443e8b169fe76a23f3d5f\0windir=C:\\Windows\0\0";}
 }
}
public sealed class SodaReadonlyProbeGate:IDisposable {
 SodaDesktopSigninControllerMutex.Lease mutex;SodaDesktopSigninPackageNative.Lease package;SodaDesktopSigninScm scm;SodaDesktopSigninQuiescence.Pin pin;SodaDesktopSigninQuiescence.Lease exclusive;R.Tree tree;string before,runtime;Func<string,byte[],bool> policy;
 public SodaReadonlyProbeGate(){string owner="S-1-5-21-2255109513-3773794534-3440117263-1001";if(!SodaDesktopSigninVault.SystemPrimary()||!Environment.Is64BitProcess)throw new InvalidOperationException("SYSTEM primary required");
 try{mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000);package=SodaDesktopSigninPackageNative.VerifyController(owner,"b499ce681b2f80f6c06ac8f653ac2a50b1bfa41f54b7ce32ff9655f6ee040d1c");scm=SodaDesktopSigninScm.Open(owner,false,()=>package.Current()&&mutex.Current());if(scm.Query().State!=1||scm.Query().Pid!=0)throw new InvalidOperationException("Stopped service required");pin=SodaDesktopSigninQuiescence.Open(owner);exclusive=pin.Exclusive();runtime=Path.Combine(SodaDesktopSigninVault.StateDirectory(owner),"runtime");policy=(p,a)=>p==runtime||p.StartsWith(runtime+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninQuiescence.StateAncestor(p,a);tree=new R.Tree(runtime,policy,Active);before=tree.Digest();}catch{Dispose();throw;}}
 bool Active(){return SodaDesktopSigninVault.SystemPrimary()&&package.Current()&&mutex.Current()&&exclusive.Current()&&scm.Query().State==1&&scm.Query().Pid==0;}
 public void Check(){if(!Active())throw new InvalidOperationException("Readonly scope changed");tree.Check();using(var fresh=new R.Tree(runtime,policy,Active))if(fresh.Digest()!=before)throw new InvalidOperationException("Readonly runtime changed");}
 public void Run(){SodaDesktopSigninProcess.Child child=null;try{Check();child=SodaDesktopSigninProcess.Start(new SodaDesktopSigninHost.Plan(),Active);var timer=Stopwatch.StartNew();while(child.Running()&&timer.ElapsedMilliseconds<120000){Check();Thread.Sleep(100);}if(!child.ExitedSuccessfully()||!child.TryGraceful())throw new InvalidOperationException("Readonly job did not complete cleanly");Check();}finally{if(child!=null&&!child.Stop())Environment.FailFast("Readonly diagnostic job could not be reaped");if(child!=null)child.Dispose();}}
 public void Dispose(){if(tree!=null)tree.Dispose();if(exclusive!=null)exclusive.Dispose();if(pin!=null)pin.Dispose();if(scm!=null)scm.Dispose();if(package!=null)package.Dispose();if(mutex!=null)mutex.Dispose();}
}
