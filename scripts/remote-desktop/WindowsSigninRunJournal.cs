// Fixed lifecycle namespace. These transitions require an independently held
// controller/Host boundary. This class never creates a directory, grants rights,
// observes a process, or infers that an empty directory means never-started.
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

internal sealed class SodaDesktopSigninRunJournal : IDisposable {
    internal enum Role { Host, Controller, Observer, Installer, Reader }
    readonly object gate=new object();readonly string directory,owner,package,barrier;
    readonly Role role;readonly Func<bool> scope;readonly Func<byte[],bool> policy;
    readonly List<SodaDesktopSigninPackageNative.Held> ancestors;readonly Func<string,byte[],bool> ancestorPolicy;
    readonly Func<IDisposable> enter;IDisposable shared;bool ended,checking,busy;internal Action AfterStageClosed=null;
    static readonly string[] Names={"initial","intent.pending","intent.claimed","started","observation","stopped","stop-observed"};
    static Exception Failure(){return new InvalidOperationException("Signin run journal is unavailable");}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]
    static extern bool MoveFileExW(string from,string to,uint flags);
    internal SodaDesktopSigninRunJournal(string directory,string owner,string package,string barrier,Role role,Func<bool> scope,Func<byte[],bool> policy,IEnumerable<string> parents,Func<string,byte[],bool> ancestorPolicy=null,Func<IDisposable> enter=null){
        this.enter=enter??(()=>new EmptyLease());this.directory=directory;this.owner=SodaDesktopSigninVault.Owner(owner);this.package=package;this.barrier=barrier;this.role=role;this.scope=scope;this.policy=policy;this.ancestorPolicy=ancestorPolicy??((path,bytes)=>policy(bytes));
        ancestors=new List<SodaDesktopSigninPackageNative.Held>();
        try{if(String.IsNullOrEmpty(directory)||!Path.IsPathRooted(directory)||scope==null||policy==null||parents==null)throw Failure();
            foreach(string parent in parents){if(ancestors.Count>=64)throw Failure();ancestors.Add(SodaDesktopSigninPackageNative.OpenCore(parent,true,true,0,bytes=>this.ancestorPolicy(parent,bytes),null));}
            ancestors.Add(SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,policy,null));Current();
        }catch{Dispose();throw;}
    }
    void Current(){
        if(ended||checking){ended=true;throw Failure();}checking=true;
        try{if(!scope()||ended)throw Failure();foreach(var item in ancestors)SodaDesktopSigninPackageNative.CheckCore(item,bytes=>ancestorPolicy(item.Path,bytes));if(!scope()||ended)throw Failure();}
        catch{ended=true;throw;}finally{checking=false;}
    }
    sealed class EmptyLease:IDisposable {public void Dispose(){}}
    void Begin(Role required){Current();if(busy||role!=required){ended=true;throw Failure();}try{shared=enter();if(shared==null)throw Failure();Current();busy=true;}catch{var acquired=shared;shared=null;if(acquired!=null)acquired.Dispose();throw;}}
    void End(){var acquired=shared;shared=null;try{if(acquired!=null)acquired.Dispose();}finally{busy=false;}}

    string PathOf(string name){return Path.Combine(directory,name);}
    string[] Inventory(){Current();string[] files=Directory.GetFileSystemEntries(directory);if(files.Length>12)throw Failure();var names=new List<string>();foreach(string path in files){string name=Path.GetFileName(path);if(Array.IndexOf(Names,name)<0)throw Failure();names.Add(name);}names.Sort(StringComparer.Ordinal);Current();return names.ToArray();}
    static bool Has(string[] names,string name){return Array.IndexOf(names,name)>=0;}
    SodaDesktopSigninRunRecord Read(string name,string kind,string run=null){
        Current();using(var file=SodaDesktopSigninPackageNative.OpenRenamableCore(PathOf(name),16384,policy))return ReadOpened(file,kind,run);
    }
    SodaDesktopSigninRunRecord ReadOpened(SodaDesktopSigninPackageNative.Held file,string kind,string run=null){
        Current();int size=checked((int)file.Before.Value.SizeLow);byte[] bytes=new byte[size];
        try{file.Stream.Position=0;int at=0;while(at<size){Current();int n=file.Stream.Read(bytes,at,size-at);if(n==0)throw Failure();at+=n;}if(file.Stream.ReadByte()!=-1)throw Failure();SodaDesktopSigninPackageNative.CheckCore(file,policy);Current();var record=SodaDesktopSigninRunRecord.Unprotect(bytes,owner,kind,run);Match(record);return record;}
        finally{Array.Clear(bytes,0,bytes.Length);}
    }
    void Match(SodaDesktopSigninRunRecord record){if(record==null||record.Owner!=owner||(string)record.Field("packageSha256")!=package||(string)record.Field("barrierSha256")!=barrier)throw Failure();}
    sealed class Snapshot {
        internal string State;internal string[] Names;internal SodaDesktopSigninRunRecord Initial,Intent,Started,Ack,Stopped,Observed;
    }
    Snapshot Inspect(){using(var lease=enter()){if(lease==null)throw Failure();return InspectLocked();}}
    Snapshot InspectLocked(){
        var s=new Snapshot{Names=Inventory(),State="recovery"};
        if(s.Names.Length==1&&Has(s.Names,"initial")){s.Initial=Read("initial","initial");s.State="initial";return s;}
        if(s.Names.Length==1&&Has(s.Names,"intent.pending")){s.Intent=Read("intent.pending","intent");s.State="pending";return s;}
        if(!Has(s.Names,"intent.claimed")||Has(s.Names,"initial")||Has(s.Names,"intent.pending"))return s;
        s.Intent=Read("intent.claimed","intent");s.State="claimed";int count=1;
        if(Has(s.Names,"started")){
            s.Started=Read("started","started",s.Intent.RunId);count++;
            if(!s.Intent.SameRun(s.Started)||(string)s.Started.Field("intentSha256")!=s.Intent.Digest()||(long)s.Started.Field("startedAt")<(long)s.Intent.Field("issuedAt")||(long)s.Started.Field("startedAt")>=(long)s.Intent.Field("expiresAt"))throw Failure();s.State="started";
            if(Has(s.Names,"observation")){
                s.Ack=Read("observation","observation",s.Intent.RunId);count++;
                if(!s.Started.SameProcess(s.Ack)||(string)s.Ack.Field("startedSha256")!=s.Started.Digest())throw Failure();s.State="observed";
                if(Has(s.Names,"stopped")){
                    s.Stopped=Read("stopped","stopped",s.Intent.RunId);count++;
                    if(!s.Started.SameProcess(s.Stopped)||(string)s.Stopped.Field("startedSha256")!=s.Started.Digest()||(long)s.Stopped.Field("stoppedAt")<(long)s.Started.Field("startedAt"))throw Failure();s.State="stopped";
                    if(Has(s.Names,"stop-observed")){
                        s.Observed=Read("stop-observed","observed-stop",s.Intent.RunId);count++;
                        if(!s.Stopped.SameProcess(s.Observed)||(string)s.Observed.Field("stoppedSha256")!=s.Stopped.Digest()||(long)s.Observed.Field("observedAt")<(long)s.Stopped.Field("stoppedAt"))throw Failure();s.State="complete";
                    }
                }
            }
        }
        if(count!=s.Names.Length)s.State="recovery";Current();return s;
    }
    internal void VerifyCurrent(){lock(gate){if(busy)throw Failure();Current();}}
    internal SodaDesktopSigninRunRecord StartedRecord(){lock(gate){if(busy)throw Failure();var s=Inspect();if(s.Started==null||s.State=="recovery")throw Failure();return s.Started;}}
    internal SodaDesktopSigninRunRecord StopRecord(){lock(gate){if(busy)throw Failure();var s=Inspect();if(s.Stopped==null||s.State!="stopped"&&s.State!="complete")throw Failure();return s.Stopped;}}
    internal string State(){lock(gate){if(busy)throw Failure();return Inspect().State;}}
    void Publish(string name,SodaDesktopSigninRunRecord record){
        Match(record);byte[] bytes=record.Protect();string stage=name+".writing";
        try{
            SodaDesktopSigninVault.FileFacts written;Current();using(var file=new FileStream(PathOf(stage),FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(bytes,0,bytes.Length);Current();file.Flush(true);written=SodaDesktopSigninVault.Facts(file.SafeFileHandle);}
            if(AfterStageClosed!=null)AfterStageClosed();
            // Private parent denies untrusted creation; re-open the new file with
            // no-follow, private ACL, single-link and identity checks before rename.
            using(var file=SodaDesktopSigninPackageNative.OpenRenamableCore(PathOf(stage),16384,policy)){
                if(!written.Same(SodaDesktopSigninVault.Facts(file.Handle))||ReadOpened(file,record.Kind,record.RunId).Digest()!=record.Digest())throw Failure();Current();if(!MoveFileExW(PathOf(stage),PathOf(name),8))throw Failure();SodaDesktopSigninPackageNative.CheckCore(file,policy);
                using(var final=SodaDesktopSigninPackageNative.OpenRenamableCore(PathOf(name),16384,policy))if(!file.Before.Same(final.Before,false,16384))throw Failure();Current();
            }
        }finally{Array.Clear(bytes,0,bytes.Length);}
    }
    // Installer only, with a separately established never-installed boundary.
    // Never exposed by the Host/controller factories or automatically invoked.
    internal void Initialize(SodaDesktopSigninRunRecord initial){lock(gate){Begin(Role.Installer);try{if(initial==null||initial.Kind!="initial"||Inventory().Length!=0)throw Failure();Publish("initial",initial);}finally{End();}}}
    static SodaDesktopSigninRunRecord Expected(Snapshot s,string name){
        switch(name){case "initial":return s.Initial;case "intent.claimed":return s.Intent;case "started":return s.Started;case "observation":return s.Ack;case "stopped":return s.Stopped;case "stop-observed":return s.Observed;default:throw Failure();}
    }
    internal void Prepare(SodaDesktopSigninRunRecord intent){lock(gate){Begin(Role.Controller);try{
        Match(intent);if(intent.Kind!="intent")throw Failure();var s=Inspect();var previous=s.State=="initial"?s.Initial:s.State=="complete"?s.Observed:null;
        if(previous==null||previous.RunId==intent.RunId)throw Failure();
        // Durable marker precedes deletion. Any interrupted transition remains
        // recovery, including after all old files have gone; no automatic replay.
        byte[] envelope=intent.Protect(),marker=Encoding.ASCII.GetBytes(previous.Digest()+"\n"+intent.Digest()+"\n");var originals=new List<SodaDesktopSigninPackageNative.Held>();
        try{foreach(string name in s.Names){var expected=Expected(s,name);var file=SodaDesktopSigninPackageNative.OpenRenamableCore(PathOf(name),16384,policy);originals.Add(file);if(ReadOpened(file,expected.Kind,expected.RunId).Digest()!=expected.Digest())throw Failure();}
            Current();using(var transition=new FileStream(PathOf("transition"),FileMode.CreateNew,FileAccess.Write,FileShare.None)){transition.Write(marker,0,marker.Length);transition.Write(envelope,0,envelope.Length);transition.Flush(true);}Current();
            foreach(var file in originals){SodaDesktopSigninPackageNative.CheckCore(file,policy);Current();File.Delete(file.Path);}Current();Publish("intent.pending",intent);Current();File.Delete(PathOf("transition"));Current();
        }finally{SodaDesktopSigninPackageNative.Release(originals);Array.Clear(envelope,0,envelope.Length);Array.Clear(marker,0,marker.Length);}
    }finally{End();}}}
    internal SodaDesktopSigninRunRecord Claim(Func<SodaDesktopSigninRunRecord,bool> mode){lock(gate){Begin(Role.Host);try{
        var s=Inspect();if(s.State!="pending"||mode==null||!mode(s.Intent))throw Failure();Current();
        using(var pending=SodaDesktopSigninPackageNative.OpenRenamableCore(PathOf("intent.pending"),16384,policy)){
            if(ReadOpened(pending,"intent",s.Intent.RunId).Digest()!=s.Intent.Digest())throw Failure();Current();
            if(!MoveFileExW(PathOf("intent.pending"),PathOf("intent.claimed"),8))throw Failure();SodaDesktopSigninPackageNative.CheckCore(pending,policy);
            using(var claimed=SodaDesktopSigninPackageNative.OpenRenamableCore(PathOf("intent.claimed"),16384,policy))if(!pending.Before.Same(claimed.Before,false,16384))throw Failure();
        }Current();return s.Intent;
    }finally{End();}}}
    internal void Started(SodaDesktopSigninRunRecord value){lock(gate){Begin(Role.Host);try{var s=Inspect();if(s.State!="claimed"||value.Kind!="started"||!s.Intent.SameRun(value)||(string)value.Field("intentSha256")!=s.Intent.Digest()||(long)value.Field("startedAt")<(long)s.Intent.Field("issuedAt")||(long)value.Field("startedAt")>=(long)s.Intent.Field("expiresAt"))throw Failure();Publish("started",value);}finally{End();}}}
    // Narrow publication while Host holds its barrier reader. The controller
    // callback must retain the independently verified exact process handle.
    internal void Observation(SodaDesktopSigninRunRecord value){lock(gate){Begin(Role.Observer);try{var s=Inspect();if(s.State!="started"||value.Kind!="observation"||!s.Started.SameProcess(value)||(string)value.Field("startedSha256")!=s.Started.Digest())throw Failure();Publish("observation",value);}finally{End();}}}
    internal SodaDesktopSigninRunRecord Observation(){lock(gate){if(busy)throw Failure();Current();if(role!=Role.Host)throw Failure();var s=Inspect();if(s.State!="observed")throw Failure();return s.Ack;}}
    internal void Stopped(SodaDesktopSigninRunRecord value){lock(gate){Begin(Role.Host);try{var s=Inspect();if(s.State!="observed"||value.Kind!="stopped"||!s.Started.SameProcess(value)||(string)value.Field("startedSha256")!=s.Started.Digest()||(long)value.Field("stoppedAt")<(long)s.Started.Field("startedAt"))throw Failure();Publish("stopped",value);}finally{End();}}}
    internal void ObservedStop(SodaDesktopSigninRunRecord value){lock(gate){Begin(Role.Controller);try{var s=Inspect();if(s.State!="stopped"||value.Kind!="observed-stop"||!s.Stopped.SameProcess(value)||(string)value.Field("stoppedSha256")!=s.Stopped.Digest()||(long)value.Field("observedAt")<(long)s.Stopped.Field("stoppedAt"))throw Failure();Publish("stop-observed",value);}finally{End();}}}
    public void Dispose(){lock(gate){ended=true;SodaDesktopSigninPackageNative.Release(ancestors);}}
}
