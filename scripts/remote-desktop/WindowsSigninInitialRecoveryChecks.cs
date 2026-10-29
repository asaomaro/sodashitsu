using System;
using System.IO;
using System.Collections.Generic;
public static class SodaDesktopSigninInitialRecoveryChecks {
 const string Owner="S-1-5-21-1-2-3-1001",Hash="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
 static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 static void Refused(Action action,string message){bool refused=false;try{action();}catch(InvalidOperationException){refused=true;}Check(refused,message);}
 sealed class Calls:SodaDesktopSigninInitialRecovery.Calls {
  internal bool Disabled=true,IsStopped=true;internal int Changes,Queries;internal Action SecondQuery=null;
  public void InspectDisabled(){Check(Disabled,"Generated service not disabled");}public bool Stopped(){if(++Queries==2&&SecondQuery!=null)SecondQuery();return IsStopped;}
  public void Manual(){Changes++;Disabled=false;}public void InspectManual(){Check(!Disabled,"Manual service was not restored");}public void Dispose(){}
 }
 sealed class Fixture:IDisposable {
  internal readonly string Slot;internal readonly Calls Service=new Calls();internal bool Active=true;
  internal Fixture(){Slot=Path.Combine(Path.GetTempPath(),"soda-initial-recovery-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(Slot);foreach(string name in new[]{"runs","admin","runtime"})Directory.CreateDirectory(Path.Combine(Slot,name));File.WriteAllBytes(Path.Combine(Slot,"quiescence.lock"),new byte[]{83});
   using(var pin=Barrier())using(var exclusive=pin.Exclusive())using(var writer=Journal(SodaDesktopSigninRunJournal.Role.Installer,exclusive.Fingerprint))writer.Initialize(SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",Owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",Hash},{"barrierSha256",exclusive.Fingerprint},{"createdAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}},Owner));
  }
  internal SodaDesktopSigninQuiescence.Pin Barrier(){return SodaDesktopSigninQuiescence.OpenCore(Path.Combine(Slot,"quiescence.lock"),new[]{Slot},(p,a)=>true);}
  internal SodaDesktopSigninRunJournal Journal(SodaDesktopSigninRunJournal.Role role,string fingerprint){return new SodaDesktopSigninRunJournal(Path.Combine(Slot,"runs"),Owner,Hash,fingerprint,role,()=>Active,acl=>true,new string[0]);}
  internal IDictionary<string,object> Run(string hash=Hash){return SodaDesktopSigninInitialRecovery.Core(Owner,hash,Slot,Service,()=>Active,Barrier,(p,a)=>true);}
  public void Dispose(){Service.Dispose();Directory.Delete(Slot,true);}
 }
 public static void Run(){
  var stopped=new SodaDesktopSigninInitialRecovery.Status{Type=0x10,State=1,Exit=1077,Pid=1234};Check(SodaDesktopSigninInitialRecovery.IsStopped(stopped),"Stopped status incorrectly used invalid PID");stopped.Pid=0;Check(SodaDesktopSigninInitialRecovery.IsStopped(stopped),"Zero PID stopped status refused");stopped.State=4;Check(!SodaDesktopSigninInitialRecovery.IsStopped(stopped),"Running status treated stopped");stopped.State=1;stopped.Exit=7;Check(!SodaDesktopSigninInitialRecovery.IsStopped(stopped),"Failed exit status treated initial");stopped.Exit=0;stopped.Specific=1;Check(!SodaDesktopSigninInitialRecovery.IsStopped(stopped),"Specific failure status treated initial");
  using(var f=new Fixture()){var result=f.Run();Check((string)result["state"]=="initial-manual-restored"&&!(bool)result["started"]&&f.Service.Changes==1,"Intact initial recovery failed");Check(Directory.GetFileSystemEntries(Path.Combine(f.Slot,"runs")).Length==1,"Recovery changed initial record");Refused(()=>f.Run(),"Already manual service was adopted");}
  using(var f=new Fixture()){f.Service.Disabled=false;Refused(()=>f.Run(),"Manual service was adopted");Check(f.Service.Changes==0,"Manual service changed");}
  using(var f=new Fixture()){f.Service.IsStopped=false;Refused(()=>f.Run(),"Running service accepted");Check(f.Service.Changes==0,"Running service changed");}
  using(var f=new Fixture()){Refused(()=>f.Run(new string('b',64)),"Wrong package-bound initial record accepted");Check(f.Service.Changes==0,"Wrong package changed service");}
  using(var f=new Fixture()){using(var pin=f.Barrier())using(var exclusive=pin.Exclusive())using(var writer=f.Journal(SodaDesktopSigninRunJournal.Role.Controller,exclusive.Fingerprint)){long now=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();writer.Prepare(SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","intent"},{"ownerSid",Owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",Hash},{"barrierSha256",exclusive.Fingerprint},{"issuedAt",now},{"expiresAt",now+60000},{"mode","normal"}},Owner));}Refused(()=>f.Run(),"Noninitial generation accepted");Check(f.Service.Changes==0,"Noninitial generation changed service");}
  using(var f=new Fixture()){File.WriteAllText(Path.Combine(f.Slot,"unknown"),"preserve");Refused(()=>f.Run(),"Unknown slot residue accepted");Check(f.Service.Changes==0&&File.ReadAllText(Path.Combine(f.Slot,"unknown"))=="preserve","Unknown slot residue was changed");}
  foreach(string name in new[]{"admin","runtime"})using(var f=new Fixture()){File.WriteAllText(Path.Combine(f.Slot,name,"keep"),"preserve");Refused(()=>f.Run(),"Nonempty initial storage accepted");Check(f.Service.Changes==0&&File.Exists(Path.Combine(f.Slot,name,"keep")),"Initial storage was changed");}
  using(var f=new Fixture()){Directory.CreateDirectory(Path.Combine(f.Slot,"install.transition"));Refused(()=>f.Run(),"Directory marker accepted");Check(f.Service.Changes==0,"Directory marker changed service");}
  using(var f=new Fixture()){f.Service.SecondQuery=()=>File.WriteAllText(Path.Combine(f.Slot,"install.transition"),"preserve");Refused(()=>f.Run(),"Late marker accepted");Check(f.Service.Changes==0,"Late marker changed service");}
  using(var f=new Fixture()){f.Service.SecondQuery=()=>f.Active=false;Refused(()=>f.Run(),"Lost authority accepted");Check(f.Service.Changes==0,"Lost authority changed service");}
  using(var f=new Fixture())using(var other=f.Barrier()){Refused(()=>f.Run(),"Concurrent barrier holder accepted");Check(f.Service.Changes==0,"Concurrent barrier changed service");}
  Console.WriteLine("signin_initial_recovery_generated_initial_only_empty_private_storage_exclusive_and_no_repair_passed");
 }
}
