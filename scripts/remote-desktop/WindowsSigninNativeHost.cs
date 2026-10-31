// One immutable privileged image; service/session workers remain distinct OS processes.
using System;
public static class SodaDesktopSigninNativeHost {
    internal static string Role(string[] args) {
        if(args==null)return null;
        if(args.Length==0)return "service";
        if(args.Length==1&&args[0]=="--context")return "worker";
        if(args.Length==2&&args[0]=="--broker"&&Purpose(args[1]))return "worker";
        if(args.Length==6&&args[0]=="--worker") {
            Guid nonce;int broker,session;long started;
            if(Guid.TryParseExact(args[1],"D",out nonce)&&nonce!=Guid.Empty&&args[1]==nonce.ToString("D")&&Int32.TryParse(args[2],out broker)&&broker>0&&Int64.TryParse(args[3],out started)&&started>0&&Int32.TryParse(args[4],out session)&&session>0&&Purpose(args[5]))return "worker";
        }
        return null;
    }
    static bool Purpose(string value){return value=="input"||value=="view"||value=="presence";}
    public static void Main(string[] args) {
        string role=Role(args);
        if(role=="service"){SodaDesktopSigninHost.Main(args);return;}
        if(role=="worker"){SodaDesktopSigninWorker.Main(args);return;}
        throw new InvalidOperationException("Signin native role is unavailable");
    }
    public static void VerifyGeneratedData() {
        if(Role(new string[0])!="service"||Role(new[]{"--context"})!="worker")throw new InvalidOperationException("Native role routing changed");
        foreach(string purpose in new[]{"input","view","presence"}) {
            if(Role(new[]{"--broker",purpose})!="worker"||Role(new[]{"--worker","00000000-0000-4000-8000-000000000001","1","1","1",purpose})!="worker")throw new InvalidOperationException("Native worker route changed");
        }
        foreach(var args in new[]{null,new[]{"--service"},new[]{"--console"},new[]{"--context","input"},new[]{"--broker","other"},new[]{"--worker"},new[]{"--worker","00000000-0000-0000-0000-000000000000","1","1","1","view"},new[]{"--worker","00000000-0000-4000-8000-000000000001","0","1","1","view"},new[]{"--worker","00000000-0000-4000-8000-000000000001","1","1","1","other"}}) {
            if(Role(args)!=null)throw new InvalidOperationException("Native role accepted unknown arguments");
        }
        Console.WriteLine("signin_native_closed_roles_generated_pass");
    }
}
