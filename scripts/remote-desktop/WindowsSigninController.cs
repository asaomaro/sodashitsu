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
    public static IDictionary<string,object> Run(string action,string owner,string manifest,string mode,string nonce,string digest){
        if(nonce=="")nonce=null;if(digest=="")digest=null;
        Require((action=="status"||action=="start"||action=="stop")&&(mode=="normal"||mode=="admin")&&(action=="start"||mode=="normal"&&nonce==null&&digest==null));
        Require(SodaDesktopSigninPackageNative.Authority(true)&&Environment.Is64BitProcess&&SodaDesktopSigninVault.UserAccount(owner));
        using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))
        using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> current=()=>mutex.Current()&&package.Current();
            using(var service=SodaDesktopSigninScm.Open(owner,action!="status",current)){
                var status=service.Query();
                if(action=="status")return Result(status);
                if(action=="start"){
                    using(var barrier=SodaDesktopSigninQuiescence.Open(owner))using(var exclusive=barrier.Exclusive()){
                        Require(current()&&exclusive.Current()&&Mode(owner,mode,nonce,digest));
                    }
                    service.Start(()=>current()&&Mode(owner,mode,nonce,digest));
                    Wait(()=>{var observed=service.Query();return observed.State==4||observed.State==1;},current);
                    if(mode=="normal"){status=service.Query();Require(status.State==4);return Result(status);}
                }
                status=service.Query();
                if(action=="start"&&status.State==1){Require(status.Clean);return Result(status);}
                Require(status.State==4);
                using(var process=SodaDesktopSigninProcessEvidence.Open(owner,status.Pid,current)){
                    if(action=="stop")service.Stop(process);
                    Wait(()=>service.Query().State==1,current);
                    uint code;Wait(()=>process.Exited(out code),current);
                    Require(process.CleanExit());return Result(service.Query());
                }
            }
        }
    }
    static IDictionary<string,object> Result(SodaDesktopSigninScm.Status status){return new Dictionary<string,object>{{"state",status.State==4?"running":status.State==1?"stopped":"pending"},{"exitCode",status.Exit},{"serviceExitCode",status.Specific}};}
    static void Wait(Func<bool> done,Func<bool> current){var clock=Stopwatch.StartNew();while(!done()){Require(current()&&clock.ElapsedMilliseconds<90000);Thread.Sleep(25);}Require(current());}
    static bool Mode(string owner,string mode,string nonce,string digest){
        string directory=Path.Combine(SodaDesktopSigninVault.StateDirectory(owner),"admin");
        using(var parent=SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,SodaDesktopSigninQuiescence.Private,null)){
            var files=Directory.GetFileSystemEntries(directory);
            if(mode=="normal")return nonce==null&&digest==null&&files.Length==0;
            string path=Path.Combine(directory,"admin.pending");if(files.Length!=1||!String.Equals(files[0],path,StringComparison.OrdinalIgnoreCase))return false;
            using(var file=SodaDesktopSigninPackageNative.OpenCore(path,false,true,65536,SodaDesktopSigninQuiescence.Private,null)){
                byte[] bytes=new byte[file.Stream.Length];try{
                    int read=0;while(read<bytes.Length){int count=file.Stream.Read(bytes,read,bytes.Length-read);if(count==0)return false;read+=count;}
                    using(var envelope=SodaDesktopSigninAdminEnvelope.Decode(bytes,owner))using(var sha=SHA256.Create())return envelope.Nonce==nonce&&BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant()==digest;
                }finally{Array.Clear(bytes,0,bytes.Length);}
            }
        }
    }
}
