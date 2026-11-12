// Test-only partial; excluded from the installed executable.
using System;
public sealed partial class SodaDesktopSigninPresence {
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
