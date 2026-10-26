// Loaded only in the administrator-protected installed broker/worker image.
using System;
using System.Diagnostics;
using System.IO;
public static class SodaDesktopProtectedWorker {
    static SodaDesktopProtectedScope.Mode Role(string mode){
        if(mode=="elevated-default")return SodaDesktopProtectedScope.Mode.ElevatedDefault;
        if(mode=="elevated-uac")return SodaDesktopProtectedScope.Mode.ElevatedUac;
        throw new InvalidOperationException("Protected worker role rejected");
    }
    public static string Create(int purpose,string mode,string owner,string logon,int session,long generation,Guid nonce,int brokerPid,long brokerStarted,int workerPid,long workerStarted){
        return new SodaDesktopProtectedScope(Role(mode),purpose,owner,logon,session,generation,nonce,brokerPid,brokerStarted,workerPid,workerStarted).Encode();
    }
    public static void Broker(string prefix,TextReader reader,TextWriter writer,Func<bool> live,Action close){
        SodaDesktopProtectedHandshake.Broker(SodaDesktopProtectedScope.Decode(prefix),reader,writer,live,close);
    }
    static void Failure(TextWriter writer,string code){try{writer.WriteLine("{\"type\":\"protected_desktop_failure\",\"code\":\""+code+"\"}");writer.Flush();}catch{}}
    // broker PID+creation come from the already authenticated pipe server,
    // role/nonce from fixed worker CLI, owner from the compiled installer constant.
    public static void Run(string mode,Guid nonce,int brokerPid,long brokerStarted,TextReader reader,TextWriter writer){
        using(var identity=System.Security.Principal.WindowsIdentity.GetCurrent())if(!identity.IsSystem)throw new InvalidOperationException("Protected worker identity required");
        using(var self=Process.GetCurrentProcess()){
            var role=Role(mode);long started=self.StartTime.ToUniversalTime().Ticks;int session=self.SessionId;
            var scope=SodaDesktopProtectedHandshake.Receive(reader,peer=>peer.MatchesPeer(role,nonce,SodaDesktopUnlock.Owner,session,brokerPid,brokerStarted,self.Id,started));
            using(var native=new SodaDesktopProtectedScopeNative(scope)){
                var guard=new SodaDesktopProtectedScope.Guard(scope);
                Func<bool> current=()=>guard.Current(native.Read(SodaDesktopUnlock.LockState));
                SodaDesktopProtectedHandshake.Confirm(writer,scope,current);
                Console.SetIn(reader);Console.SetOut(writer);
                try{
                    SodaDesktopHost.RunProtected(current,()=>guard.Capture(native.Read(SodaDesktopUnlock.LockState)),ticket=>guard.Publish((SodaDesktopProtectedScope.Guard.Ticket)ticket,native.Read(SodaDesktopUnlock.LockState)),mode);
                }catch{
                    Failure(writer,current()?"worker_unavailable":"source_changed");return;
                }
                if(!current())Failure(writer,"source_changed");
            }
        }
    }
}
