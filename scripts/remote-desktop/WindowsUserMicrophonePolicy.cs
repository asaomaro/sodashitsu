// Pure policy for an ordinary-user microphone actor. No native/device APIs.
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
public sealed class SodaDesktopUserMicrophonePolicy {
    public sealed class Facts {
        public bool System,Elevated;
        public int Session,ActiveSession,LockState;
        public string Owner,Logon;
    }
    readonly string owner,logon;readonly int session;bool revoked;readonly object gate=new object();
    public SodaDesktopUserMicrophonePolicy(Facts facts,string mode) {
        if((mode!="elevated-default"&&mode!="elevated-uac")||!Valid(facts))throw new InvalidOperationException("Ordinary microphone scope required");
        owner=facts.Owner;logon=facts.Logon;session=facts.Session;
    }
    static bool Valid(Facts facts){return facts!=null&&!facts.System&&!facts.Elevated&&facts.Session>0&&facts.ActiveSession==facts.Session&&facts.LockState==1&&facts.Owner!=null&&Regex.IsMatch(facts.Owner,@"\AS-1-5-[0-9-]+\z")&&facts.Logon!=null&&Regex.IsMatch(facts.Logon,@"\AS-1-5-5-[0-9]+-[0-9]+\z");}
    public bool Current(Facts facts){lock(gate){if(revoked)return false;if(!Valid(facts)||facts.Owner!=owner||facts.Logon!=logon||facts.Session!=session){revoked=true;return false;}return true;}}
    public bool Peer(Facts facts){lock(gate){return !revoked&&Valid(facts)&&facts.Owner==owner&&facts.Logon==logon&&facts.Session==session;}}
    public static bool Start(Dictionary<string,object> command,string id,bool enabled,long now,long started,long heartbeat,bool stopping){
        return !enabled&&!stopping&&now>=started&&now-started<2500&&now>=heartbeat&&now-heartbeat<2000&&command!=null&&command.Count==5&&
            Object.Equals(command.ContainsKey("type")?command["type"]:null,"native_microphone")&&Object.Equals(command.ContainsKey("id")?command["id"]:null,id)&&
            Object.Equals(command.ContainsKey("enabled")?command["enabled"]:null,true)&&command.ContainsKey("pipeName")&&command["pipeName"] is string&&Regex.IsMatch((string)command["pipeName"],@"\ASodaDesktopMicrophone-[a-f0-9]{32}\z")&&
            command.ContainsKey("clientPid")&&command["clientPid"] is int&&(int)command["clientPid"]>0;
    }
    public static void GeneratedChecks(){
        var facts=new Facts{Owner="S-1-5-21-1-2-3-1001",Logon="S-1-5-5-1-2",Session=1,ActiveSession=1,LockState=1};
        foreach(var mode in new[]{"elevated-default","elevated-uac"}){
            var p=new SodaDesktopUserMicrophonePolicy(facts,mode);if(!p.Current(facts)||!p.Peer(facts))throw new Exception("Ordinary microphone rejected");
            facts.LockState=0;if(p.Current(facts))throw new Exception("Microphone survived lock");facts.LockState=1;if(p.Current(facts))throw new Exception("Microphone scope resurrected");
        }
        foreach(var mode in new[]{"locked-winlogon","signin",null}){bool rejected=false;try{new SodaDesktopUserMicrophonePolicy(facts,mode);}catch(InvalidOperationException){rejected=true;}if(!rejected)throw new Exception("Signin microphone admitted");}
        var scope=new SodaDesktopUserMicrophonePolicy(facts,"elevated-default");facts.System=true;if(scope.Peer(facts))throw new Exception("SYSTEM audio actor admitted");facts.System=false;
        facts.Elevated=true;if(scope.Peer(facts))throw new Exception("Elevated audio actor admitted");facts.Elevated=false;
        facts.Logon="S-1-5-5-3-4";if(scope.Peer(facts))throw new Exception("Other logon microphone admitted");facts.Logon="S-1-5-5-1-2";
        facts.Session=2;if(scope.Peer(facts))throw new Exception("Other session microphone admitted");facts.Session=1;
        facts.Owner="S-1-5-21-1-2-3-1002";if(scope.Peer(facts))throw new Exception("Other user microphone admitted");facts.Owner="S-1-5-21-1-2-3-1001";
        string id=Guid.NewGuid().ToString("D");var command=new Dictionary<string,object>{{"type","native_microphone"},{"id",id},{"enabled",true},{"pipeName","SodaDesktopMicrophone-"+Guid.NewGuid().ToString("N")},{"clientPid",1}};
        if(!Start(command,id,false,100,100,100,false))throw new Exception("Microphone start rejected");
        if(Start(command,id,false,2600,100,2600,false))throw new Exception("Microphone startup extended");
        if(Start(command,id,false,2100,100,100,false))throw new Exception("Microphone heartbeat expired");
        if(Start(command,id,true,100,100,100,false)||Start(command,id,false,100,100,100,true)||Start(command,Guid.NewGuid().ToString("D"),false,100,100,100,false))throw new Exception("Microphone stream ownership missing");
        Console.WriteLine("user_microphone_policy_checks_passed: ordinary SID/logon/session, UAC/Default only, irreversible lock, deadline/heartbeat/stream; fake facts only");
    }
}
