// Explicit elevated control of the fixed service through Windows SCM.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
public static class SodaDesktopSigninController {
    static Exception Failure(){return new InvalidOperationException("Signin service control is unavailable");}
    static void Require(bool value){if(!value)throw Failure();}
    public static IDictionary<string,object> Run(string action,string owner,string manifest){
        Require(action=="status"||action=="start"||action=="stop");
        Require(SodaDesktopSigninPackageNative.Authority(true)&&Environment.Is64BitProcess&&SodaDesktopSigninVault.UserAccount(owner));
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))
        using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> current=()=>mutex.Current()&&package.Current();
            using(var service=SodaDesktopSigninScm.Open(owner,action!="status",current)){
                if(action=="start"){service.Start(current);service.Wait(true);}
                else if(action=="stop"){
                    var status=service.Query();Require(status.State==4);
                    using(var process=SodaDesktopSigninProcessEvidence.Open(owner,status.Pid,current)){
                        service.Stop(process);service.Wait(false);Require(process.WaitForCleanExit());
                    }
                }
                var observed=service.Query();return new Dictionary<string,object>{{"state",observed.State==4?"running":observed.State==1?"stopped":"pending"},{"exitCode",observed.Exit},{"serviceExitCode",observed.Specific}};
            }
        }
    }
}
