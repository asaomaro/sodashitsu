// Immutable v2 worker scope and pure policy. No native APIs, service or input operations.
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using System.Security.Principal;
using System.Web.Script.Serialization;

public sealed class SodaDesktopProtectedScope {
    public enum Mode { LockedWinlogon, ElevatedDefault, ElevatedUac }
    static readonly string[] Names={"locked-winlogon","elevated-default","elevated-uac"};
    public readonly Mode Role;
    public readonly int Purpose,Session,BrokerPid,WorkerPid;
    public readonly string Owner,Logon;
    public readonly long Generation,BrokerStarted,WorkerStarted;
    public readonly Guid Nonce;
    static bool ValidOwner(string owner){try{return owner!=null&&owner.Length<=184&&new SecurityIdentifier(owner).Value==owner;}catch{return false;}}
    public SodaDesktopProtectedScope(Mode role,int purpose,string owner,string logon,int session,long generation,Guid nonce,int brokerPid,long brokerStarted,int workerPid,long workerStarted){
        if((int)role<0||(int)role>=Names.Length||purpose<1||purpose>7||(purpose&(role==Mode.LockedWinlogon?1:4))==0||
           !ValidOwner(owner)||
           logon==null||logon.Length>64||!Regex.IsMatch(logon,@"\AS-1-5-5-[0-9]+-[0-9]+\z")||session<1||generation<1||generation>9007199254740991L||nonce==Guid.Empty||brokerPid<1||workerPid<1||brokerPid==workerPid||brokerStarted<1||workerStarted<1)throw new ArgumentException("Invalid protected worker scope");
        Role=role;Purpose=purpose;Owner=owner;Logon=logon;Session=session;Generation=generation;Nonce=nonce;BrokerPid=brokerPid;BrokerStarted=brokerStarted;WorkerPid=workerPid;WorkerStarted=workerStarted;
    }
    string EncodeType(string type){
        var values=new SortedDictionary<string,object>(StringComparer.Ordinal){{"type",type},{"version",2},{"mode",Names[(int)Role]},{"purpose",Purpose},{"owner",Owner},{"logon",Logon},{"session",Session},{"generation",Generation},{"nonce",Nonce.ToString("D")},{"brokerPid",BrokerPid},{"brokerStarted",BrokerStarted},{"workerPid",WorkerPid},{"workerStarted",WorkerStarted}};
        return new JavaScriptSerializer{MaxJsonLength=4096}.Serialize(values);
    }
    public string Encode(){return EncodeType("worker_scope");}
    public string Ready(){return EncodeType("worker_scope_ready");}
    static long Integer(object value){if(!(value is int)&&!(value is long))throw new FormatException("Scope integer required");return Convert.ToInt64(value);}
    static SodaDesktopProtectedScope DecodeType(string wire,string type){
        if(wire==null||wire.Length>4096)throw new FormatException("Scope message limit");
        try{
            var data=new JavaScriptSerializer{MaxJsonLength=4096}.Deserialize<Dictionary<string,object>>(wire);
            if(data==null||data.Count!=13||!Object.Equals(data["type"],type)||Integer(data["version"])!=2)throw new FormatException();
            int mode=Array.IndexOf(Names,data["mode"] as string);Guid nonce;if(!Guid.TryParseExact(data["nonce"] as string,"D",out nonce))throw new FormatException();
            var scope=new SodaDesktopProtectedScope((Mode)mode,checked((int)Integer(data["purpose"])),data["owner"] as string,data["logon"] as string,checked((int)Integer(data["session"])),Integer(data["generation"]),nonce,checked((int)Integer(data["brokerPid"])),Integer(data["brokerStarted"]),checked((int)Integer(data["workerPid"])),Integer(data["workerStarted"]));
            // This private v2 prefix is emitted canonically by both peers. Reject duplicate
            // fields, alternate encodings and legacy messages instead of guessing a scope.
            if(!String.Equals(wire,scope.EncodeType(type),StringComparison.Ordinal))throw new FormatException();
            return scope;
        }catch(Exception error){throw new FormatException("Invalid protected worker scope",error);}
    }
    public static SodaDesktopProtectedScope Decode(string wire){return DecodeType(wire,"worker_scope");}
    public bool AcceptsReady(string wire){try{return Same(DecodeType(wire,"worker_scope_ready"));}catch{return false;}}
    public bool Same(SodaDesktopProtectedScope other){return other!=null&&String.Equals(Encode(),other.Encode(),StringComparison.Ordinal);}
    public bool MatchesPeer(Mode role,Guid nonce,string owner,int session,int brokerPid,long brokerStarted,int workerPid,long workerStarted){return Role==role&&Nonce==nonce&&Owner==owner&&Session==session&&BrokerPid==brokerPid&&BrokerStarted==brokerStarted&&WorkerPid==workerPid&&WorkerStarted==workerStarted;}
    public sealed class Facts {
        public bool System;
        public int Session,ActiveSession,LockState,BrokerPid,WorkerPid;
        public string Owner,Logon,Desktop,ThreadDesktop;
        public long Generation,BrokerStarted,WorkerStarted,DesktopEpoch;
        public Guid Nonce;
    }
    public string Failure(Facts facts){
        if(facts==null||!facts.System)return "worker_identity";
        if(facts.Session!=Session||facts.ActiveSession!=Session)return "worker_session";
        if(facts.Owner!=Owner)return "worker_owner";
        if(facts.Logon!=Logon)return "worker_logon";
        if(facts.Generation!=Generation||facts.Nonce!=Nonce)return "worker_generation";
        if(facts.BrokerPid!=BrokerPid||facts.BrokerStarted!=BrokerStarted||facts.WorkerPid!=WorkerPid||facts.WorkerStarted!=WorkerStarted)return "worker_process";
        if(facts.LockState!=(Role==Mode.LockedWinlogon?0:1))return "worker_lock_state";
        if(facts.Desktop!=(Role==Mode.ElevatedDefault?"Default":"Winlogon")||facts.ThreadDesktop!=facts.Desktop)return "worker_desktop";
        return null;
    }
    public sealed class Guard {
        readonly SodaDesktopProtectedScope scope;
        readonly object gate=new object();
        bool revoked,epochBound;long epoch;
        public Guard(SodaDesktopProtectedScope scope){if(scope==null)throw new ArgumentNullException("scope");this.scope=scope;}
        public sealed class Ticket {
            internal readonly Guid Nonce;internal readonly long Generation,Epoch;
            internal Ticket(Guid nonce,long generation,long epoch){Nonce=nonce;Generation=generation;Epoch=epoch;}
        }
        bool Check(Facts facts){if(revoked)return false;if(scope.Failure(facts)!=null||epochBound&&facts.DesktopEpoch!=epoch){revoked=true;return false;}epoch=facts.DesktopEpoch;epochBound=true;return true;}
        public bool Current(Facts facts){lock(gate){return Check(facts);}}
        public Ticket Capture(Facts facts){lock(gate){return Check(facts)?new Ticket(scope.Nonce,scope.Generation,facts.DesktopEpoch):null;}}
        public bool Publish(Ticket ticket,Facts facts){
            lock(gate){if(ticket==null||!Check(facts))return false;
            if(ticket.Nonce!=scope.Nonce||ticket.Generation!=scope.Generation||ticket.Epoch!=facts.DesktopEpoch){revoked=true;return false;}return true;}
        }
        public void Release<T>(ICollection<T> held,Func<Facts> read,Action<T> keyUp){
            try{foreach(var key in new List<T>(held)){lock(gate){if(!Check(read()))break;keyUp(key);}}}
            finally{held.Clear();}
        }
    }
}
