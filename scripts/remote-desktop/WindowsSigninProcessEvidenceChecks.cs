using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
public static class SodaDesktopSigninProcessEvidenceChecks {
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action action,string message){bool refused=false;try{action();}catch(InvalidOperationException){refused=true;}Check(refused,message);}
    public static void Run(string executable){
        using(var self=Process.GetCurrentProcess()){
            uint pid=(uint)self.Id;string created=self.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(System.Globalization.CultureInfo.InvariantCulture),image=self.MainModule.FileName;
            using(var pin=SodaDesktopSigninProcessEvidence.OpenCore(pid,created,image,false,()=>true)){
                Check(pin.Current()&&!pin.CleanExit(),"Live generated process became clean exit");pin.Dispose();Check(!pin.Current()&&!pin.CleanExit(),"Disposed process pin retained evidence");
            }
            Refused(()=>{using(var pin=SodaDesktopSigninProcessEvidence.OpenCore(pid,"1",image,false,()=>true)){}} ,"Creation mismatch retained process pin");
            Refused(()=>{using(var pin=SodaDesktopSigninProcessEvidence.OpenCore(pid,created,image+".wrong",false,()=>true)){}} ,"Image mismatch retained process pin");
            using(var identity=System.Security.Principal.WindowsIdentity.GetCurrent())if(!identity.IsSystem)Refused(()=>{using(var pin=SodaDesktopSigninProcessEvidence.OpenCore(pid,created,image,true,()=>true)){}} ,"Ordinary process became SYSTEM session0 evidence");
            bool scope=true;using(var pin=SodaDesktopSigninProcessEvidence.OpenCore(pid,created,image,false,()=>scope)){scope=false;Check(!pin.Current(),"Revoked process scope remained current");scope=true;Check(!pin.Current()&&!pin.CleanExit(),"Revoked process pin revived");}
            bool expire=false;int inspections=0;using(var pin=SodaDesktopSigninProcessEvidence.OpenCore(pid,created,image,false,()=>!(expire&&++inspections==2))){expire=true;Check(!pin.Current(),"Inspection-time process scope remained current");}
            SodaDesktopSigninProcessEvidence.Pin reentrant=null;bool recurse=false;try{reentrant=SodaDesktopSigninProcessEvidence.OpenCore(pid,created,image,false,()=>{if(recurse)reentrant.Dispose();return true;});recurse=true;Check(!reentrant.Current(),"Reentrant disposal retained process pin");}finally{if(reentrant!=null)reentrant.Dispose();}
        }
        foreach(int code in new[]{0,7,259}){
            string name="Local\\soda-generated-process-"+Guid.NewGuid().ToString("N");using(var ready=new EventWaitHandle(false,EventResetMode.ManualReset,name+"-ready"))using(var exit=new EventWaitHandle(false,EventResetMode.ManualReset,name))
            using(var child=Process.Start(new ProcessStartInfo(executable,"--generated-child "+name+" "+code){UseShellExecute=false,CreateNoWindow=true})){
                try{Check(ready.WaitOne(5000),"Generated child was not ready");string created=child.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(System.Globalization.CultureInfo.InvariantCulture);
                    bool permitted=true,expireAtEnd=false;int exitChecks=0;using(var pin=SodaDesktopSigninProcessEvidence.OpenCore((uint)child.Id,created,executable,false,()=>permitted&&!(expireAtEnd&&++exitChecks==2))){
                        Check(pin.Current()&&!pin.CleanExit(),"Live child was classified as stopped");exit.Set();Check(child.WaitForExit(5000),"Generated child did not exit");Check(!pin.Current(),"Exited process remained live");Check(pin.CleanExit()==(code==0),"Retained handle ignored actual exit code "+code);if(code==0){expireAtEnd=true;Check(!pin.CleanExit(),"Exit inspection ignored revoked process scope");expireAtEnd=false;}permitted=false;Check(!pin.CleanExit(),"Clean exit ignored revoked scope");permitted=true;Check(!pin.CleanExit(),"Revoked clean evidence revived");
                    }
                }finally{exit.Set();if(!child.WaitForExit(5000)){child.Kill();child.WaitForExit(5000);}}
            }
        }
        Console.WriteLine("signin_process_evidence_actual_ordinary_process_creation_image_exit_and_revocation_passed");
    }
    public static void Main(string[] args){
        if(args.Length!=3||args[0]!="--generated-child")throw new InvalidOperationException("Generated child mode required");
        using(var ready=EventWaitHandle.OpenExisting(args[1]+"-ready"))using(var exit=EventWaitHandle.OpenExisting(args[1])){ready.Set();if(!exit.WaitOne(10000))Environment.Exit(9);Environment.Exit(Int32.Parse(args[2],System.Globalization.CultureInfo.InvariantCulture));}
    }
}
