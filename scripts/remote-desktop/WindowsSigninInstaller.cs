// Explicit first installation. Never starts a service, adopts an existing slot,
// upgrades, resets keys/trust or removes unknown partial installation contents.
using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
public static class SodaDesktopSigninInstaller {
    static Exception Failure(){return new InvalidOperationException("Signin installation requires reviewed release bytes, new fixed targets");}
    static void Require(bool value){if(!value)throw Failure();}
    public static IDictionary<string,object> Preview(string source,string owner,string manifest,uint startupType=3){
        Require(startupType==2||startupType==3);
        using(var release=SodaDesktopSigninInstallSource.Open(source,owner,manifest))return new Dictionary<string,object>{{"validated",true},{"ownerSid",owner},{"packageSha256",release.ManifestSha256},{"service",SodaDesktopSigninServicePolicy.Name(owner)},{"startsService",false},{"writesInstalledState",false},{"startupType",startupType==2?"Automatic":"Manual"}};
    }
    public static IDictionary<string,object> Install(string source,string owner,string manifest,uint startupType=3){
        Require(startupType==2||startupType==3);
        Require(Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))
        using(var release=SodaDesktopSigninInstallSource.Open(source,owner,manifest)){
            Func<bool> current=()=>mutex.Current()&&release.Current();
            var paths=SodaDesktopSigninInstallFiles.Paths.Installed(owner,Guid.NewGuid().ToString("N"));
            var parents=new List<SodaDesktopSigninPackageNative.Held>();
            try{
                Require(SodaDesktopSigninInstallFiles.Absent(paths.Code)&&SodaDesktopSigninInstallFiles.Absent(paths.Slot)&&SodaDesktopSigninInstallFiles.Absent(paths.Stage));
                foreach(string parent in new[]{paths.ProgramParent,paths.DataParent}){
                    var directories=new List<string>();for(string path=parent;!String.IsNullOrEmpty(path);path=Path.GetDirectoryName(path))directories.Add(path);
                    directories.Reverse();foreach(string path in directories){
                        Require(current());if(SodaDesktopSigninInstallFiles.Absent(path))SodaDesktopSigninInstallFiles.CreatePrivateDirectory(path);
                        parents.Add(SodaDesktopSigninPackageNative.OpenCore(path,true,false,0,acl=>SodaDesktopSigninQuiescence.StateAncestor(path,acl),null));
                    }
                }
                using(var service=SodaDesktopSigninInstallerScm.Open(owner,current)){
                    Require(service.Absent()&&service.LegacyAbsent());
                    foreach(string path in new[]{paths.Slot,Path.Combine(paths.Slot,"runtime"),paths.Stage})SodaDesktopSigninInstallFiles.CreatePrivateDirectory(path);
                    using(var barrier=SodaDesktopSigninPackageNative.CreatePrivateFile(Path.Combine(paths.Slot,"quiescence.lock"))){barrier.WriteByte(83);barrier.Flush(true);}
                    release.Copy(paths.Stage,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,(path,acl)=>SodaDesktopSigninQuiescence.Private(acl),current,SodaDesktopSigninPackageNative.CreatePrivateFile);
                    Require(current());Directory.Move(paths.Stage,paths.Code);
                    using(var verified=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
                        Func<bool> ready=()=>current()&&verified.Current();
                        service.CreateDisabled(ready);service.Enable(startupType,ready);
                        return new Dictionary<string,object>{{"installed",true},{"started",false},{"service",SodaDesktopSigninServicePolicy.Name(owner)},{"ownerSid",owner},{"packageSha256",manifest},{"startupType",startupType==2?"Automatic":"Manual"}};
                    }
                }
            }finally{SodaDesktopSigninPackageNative.Release(parents);}
        }
    }
}
