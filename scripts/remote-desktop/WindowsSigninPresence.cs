// Finite, read-only presence publisher. Never captures pixels or grants input.
using System;
public sealed class SodaDesktopSigninPresence {
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
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    public static void VerifyGeneratedData(){
        long now=0;bool live=true;int emitted=0;var guard=new SodaDesktopSigninPresence(()=>now,()=>live);
        Check(guard.Pulse(record=>{Check(record.type=="signin_presence"&&record.seq==1&&record.validForMs==1000,"Presence record changed");emitted++;}),"Initial presence rejected");
        now=249;Check(guard.Pulse(record=>emitted++)&&emitted==1,"Presence cadence exceeded");now=250;Check(guard.Pulse(record=>emitted++)&&emitted==2,"Presence cadence stopped");
        now=15000;Check(!guard.Command("heartbeat")&&!guard.Current(),"Expired presence revived by heartbeat");
        now=0;guard=new SodaDesktopSigninPresence(()=>now,()=>live);for(now=1000;now<120000;now+=1000)Check(guard.Command("heartbeat"),"Live heartbeat rejected");Check(!guard.Pulse(record=>emitted++),"Presence lifetime extended");
        now=0;guard=new SodaDesktopSigninPresence(()=>now,()=>live);live=false;Check(!guard.Current(),"Lost presence source accepted");live=true;Check(!guard.Current(),"Presence source revived");
        foreach(string command in new[]{"configure","input","control","ack","quality","keyframe","release","unknown",null}){guard=new SodaDesktopSigninPresence(()=>now,()=>true);Check(!guard.Command(command)&&!guard.Current(),"Presence accepted non-observer command");}
        guard=new SodaDesktopSigninPresence(()=>now,()=>{now=120000;return true;});Check(!guard.Current(),"Presence callback extended deadline");
        now=10;guard=new SodaDesktopSigninPresence(()=>now,()=>true);now=9;Check(!guard.Current(),"Presence backward clock accepted");
        now=0;guard=new SodaDesktopSigninPresence(()=>now,()=>true);Check(!guard.Pulse(record=>guard.Pulse(other=>emitted++))&&!guard.Current(),"Reentrant presence publication accepted");
        foreach(bool command in new[]{false,true}){int calls=0;guard=new SodaDesktopSigninPresence(()=>{if(++calls==4)throw new InvalidOperationException("generated clock failure");return 0;},()=>true);try{if(command)guard.Command("heartbeat");else guard.Pulse(record=>emitted++);}catch(InvalidOperationException){}Check(!guard.Current(),"Presence clock exception revived");}
        Console.WriteLine("signin_presence_generated_readonly_expiry_and_commands_passed");
    }
}
