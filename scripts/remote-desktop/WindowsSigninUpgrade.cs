// Explicit stopped-service update. Windows SCM and file renames own the
// transition; no run journal, boot witness, receipts or automatic replay.
using System;
using System.IO;
using System.Collections.Generic;
using System.Security.Cryptography;
public static class SodaDesktopSigninUpgrade {
    static void Require(bool value){if(!value)throw new InvalidOperationException("Signin update requires a stopped, verified installation");}
    public static IDictionary<string,object> Run(string owner,string oldHash,string source,string newHash){
        Require(Environment.Is64BitProcess&&SodaDesktopSigninPackageNative.Authority(true)&&SodaDesktopSigninVault.UserAccount(owner));
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))
        using(var release=SodaDesktopSigninInstallSource.Open(source,owner,newHash))
        using(var pin=SodaDesktopSigninQuiescence.Open(owner))using(var exclusive=pin.Exclusive()){
            Func<bool> current=()=>mutex.Current()&&release.Current()&&exclusive.Current();
            var paths=SodaDesktopSigninInstallFiles.Paths.Installed(owner,Guid.NewGuid().ToString("N"));
            bool legacy=SodaDesktopSigninUpgradeScm.LegacyExists(owner);
            using(var service=SodaDesktopSigninUpgradeScm.Open(owner,current,legacy)){
                service.Inspect(false);
                string archive=paths.Code+".previous-"+Guid.NewGuid().ToString("N");
                using(var installed=SodaDesktopSigninPackageNative.OpenCore(paths.Code,true,true,0,acl=>SodaDesktopSigninPackage.CodeAcl(acl,true),null))
                using(var manifest=SodaDesktopSigninPackageNative.OpenCore(Path.Combine(paths.Code,"signin-package.json"),false,true,32768,acl=>SodaDesktopSigninPackage.CodeAcl(acl,true),null)){
                    // Old code is archived, never executed. Bind the operator's
                    // reviewed old manifest bytes without retaining its schema.
                    using(var sha=SHA256.Create())Require(BitConverter.ToString(sha.ComputeHash(manifest.Stream)).Replace("-","").ToLowerInvariant()==oldHash);
                    Require(current());
                    SodaDesktopSigninInstallFiles.CreatePrivateDirectory(paths.Stage);
                    release.Copy(paths.Stage,SodaDesktopSigninInstallFiles.CreatePrivateDirectory,(path,acl)=>SodaDesktopSigninQuiescence.Private(acl),()=>current(),SodaDesktopSigninPackageNative.CreatePrivateFile);
                    service.Disable(()=>current());
                }
                // The protected data slot is deliberately untouched: identity,
                // trust, enrollment and historical records keep their bytes.
                Require(current());Directory.Move(paths.Code,archive);
                Require(current());Directory.Move(paths.Stage,paths.Code);
                using(var published=SodaDesktopSigninPackageNative.VerifyController(owner,newHash)){
                    Func<bool> verified=()=>current()&&published.Current();Require(verified());
                    if(legacy){
                        using(var replacement=SodaDesktopSigninInstallerScm.Open(owner,verified)){
                            replacement.CreateDisabled(verified);
                            service.DeleteLegacy();
                            replacement.EnableManual(verified);
                        }
                    }else service.Manual(verified);
                    Require(verified());
                    return new Dictionary<string,object>{{"state","upgraded"},{"started",false},{"service",SodaDesktopSigninServicePolicy.Name(owner)},{"packageSha256",newHash},{"oldPackageSha256",oldHash},{"codeArchive",archive},{"legacyServiceMigrated",legacy}};
                }
            }
        }
    }
}
