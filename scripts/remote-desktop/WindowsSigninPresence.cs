// Finite, read-only presence publisher. Never captures pixels or grants input.
using System;
public sealed partial class SodaDesktopSigninPresence {
    readonly Func<long> clock;readonly Func<bool> source;readonly long deadline;
    long lastNow,lastBeat,next,sequence;bool ended,publishing;
    public sealed class Record {
        public string type="signin_presence";public long seq;public int validForMs=1000;
        internal Record(long sequence){seq=sequence;}
    }
    public SodaDesktopSigninPresence(Func<long> clock,Func<bool> source){
        if(clock==null||source==null)throw new ArgumentException("Signin presence is unavailable");this.clock=clock;this.source=source;
        long at=clock();if(at<0||at>Int64.MaxValue-120000)throw new ArgumentException("Signin presence is unavailable");lastNow=lastBeat=at;next=at;deadline=at+120000;
    }
    long Now(){try{long at=clock();if(at<lastNow)throw new InvalidOperationException("Signin presence clock changed");lastNow=at;return at;}catch{ended=true;throw;}}
    public bool Current(){
        if(ended)return false;
        try{long at=Now();if(at>=deadline||at-lastBeat>=15000||!source()||ended){ended=true;return false;}at=Now();if(ended||at>=deadline||at-lastBeat>=15000){ended=true;return false;}return true;}catch{ended=true;return false;}
    }
    public bool Command(string command){
        if(!Current())return false;
        if(command=="stop"){ended=true;return true;}
        if(command!="heartbeat"){ended=true;return false;}
        long at=Now();if(ended||at>=deadline||at-lastBeat>=15000){ended=true;return false;}lastBeat=at;return true;
    }
    public bool Pulse(Action<Record> publish){
        if(publish==null||publishing){ended=true;return false;}
        if(!Current())return false;long at=Now();if(at<next)return true;
        if(sequence>=9007199254740991){ended=true;return false;}long current=++sequence;
        publishing=true;
        try{if(!Current())return false;publish(new Record(current));if(!Current())return false;next=Now()+250;return true;}
        catch{ended=true;return false;}finally{publishing=false;}
    }
    public void Close(){ended=true;}
}
