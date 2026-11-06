using System;using System.Diagnostics;
using R=SodaDesktopSigninRestartRecovery;
public sealed class SodaSigninUpgradeBootGuard:IDisposable {
 const string Owner="S-1-5-21-2255109513-3773794534-3440117263-1001",Prior="1268:134384627775760276";
 readonly Stopwatch clock=Stopwatch.StartNew();R.ScmInstance critical;SodaDesktopSigninScm service;
 static void Need(bool value){if(!value)throw new InvalidOperationException("Fixed new-boot upgrade proof required");}
 public SodaSigninUpgradeBootGuard(){try{Need(Actor());critical=new R.ScmInstance(Actor);R.RequireNewInstance(Prior,critical.Identity);service=SodaDesktopSigninScm.Open(Owner,false,Current);Stopped();}catch{Dispose();throw;}}
 bool Actor(){return clock.ElapsedMilliseconds<600000&&SodaDesktopSigninVault.SystemPrimary()&&Process.GetCurrentProcess().SessionId==0&&Environment.MachineName=="OSK2-024680-2";}
 public bool Current(){return Actor()&&critical!=null&&critical.Current();}
 public string Instance{get{Need(Current());return critical.Identity;}}
 public void Stopped(){Need(Current()&&service!=null);SodaDesktopSigninServicePolicy.Inspect(Owner);var state=service.Query();Need(state.State==1&&state.Pid==0&&state.Exit==1077&&state.Specific==0&&Current());}
 public void Dispose(){if(service!=null){service.Dispose();service=null;}if(critical!=null){critical.Dispose();critical=null;}}
}
