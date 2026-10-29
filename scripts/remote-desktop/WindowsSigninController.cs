// Explicit elevated local controller. No remote RPC, registration, automatic
// replay, generic command/path, key/trust write or forced process termination.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
public static class SodaDesktopSigninController {
    static Exception Failure(){return new InvalidOperationException("Signin controller requires a verified installation or explicit recovery");}
    static long Wall(){return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}
    static void Require(bool value){if(!value)throw Failure();}
    static IDictionary<string,object> Result(string state,string journal,string run=null){var value=new Dictionary<string,object>{{"state",state},{"journal",journal}};if(run!=null)value.Add("runId",run);return value;}
    internal sealed class Context {
        internal readonly string Owner,Package;internal readonly SodaDesktopSigninScm Service;internal readonly Func<bool> Current;
        internal readonly Func<SodaDesktopSigninQuiescence.Pin> Barrier;
        internal readonly Func<SodaDesktopSigninRunJournal.Role,string,Func<bool>,SodaDesktopSigninRunJournal> Journal;
        internal readonly Func<SodaDesktopSigninRunRecord,Func<bool>,SodaDesktopSigninProcessEvidence.Pin> Process;
        internal readonly Func<SodaDesktopSigninRunRecord,Func<bool>,bool> Mode;internal readonly Action<int> Wait;
        internal Context(string owner,string package,SodaDesktopSigninScm service,Func<bool> current,Func<SodaDesktopSigninQuiescence.Pin> barrier,Func<SodaDesktopSigninRunJournal.Role,string,Func<bool>,SodaDesktopSigninRunJournal> journal,Func<SodaDesktopSigninRunRecord,Func<bool>,SodaDesktopSigninProcessEvidence.Pin> process,Func<SodaDesktopSigninRunRecord,Func<bool>,bool> mode,Action<int> wait=null){Wait=wait??Thread.Sleep;Owner=owner;Package=package;Service=service;Current=current;Barrier=barrier;Journal=journal;Process=process;Mode=mode;}
    }
    static void Validate(string action,string mode,string adminNonce,string adminSha256){if(action!="status"&&action!="start"&&action!="stop"||mode!="normal"&&mode!="admin"||action!="start"&&(mode!="normal"||adminNonce!=null||adminSha256!=null))throw Failure();}
    public static IDictionary<string,object> Run(string action,string owner,string manifestSha256,string mode,string adminNonce,string adminSha256){
        if(adminNonce=="")adminNonce=null;if(adminSha256=="")adminSha256=null;Validate(action,mode,adminNonce,adminSha256);Require(SodaDesktopSigninPackageNative.Authority(true)&&Environment.Is64BitProcess&&SodaDesktopSigninVault.UserAccount(owner));
        var timer=Stopwatch.StartNew();using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifestSha256)){
            Func<bool> current=()=>timer.ElapsedMilliseconds<90000&&mutex.Current()&&package.Current();using(var scm=SodaDesktopSigninScm.Open(owner,action!="status",current)){
                var context=new Context(owner,package.ManifestSha256,scm,current,()=>SodaDesktopSigninQuiescence.Open(owner),(role,barrier,scope)=>SodaDesktopSigninRunStorage.OpenController(owner,package.ManifestSha256,barrier,role,scope),(started,scope)=>SodaDesktopSigninProcessEvidence.Open(owner,started,scope),(intent,scope)=>SodaDesktopSigninRunStorage.ControllerMode(owner,intent,scope));
                return RunCore(action,mode,adminNonce,adminSha256,context);
            }
        }
    }
    // Generated ordinary adapter seam; public Run supplies only fixed native
    // installation/SCM/process/owner authority above, never caller paths.
    internal static IDictionary<string,object> RunCore(string action,string mode,string adminNonce,string adminSha256,Context context){
        Validate(action,mode,adminNonce,adminSha256);if(context==null)throw Failure();string owner=context.Owner,package=context.Package;var scm=context.Service;var current=context.Current;Require(current());
                if(action=="start")return Start(context,mode,adminNonce,adminSha256);
                using(var pin=context.Barrier()){
                    string barrier=pin.Fingerprint;Func<bool> reading=()=>current()&&pin.Current();
                    using(var journal=context.Journal(SodaDesktopSigninRunJournal.Role.Reader,barrier,reading)){
                        var status=scm.Query();string state=journal.State();
                        if(action=="status")return Result(status.State==1?"stopped":status.State==4?"running":"transition",state);
                        if(status.State==1){Require(state=="initial"||state=="complete");return Result("stopped",state);}
                        Require(status.State==4);var started=journal.StartedRecord();Require(status.Pid==(long)started.Field("pid"));
                        using(var process=context.Process(started,current)){
                            return Observe(context,pin,journal,process,started,barrier,true);
                        }
                    }
                }
    }
    static IDictionary<string,object> Observe(Context context,SodaDesktopSigninQuiescence.Pin pin,SodaDesktopSigninRunJournal journal,SodaDesktopSigninProcessEvidence.Pin process,SodaDesktopSigninRunRecord started,string barrier,bool requestStop){
        string owner=context.Owner,package=context.Package;var scm=context.Service;var current=context.Current;
                            if(requestStop)scm.Stop(process);var waited=Stopwatch.StartNew();
                            while(waited.ElapsedMilliseconds<35000){var latest=scm.Query();if(latest.State==1){Require(latest.Clean);uint exit;if(process.Exited(out exit)){Require(process.CleanExit());break;}}else Require(latest.State==4&&latest.Pid==process.Process.Pid||latest.State==3);context.Wait(25);}
                            Require(scm.Query().Clean&&process.CleanExit());var stopped=journal.StopRecord();Require(started.SameProcess(stopped));
                            // Dispose the reader (which retains the slot) before
                            // consuming only our own barrier read pin.
                            journal.Dispose();using(var exclusive=pin.Exclusive()){
                                Func<bool> proved=()=>current()&&exclusive.Current()&&exclusive.Fingerprint==barrier&&process.CleanExit()&&scm.Query().Clean;
                                Require(proved());var fields=stopped.Fields();fields["kind"]="observed-stop";fields.Remove("stoppedAt");fields.Remove("startedSha256");fields.Remove("nodeExitCode");fields.Remove("jobEmpty");
                                fields.Add("observedAt",Wall());fields.Add("stoppedSha256",stopped.Digest());fields.Add("processExitCode",0);fields.Add("scmExitCode",0);fields.Add("scmSpecificCode",0);fields.Add("scmState","stopped");fields.Add("barrierExclusive",true);
                                using(var writer=context.Journal(SodaDesktopSigninRunJournal.Role.Controller,barrier,proved))writer.ObservedStop(SodaDesktopSigninRunRecord.Build(fields,owner));
                                var result=Result("stopped","complete",started.RunId);if(!requestStop)result.Add("adminResult","inspect-required");return result;
                            }    }
    static IDictionary<string,object> Start(Context context,string mode,string adminNonce,string adminSha256){
        string owner=context.Owner,package=context.Package;var scm=context.Service;var current=context.Current;
        string barrier;SodaDesktopSigninRunRecord intent;
        using(var before=context.Barrier()){
            barrier=before.Fingerprint;using(var exclusive=before.Exclusive()){
                Func<bool> writing=()=>current()&&exclusive.Current()&&exclusive.Fingerprint==barrier&&scm.Query().State==1;Require(writing());long issued=Wall();
                var fields=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","intent"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",package},{"barrierSha256",barrier},{"issuedAt",issued},{"expiresAt",checked(issued+60000)},{"mode",mode}};
                if(mode=="admin"){fields.Add("adminNonce",adminNonce);fields.Add("adminSha256",adminSha256);}else Require(adminNonce==null&&adminSha256==null);
                intent=SodaDesktopSigninRunRecord.Build(fields,owner);Require(context.Mode(intent,writing));
                using(var writer=context.Journal(SodaDesktopSigninRunJournal.Role.Controller,barrier,writing))writer.Prepare(intent);
            }
        }
        using(var pin=context.Barrier()){
            Require(pin.Fingerprint==barrier);Func<bool> reading=()=>current()&&pin.Current()&&pin.Fingerprint==barrier;
            using(var journal=context.Journal(SodaDesktopSigninRunJournal.Role.Reader,barrier,reading)){
                scm.Start(()=>reading()&&journal.State()=="pending"&&Wall()<(long)intent.Field("expiresAt"));var timer=Stopwatch.StartNew();
                while(timer.ElapsedMilliseconds<45000){
                    Require(reading()&&Wall()<(long)intent.Field("expiresAt"));var status=scm.Query();string state=journal.State();Require(status.State==2||status.State==4||status.State==1&&(status.Exit==0||status.Exit==1077)&&state=="pending");
                    // SCM PID is valid only RUNNING, never pending/stopped.
                    if(status.State==4&&state=="started"){
                        var started=journal.StartedRecord();Require(intent.SameRun(started)&&(string)started.Field("intentSha256")==intent.Digest()&&status.Pid==(long)started.Field("pid"));
                        using(var process=context.Process(started,current)){
                            Func<bool> observing=()=>reading()&&process.Current()&&scm.Query().State==4&&scm.Query().Pid==process.Process.Pid;
                            var fields=started.Fields();fields["kind"]="observation";fields.Remove("startedAt");fields.Remove("intentSha256");fields.Add("startedSha256",started.Digest());
                            using(var observer=context.Journal(SodaDesktopSigninRunJournal.Role.Observer,barrier,observing))observer.Observation(SodaDesktopSigninRunRecord.Build(fields,owner));
                            // ACK confirms admission prerequisites, not successful
                            // enrollment, a connected viewer or an admin result.
                            if(mode=="admin")return Observe(context,pin,journal,process,started,barrier,false);
                            return Result("observation-acknowledged","observed",intent.RunId);
                        }
                    }
                    Require(state=="pending"||state=="claimed"||state=="started");context.Wait(25);
                }throw Failure();
            }
        }
    }
}
