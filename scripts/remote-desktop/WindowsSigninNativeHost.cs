// One immutable privileged image; service/session workers remain distinct OS processes.
using System;
public static partial class SodaDesktopSigninNativeHost {
    internal static string Role(string[] args) {
        if(args==null)return null;
        if(args.Length==0)return "service";
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
}
