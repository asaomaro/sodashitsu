// Test fixture only: reads the existing product's routing predicates; never calls its Main.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public static class SodaLockCoverProbe {
    static readonly string[] Names={"LockState","UserLockScreen","PendingUserLockScreen","InputIsDefault","PendingShellLockScreen","SecureDesktopCandidate","SelectSource","GetForegroundWindow"};
    [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool GetTokenInformation(IntPtr token,int kind,out int value,int size,out int needed);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
    static object Product(string name) {
        if(Array.IndexOf(Names,name)<0)throw new InvalidOperationException();
        var method=typeof(SodaDesktopUnlock).GetMethod(name,BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic,null,Type.EmptyTypes,null);
        if(method==null)throw new InvalidOperationException();
        return method.Invoke(null,null);
    }
    static bool NormalActor() {
        using(var process=Process.GetCurrentProcess())using(var identity=WindowsIdentity.GetCurrent()) {
            uint session=WTSGetActiveConsoleSessionId();
            if(session==0||session==0xffffffff||process.SessionId!=(int)session||identity.IsSystem||new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))return false;
            IntPtr token;if(!OpenProcessToken(process.Handle,8,out token))return false;
            try {int elevated,needed;return GetTokenInformation(token,20,out elevated,4,out needed)&&needed==4&&elevated==0;}
            finally {CloseHandle(token);}
        }
    }
    // No emulation of product predicates: only validate and project their returned values.
    public static Dictionary<string,object> Sample(Func<string,object> invoke) {
        object raw=invoke("LockState");if(!(raw is int))throw new InvalidOperationException();int state=(int)raw;if(state < -1||state>1)throw new InvalidOperationException();
        var row=new Dictionary<string,object>{{"lockState",state}};
        foreach(string name in new[]{"UserLockScreen","PendingUserLockScreen","InputIsDefault","PendingShellLockScreen","SecureDesktopCandidate"}) {
            object value=invoke(name);if(!(value is bool))throw new InvalidOperationException();row.Add(name,(bool)value);
        }
        string source=invoke("SelectSource") as string;
        if(source!="normal"&&source!="cover"&&source!="secure"&&source!="transition")throw new InvalidOperationException();row.Add("source",source);
        object foreground=invoke("GetForegroundWindow");if(!(foreground is IntPtr))throw new InvalidOperationException();row.Add("foregroundZero",(IntPtr)foreground==IntPtr.Zero);
        return row;
    }
    static void Check(bool value){if(!value)throw new InvalidOperationException();}
    public static void SelfTest() {
        var calls=new List<string>();Func<string,object> generated=name=>{calls.Add(name);if(name=="LockState")return 0;if(name=="SelectSource")return "cover";if(name=="GetForegroundWindow")return IntPtr.Zero;return false;};
        var row=Sample(generated);Check(row.Count==8&&calls.Count==8&&String.Join(",",calls)==String.Join(",",Names));Check((string)row["source"]=="cover"&&(bool)row["foregroundZero"]);
        foreach(string source in new[]{"normal","cover","secure","transition"})foreach(int state in new[]{-1,0,1}){var result=Sample(name=>name=="SelectSource"?(object)source:name=="LockState"?(object)state:generated(name));Check((string)result["source"]==source&&(int)result["lockState"]==state);}
        foreach(string field in Names){bool rejected=false;try{Sample(name=>name==field?(field=="SelectSource"?(object)"unknown":field=="LockState"?(object)2:field=="GetForegroundWindow"?(object)0:(object)"false"):generated(name));}catch{rejected=true;}Check(rejected);}
    }
    static void Write(object value){using(var output=new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false),4096)){output.WriteLine(new JavaScriptSerializer().Serialize(value));output.Flush();}}
    public static int Main(string[] args) {
        if(args.Length!=1||(args[0]!="--self-test"&&args[0]!="--observe"))return 64;
        try {
            if(args[0]=="--self-test"){SelfTest();Write(new{fixture="lockcover-readonly",synthetic=true,passed=true});return 0;}
            // Watchdog terminates only this diagnostic process. Product SelectSource may wait ~2s.
            using(var watchdog=new Timer(_=>Environment.Exit(1),null,12000,Timeout.Infinite)) {
                if(!NormalActor())throw new InvalidOperationException();
                var samples=new List<Dictionary<string,object>>();var clock=Stopwatch.StartNew();
                for(int n=0;n<3;n++) {if(n!=0)Thread.Sleep(250);if(!NormalActor())throw new InvalidOperationException();var sample=Sample(Product);if(!NormalActor())throw new InvalidOperationException();sample.Add("elapsedMs",clock.ElapsedMilliseconds);samples.Add(sample);}
                Write(new{fixture="lockcover-readonly",normalActor=true,activeConsole=true,samples=samples,authorization=false});return 0;
            }
        } catch {Write(new{fixture="lockcover-readonly",unavailable=true});return 1;}
    }
}
