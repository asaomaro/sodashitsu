// Pure sequential WinEvent fence. A timeout permanently revokes this observer.
using System;
using System.Diagnostics;
using System.Threading;
public sealed class SodaDesktopProtectedEpoch : IDisposable {
    readonly object requestGate=new object(),gate=new object();
    int next,pending,delivered;long epoch,atMarker;bool closed;
    public void Changed(){lock(gate){epoch++;}}
    public void Marker(int sequence){lock(gate){if(closed||pending!=sequence)return;delivered=sequence;atMarker=epoch;Monitor.PulseAll(gate);}}
    public bool Checkpoint(Action<int> post,int timeout,out long value){
        value=-1;
        if(post==null||timeout<1||timeout>2000)throw new ArgumentException();
        lock(requestGate){
            int sequence;lock(gate){if(closed||next==Int32.MaxValue)return false;pending=sequence=++next;}
            var clock=Stopwatch.StartNew();
            try{post(sequence);}catch{Dispose();return false;}
            lock(gate){
                while(!closed&&delivered!=sequence){int remaining=timeout-(int)clock.ElapsedMilliseconds;if(remaining<=0){closed=true;Monitor.PulseAll(gate);return false;}Monitor.Wait(gate,remaining);}
                if(closed||clock.ElapsedMilliseconds>timeout){closed=true;return false;}
                value=atMarker;return true;
            }
        }
    }
    public void Dispose(){lock(gate){closed=true;Monitor.PulseAll(gate);}}
}
