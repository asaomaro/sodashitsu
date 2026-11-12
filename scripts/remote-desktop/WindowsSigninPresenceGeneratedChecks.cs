// Test-only partial; excluded from the installed executable.
using System;
public sealed partial class SodaDesktopSigninPresence {
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    public static void VerifyGeneratedData(){
        long now=0;bool live=true;int emitted=0;var guard=new SodaDesktopSigninPresence(()=>now,()=>live);
        Check(guard.Pulse(record=>{Check(record.type=="signin_presence"&&record.seq==1,"Presence record changed");emitted++;}),"Initial presence rejected");
        now=249;Check(guard.Pulse(record=>emitted++)&&emitted==1,"Presence cadence exceeded");now=250;Check(guard.Pulse(record=>emitted++)&&emitted==2,"Presence cadence stopped");
        now=12*60*60*1000;Check(guard.Current()&&guard.Pulse(record=>emitted++),"Healthy presence expired by time without ownership loss");
        live=false;Check(!guard.Current(),"Lost presence source accepted");live=true;Check(!guard.Current(),"Closed source revived");
        foreach(string command in new[]{"configure","input","control","ack","quality","keyframe","release","unknown",null}){guard=new SodaDesktopSigninPresence(()=>now,()=>true);Check(!guard.Command(command)&&!guard.Current(),"Presence accepted a capture/input command");}
        guard=new SodaDesktopSigninPresence(()=>now,()=>true);Check(guard.Command("heartbeat")&&guard.Command("stop")&&!guard.Current(),"Presence stop was ignored");
        Console.WriteLine("signin_presence_real_owner_lifetime_and_readonly_commands_passed");
    }
}
