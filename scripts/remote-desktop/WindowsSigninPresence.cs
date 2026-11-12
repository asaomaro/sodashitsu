// Read-only status cadence over actual native source ownership. No proof TTL.
using System;
public sealed partial class SodaDesktopSigninPresence {
    readonly Func<long> clock;readonly Func<bool> source;long next,sequence;bool closed;
    public sealed class Record {public string type="signin_presence";public long seq;internal Record(long sequence){seq=sequence;}}
    public SodaDesktopSigninPresence(Func<long> clock,Func<bool> source){this.clock=clock;this.source=source;}
    public bool Current(){if(closed)return false;try{if(source())return true;}catch{}closed=true;return false;}
    public bool Command(string command){if(!Current())return false;if(command=="stop"){closed=true;return true;}if(command=="heartbeat")return true;closed=true;return false;}
    public bool Pulse(Action<Record> publish){
        if(!Current())return false;
        try{long at=clock();if(at<next)return true;if(sequence>=9007199254740991)return false;publish(new Record(++sequence));next=at+250;return Current();}catch{closed=true;return false;}
    }
    public void Close(){closed=true;}
}
