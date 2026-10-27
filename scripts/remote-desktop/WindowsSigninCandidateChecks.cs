// Generated host only. Never constructs the native host or queries Windows state.
using System;
using System.Collections.Generic;

public static class SodaDesktopSigninCandidateChecks {
    sealed class Fake : SodaDesktopSigninCandidate.Host {
        public bool System=true,StateOk=true,NameEmpty=true,TokenSuccess=false,NamesOk=true,ThrowToken=false,ThrowClose=false;
        public int State=1,Session=4,Error=1008,Closed,ConsoleReads,WorkerReads,SystemReads,TokenReads,StateReads,UserReads;
        public int SecondState=1,SecondError=1008;
        public bool SecondEmpty=true,SecondTokenSuccess=false,SecondThrowToken=false;
        public IntPtr SecondToken=IntPtr.Zero;
        public int SecondWorker=4;
        public bool SecondSystem=true;
        public uint FirstConsole=4,SecondConsole=4;
        public IntPtr Token=IntPtr.Zero;
        public string Station="WinSta0",Input="Winlogon",Thread="Winlogon",ThrowAt;
        public readonly List<string> Calls=new List<string>();
        void Hit(string name) { Calls.Add(name);if(ThrowAt==name)throw new Exception("private native diagnostic"); }
        public bool SystemWithTcb { get { Hit("system");return ++SystemReads==1?System:SecondSystem; } }
        public int WorkerSession { get { Hit("worker");return ++WorkerReads==1?Session:SecondWorker; } }
        public uint ConsoleSession() { Hit("console");return ++ConsoleReads==1?FirstConsole:SecondConsole; }
        public bool SessionState(uint session,out int state) { Hit("state");Check(session==4,"Wrong session queried");state=++StateReads==1?State:SecondState;return StateOk; }
        public bool EmptyUserName(uint session) { Hit("user");Check(session==4,"Wrong user session queried");return ++UserReads==1?NameEmpty:SecondEmpty; }
        public bool QueryToken(uint session,out IntPtr token,out int error) {
            Hit("token");Check(session==4,"Wrong token session queried");bool first=++TokenReads==1;token=first?Token:SecondToken;error=first?Error:SecondError;
            if(first?ThrowToken:SecondThrowToken)throw new Exception("private token diagnostic");return first?TokenSuccess:SecondTokenSuccess;
        }
        public void CloseToken(IntPtr token) { Closed++;Check(token==(TokenReads==1?Token:SecondToken),"Wrong token closed");Hit("close");if(ThrowClose)throw new Exception("private cleanup diagnostic"); }
        public bool DesktopNames(out string station,out string input,out string thread) { Hit("names");station=Station;input=Input;thread=Thread;return NamesOk; }
    }
    static void Check(bool value,string message) { if(!value)throw new InvalidOperationException(message); }
    static bool Read(Fake host) { SodaDesktopSigninCandidate.Candidate candidate;bool result=SodaDesktopSigninCandidate.Read(host,4,out candidate);Check(result?candidate!=null&&candidate.Session==4:candidate==null,"Partial candidate escaped");return result; }
    static void Reject(string name,Action<Fake> change) { var host=new Fake();change(host);Check(!Read(host),"Unsafe signin candidate accepted: "+name); }
    static byte[] Privileges(uint count,params uint[] values) {
        var bytes=new byte[4+values.Length*4];Buffer.BlockCopy(BitConverter.GetBytes(count),0,bytes,0,4);
        for(int index=0;index<values.Length;index++)Buffer.BlockCopy(BitConverter.GetBytes(values[index]),0,bytes,4+index*4,4);
        return bytes;
    }
    static void PrivilegeChecks() {
        Check(SodaDesktopSigninCandidateNative.EnabledPrivilege(Privileges(2,99,0,0,7,0,2),7,0),"Enabled target privilege rejected");
        Check(SodaDesktopSigninCandidateNative.EnabledPrivilege(Privileges(1,7,0,0x80000002),7,0),"Used enabled target privilege rejected");
        Check(SodaDesktopSigninCandidateNative.EnabledPrivilege(Privileges(1,7,0xffffffff,2),7,-1),"Signed LUID high word rejected");
        foreach(uint flags in new uint[]{0,1,4,6,0x80000000})Check(!SodaDesktopSigninCandidateNative.EnabledPrivilege(Privileges(1,7,0,flags),7,0),"Disabled or removed target privilege accepted");
        Check(!SodaDesktopSigninCandidateNative.EnabledPrivilege(Privileges(1,99,0,2),7,0),"Unrelated enabled privilege accepted");
        Check(!SodaDesktopSigninCandidateNative.EnabledPrivilege(Privileges(1,7,1,2),7,0),"Different LUID high word accepted");
        Check(!SodaDesktopSigninCandidateNative.EnabledPrivilege(Privileges(2,7,0,2,7,0,2),7,0),"Duplicate target privilege accepted");
        foreach(byte[] bytes in new[]{null,new byte[3],Privileges(0),Privileges(2,7,0,2),Privileges(UInt32.MaxValue,7,0,2),new byte[6149]})
            Check(!SodaDesktopSigninCandidateNative.EnabledPrivilege(bytes,7,0),"Malformed privilege buffer accepted");
    }
    public static void Run() {
        PrivilegeChecks();
        var good=new Fake();Check(Read(good),"Generated signed-out candidate rejected");Check(good.Closed==0,"Unexpected candidate resources");
        Reject("non-SYSTEM or missing TCB",h=>h.System=false);
        Reject("wrong worker session",h=>h.Session=0);
        Reject("other console",h=>h.FirstConsole=8);
        Reject("console detaching",h=>h.FirstConsole=UInt32.MaxValue);
        Reject("state unavailable",h=>h.StateOk=false);
        foreach(int state in new[]{-1,0,2,3,4,5,6,7,8,9,10}) { int value=state;Reject("WTS state "+value,h=>h.State=value); }
        Reject("logged-on name or query failure",h=>h.NameEmpty=false);
        foreach(int error in new[]{0,5,87,233,1245,1314,1722}) { int value=error;Reject("token query error "+value,h=>h.Error=value); }
        Reject("successful null token",h=>h.TokenSuccess=true);
        Reject("invalid token handle",h=>h.Token=new IntPtr(-1));
        foreach(bool success in new[]{false,true}) {
            var host=new Fake {TokenSuccess=success,Token=new IntPtr(23)};
            Check(!Read(host) && host.Closed==1 && !host.Calls.Contains("names"),"Token was leaked or desktop inspected after a present token");
        }
        var throwing=new Fake {Token=new IntPtr(23),ThrowToken=true};
        Check(!Read(throwing) && throwing.Closed==1,"Throwing token query leaked its returned handle");
        var closeFailure=new Fake {Token=new IntPtr(23),TokenSuccess=true,ThrowClose=true};
        Check(!Read(closeFailure) && closeFailure.Closed==1,"Cleanup failure published a candidate or retried close");
        Reject("desktop query failed",h=>h.NamesOk=false);
        Reject("service station",h=>h.Station="Service-0x0-3e7$");
        Reject("user input desktop",h=>h.Input="Default");
        Reject("wrong thread desktop",h=>h.Thread="Default");
        Reject("missing station",h=>h.Station=null);
        Reject("missing input desktop",h=>h.Input=null);
        Reject("missing thread desktop",h=>h.Thread=null);
        Reject("console switched during query",h=>h.SecondConsole=8);
        Reject("worker scope changed",h=>h.SecondWorker=8);
        Reject("caller authority changed",h=>h.SecondSystem=false);
        Reject("user signed in during query",h=>h.SecondState=0);
        Reject("user name appeared during query",h=>h.SecondEmpty=false);
        Reject("final token query denied",h=>h.SecondError=5);
        foreach(bool success in new[]{false,true}) {
            var host=new Fake {SecondTokenSuccess=success,SecondToken=new IntPtr(31)};
            Check(!Read(host) && host.Closed==1,"Final token query leaked a handle or accepted a user");
        }
        var lateThrow=new Fake {SecondToken=new IntPtr(31),SecondThrowToken=true};
        Check(!Read(lateThrow) && lateThrow.Closed==1,"Final throwing token query leaked a handle");
        foreach(string call in new[]{"system","worker","console","state","user","token","names"}) { string value=call;Reject("query threw at "+value,h=>h.ThrowAt=value); }
        foreach(uint session in new uint[]{0,UInt32.MaxValue,2147483648U}) {
            var host=new Fake();SodaDesktopSigninCandidate.Candidate candidate;
            Check(!SodaDesktopSigninCandidate.Read(host,session,out candidate) && candidate==null && host.Calls.Count==0,"Invalid expected session performed queries");
        }
        SodaDesktopSigninCandidate.Candidate missing;
        Check(!SodaDesktopSigninCandidate.Read(null,4,out missing) && missing==null,"Missing host accepted");
        Console.WriteLine("desktop_signin_candidate_generated_passed");
    }
}
