// Private pipe adapter. Only registered file requests can fill verified native streams.
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Diagnostics;

namespace Sodashitsu.NativeDrag
{
    internal sealed class DragReadNeed
    {
        internal readonly string Request;internal readonly int Index,Length;internal readonly long Offset;
        internal DragReadNeed(string request,int index,long offset,int length){Request=request;Index=index;Offset=offset;Length=length;}
    }
    internal sealed class DragDataPump:IDisposable
    {
        private sealed class Pending
        {
            internal string Id;internal int Index;internal byte[] Data;internal int Offset;internal long Since;internal bool Ended;
        }
        private readonly object gate=new object();
        private readonly Dictionary<string,Pending> pending=new Dictionary<string,Pending>(StringComparer.Ordinal);
        private readonly HashSet<int> requested=new HashSet<int>();
        private readonly DragEntry[] entries;
        private readonly DragScope scope;
        private readonly Func<long> clock;
        private readonly Action<DragReadNeed> send;
        private readonly long born;
        private long observed,lastBeat;
        private bool dead;
        internal DragDataPump(DragScope scope,IList<DragEntry> entries,Func<long> clock,Action<DragReadNeed> send)
        {
            if(scope==null||clock==null||send==null)throw new ArgumentException("Invalid native data pump");
            using(DragLease validate=new DragLease(scope,entries,delegate{throw new IOException("No metadata payload");},delegate{return true;},delegate{return 0;})){}
            this.scope=scope;this.clock=clock;this.send=send;this.entries=new DragEntry[entries.Count];entries.CopyTo(this.entries,0);
            born=observed=lastBeat=clock();if(born<0)throw new ArgumentException("Invalid native data clock");
        }
        private long Check()
        {
            long now;
            try{now=clock();}catch{CancelCore();throw new IOException("Native data clock unavailable");}
            if(dead||now<observed||now-born>=900000||now-lastBeat>=5000){CancelCore();throw new IOException("Native data lifetime ended");}
            observed=now;
            foreach(Pending request in pending.Values)
                if(now-request.Since>=5000){CancelCore();throw new IOException("Native data request expired");}
            return now;
        }
        private void CancelCore()
        {
            dead=true;foreach(Pending request in pending.Values)if(request.Data!=null)Array.Clear(request.Data,0,request.Data.Length);Monitor.PulseAll(gate);
        }
        internal bool Alive {get{lock(gate){try{Check();return true;}catch{return false;}}}}
        internal bool Beat(DragScope expected)
        {
            lock(gate){if(!scope.Matches(expected))return false;try{lastBeat=Check();return true;}catch{return false;}}
        }
        private DragReadNeed Need(Pending request){return new DragReadNeed(request.Id,request.Index,request.Offset,Math.Min(65536,request.Data.Length-request.Offset));}
        private void Send(DragReadNeed need)
        {
            try{lock(gate){Check();send(need);Check();}}
            catch{Dispose();throw;}
        }
        // send must enqueue into a bounded worker queue, never synchronously block on an OS pipe.
        // The supervisor independently watches blocked input/output and proves process exit.
        internal byte[] Fetch(int index)
        {
            Pending request;
            lock(gate)
            {
                long now=Check();
                if(index<0||index>=entries.Length||entries[index].Directory||requested.Contains(index)||pending.Count>=16)throw new IOException("Native file request refused");
                requested.Add(index);
                request=new Pending{Id=Guid.NewGuid().ToString("D"),Index=index,Data=new byte[checked((int)entries[index].Bytes)],Since=now};
                pending.Add(request.Id,request);
            }
            bool adopted=false;
            try
            {
                Send(Need(request));
                lock(gate)
                {
                    while(!request.Ended){Check();Monitor.Wait(gate,50);}
                    Check();adopted=true;return request.Data;
                }
            }
            finally
            {
                lock(gate)
                {
                    if(!adopted)Array.Clear(request.Data,0,request.Data.Length);
                    pending.Remove(request.Id);Monitor.PulseAll(gate);
                }
            }
        }
        internal void Accept(DragPacket packet)
        {
            DragReadNeed next=null;
            try
            {
                lock(gate)
                {
                    long now=Check();Pending request;
                    if(packet==null||(packet.Type!="bytes"&&packet.Type!="end")||packet.Request==null||!pending.TryGetValue(packet.Request,out request)||request.Ended||request.Index!=packet.Index)throw new IOException("Unregistered native data response");
                    if(packet.Type=="bytes")
                    {
                        int expected=Math.Min(65536,request.Data.Length-request.Offset);
                        if(packet.Data==null||packet.Offset!=request.Offset||expected==0||packet.Data.Length!=expected)throw new IOException("Native response offset or length mismatch");
                        Buffer.BlockCopy(packet.Data,0,request.Data,request.Offset,expected);request.Offset+=expected;request.Since=now;
                        if(request.Offset<request.Data.Length)next=Need(request);
                    }
                    else
                    {
                        if(packet.Data!=null||request.Offset!=request.Data.Length)throw new IOException("Incomplete native file response");
                        request.Ended=true;Monitor.PulseAll(gate);
                    }
                }
                if(next!=null)Send(next);
            }
            catch{Dispose();throw;}
            finally{if(packet!=null&&packet.Data!=null)Array.Clear(packet.Data,0,packet.Data.Length);}
        }
        internal bool WaitIdle(int milliseconds)
        {
            if(milliseconds<0||milliseconds>5000)throw new ArgumentOutOfRangeException("milliseconds");Stopwatch elapsed=Stopwatch.StartNew();
            lock(gate)
            {
                while(pending.Count!=0){int left=(int)Math.Max(0,milliseconds-elapsed.ElapsedMilliseconds);if(left==0||!Monitor.Wait(gate,left))return pending.Count==0;}
                return true;
            }
        }
        public void Dispose(){lock(gate)CancelCore();}
    }
}
