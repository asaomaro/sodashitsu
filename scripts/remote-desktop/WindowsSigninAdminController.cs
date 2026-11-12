// Explicit elevated local command. The fixed SYSTEM service owns all writes.
using System;
using System.Collections.Generic;
using System.IO.Pipes;
using System.Security.Principal;
using System.Text;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninAdminController {
    public static object Run(string owner,string manifest,byte[] operation){
        if(operation==null||operation.Length<1||operation.Length>16384||!SodaDesktopSigninPackageNative.Authority(true)||!SodaDesktopSigninVault.UserAccount(owner))throw new InvalidOperationException("Signin administration is unavailable");
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> current=()=>mutex.Current()&&package.Current();
            using(var service=SodaDesktopSigninScm.Open(owner,true,current)){
                if(service.Query().State!=1)throw new InvalidOperationException("Stop the signin service before administration");
                using(var pin=SodaDesktopSigninQuiescence.Open(owner))using(var exclusive=pin.Exclusive())if(!exclusive.Current())throw new InvalidOperationException("Signin administration is unavailable");
                service.Start(current,true);service.Wait(true);
                var status=service.Query();
                using(var process=SodaDesktopSigninProcessEvidence.Open(owner,status.Pid,current)){
                    byte[] response;
                    using(var pipe=new NamedPipeClientStream(".",SodaDesktopSigninAdminPipe.Name(owner),PipeDirection.InOut,PipeOptions.None,TokenImpersonationLevel.Impersonation)){
                        pipe.Connect(10000);SodaDesktopSigninAdminPipe.AuthenticateServer(pipe,process.Process.Pid);
                        if(!process.Current()||service.Query().Pid!=process.Process.Pid)throw new InvalidOperationException("Signin administration is unavailable");
                        SodaDesktopSigninAdminPipe.Write(pipe,operation);response=SodaDesktopSigninAdminPipe.Read(pipe);
                    }
                    try{
                        service.Wait(false);if(!process.WaitForCleanExit())throw new InvalidOperationException("Signin administration is incomplete");
                        return new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=8}.DeserializeObject(new UTF8Encoding(false,true).GetString(response));
                    }finally{Array.Clear(response,0,response.Length);}
                }
            }
        }
    }
}
