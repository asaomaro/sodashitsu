// Private v2 prefix only. Callers authenticate the pipe's OS peers first.
using System;
using System.IO;
using System.Threading;
public static class SodaDesktopProtectedHandshake {
    static Exception Rejected(){return new InvalidOperationException("Protected worker handshake rejected");}
    static string Prefix(TextReader reader){
        var text=new System.Text.StringBuilder();
        while(true){int next=reader.Read();if(next<0)throw Rejected();if(next==10)return text.ToString().TrimEnd('\r');if(text.Length>=4096)throw Rejected();text.Append((char)next);}
    }
    public static SodaDesktopProtectedScope Receive(TextReader reader,Func<SodaDesktopProtectedScope,bool> authentic){
        var scope=SodaDesktopProtectedScope.Decode(Prefix(reader));if(!authentic(scope))throw Rejected();return scope;
    }
    public static void Confirm(TextWriter writer,SodaDesktopProtectedScope scope,Func<bool> current){
        if(!current())throw Rejected();writer.WriteLine(scope.Ready());writer.Flush();if(!current())throw Rejected();
    }
    public static void Broker(SodaDesktopProtectedScope scope,TextReader reader,TextWriter writer,Func<bool> live,Action close,int timeout=6000){
        if(scope==null||reader==null||writer==null||live==null||close==null||timeout<1||timeout>6000)throw new ArgumentException();
        object gate=new object();bool finished=false,expired=false,success=false;int closing=0;
        var clock=System.Diagnostics.Stopwatch.StartNew();
        Action cancel=()=>{if(Interlocked.Exchange(ref closing,1)!=0)return;try{close();}catch{}};
        using(var deadline=new Timer(_=>{lock(gate){if(finished)return;expired=true;}cancel();},null,timeout,Timeout.Infinite)){
            try{
                if(!live())throw Rejected();
                writer.WriteLine(scope.Encode());writer.Flush();
                if(!scope.AcceptsReady(Prefix(reader)))throw Rejected();
                bool current=live();
                lock(gate){if(expired||clock.ElapsedMilliseconds>=timeout||!current)throw Rejected();finished=true;success=true;}
            }finally{lock(gate){finished=true;}if(!success)cancel();}
        }
    }
}
