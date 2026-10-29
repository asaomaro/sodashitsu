// Explicit first installation. Never starts a service, adopts an existing slot,
// upgrades, resets keys/trust or removes unknown partial installation contents.
using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
public static class SodaDesktopSigninInstaller {
    static Exception Failure(){return new InvalidOperationException("Signin installation requires reviewed release bytes, new fixed targets or explicit recovery");}
    static void Require(bool value){if(!value)throw Failure();}
    public static IDictionary<string,object> Preview(string source,string owner,string manifest){
        using(var release=SodaDesktopSigninInstallSource.Open(source,owner,manifest))return new Dictionary<string,object>{{"validated",true},{"ownerSid",owner},{"packageSha256",release.ManifestSha256},{"service",SodaDesktopSigninServicePolicy.Name(owner)},{"startsService",false},{"writesInstalledState",false}};
    }
    public static IDictionary<string,object> Install(string source,string owner,string manifest){
        Require(Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));var timer=Stopwatch.StartNew();
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var release=SodaDesktopSigninInstallSource.Open(source,owner,manifest)){
            Func<bool> authority=()=>timer.ElapsedMilliseconds<300000&&mutex.Current()&&SodaDesktopSigninPackageNative.Authority(true);
            using(var service=SodaDesktopSigninInstallerScm.Open(owner,authority)){
                var paths=SodaDesktopSigninInstallFiles.Paths.Installed(owner,Guid.NewGuid().ToString("N"));
                Func<string,byte[],bool> policy=(path,acl)=>Within(paths.Slot,path)||Within(paths.Code,path)||Within(paths.Stage,path)?SodaDesktopSigninQuiescence.Private(acl):SodaDesktopSigninPackage.CodeAcl(acl,false);
                return InstallCore(release,owner,paths,service,authority,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,policy,
                    ()=>Verify(owner,manifest),()=>SodaDesktopSigninQuiescence.Open(owner),SodaDesktopSigninPackageNative.CreatePrivateFile);
            }
        }
    }
    internal sealed class Verified:IDisposable {readonly IDisposable lease;readonly Func<bool> current;internal Verified(IDisposable lease,Func<bool> current){this.lease=lease;this.current=current;}internal bool Current(){return current!=null&&current();}public void Dispose(){if(lease!=null)lease.Dispose();}}
    static Verified Verify(string owner,string manifest){var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest);return new Verified(package,package.Current);}
    static bool Within(string root,string path){return String.Equals(root,path,StringComparison.OrdinalIgnoreCase)||path.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);}
    // Filesystem/SCM factories are separate ordinary-test seams; public Install
    // always derives fixed locations and native primary-admin/private policies.
    internal static IDictionary<string,object> InstallCore(SodaDesktopSigninInstallSource source,string owner,SodaDesktopSigninInstallFiles.Paths paths,SodaDesktopSigninInstallerScm service,Func<bool> authority,Action<string> createPrivate,Func<string,byte[],bool> policy,Func<Verified> verifyPublished,Func<SodaDesktopSigninQuiescence.Pin> barrier,Func<string,FileStream> createFile=null){
        Require(source!=null&&paths!=null&&service!=null&&authority!=null&&authority()&&source.Current()&&service.Absent());string id=Guid.NewGuid().ToString("D");
        Func<bool> copying=()=>authority()&&source.Current()&&service.Absent();using(var files=SodaDesktopSigninInstallFiles.Prepare(paths,owner,id,source.ManifestSha256,createPrivate,policy,()=>authority()&&source.Current(),createFile)){
            source.Copy(paths.Stage,createPrivate,policy,()=>copying()&&files.Current(),createFile);Require(copying());files.Publish();
            // Package verification is retained until registration/manual policy
            // is complete; this never executes any source/copy program.
            using(var verified=verifyPublished())using(var pin=barrier())using(var exclusive=pin.Exclusive()){
                Require(verified!=null&&verified.Current()&&exclusive.Current());string fingerprint=exclusive.Fingerprint;Func<bool> preparing=()=>authority()&&verified.Current()&&files.Current()&&exclusive.Current()&&exclusive.Fingerprint==fingerprint;
                var initial=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",source.ManifestSha256},{"barrierSha256",fingerprint},{"createdAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}};
                using(var journal=new SodaDesktopSigninRunJournal(Path.Combine(paths.Slot,"runs"),owner,source.ManifestSha256,fingerprint,SodaDesktopSigninRunJournal.Role.Installer,preparing,acl=>policy(paths.Slot,acl),new string[0],createFile:createFile))journal.Initialize(SodaDesktopSigninRunRecord.Build(initial,owner));
                service.CreateDisabled(()=>preparing()&&InitialCurrent(paths,owner,source.ManifestSha256,fingerprint,preparing,policy));
                files.ClearMarker();service.EnableManual(()=>preparing()&&files.MarkerCleared&&InitialCurrent(paths,owner,source.ManifestSha256,fingerprint,preparing,policy));
                Require(preparing()&&files.MarkerCleared);return new Dictionary<string,object>{{"installed",true},{"started",false},{"service",SodaDesktopSigninServicePolicy.Name(owner)},{"ownerSid",owner},{"packageSha256",source.ManifestSha256}};
            }
        }
    }
    static bool InitialCurrent(SodaDesktopSigninInstallFiles.Paths paths,string owner,string manifest,string fingerprint,Func<bool> current,Func<string,byte[],bool> policy){using(var journal=new SodaDesktopSigninRunJournal(Path.Combine(paths.Slot,"runs"),owner,manifest,fingerprint,SodaDesktopSigninRunJournal.Role.Reader,current,acl=>policy(paths.Slot,acl),new string[0]))return journal.State()=="initial";}
}
