// Signin-specific consent and replay checks over current OS process/session facts.
using System;
public sealed class SodaDesktopSigninScope {
    public sealed class Facts {
        public bool Candidate,BrokerAlive,WorkerAlive;
        public int Session,BrokerPid,WorkerPid;
        public long BrokerStarted,WorkerStarted;
    }
    readonly int session,brokerPid,workerPid;readonly long brokerStarted,workerStarted;
    readonly bool allowInput;bool closed,control;long input;
    public SodaDesktopSigninScope(int session,int brokerPid,long brokerStarted,int workerPid,long workerStarted,bool allowInput){
        if(session<1||brokerPid<1||workerPid<1||brokerPid==workerPid||brokerStarted<1||workerStarted<1)throw new ArgumentException("Signin scope is unavailable");
        this.session=session;this.brokerPid=brokerPid;this.brokerStarted=brokerStarted;this.workerPid=workerPid;this.workerStarted=workerStarted;this.allowInput=allowInput;
    }
    public bool Current(Func<Facts> read){
        if(closed)return false;
        try{var facts=read();if(!closed&&facts!=null&&facts.Candidate&&facts.BrokerAlive&&facts.WorkerAlive&&facts.Session==session&&facts.BrokerPid==brokerPid&&facts.BrokerStarted==brokerStarted&&facts.WorkerPid==workerPid&&facts.WorkerStarted==workerStarted)return true;}catch{}
        Close();return false;
    }
    public bool Control(bool enabled,Func<Facts> read){control=enabled&&allowInput&&Current(read);return control;}
    public bool Input(long sequence,Func<Facts> read){if(!control||sequence<=input||!Current(read))return false;input=sequence;return true;}
    public void Close(){closed=true;control=false;}
}
