namespace SodaDesktopTests {
using System;
// Fake-driver and kernel-lock checks only; never changes a display mode.
public static class DisplayModeChecks {
 class Fake : SodaDesktopDisplay.Driver {
  public SodaDesktopDisplay.Mode CurrentMode=new SodaDesktopDisplay.Mode { Width=1600,Height=900,X=100,Y=200,Bits=32,Frequency=60 };
  public int Applies,Arms,Disarms;public bool ArmFails,FailAfterApply;
  public System.Threading.ManualResetEvent RestoreEntered,RestoreContinue;
  public SodaDesktopDisplay.Mode Current(string name){return CurrentMode;}
  public System.Collections.Generic.List<SodaDesktopDisplay.Mode> Modes(string name){return new System.Collections.Generic.List<SodaDesktopDisplay.Mode>{new SodaDesktopDisplay.Mode{Width=800,Height=600,Bits=32}};}
  public bool Test(string name,SodaDesktopDisplay.Mode mode){return true;}
  public void Apply(string name,SodaDesktopDisplay.Mode mode){if(Arms==0)throw new Exception("Applied before guardian");Applies++;if(mode.Width==1600&&RestoreEntered!=null){RestoreEntered.Set();RestoreContinue.WaitOne();}CurrentMode=mode;if(FailAfterApply){FailAfterApply=false;throw new Exception("Partial driver failure");}}
  public void Arm(string name,SodaDesktopDisplay.Mode original,SodaDesktopDisplay.Mode target){Arms++;if(ArmFails)throw new Exception("No guardian");}
  public void Disarm(){Disarms++;}
 }
 static void Check(bool ok,string why){if(!ok)throw new Exception(why);}
 public static string Run() {
  Check(System.Runtime.InteropServices.Marshal.SizeOf(typeof(SodaDesktopDisplay.Mode))==220,"DEVMODEW layout");
  var normal=new Fake();var lease=new SodaDesktopDisplay.Lease(normal,"test",800,600);Check(normal.Applies==1&&normal.CurrentMode.Width==800,"Mode applied");lease.Dispose();lease.Dispose();Check(normal.Applies==2&&normal.CurrentMode.Width==1600&&normal.Disarms==1,"Restoration and guardian disarm");
  var failedGuard=new Fake{ArmFails=true};try{new SodaDesktopDisplay.Lease(failedGuard,"test",800,600);throw new Exception("Expected guardian refusal");}catch{Check(failedGuard.Applies==0,"Must not apply without guardian");}
  var unsupported=new Fake();try{new SodaDesktopDisplay.Lease(unsupported,"test",801,601);throw new Exception("Expected unsupported refusal");}catch{Check(unsupported.Applies==0&&unsupported.Arms==0,"Unsupported mode touched driver");}
  var local=new Fake();var changed=new SodaDesktopDisplay.Lease(local,"test",800,600);local.CurrentMode=new SodaDesktopDisplay.Mode{Width=1024,Height=768};changed.Dispose();Check(local.Applies==1&&local.CurrentMode.Width==1024&&local.Disarms==1,"Must preserve later local layout");
  var partial=new Fake{FailAfterApply=true};try{new SodaDesktopDisplay.Lease(partial,"test",800,600);throw new Exception("Expected failed apply");}catch{Check(partial.Applies==2&&partial.CurrentMode.Width==1600,"Partial apply must restore");}
  var refresh=new Fake();var refreshLease=new SodaDesktopDisplay.Lease(refresh,"test",800,600);refresh.CurrentMode.Frequency=144;refresh.CurrentMode.Bits=30;refreshLease.Dispose();Check(refresh.CurrentMode.Width==1600&&refresh.CurrentMode.Frequency==144&&refresh.CurrentMode.Bits==30&&refresh.CurrentMode.Fields==0x180000,"Restore must request dimensions only, preserving current refresh/color fields");
  string device="SodaDisplayFake-"+Guid.NewGuid().ToString("N");bool returned=false;
  using(var gate=SodaDesktopDisplay.DeviceMutex(device)) {
   gate.WaitOne();var waiting=new System.Threading.Thread(()=>{SodaDesktopDisplay.WaitForPrevious(device);returned=true;});waiting.Start();
   System.Threading.Thread.Sleep(100);Check(!returned,"New lease bypassed guardian restoration lock");gate.ReleaseMutex();Check(waiting.Join(2000)&&returned,"New lease must proceed after restoration");
  }
  string guardDevice="SodaGuardFake-"+Guid.NewGuid().ToString("N"),eventName="Local\\SodaGuardFakeStop-"+Guid.NewGuid().ToString("N");
  using(var stop=new System.Threading.EventWaitHandle(false,System.Threading.EventResetMode.ManualReset,eventName))
  using(var ready=new System.Threading.ManualResetEvent(false))
  using(var restoreEntered=new System.Threading.ManualResetEvent(false))
  using(var restoreContinue=new System.Threading.ManualResetEvent(false)) {
   var old=new Fake{Arms=1,RestoreEntered=restoreEntered,RestoreContinue=restoreContinue};var original=old.CurrentMode;old.CurrentMode.Width=800;old.CurrentMode.Height=600;
   var plan=new SodaDesktopDisplay.Plan{Device=guardDevice,Original=original,Target=old.CurrentMode,StopEvent=eventName};bool parentExited=false,newSnapshot=false;
   var guard=new System.Threading.Thread(()=>SodaDesktopDisplay.Guard(old,plan,()=>parentExited,()=>ready.Set()));guard.IsBackground=true;guard.Start();
   Check(ready.WaitOne(2000),"Guardian readiness");parentExited=true;Check(restoreEntered.WaitOne(2000),"Guardian must restore after simulated death");
   var next=new System.Threading.Thread(()=>{SodaDesktopDisplay.WaitForPrevious(guardDevice);Check(old.CurrentMode.Width==1600,"Next snapshot preceded restoration");newSnapshot=true;});next.IsBackground=true;next.Start();
   try{System.Threading.Thread.Sleep(100);Check(!newSnapshot,"Next lease bypassed in-progress guardian restore");}finally{restoreContinue.Set();}
   Check(guard.Join(2000)&&next.Join(2000)&&newSnapshot,"Restored guardian must release next lease");
  }
  return "display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes";
 }
}

}
