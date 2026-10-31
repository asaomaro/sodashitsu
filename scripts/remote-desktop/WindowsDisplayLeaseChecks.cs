namespace SodaDesktopTests {
using System;
using System.Drawing;
// Fake-driver and kernel-lock checks only; never changes a display mode.
public static class DisplayModeChecks {
 class Fake : SodaDesktopDisplay.Driver {
  public SodaDesktopDisplay.Mode CurrentMode=new SodaDesktopDisplay.Mode { Width=1600,Height=900,X=100,Y=200,Bits=32,Frequency=60 };
  public int Applies,Arms,Disarms;public bool ArmFails,FailAfterApply;
  public System.Threading.ManualResetEvent RestoreEntered,RestoreContinue;
  public virtual SodaDesktopDisplay.Mode Current(string name){return CurrentMode;}
  public System.Collections.Generic.List<SodaDesktopDisplay.Mode> Modes(string name){return new System.Collections.Generic.List<SodaDesktopDisplay.Mode>{new SodaDesktopDisplay.Mode{Width=800,Height=600,Bits=32}};}
  public bool Test(string name,SodaDesktopDisplay.Mode mode){return true;}
  public void Apply(string name,SodaDesktopDisplay.Mode mode){if(Arms==0)throw new Exception("Applied before guardian");Applies++;if(mode.Width==1600&&RestoreEntered!=null){RestoreEntered.Set();RestoreContinue.WaitOne();}CurrentMode=mode;if(FailAfterApply){FailAfterApply=false;throw new Exception("Partial driver failure");}}
  public void Arm(string name,SodaDesktopDisplay.Mode original,SodaDesktopDisplay.Mode target){Arms++;if(ArmFails)throw new Exception("No guardian");}
  public void Disarm(){Disarms++;}
 }
 static void Check(bool ok,string why){if(!ok)throw new Exception(why);}
 class Layout : Fake {
  public SodaDesktopDisplay.Mode Left=new SodaDesktopDisplay.Mode {X=-1920,Y=360,Width=1920,Height=1080};
  public override SodaDesktopDisplay.Mode Current(string name){return name=="left"?Left:CurrentMode;}
 }
 class Virtual : SodaDesktopDisplay.Driver {
  public SodaDesktopDisplay.Mode Mode=new SodaDesktopDisplay.Mode{Width=800,Height=600,X=1920,Y=0};public int Applies,Tests,Arms;public Action ReadModes,Tested,ReadCurrent,Applied;
  public SodaDesktopDisplay.Mode Current(string name){if(name!="owned-virtual")throw new Exception("Physical source accessed");if(ReadCurrent!=null)ReadCurrent();return Mode;}
  public System.Collections.Generic.List<SodaDesktopDisplay.Mode> Modes(string name){if(name!="owned-virtual")throw new Exception("Physical modes accessed");if(ReadModes!=null)ReadModes();return new System.Collections.Generic.List<SodaDesktopDisplay.Mode>{new SodaDesktopDisplay.Mode{Width=1280,Height=720}};}
  public bool Test(string name,SodaDesktopDisplay.Mode mode){Tests++;if(Tested!=null)Tested();return true;}
  public void Apply(string name,SodaDesktopDisplay.Mode mode){if(name!="owned-virtual")throw new Exception("Physical mode changed");Applies++;Mode=mode;if(Applied!=null)Applied();}
  public void Arm(string name,SodaDesktopDisplay.Mode original,SodaDesktopDisplay.Mode target){Arms++;throw new Exception("Virtual guardian must not outlive device ownership");}
  public void Disarm(){}
 }
 static void VirtualModes(){
  var valid=new Virtual();var bounds=SodaDesktopDisplay.ApplyOwnedVirtualMode(valid,"owned-virtual",1280,720,()=>true,()=>0);Check(bounds==new Rectangle(1920,0,1280,720)&&valid.Applies==1&&valid.Arms==0,"Owned virtual mode and no guardian");
  foreach(string stage in new[]{"modes","test","before-apply","after-apply","deadline","rollback","scope-query-deadline"}){
   var fake=new Virtual();bool permit=true,expireInScope=false;long now=100;int reads=0;
   if(stage=="modes")fake.ReadModes=()=>permit=false;if(stage=="test")fake.Tested=()=>permit=false;
   if(stage=="before-apply")fake.ReadCurrent=()=>{if(++reads==2)permit=false;};if(stage=="after-apply")fake.Applied=()=>permit=false;
   if(stage=="scope-query-deadline")fake.ReadCurrent=()=>{if(++reads==2)expireInScope=true;};
   if(stage=="deadline")fake.ReadModes=()=>now=3100;if(stage=="rollback")fake.ReadModes=()=>now=99;
   bool denied=false;try{SodaDesktopDisplay.ApplyOwnedVirtualMode(fake,"owned-virtual",1280,720,()=>{if(expireInScope)now=3100;return permit;},()=>now);}catch(InvalidOperationException){denied=true;}catch(System.TimeoutException){denied=true;}
   Check(denied,"Virtual mode source/budget guard missing: "+stage);Check(fake.Applies==(stage=="after-apply"?1:0)&&fake.Arms==0,"Virtual mode committed after source/budget loss: "+stage);
  }
  var unsupported=new Virtual();bool rejected=false;try{SodaDesktopDisplay.ApplyOwnedVirtualMode(unsupported,"owned-virtual",1920,1080,()=>true,()=>0);}catch(InvalidOperationException){rejected=true;}Check(rejected&&unsupported.Applies==0,"Unsupported virtual mode applied");
  Console.WriteLine("owned_virtual_mode_checks_passed: exact source, original deadline, rollback, no orphan restoration guardian; fake driver only");
 }
 public static string Run() {
  VirtualModes();
  Check(System.Runtime.InteropServices.Marshal.SizeOf(typeof(SodaDesktopDisplay.Mode))==220,"DEVMODEW layout");
  var layout=new Layout{CurrentMode=new SodaDesktopDisplay.Mode{Width=3840,Height=2160}};
  var native=SodaDesktopDisplay.VirtualRectangle(layout,new[]{"primary","left"});
  Check(native==new Rectangle(-1920,0,5760,2160),"Physical virtual bounds, including negative monitor origin");
  var absolute=SodaDesktopDisplay.AbsolutePointer(SodaDesktopDisplay.RectangleOf(layout.CurrentMode),native,0.5,0.5);
  Check(absolute==new Point(43698,32783),"Physical pointer coordinates must not use DPI-scaled bounds");
  Check(SodaDesktopDisplay.AbsolutePointer(SodaDesktopDisplay.RectangleOf(layout.Left),native,0,0).X==0,"Leftmost physical pixel");
  Check(SodaDesktopDisplay.AbsolutePointer(SodaDesktopDisplay.RectangleOf(layout.CurrentMode),native,1,1)==new Point(65535,65535),"Last physical pixel");
  layout.CurrentMode=new SodaDesktopDisplay.Mode{Width=1600,Height=900};
  var resized=SodaDesktopDisplay.VirtualRectangle(layout,new[]{"primary"});
  Check(resized==new Rectangle(0,0,1600,900)&&SodaDesktopDisplay.AbsolutePointer(resized,resized,1,1)==new Point(65535,65535),"Refresh native input bounds after resolution change");
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
