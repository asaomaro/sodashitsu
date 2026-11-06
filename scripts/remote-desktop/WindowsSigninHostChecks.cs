// Generated ordinary-account child only. Never invokes the service entry point.
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Text;
using System.Threading;

public static class SodaDesktopSigninHostChecks {
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
    [DllImport("kernel32.dll")]static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
    [DllImport("kernel32.dll",SetLastError=true)]static extern bool SetEvent(IntPtr handle);
    static long sentinelValue;
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static byte[] Acl(string sddl){var sd=new RawSecurityDescriptor(sddl);var bytes=new byte[sd.BinaryLength];sd.GetBinaryForm(bytes,0);return bytes;}
    static void Wait(Func<bool> done,string message){var timer=Stopwatch.StartNew();while(timer.ElapsedMilliseconds<5000){if(done())return;Thread.Sleep(20);}throw new InvalidOperationException(message);}
    static void Publish(string path,string text){string stage=path+"."+Process.GetCurrentProcess().Id+".tmp";File.WriteAllText(stage,text);File.Move(stage,path);}
    static string Quote(string value){return "\""+value+"\"";}
    internal static SodaDesktopSigninHost.Plan Fixture(string exe,string directory,string mode){return new SodaDesktopSigninHost.Plan(exe,mode+" "+Quote(directory)+(mode=="--generated-child"?" "+sentinelValue.ToString(System.Globalization.CultureInfo.InvariantCulture):""),Environment.GetFolderPath(Environment.SpecialFolder.System),directory);}
    static void ServiceEntry(SodaDesktopSigninHost.Service service,uint count,string name){
        IntPtr text=IntPtr.Zero,vector=IntPtr.Zero;
        try{if(name!=null){text=Marshal.StringToHGlobalUni(name);vector=Marshal.AllocHGlobal(IntPtr.Size);Marshal.WriteIntPtr(vector,text);}service.Entry(count,vector);}
        finally{if(vector!=IntPtr.Zero)Marshal.FreeHGlobal(vector);if(text!=IntPtr.Zero)Marshal.FreeHGlobal(text);}
    }
    sealed class DeadlineLease:IDisposable {internal bool Disposed;public void Dispose(){Disposed=true;}}
    public static void ServiceLifecycle(){
        int previous=Environment.ExitCode;
        try{
            Check(Marshal.SizeOf(typeof(SodaDesktopSigninHost.ServiceStatus))==28&&Marshal.SizeOf(typeof(SodaDesktopSigninHost.ServiceEntry))==16,"Native service ABI changed");
            foreach(uint control in new uint[]{0,1,5}){
                var states=new System.Collections.Generic.List<SodaDesktopSigninHost.ServiceStatus>();bool ran=false,cleaned=false;string runnerFailure=null;int scheduled=0;var lease=new DeadlineLease();SodaDesktopSigninHost.Service active=null;
                try{active=new SodaDesktopSigninHost.Service((name,handler)=>{Check(name.Length==82&&name=="SodaDesktopSignin-"+SodaDesktopSigninPackage.Slot(SodaDesktopSigninHost.Owner),"Fixed service identity changed");return new IntPtr(7);},
                    delegate(IntPtr handle,ref SodaDesktopSigninHost.ServiceStatus value){Check(handle==new IntPtr(7),"Wrong service status handle");if(value.State==1)Check(cleaned,"Service stopped before cleanup");states.Add(value);return true;},
                    stop=>{
                        ran=true;try{
                            Check(states[states.Count-1].State==4&&!stop.WaitOne(0),"Service runner started after stop");
                            Check(active.Control(99,0,IntPtr.Zero,IntPtr.Zero)==120&&!stop.WaitOne(0),"Unknown service control accepted");
                            Check(active.Control(4,0,IntPtr.Zero,IntPtr.Zero)==0,"Service interrogation rejected");
                            if(control!=0){Check(active.Control(control,0,IntPtr.Zero,IntPtr.Zero)==0&&stop.WaitOne(0),"Service stop event missing");Check(states[states.Count-1].State==3,"Service stop pending missing");Check(active.Control(control,0,IntPtr.Zero,IntPtr.Zero)==0,"Repeated stop rejected");}
                        }catch(Exception error){runnerFailure=error.Message;throw;}finally{cleaned=true;}
                    },action=>{scheduled++;return lease;});}catch(ArgumentException){throw new InvalidOperationException("Fixed service name exceeded managed limit");}
                using(active){
                    ServiceEntry(active,1,active.Name);
                    Check(runnerFailure==null,runnerFailure??"Unexpected runner failure");
                    Check(ran&&active.ExitCode==0,"Service runner failed");
                    Check(scheduled==(control==0?0:1)&&(control==0||lease.Disposed),"Service stop deadline missing or not canceled");
                    Check(states[0].State==2&&states[0].Accepted==0&&states[0].Checkpoint==1&&states[0].WaitHint==30000,"Service start pending incorrect");
                    Check(states[1].State==4&&states[1].Accepted==5&&states[1].Checkpoint==0&&states[1].WaitHint==0,"Service accepted controls incorrect");
                    var last=states[states.Count-1];Check(last.State==1&&last.Exit==0&&last.Specific==0&&last.Accepted==0,"Clean service stop incorrect");
                    foreach(var state in states)if(state.State==3)Check(state.Accepted==0&&state.Checkpoint==1&&state.WaitHint==30000,"Service stop pending incorrect");
                    int count=states.Count;Check(active.Control(4,0,IntPtr.Zero,IntPtr.Zero)==120&&active.Control(1,0,IntPtr.Zero,IntPtr.Zero)==120&&states.Count==count,"Stopped service reported again");
                    ServiceEntry(active,1,active.Name);Check(states.Count==count,"Duplicate service entry reported stopped again");
                }
            }
            foreach(int mode in new[]{0,1,2,3,4}){
                bool ran=false;var states=new System.Collections.Generic.List<SodaDesktopSigninHost.ServiceStatus>();
                using(var service=new SodaDesktopSigninHost.Service((name,handler)=>mode==4?IntPtr.Zero:new IntPtr(7),
                    delegate(IntPtr handle,ref SodaDesktopSigninHost.ServiceStatus value){states.Add(value);return true;},
                    stop=>{ran=true;throw new InvalidOperationException("generated runner failure");})){
                    ServiceEntry(service,mode==1?2u:mode==2?0u:1u,mode==2?null:mode==3?"other-service":service.Name);
                    Check(service.ExitCode==1&&Environment.ExitCode==1,"Service failure lost exit status");
                    Check(ran==(mode==0),"Invalid service start arguments executed runner");
                    if(mode==4)Check(states.Count==0,"Unregistered service reported status");
                    else{var last=states[states.Count-1];Check(last.State==1&&last.Exit==1066&&last.Specific==1,"Service failure reported clean stop");}
                }
            }
            foreach(uint code in new uint[]{0,1,100,101,102,103,104,105,106,107,108,109,110,200,201,203,208,215,216,240,241,UInt32.MaxValue}){
                bool cleaned=false;var states=new System.Collections.Generic.List<SodaDesktopSigninHost.ServiceStatus>();
                using(var service=new SodaDesktopSigninHost.Service((name,handler)=>new IntPtr(7),
                    delegate(IntPtr handle,ref SodaDesktopSigninHost.ServiceStatus value){if(value.State==1)Check(cleaned,"Diagnostic reported before cleanup");states.Add(value);return true;},
                    stop=>{try{throw new SodaDesktopSigninHost.StartupFailure(code);}finally{cleaned=true;}})){
                    ServiceEntry(service,1,service.Name);var last=states[states.Count-1];
                    Check(service.ExitCode==1&&Environment.ExitCode==1&&last.State==1&&last.Exit==1066&&last.Specific==(code>=101&&code<=109||code>=201&&code<=215||code==240?code:1u),"Fixed startup stage lost or unbounded");
                }
            }
            Action alarm=null;int expired=0;var canceled=new DeadlineLease();
            using(var timeout=new SodaDesktopSigninHost.StopDeadline(action=>{alarm=action;return canceled;},()=>expired++)){alarm();alarm();Check(expired==1,"Stop deadline did not fire once");}
            Check(canceled.Disposed,"Expired deadline lease retained");expired=0;
            using(var timeout=new SodaDesktopSigninHost.StopDeadline(action=>{alarm=action;return new DeadlineLease();},()=>expired++)){}
            alarm();Check(expired==0,"Canceled stop deadline still fired");
            Console.WriteLine("signin_native_service_name_lifecycle_and_failure_passed");
        }finally{Environment.ExitCode=previous;}
    }
    public static void Run(string exe,string directory){
        Check(!SodaDesktopSigninVault.SystemPrimary(),"Host fixtures require ordinary account");ServiceLifecycle();SodaDesktopSigninProcess.Layouts();
        Check(SodaDesktopSigninHost.PrivateRuntimeAcl(Acl("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)")),"Private runtime rejected");
        Check(!SodaDesktopSigninHost.PrivateRuntimeAcl(Acl("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FR;;;WD)")),"Foreign runtime read accepted");
        Check(!SodaDesktopSigninHost.PrivateRuntimeAcl(Acl("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;0x10000000;;;WD)")),"Foreign runtime write accepted");
        string runtime=Path.Combine(directory,"generated-runtime"),barrier=Path.Combine(directory,"quiescence.lock");Directory.CreateDirectory(runtime);File.WriteAllBytes(barrier,new byte[]{83});
        using(var lease=SodaDesktopSigninHost.Barrier(runtime,descriptor=>true)){
            bool blocked=false;try{using(var exclusive=new FileStream(barrier,FileMode.Open,FileAccess.Read,FileShare.None)){} }catch(IOException){blocked=true;}Check(blocked,"Live quiescence lease allowed exclusive access");
            blocked=false;try{using(var writer=new FileStream(barrier,FileMode.Open,FileAccess.Write,FileShare.Read)){} }catch(IOException){blocked=true;}Check(blocked,"Live quiescence lease allowed writes");
            blocked=false;try{File.Delete(barrier);}catch(IOException){blocked=true;}Check(blocked,"Live quiescence lease allowed replacement");
        }
        using(var exclusive=new FileStream(barrier,FileMode.Open,FileAccess.Read,FileShare.None))Check(exclusive.Length==1,"Released quiescence barrier unavailable");
        File.WriteAllBytes(barrier,new byte[]{84});bool badBarrier=false;try{using(var lease=SodaDesktopSigninHost.Barrier(runtime,descriptor=>true)){} }catch(InvalidOperationException){badBarrier=true;}Check(badBarrier,"Invalid quiescence marker accepted");File.Delete(barrier);Directory.Delete(runtime);
        foreach(string mode in new[]{"--generated-stop-success","--generated-stop-failure","--generated-stop-hang","--generated-stop-descendant"})using(var child=SodaDesktopSigninProcess.Start(Fixture(exe,directory,mode),()=>true)){
            if(mode=="--generated-stop-descendant")Wait(()=>File.Exists(Path.Combine(directory,"descendant")),"Graceful fixture descendant was not ready");
            bool clean=child.TryGraceful(mode=="--generated-stop-success"||mode=="--generated-stop-failure"?3000:100);
            if(mode=="--generated-stop-success")Check(clean&&child.ExitedSuccessfully()&&child.Active()==0,"Cooperative child did not finish cleanly");
            else if(mode=="--generated-stop-failure")Check(!clean,"Graceful completion ignored nonzero child exit");
            else if(mode=="--generated-stop-descendant")Check(!clean,"Graceful completion ignored live descendant");
            else Check(!clean,"Graceful completion ignored timeout");
            Check(child.Stop()&&child.Active()==0,"Graceful fallback did not stop every descendant");
        }
        using(var forced=SodaDesktopSigninProcess.Start(Fixture(exe,directory,"--generated-stop-hang"),()=>true)){Check(forced.Stop(),"Generated force stop failed");Check(!forced.TryGraceful(100),"Forced child was misclassified as clean");}
        File.Delete(Path.Combine(directory,"descendant"));
        foreach(string mode in new[]{"--generated-exit-success","--generated-exit-failure","--generated-exit-diagnostic","--generated-exit-entry-failure"})using(var child=SodaDesktopSigninProcess.Start(Fixture(exe,directory,mode),()=>true)){
            Wait(()=>!child.Running(),"Generated finite child did not exit");Check(child.ExitedSuccessfully()==(mode=="--generated-exit-success"),"Finite child exit code was ignored");Check(child.FailureStage(107)==(mode=="--generated-exit-diagnostic"?208u:mode=="--generated-exit-entry-failure"?240u:107u)&&child.FailureStage(105)==105,"Closed child diagnostic was lost or accepted in wrong stage");Check(child.Stop()&&child.Active()==0,"Finite child cleanup failed");
        }
        using(var sentinel=new EventWaitHandle(false,EventResetMode.ManualReset)){
        sentinelValue=sentinel.SafeWaitHandle.DangerousGetHandle().ToInt64();
        Check(SetHandleInformation(new IntPtr(sentinelValue),1,1),"Could not prepare inheritable fixture event");
        string marker=Path.Combine(directory,"ready");File.Delete(marker);File.Delete(Path.Combine(directory,"descendant"));
        var plan=Fixture(exe,directory,"--generated-child");
        Check(plan.EnvironmentBlock.IndexOf("NODE_OPTIONS=",StringComparison.OrdinalIgnoreCase)<0&&plan.EnvironmentBlock.IndexOf("SODA_SIGNIN_HOST_SECRET=",StringComparison.OrdinalIgnoreCase)<0,"Parent environment retained");
        using(var child=SodaDesktopSigninProcess.Start(plan,()=>true)){
            Wait(()=>File.Exists(marker),"Generated child did not become ready");
            Check(File.ReadAllText(marker)=="generated_environment_and_job_passed","Child environment or job incorrect");
            Check(!sentinel.WaitOne(0),"Unexpected handle inherited");
            try{Wait(()=>{int pid;string file=Path.Combine(directory,"descendant");return child.Active()>=2&&File.Exists(file)&&Int32.TryParse(File.ReadAllText(file),out pid)&&child.Owns(pid);},"Grandchild not owned by job");}
            catch{Console.WriteLine("generated_job_active="+child.Active()+" descendant_marker="+File.Exists(Path.Combine(directory,"descendant"))+" child_running="+child.Running());throw;}
            Check(child.Running(),"Generated child ended early");
            Check(child.Stop()&&child.Active()==0&&!child.Running(),"Descendant cleanup failed");
            Check(child.Stop(),"Stop is not idempotent");
        }
        File.Delete(marker);File.Delete(Path.Combine(directory,"descendant"));
        int calls=0;bool rejected=false;
        try{using(var child=SodaDesktopSigninProcess.Start(plan,()=>++calls<3)){child.Stop();}}
        catch(InvalidOperationException ex){rejected=ex.Message=="Signin host is unavailable";}
        Check(rejected&&calls==3,"Post-create revocation accepted");
        Check(!File.Exists(marker),"Revoked suspended child executed");
        int admissions=0;bool admissionRejected=false;
        try{using(var child=SodaDesktopSigninProcess.Start(plan,()=>true,()=>{admissions++;return false;},()=>true)){child.Stop();}}catch(InvalidOperationException){admissionRejected=true;}
        Check(admissionRejected&&admissions==1&&!File.Exists(marker),"Unconfirmed child admission resumed");
        bool live=true,postAdmissionRejected=false;try{using(var child=SodaDesktopSigninProcess.Start(plan,()=>live,()=>{live=false;return true;},()=>true)){child.Stop();}}catch(InvalidOperationException){postAdmissionRejected=true;}
        Check(postAdmissionRejected&&!File.Exists(marker),"Post-admission revocation resumed child");
        bool initial=false;try{using(var child=SodaDesktopSigninProcess.Start(plan,()=>false)){child.Stop();}}catch(InvalidOperationException){initial=true;}
        Check(initial&&!File.Exists(marker),"Initial revocation accepted");
        bool nonexistent=false;try{using(var child=SodaDesktopSigninProcess.Start(Fixture(Path.Combine(directory,"absent.exe"),directory,"--generated-child"),()=>true)){child.Stop();}}catch(InvalidOperationException){nonexistent=true;}
        Check(nonexistent,"Missing child accepted");
        SodaDesktopSigninRunSessionChecks.NativeResume(exe,directory);
        // A fresh run after both failure paths proves no retained job/process state.
        using(var child=SodaDesktopSigninProcess.Start(plan,()=>true)){Wait(()=>File.Exists(marker),"Recovery child failed");Check(child.Stop()&&child.Active()==0,"Recovery cleanup failed");}
        Console.WriteLine("signin_host_generated_environment_job_descendants_and_revocation_passed");
        }
    }
    // Test exe's explicitly selected entry point; production compilation selects
    // SodaDesktopSigninHost instead. No desktop/account/key APIs are exercised.
    public static void Main(string[] args){
        if((args.Length!=2&&args.Length!=3)||!Path.IsPathRooted(args[1]))Environment.Exit(2);
        if(args[0]=="--generated-stop-hang"){Thread.Sleep(30000);return;}
        if(args[0]=="--generated-stop-success"||args[0]=="--generated-stop-failure"||args[0]=="--generated-stop-descendant"){
            Process descendant=null;
            try{
                if(args[0]=="--generated-stop-descendant")descendant=Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--generated-descendant "+Quote(args[1])){UseShellExecute=false,CreateNoWindow=true});
                if(Console.ReadLine()!="signin_stop"){Environment.Exit(9);return;}if(args[0]=="--generated-stop-failure")Environment.Exit(7);
            }finally{if(descendant!=null)descendant.Dispose();}return;
        }
        if(args[0]=="--generated-exit-success")return;
        if(args[0]=="--generated-exit-failure"){Environment.Exit(7);return;}
        if(args[0]=="--generated-exit-diagnostic"){Environment.Exit(208);return;}
        if(args[0]=="--generated-exit-entry-failure"){Environment.Exit(240);return;}
        if(args[0]=="--generated-descendant"){Publish(Path.Combine(args[1],"descendant"),Process.GetCurrentProcess().Id.ToString());Thread.Sleep(30000);return;}
        if(args[0]!="--generated-child"||args.Length!=3)Environment.Exit(2);
        SetEvent(new IntPtr(Int64.Parse(args[2],System.Globalization.CultureInfo.InvariantCulture)));
        bool inJob;bool good=IsProcessInJob(GetCurrentProcess(),IntPtr.Zero,out inJob)&&inJob;
        good=good&&Environment.GetEnvironmentVariable("SODA_SIGNIN_HOST_SECRET")==null&&Environment.GetEnvironmentVariable("NODE_OPTIONS")==null;
        good=good&&Environment.GetEnvironmentVariable("TEMP")==args[1]&&Environment.GetEnvironmentVariable("TMP")==args[1]&&Environment.GetEnvironmentVariable("PATH")==Environment.GetFolderPath(Environment.SpecialFolder.System);
        good=good&&Environment.CurrentDirectory==Environment.GetFolderPath(Environment.SpecialFolder.System);
        if(!good)Environment.Exit(3);
        var exe=Process.GetCurrentProcess().MainModule.FileName;
        var start=new ProcessStartInfo(exe,"--generated-descendant "+Quote(args[1])){UseShellExecute=false,CreateNoWindow=true};
        using(var descendant=Process.Start(start)){Publish(Path.Combine(args[1],"ready"),"generated_environment_and_job_passed");Thread.Sleep(30000);}
    }
}
