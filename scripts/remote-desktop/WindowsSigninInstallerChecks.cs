using System;
using System.IO;
using System.Collections.Generic;
public static class SodaDesktopSigninInstallerChecks {
 const string Owner="S-1-5-21-1-2-3-1001";
 static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 static void Refused(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}catch(IOException){failed=true;}Check(failed,message);}
 sealed class Calls:SodaDesktopSigninInstallerScm.Calls {
  internal bool Exists,Disabled,Manual;internal int Creates,Enables;internal Action BeforeInspect,OnCreate,OnEnable=null;internal Func<bool> Ready=()=>true,Committed=()=>true;
  public bool Absent(){return !Exists;}
  public void CreateDisabled(){Check(Ready(),"SCM registration preceded verified data");Creates++;Exists=Disabled=true;if(OnCreate!=null)OnCreate();}
  public void InspectDisabled(){if(BeforeInspect!=null)BeforeInspect();Check(Exists&&Disabled&&!Manual,"Disabled service policy was not preserved");}
  public void EnableManual(){Check(Committed(),"Manual enable preceded marker commit");Enables++;Disabled=false;Manual=true;if(OnEnable!=null)OnEnable();}
  public void InspectManual(){Check(Exists&&Manual&&!Disabled,"Manual service policy unavailable");}
  public void Dispose(){}
 }
 static SodaDesktopSigninInstaller.Verified Verify(string code,string hash){var source=SodaDesktopSigninInstallSource.Open(code,Owner,hash);return new SodaDesktopSigninInstaller.Verified(source,source.Current);}
 static void Create(string path){if(!SodaDesktopSigninInstallFiles.Absent(path))throw new InvalidOperationException("Generated directory collision");Directory.CreateDirectory(path);}
 static SodaDesktopSigninQuiescence.Pin Barrier(SodaDesktopSigninInstallFiles.Paths paths){return SodaDesktopSigninQuiescence.OpenCore(Path.Combine(paths.Slot,"quiescence.lock"),new[]{paths.Slot},(path,acl)=>true);}
 public static void Run(){
  byte[] descriptor=SodaDesktopSigninPackageNative.PrivateFileDescriptor();var security=new System.Security.AccessControl.RawSecurityDescriptor(descriptor,0);Check(security.Owner.Value=="S-1-5-32-544"&&SodaDesktopSigninQuiescence.Private(descriptor),"New private file owner or ACL was not explicit");
  string root=Path.Combine(Path.GetTempPath(),"soda-installer-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
  try{
   string input=Path.Combine(root,"source"),hash=SodaDesktopSigninInstallSourceChecks.Make(input);var paths=new SodaDesktopSigninInstallFiles.Paths(Path.Combine(root,"program"),Path.Combine(root,"data"),Owner,Guid.NewGuid().ToString("N"));var calls=new Calls();int privateFiles=0;Func<string,FileStream> createFile=path=>{privateFiles++;return new FileStream(path,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None);};
   calls.Ready=()=>File.Exists(Path.Combine(paths.Code,"signin-package.json"))&&File.Exists(Path.Combine(paths.Slot,"runs","initial"))&&File.Exists(Path.Combine(paths.Slot,"install.transition"));calls.Committed=()=>!File.Exists(Path.Combine(paths.Slot,"install.transition"))&&File.Exists(Path.Combine(paths.Slot,"runs","initial"));
   using(var release=SodaDesktopSigninInstallSource.Open(input,Owner,hash))using(var service=new SodaDesktopSigninInstallerScm(calls,()=>true)){
    var result=SodaDesktopSigninInstaller.InstallCore(release,Owner,paths,service,()=>true,Create,(path,acl)=>true,()=>Verify(paths.Code,hash),()=>Barrier(paths),createFile);Check(privateFiles>=SodaDesktopSigninPackage.RequiredPaths().Length+4,"Private file creation bypassed explicit owner factory");Check((bool)result["installed"]&&!(bool)result["started"]&&calls.Creates==1&&calls.Enables==1,"Initial installation did not commit without starting");Check(Directory.GetFileSystemEntries(Path.Combine(paths.Slot,"admin")).Length==0&&Directory.GetFileSystemEntries(Path.Combine(paths.Slot,"runtime")).Length==0,"Installer created identity or administrative data");
    using(var pin=Barrier(paths))using(var reader=new SodaDesktopSigninRunJournal(Path.Combine(paths.Slot,"runs"),Owner,hash,pin.Fingerprint,SodaDesktopSigninRunJournal.Role.Reader,()=>true,acl=>true,new string[0]))Check(reader.State()=="initial","Installed run generation was not bound to package/barrier");
   }
   Check(SodaDesktopSigninRunStorage.MaintenanceAbsent(paths.Slot),"Committed installation retained marker");Directory.CreateDirectory(Path.Combine(paths.Slot,"install.transition"));Check(!SodaDesktopSigninRunStorage.MaintenanceAbsent(paths.Slot),"Directory maintenance marker was ignored");Directory.Delete(Path.Combine(paths.Slot,"install.transition"));
   using(var release=SodaDesktopSigninInstallSource.Open(input,Owner,hash))using(var service=new SodaDesktopSigninInstallerScm(new Calls(),()=>true))Refused(()=>SodaDesktopSigninInstaller.InstallCore(release,Owner,paths,service,()=>true,Create,(path,acl)=>true,()=>Verify(paths.Code,hash),()=>Barrier(paths)),"Existing code/data target was adopted");
   var existing=new Calls{Exists=true};var other=new SodaDesktopSigninInstallFiles.Paths(Path.Combine(root,"other-program"),Path.Combine(root,"other-data"),Owner,Guid.NewGuid().ToString("N"));
   using(var release=SodaDesktopSigninInstallSource.Open(input,Owner,hash))using(var service=new SodaDesktopSigninInstallerScm(existing,()=>true))Refused(()=>SodaDesktopSigninInstaller.InstallCore(release,Owner,other,service,()=>true,Create,(path,acl)=>true,()=>Verify(other.Code,hash),()=>Barrier(other)),"Existing service was adopted");Check(!Directory.Exists(other.Slot),"Existing service changed data targets");
   bool active=true;var failed=new Calls();failed.OnCreate=()=>active=false;other=new SodaDesktopSigninInstallFiles.Paths(Path.Combine(root,"failed-program"),Path.Combine(root,"failed-data"),Owner,Guid.NewGuid().ToString("N"));
   using(var release=SodaDesktopSigninInstallSource.Open(input,Owner,hash))using(var service=new SodaDesktopSigninInstallerScm(failed,()=>active))Refused(()=>SodaDesktopSigninInstaller.InstallCore(release,Owner,other,service,()=>active,Create,(path,acl)=>true,()=>Verify(other.Code,hash),()=>Barrier(other)),"Revoked registration became manual service");Check(failed.Creates==1&&failed.Enables==0&&failed.Disabled&&File.Exists(Path.Combine(other.Slot,"install.transition")),"Partial registration lost disabled recovery state");
   var inspect=new Calls{Exists=true,Disabled=true};bool owned=true;inspect.BeforeInspect=()=>owned=false;using(var service=new SodaDesktopSigninInstallerScm(inspect,()=>owned))Refused(()=>service.EnableManual(()=>true),"Unowned existing service enabled");
   var unready=new Calls();using(var service=new SodaDesktopSigninInstallerScm(unready,()=>true)){Refused(()=>service.CreateDisabled(()=>false),"Unverified package registered service");Check(unready.Creates==0,"Unverified readiness reached SCM create");}
   var uncommitted=new Calls();using(var service=new SodaDesktopSigninInstallerScm(uncommitted,()=>true)){service.CreateDisabled(()=>true);Refused(()=>service.EnableManual(()=>false),"Uncommitted installation enabled service");Check(uncommitted.Enables==0,"Uncommitted readiness reached SCM enable");}
   var raced=new Calls();other=new SodaDesktopSigninInstallFiles.Paths(Path.Combine(root,"race-program"),Path.Combine(root,"race-data"),Owner,Guid.NewGuid().ToString("N"));int inspections=0;raced.BeforeInspect=()=>{if(++inspections==2)File.WriteAllText(Path.Combine(other.Slot,"install.transition"),"generated unknown marker");};
   using(var release=SodaDesktopSigninInstallSource.Open(input,Owner,hash))using(var service=new SodaDesktopSigninInstallerScm(raced,()=>true))Refused(()=>SodaDesktopSigninInstaller.InstallCore(release,Owner,other,service,()=>true,Create,(path,acl)=>true,()=>Verify(other.Code,hash),()=>Barrier(other)),"Maintenance marker bypassed before enabling");Check(raced.Enables==0&&File.Exists(Path.Combine(other.Slot,"install.transition")),"Maintenance marker bypassed before enabling");
   Console.WriteLine("signin_installer_generated_fixed_targets_private_files_initial_disabled_manual_and_partial_refusal_passed");
  }finally{Directory.Delete(root,true);}
 }
}
