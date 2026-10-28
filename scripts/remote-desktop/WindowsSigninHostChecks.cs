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
    public static void Run(string exe,string directory){
        Check(!SodaDesktopSigninVault.SystemPrimary(),"Host fixtures require ordinary account");SodaDesktopSigninProcess.Layouts();
        Check(SodaDesktopSigninHost.PrivateRuntimeAcl(Acl("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)")),"Private runtime rejected");
        Check(!SodaDesktopSigninHost.PrivateRuntimeAcl(Acl("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FR;;;WD)")),"Foreign runtime read accepted");
        Check(!SodaDesktopSigninHost.PrivateRuntimeAcl(Acl("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;0x10000000;;;WD)")),"Foreign runtime write accepted");
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
        bool initial=false;try{using(var child=SodaDesktopSigninProcess.Start(plan,()=>false)){child.Stop();}}catch(InvalidOperationException){initial=true;}
        Check(initial&&!File.Exists(marker),"Initial revocation accepted");
        bool nonexistent=false;try{using(var child=SodaDesktopSigninProcess.Start(Fixture(Path.Combine(directory,"absent.exe"),directory,"--generated-child"),()=>true)){child.Stop();}}catch(InvalidOperationException){nonexistent=true;}
        Check(nonexistent,"Missing child accepted");
        // A fresh run after both failure paths proves no retained job/process state.
        using(var child=SodaDesktopSigninProcess.Start(plan,()=>true)){Wait(()=>File.Exists(marker),"Recovery child failed");Check(child.Stop()&&child.Active()==0,"Recovery cleanup failed");}
        Console.WriteLine("signin_host_generated_environment_job_descendants_and_revocation_passed");
        }
    }
    // Test exe's explicitly selected entry point; production compilation selects
    // SodaDesktopSigninHost instead. No desktop/account/key APIs are exercised.
    public static void Main(string[] args){
        if((args.Length!=2&&args.Length!=3)||!Path.IsPathRooted(args[1]))Environment.Exit(2);
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
