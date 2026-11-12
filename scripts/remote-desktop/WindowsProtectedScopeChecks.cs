// Generated identities/desktop facts only. Never starts or queries a real session.
using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
public static class SodaDesktopProtectedScopeChecks {
    static void Need(bool value,string reason){if(!value)throw new Exception(reason);}
    static SodaDesktopProtectedScope Scope(SodaDesktopProtectedScope.Mode mode=SodaDesktopProtectedScope.Mode.ElevatedDefault,int purpose=4){return new SodaDesktopProtectedScope(mode,purpose,"S-1-5-21-1-2-3-1001","S-1-5-5-1-2",1,7,new Guid("11111111-2222-4333-8444-555555555555"),11,638000000000000001L,12,638000000000000002L);}
    static SodaDesktopProtectedScope.Facts Facts(SodaDesktopProtectedScope scope){return new SodaDesktopProtectedScope.Facts{System=true,Owner=scope.Owner,Logon=scope.Logon,Session=scope.Session,ActiveSession=scope.Session,Generation=scope.Generation,Nonce=scope.Nonce,BrokerPid=scope.BrokerPid,BrokerStarted=scope.BrokerStarted,WorkerPid=scope.WorkerPid,WorkerStarted=scope.WorkerStarted,Desktop=scope.Role==SodaDesktopProtectedScope.Mode.ElevatedDefault?"Default":"Winlogon",ThreadDesktop=scope.Role==SodaDesktopProtectedScope.Mode.ElevatedDefault?"Default":"Winlogon",LockState=scope.Role==SodaDesktopProtectedScope.Mode.LockedWinlogon?0:1};}
    static void Reject(string wire){bool rejected=false;try{SodaDesktopProtectedScope.Decode(wire);}catch(FormatException){rejected=true;}Need(rejected,"Invalid scope wire accepted");}
    public static void Run(){
        var hostScope=Scope();var hostFacts=Facts(hostScope);
        SodaDesktopHost.VerifyProtectedBoundaries(()=>hostScope.Failure(hostFacts)==null,()=>hostFacts.Desktop="Winlogon");
        hostFacts=Facts(hostScope);
        SodaDesktopHost.VerifyProtectedQueuedOutput(()=>hostScope.Failure(hostFacts)==null,()=>hostFacts.Desktop="Winlogon");
        hostFacts=Facts(hostScope);
        SodaDesktopHost.VerifyProtectedNativeOutput(()=>hostScope.Failure(hostFacts)==null,()=>hostFacts.Desktop="Winlogon");
        var cloud=new SodaDesktopProtectedScope(hostScope.Role,hostScope.Purpose,"S-1-12-1-1-2-3-4",hostScope.Logon,hostScope.Session,hostScope.Generation,hostScope.Nonce,hostScope.BrokerPid,hostScope.BrokerStarted,hostScope.WorkerPid,hostScope.WorkerStarted);
        Need(cloud.Same(SodaDesktopProtectedScope.Decode(cloud.Encode()))&&cloud.Failure(Facts(cloud))==null,"Cloud owner SID rejected");
        foreach(var mode in new[]{SodaDesktopProtectedScope.Mode.LockedWinlogon,SodaDesktopProtectedScope.Mode.ElevatedDefault,SodaDesktopProtectedScope.Mode.ElevatedUac}){
            var scope=Scope(mode,mode==SodaDesktopProtectedScope.Mode.LockedWinlogon?1:4);Need(scope.Same(SodaDesktopProtectedScope.Decode(scope.Encode())),"Scope roundtrip");Need(scope.AcceptsReady(scope.Ready()),"Same tuple acknowledgement");Need(!scope.AcceptsReady(scope.Encode()),"Scope cannot substitute for ready");Need(scope.Failure(Facts(scope))==null,"Expected mode allowed");
            foreach(var mutate in new Action<SodaDesktopProtectedScope.Facts>[] {f=>f.System=false,f=>f.ActiveSession++,f=>f.Session++,f=>f.Owner="S-1-5-21-1-2-3-1002",f=>f.Logon="S-1-5-5-1-3",f=>f.Generation++,f=>f.Nonce=Guid.NewGuid(),f=>f.BrokerPid++,f=>f.BrokerStarted++,f=>f.WorkerPid++,f=>f.WorkerStarted++,f=>f.LockState=1-f.LockState,f=>f.Desktop="other",f=>f.ThreadDesktop="other"}){var facts=Facts(scope);mutate(facts);Need(scope.Failure(facts)!=null,"Scope boundary mutation accepted");}
        }
        var selected=Scope();var json=new JavaScriptSerializer();var data=json.Deserialize<Dictionary<string,object>>(selected.Encode());data["extra"]="ignored";Reject(json.Serialize(data));Reject(selected.Encode().Replace("\"version\":2","\"version\":2,\"version\":2"));Reject(selected.Encode().Replace("\"version\":2","\"version\":2.0"));Reject(" "+selected.Encode());Reject(selected.Encode().Replace("elevated-default","locked-winlogon"));
        Need(!selected.MatchesPeer(selected.Role,Guid.NewGuid(),selected.Owner,selected.Session,selected.BrokerPid,selected.BrokerStarted,selected.WorkerPid,selected.WorkerStarted),"CLI nonce must match authenticated prefix");
        Need(!selected.AcceptsReady(Scope(SodaDesktopProtectedScope.Mode.ElevatedUac).Ready()),"UAC worker acknowledged Default scope");Need(!selected.AcceptsReady(Scope(SodaDesktopProtectedScope.Mode.ElevatedDefault,5).Ready()),"Different purpose acknowledged");
        Console.WriteLine("protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, direct OS identity/desktop admission at input and queued output; fake facts only");
    }
}
