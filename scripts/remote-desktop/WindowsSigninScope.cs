// Pure, terminal scope guard. Never reads the OS or grants consent by itself.
using System;
using System.Diagnostics;

public sealed class SodaDesktopSigninScope {
    public sealed class Facts {
        public bool Candidate,Observer,BrokerAlive,WorkerAlive;
        public int Session,BrokerPid,WorkerPid;
        public long Epoch,BrokerStarted,WorkerStarted;
        public Guid Nonce;
    }
    public sealed class Frame {
        internal readonly SodaDesktopSigninScope Owner;internal readonly long Epoch,Serial,At;
        internal Frame(SodaDesktopSigninScope owner,long epoch,long serial,long at){Owner=owner;Epoch=epoch;Serial=serial;At=at;}
    }
    readonly object gate=new object();readonly Func<long> now;
    readonly int session,brokerPid,workerPid;readonly long brokerStarted,workerStarted,deadline;
    readonly Guid nonce;readonly bool allowInput;
    bool ended,control;long epoch=-1,serial,published,publishedAt,input,drawn,drawnAt,lastNow,controlRevision;
    public SodaDesktopSigninScope(int session,int brokerPid,long brokerStarted,int workerPid,long workerStarted,Guid nonce,bool allowInput,Func<long> now){
        if(session<1||brokerPid<1||workerPid<1||brokerPid==workerPid||brokerStarted<1||workerStarted<1||nonce==Guid.Empty||now==null)throw new ArgumentException("Signin scope is unavailable");
        this.session=session;this.brokerPid=brokerPid;this.brokerStarted=brokerStarted;this.workerPid=workerPid;this.workerStarted=workerStarted;this.nonce=nonce;this.allowInput=allowInput;this.now=now;
        long start=now();if(start<0||start>Int64.MaxValue-120000)throw new ArgumentException("Signin scope is unavailable");deadline=start+120000;lastNow=start;
    }
    long Now(){long value=now();if(value<lastNow)throw new InvalidOperationException("Signin clock changed");lastNow=value;return value;}
    bool FactsMatch(Facts facts){return facts!=null&&facts.Candidate&&facts.Observer&&facts.BrokerAlive&&facts.WorkerAlive&&facts.Session==session&&facts.BrokerPid==brokerPid&&facts.BrokerStarted==brokerStarted&&facts.WorkerPid==workerPid&&facts.WorkerStarted==workerStarted&&facts.Nonce==nonce&&facts.Epoch>=0;}
    bool CurrentCore(Func<Facts> read){
        if(ended)return false;
        try{
            if(Now()>=deadline){ended=true;control=false;return false;}
            Facts facts=read();
            if(ended||Now()>=deadline||!FactsMatch(facts)||epoch>=0&&epoch!=facts.Epoch){ended=true;control=false;return false;}
            if(epoch<0)epoch=facts.Epoch;return !ended;
        }catch{ended=true;control=false;return false;}
    }
    public bool Current(Func<Facts> read){lock(gate)return CurrentCore(read);}
    public Frame Capture(Func<Facts> read){lock(gate){if(!CurrentCore(read)||serial==Int64.MaxValue)return null;long at=Now();if(ended||at>=deadline){ended=true;return null;}return new Frame(this,epoch,++serial,at);}}
    public bool Publish(Frame frame,Func<Facts> read){lock(gate){
        if(frame==null||frame.Owner!=this||!CurrentCore(read))return false;
        long at=Now();
        if(ended||at>=deadline||frame.Epoch!=epoch||frame.Serial!=serial||frame.Serial<=published||at-frame.At>=1500)return false;
        published=frame.Serial;publishedAt=frame.At;return true;
    }}
    public bool Drawn(long sequence,Func<Facts> read){lock(gate){
        if(sequence<1||!CurrentCore(read))return false;long at=Now();
        if(ended||at>=deadline||sequence<=drawn||sequence!=published||at-publishedAt>=1500)return false;
        drawn=sequence;drawnAt=publishedAt;return true;
    }}
    public bool Control(bool enabled,Func<Facts> read){lock(gate){
        control=false;if(controlRevision==Int64.MaxValue){ended=true;return false;}long revision=++controlRevision;
        if(!enabled||!allowInput||!CurrentCore(read)||ended||revision!=controlRevision)return false;
        control=true;return true;
    }}
    public bool Input(long sequence,long frameSequence,Func<Facts> read){lock(gate){
        if(!control||!allowInput||sequence<1||frameSequence<1)return false;long revision=controlRevision;
        if(!CurrentCore(read))return false;long at=Now();
        if(ended||at>=deadline||!control||revision!=controlRevision||sequence<=input||frameSequence!=drawn||at<drawnAt||at-drawnAt>=1500)return false;
        input=sequence;return true;
    }}
    public void Close(){lock(gate){ended=true;control=false;}}
}
