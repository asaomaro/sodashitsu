// Direct OS facts for the retained worker and broker. No private observer,
// WinEvent marker, epoch or synthetic proof lifetime.
using System;
using System.Diagnostics;
using System.IO;
public sealed class SodaDesktopSigninInactiveException:InvalidOperationException {}
public sealed class SodaDesktopSigninScopeNative:IDisposable {
    readonly int session;readonly Process self,broker;
    readonly SodaDesktopSigninCandidateNative candidate=new SodaDesktopSigninCandidateNative();
    bool closed;
    static Exception Failure(){return new InvalidOperationException("Signin scope is unavailable");}
    internal static void RequireCandidate(bool candidate){if(!candidate)throw new SodaDesktopSigninInactiveException();}
    public SodaDesktopSigninScopeNative(string owner,int session,int brokerPid,long brokerStarted){
        this.session=session;
        try{
            if(session<1||!SodaDesktopSigninVault.SystemPrimary()||!candidate.SystemWithTcb)throw Failure();
            self=Process.GetCurrentProcess();broker=Process.GetProcessById(brokerPid);
            string expected=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu","DesktopSignin-"+SodaDesktopSigninPackage.Slot(owner),"DesktopSigninNative.exe");
            if(self.Handle==IntPtr.Zero||broker.Handle==IntPtr.Zero||self.HasExited||broker.HasExited||self.SessionId!=session||broker.SessionId!=0||broker.StartTime.ToUniversalTime().Ticks!=brokerStarted||!String.Equals(self.MainModule.FileName,expected,StringComparison.OrdinalIgnoreCase)||!String.Equals(broker.MainModule.FileName,expected,StringComparison.OrdinalIgnoreCase))throw Failure();
            SodaDesktopSigninCandidate.Candidate facts;RequireCandidate(SodaDesktopSigninCandidate.Read(candidate,(uint)session,out facts));
        }catch{Dispose();throw;}
    }
    public SodaDesktopSigninScope.Facts Read(){
        var facts=new SodaDesktopSigninScope.Facts{Session=session};if(closed)return facts;
        try{
            facts.BrokerPid=broker.Id;facts.BrokerStarted=broker.StartTime.ToUniversalTime().Ticks;facts.WorkerPid=self.Id;facts.WorkerStarted=self.StartTime.ToUniversalTime().Ticks;
            facts.BrokerAlive=!broker.HasExited;facts.WorkerAlive=!self.HasExited;
            SodaDesktopSigninCandidate.Candidate candidateNow;
            facts.Candidate=facts.BrokerAlive&&facts.WorkerAlive&&broker.SessionId==0&&self.SessionId==session&&SodaDesktopSigninCandidate.Read(candidate,(uint)session,out candidateNow);
        }catch{facts.Candidate=false;}
        return facts;
    }
    public void Dispose(){closed=true;if(broker!=null)broker.Dispose();if(self!=null)self.Dispose();}
}
