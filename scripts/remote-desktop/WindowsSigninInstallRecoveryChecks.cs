using System;
using System.IO;
using System.Collections.Generic;
using System.Security.AccessControl;
using System.Security.Cryptography;
public static class SodaDesktopSigninInstallRecoveryChecks {
    const string Owner="S-1-5-21-1-2-3-1001";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}catch(IOException){failed=true;}Check(failed,message);}
    static byte[] Acl(string sddl){var d=new RawSecurityDescriptor(sddl);var bytes=new byte[d.BinaryLength];d.GetBinaryForm(bytes,0);return bytes;}
    sealed class State {internal bool Exists,Disabled=true,Secured,Running,BadConfig;internal int Secures,Manuals;internal Action OnSecure,OnManual;}
    sealed class Crash:SodaDesktopSigninInstallerScm.Calls {
        readonly State state;internal Crash(State state){this.state=state;}
        public bool Absent(){return !state.Exists;}
        public void CreateDisabled(){state.Exists=true;throw new InvalidOperationException("Generated interruption after SCM registration");}
        public void InspectDisabled(){throw new InvalidOperationException("Generated crash did not interrupt");}
        public void EnableManual(){throw new InvalidOperationException("Generated partial install became manual");}
        public void InspectManual(){throw new InvalidOperationException("Generated partial install became manual");}
        public void Dispose(){}
    }
    sealed class Service:SodaDesktopSigninInstallRecovery.Calls,SodaDesktopSigninInitialRecovery.Calls {
        readonly State state;internal Service(State state){this.state=state;}
        public void InspectInitialDisabled(){Check(state.Exists&&state.Disabled&&!state.BadConfig,"Generated initial configuration changed");}
        public void InspectStrictDisabled(){InspectInitialDisabled();Check(state.Secured,"Generated strict ACL missing");}
        public void InspectDisabled(){InspectStrictDisabled();}
        public bool Stopped(){return !state.Running;}
        public void Secure(){state.Secures++;state.Secured=true;if(state.OnSecure!=null)state.OnSecure();}
        public void Manual(){state.Manuals++;if(state.OnManual!=null)state.OnManual();state.Disabled=false;}
        public void InspectManual(){Check(!state.Disabled&&state.Secured&&!state.BadConfig,"Generated manual configuration changed");}
        public void Dispose(){}
    }
    sealed class Fixture:IDisposable {
        internal readonly string Root,Manifest;internal readonly SodaDesktopSigninInstallFiles.Paths Paths;internal readonly State State=new State();internal bool Current=true;
        internal Fixture(){Root=Path.Combine(Path.GetTempPath(),"sr-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(Root);
            string input=Path.Combine(Root,"s");Manifest=SodaDesktopSigninInstallSourceChecks.Make(input);Paths=new SodaDesktopSigninInstallFiles.Paths(Path.Combine(Root,"p"),Path.Combine(Root,"d"),Owner,Guid.NewGuid().ToString("N"));
            using(var source=SodaDesktopSigninInstallSource.Open(input,Owner,Manifest))using(var scm=new SodaDesktopSigninInstallerScm(new Crash(State),()=>true))
                Refused(()=>SodaDesktopSigninInstaller.InstallCore(source,Owner,Paths,scm,()=>true,p=>Directory.CreateDirectory(p),(p,a)=>true,()=>Verified(),()=>Barrier(),p=>new FileStream(p,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None)),"Generated install did not interrupt");
            Check(State.Exists&&State.Disabled&&File.Exists(Marker)&&File.Exists(Path.Combine(Paths.Slot,"runs","initial")),"Generated initial partial state is incomplete");
        }
        internal string Marker{get{return Path.Combine(Paths.Slot,"install.transition");}}
        internal string MarkerHash{get{using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(Marker))).Replace("-","").ToLowerInvariant();}}
        internal SodaDesktopSigninInstaller.Verified Verified(){var source=SodaDesktopSigninInstallSource.Open(Paths.Code,Owner,Manifest);return new SodaDesktopSigninInstaller.Verified(source,source.Current);}
        internal SodaDesktopSigninQuiescence.Pin Barrier(){return SodaDesktopSigninQuiescence.OpenCore(Path.Combine(Paths.Slot,"quiescence.lock"),new[]{Paths.Slot},(p,a)=>true);}
        internal IDictionary<string,object> Run(bool complete,string hash=null,string owner=null,string manifest=null){using(var source=Verified())using(var service=new Service(State))return SodaDesktopSigninInstallRecovery.Core(owner??Owner,manifest??Manifest,Paths.Slot,hash??MarkerHash,complete,service,()=>Current&&source.Current(),()=>Barrier(),(p,a)=>true);}
        internal void RestoreMarkerFreeInitial(){using(var source=Verified())using(var service=new Service(State))SodaDesktopSigninInitialRecovery.Core(Owner,Manifest,Paths.Slot,service,()=>Current&&source.Current(),()=>Barrier(),(p,a)=>true);}
        public void Dispose(){Directory.Delete(Root,true);}
    }
    static void InitialPolicy(){
        var original=Acl("O:BAG:BAD:(A;;0x201fd;;;SY)(A;;GA;;;BA)(A;;0x2018d;;;IU)");
        Check(SodaDesktopSigninServicePolicy.InitialAcl(original)&&!SodaDesktopSigninServicePolicy.Acl(original),"Initial-only ACL leaked into ordinary service policy");
        foreach(uint access in new uint[]{2,16,32,64,0x10000,0x40000,0x80000,0x10000000})
            Check(!SodaDesktopSigninServicePolicy.InitialAcl(Acl("O:BAG:BAD:(A;;GA;;;SY)(A;;GA;;;BA)(A;;0x"+access.ToString("x")+";;;IU)")),"Initial ACL granted unprivileged service mutation");
        Check(!SodaDesktopSigninServicePolicy.InitialAcl(Acl("O:S-1-5-21-1-2-3-1001G:BAD:(A;;GA;;;SY)(A;;GA;;;BA)")),"Initial service accepted an unprivileged owner");
    }
    public static void Run(){
        InitialPolicy();
        using(var f=new Fixture()){
            string hash=f.MarkerHash;var inspected=f.Run(false);Check((string)inspected["markerSha256"]==hash&&f.State.Secures==0&&f.State.Manuals==0&&File.Exists(f.Marker),"Inspect changed initial installation");
            var result=f.Run(true,hash);Check((string)result["state"]=="initial-install-completed"&&!(bool)result["started"]&&f.State.Secures==1&&f.State.Manuals==1&&!File.Exists(f.Marker),"Initial completion did not preserve order");
            Check(Directory.GetFileSystemEntries(Path.Combine(f.Paths.Slot,"admin")).Length==0&&Directory.GetFileSystemEntries(Path.Combine(f.Paths.Slot,"runtime")).Length==0,"Completion created identity or runtime data");
            Refused(()=>f.Run(true,hash),"Completed installation was replayed");
        }
        foreach(string mode in new[]{"hash","owner","package","schema","marker-directory","admin","runtime","runs","running","configuration","scope"})using(var f=new Fixture()){
            string hash=f.MarkerHash,owner=Owner,package=f.Manifest;
            if(mode=="hash")hash=new string('e',64);if(mode=="owner")owner="S-1-5-21-1-2-3-1002";if(mode=="package")package=new string('f',64);
            if(mode=="schema")File.WriteAllText(f.Marker,File.ReadAllText(f.Marker).Replace("\"initial\"","\"other\""));
            if(mode=="marker-directory"){File.Delete(f.Marker);Directory.CreateDirectory(f.Marker);}
            if(mode=="admin"||mode=="runtime"||mode=="runs")File.WriteAllText(Path.Combine(f.Paths.Slot,mode,"generated-unknown"),"generated");
            if(mode=="running")f.State.Running=true;if(mode=="configuration")f.State.BadConfig=true;if(mode=="scope")f.Current=false;
            Refused(()=>f.Run(true,hash,owner,package),"Unsafe initial evidence was accepted: "+mode);Check(f.State.Secures==0&&f.State.Manuals==0&&f.State.Disabled,"Rejected initial evidence changed service: "+mode);
        }
        foreach(string mode in new[]{"scope","admin","configuration"})using(var f=new Fixture()){
            string hash=f.MarkerHash;f.State.OnSecure=()=>{if(mode=="scope")f.Current=false;if(mode=="admin")File.WriteAllText(Path.Combine(f.Paths.Slot,"admin","generated-unknown"),"generated");if(mode=="configuration")f.State.BadConfig=true;};
            Refused(()=>f.Run(true,hash),"Post-ACL evidence was ignored");Check(f.State.Secures==1&&f.State.Manuals==0&&File.Exists(f.Marker)&&f.State.Disabled,"Post-ACL failure cleared marker or enabled service");
        }
        using(var f=new Fixture()){
            string hash=f.MarkerHash;f.State.OnManual=()=>{throw new InvalidOperationException("Generated interruption before manual setting");};
            Refused(()=>f.Run(true,hash),"Manual-setting interruption was accepted");Check(!File.Exists(f.Marker)&&f.State.Disabled,"Manual-setting failure lost its recovery boundary");
            f.State.OnManual=null;f.RestoreMarkerFreeInitial();Check(!f.State.Disabled,"Existing marker-free initial recovery could not continue");
        }
        Console.WriteLine("signin_install_completion_generated_marker_binding_initial_only_stopped_acl_order_and_no_reset_passed");
    }
}
