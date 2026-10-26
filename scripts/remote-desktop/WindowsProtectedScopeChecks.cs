// Generated identities/desktop facts only. Never starts or queries a real session.
using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Threading;
using System.Threading.Tasks;
public static class SodaDesktopProtectedScopeChecks {
    static void Need(bool value,string reason){if(!value)throw new Exception(reason);}
    static SodaDesktopProtectedScope Scope(SodaDesktopProtectedScope.Mode mode=SodaDesktopProtectedScope.Mode.ElevatedDefault,int purpose=4){return new SodaDesktopProtectedScope(mode,purpose,"S-1-5-21-1-2-3-1001","S-1-5-5-1-2",1,7,new Guid("11111111-2222-4333-8444-555555555555"),11,638000000000000001L,12,638000000000000002L);}
    static SodaDesktopProtectedScope.Facts Facts(SodaDesktopProtectedScope scope){return new SodaDesktopProtectedScope.Facts{System=true,Owner=scope.Owner,Logon=scope.Logon,Session=scope.Session,ActiveSession=scope.Session,Generation=scope.Generation,Nonce=scope.Nonce,BrokerPid=scope.BrokerPid,BrokerStarted=scope.BrokerStarted,WorkerPid=scope.WorkerPid,WorkerStarted=scope.WorkerStarted,Desktop=scope.Role==SodaDesktopProtectedScope.Mode.ElevatedDefault?"Default":"Winlogon",ThreadDesktop=scope.Role==SodaDesktopProtectedScope.Mode.ElevatedDefault?"Default":"Winlogon",LockState=scope.Role==SodaDesktopProtectedScope.Mode.LockedWinlogon?0:1,DesktopEpoch=3};}
    static void Reject(string wire){bool rejected=false;try{SodaDesktopProtectedScope.Decode(wire);}catch(FormatException){rejected=true;}Need(rejected,"Invalid scope wire accepted");}
    static void CheckEpochFence(){
        using(var epoch=new SodaDesktopProtectedEpoch())using(var posted=new ManualResetEventSlim(false)){
            long observed=-1;int sequence=0;
            var waiting=Task.Run(()=>epoch.Checkpoint(id=>{sequence=id;posted.Set();},2000,out observed));
            Need(posted.Wait(1000),"Marker not queued");
            epoch.Marker(sequence+1);Need(!waiting.IsCompleted,"Unrelated marker accepted");
            // Model away/back notifications queued before the marker, dispatched late.
            epoch.Changed();epoch.Changed();Need(!waiting.IsCompleted,"Queued transitions bypassed marker wait");
            epoch.Marker(sequence);Need(waiting.Wait(1000)&&waiting.Result&&observed==2,"Delayed desktop notifications were not drained before snapshot");
        }
        using(var epoch=new SodaDesktopProtectedEpoch()){
            long observed;Need(!epoch.Checkpoint(id=>{},10,out observed),"Unresponsive observer accepted");
            Need(!epoch.Checkpoint(id=>epoch.Marker(id),100,out observed),"Timed-out observer resurrected");
        }
        using(var epoch=new SodaDesktopProtectedEpoch()){
            long observed;Need(!epoch.Checkpoint(id=>{throw new Exception("generated marker failure");},100,out observed),"Marker failure accepted");
        }
        using(var epoch=new SodaDesktopProtectedEpoch())using(var posted=new ManualResetEventSlim(false)){
            long observed=-1;var waiting=Task.Run(()=>epoch.Checkpoint(id=>posted.Set(),2000,out observed));Need(posted.Wait(1000),"Closing marker not queued");epoch.Dispose();Need(waiting.Wait(1000)&&!waiting.Result,"Observer shutdown did not reject pending snapshot");
        }
    }
    public static void Run(){
        CheckEpochFence();
        var hostScope=Scope();var hostFacts=Facts(hostScope);var hostGuard=new SodaDesktopProtectedScope.Guard(hostScope);
        SodaDesktopHost.VerifyProtectedBoundaries(()=>hostGuard.Current(hostFacts),()=>hostGuard.Capture(hostFacts),frameTicket=>hostGuard.Publish((SodaDesktopProtectedScope.Guard.Ticket)frameTicket,hostFacts),()=>hostFacts.DesktopEpoch++);
        hostFacts=Facts(hostScope);hostGuard=new SodaDesktopProtectedScope.Guard(hostScope);
        SodaDesktopHost.VerifyProtectedQueuedOutput(()=>hostGuard.Current(hostFacts),()=>hostGuard.Capture(hostFacts),frameTicket=>hostGuard.Publish((SodaDesktopProtectedScope.Guard.Ticket)frameTicket,hostFacts),()=>hostFacts.DesktopEpoch++);
        var cloud=new SodaDesktopProtectedScope(hostScope.Role,hostScope.Purpose,"S-1-12-1-1-2-3-4",hostScope.Logon,hostScope.Session,hostScope.Generation,hostScope.Nonce,hostScope.BrokerPid,hostScope.BrokerStarted,hostScope.WorkerPid,hostScope.WorkerStarted);
        Need(cloud.Same(SodaDesktopProtectedScope.Decode(cloud.Encode()))&&cloud.Failure(Facts(cloud))==null,"Cloud owner SID rejected");
        foreach(var mode in new[]{SodaDesktopProtectedScope.Mode.LockedWinlogon,SodaDesktopProtectedScope.Mode.ElevatedDefault,SodaDesktopProtectedScope.Mode.ElevatedUac}){
            var scope=Scope(mode,mode==SodaDesktopProtectedScope.Mode.LockedWinlogon?1:4);Need(scope.Same(SodaDesktopProtectedScope.Decode(scope.Encode())),"Scope roundtrip");Need(scope.AcceptsReady(scope.Ready()),"Same tuple acknowledgement");Need(!scope.AcceptsReady(scope.Encode()),"Scope cannot substitute for ready");Need(scope.Failure(Facts(scope))==null,"Expected mode allowed");
            foreach(var mutate in new Action<SodaDesktopProtectedScope.Facts>[] {f=>f.System=false,f=>f.ActiveSession++,f=>f.Session++,f=>f.Owner="S-1-5-21-1-2-3-1002",f=>f.Logon="S-1-5-5-1-3",f=>f.Generation++,f=>f.Nonce=Guid.NewGuid(),f=>f.BrokerPid++,f=>f.BrokerStarted++,f=>f.WorkerPid++,f=>f.WorkerStarted++,f=>f.LockState=1-f.LockState,f=>f.Desktop="other",f=>f.ThreadDesktop="other"}){var facts=Facts(scope);mutate(facts);Need(scope.Failure(facts)!=null,"Scope boundary mutation accepted");}
        }
        var selected=Scope();var json=new JavaScriptSerializer();var data=json.Deserialize<Dictionary<string,object>>(selected.Encode());data["extra"]="ignored";Reject(json.Serialize(data));Reject(selected.Encode().Replace("\"version\":2","\"version\":2,\"version\":2"));Reject(selected.Encode().Replace("\"version\":2","\"version\":2.0"));Reject(" "+selected.Encode());Reject(selected.Encode().Replace("elevated-default","locked-winlogon"));
        Need(!selected.MatchesPeer(selected.Role,Guid.NewGuid(),selected.Owner,selected.Session,selected.BrokerPid,selected.BrokerStarted,selected.WorkerPid,selected.WorkerStarted),"CLI nonce must match authenticated prefix");
        var guard=new SodaDesktopProtectedScope.Guard(selected);var current=Facts(selected);var ticket=guard.Capture(current);Need(ticket!=null,"Capture admitted");current.DesktopEpoch++;Need(!guard.Publish(ticket,current),"Transition during encode published");current.DesktopEpoch--;Need(!guard.Current(current),"Revoked scope resurrected");
        guard=new SodaDesktopProtectedScope.Guard(selected);current=Facts(selected);ticket=guard.Capture(current);Need(guard.Publish(ticket,current),"Stable frame published");current.Logon="S-1-5-5-1-99";Need(!guard.Publish(ticket,current),"New logon received old frame");
        var keys=new HashSet<string>{"ShiftLeft","KeyA"};var ups=new List<string>();guard=new SodaDesktopProtectedScope.Guard(selected);current=Facts(selected);current.Desktop="Winlogon";guard.Release(keys,()=>current,ups.Add);Need(keys.Count==0&&ups.Count==0,"Keyup sent into new desktop");
        keys=new HashSet<string>{"ShiftLeft","KeyA"};guard=new SodaDesktopProtectedScope.Guard(selected);current=Facts(selected);guard.Release(keys,()=>current,ups.Add);Need(keys.Count==0&&ups.Count==2,"Live old scope releases keys");
        guard=new SodaDesktopProtectedScope.Guard(selected);current=Facts(selected);Need(guard.Current(current),"Initial epoch bound");current.DesktopEpoch++;Need(!guard.Current(current)&&guard.Capture(current)==null,"New epoch admitted without reapproval");
        keys=new HashSet<string>{"ShiftLeft"};ups.Clear();guard.Release(keys,()=>current,ups.Add);Need(keys.Count==0&&ups.Count==0,"Epoch-changed release sent input");
        var other=new SodaDesktopProtectedScope(selected.Role,selected.Purpose,selected.Owner,selected.Logon,selected.Session,selected.Generation,Guid.NewGuid(),selected.BrokerPid,selected.BrokerStarted,selected.WorkerPid,selected.WorkerStarted);
        guard=new SodaDesktopProtectedScope.Guard(selected);var otherGuard=new SodaDesktopProtectedScope.Guard(other);Need(!guard.Publish(otherGuard.Capture(Facts(other)),Facts(selected)),"Other worker scope frame accepted");
        Need(!selected.AcceptsReady(Scope(SodaDesktopProtectedScope.Mode.ElevatedUac).Ready()),"UAC worker acknowledged Default scope");Need(!selected.AcceptsReady(Scope(SodaDesktopProtectedScope.Mode.ElevatedDefault,5).Ready()),"Different purpose acknowledged");
        keys=new HashSet<string>{"ShiftLeft","KeyA"};ups.Clear();guard=new SodaDesktopProtectedScope.Guard(selected);current=Facts(selected);guard.Release(keys,()=>current,key=>{ups.Add(key);current.Desktop="Winlogon";});Need(keys.Count==0&&ups.Count==1,"Release continued after mid-release transition");
        keys=new HashSet<string>{"ShiftLeft"};guard=new SodaDesktopProtectedScope.Guard(selected);current=Facts(selected);try{guard.Release(keys,()=>current,key=>{throw new InvalidOperationException("generated keyup failure");});}catch(InvalidOperationException){}Need(keys.Count==0,"Release failure retained tracker");
        foreach(var mode in new[]{SodaDesktopProtectedScope.Mode.LockedWinlogon,SodaDesktopProtectedScope.Mode.ElevatedUac}){
            var scope=Scope(mode,mode==SodaDesktopProtectedScope.Mode.LockedWinlogon?1:4);var snapshot=Facts(scope);var boundary=new SodaDesktopProtectedScope.Guard(scope);
            SodaDesktopProtectedScopeNative.SealSnapshot(snapshot,()=>true,()=>1-snapshot.LockState);
            Need(!boundary.Current(snapshot),"Lock changed on same Winlogon desktop accepted");
        }
        current=Facts(selected);int reads=0;SodaDesktopProtectedScopeNative.SealSnapshot(current,()=>++reads==1,()=>current.LockState);Need(!current.System&&reads==2,"Transition during terminal lock read accepted");
        current=Facts(selected);SodaDesktopProtectedScopeNative.SealSnapshot(current,()=>true,()=>{throw new Exception("generated read failure");});Need(!current.System,"Terminal lock failure accepted");
        Console.WriteLine("protected_scope_checks_passed: canonical v2 tuple/ack, modes/purpose, owner/logon/session/process/nonce, post-encode epoch, irreversible revocation, no keyup after scope loss; fake facts only");
    }
}
