using System;
using System.IO;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Threading;
using Sodashitsu.NativeDrag;
internal static class NativeDragPumpChecks
{
    private static void Assert(bool value,string reason){if(!value)throw new Exception("generated assertion: "+reason);}
    private static DragScope Scope(){return new DragScope("11111111-1111-4111-8111-111111111111","https://example.test","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333");}
    private static string Sha(byte[] bytes){using(SHA256 hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    private static DragEntry Entry(byte[] data){return new DragEntry("generated.txt",false,data.Length,Sha(data));}
    private static DragReadNeed Take(BlockingCollection<DragReadNeed> output){DragReadNeed need;Assert(output.TryTake(out need,2000),"registered read request missing");return need;}
    private static byte[] Slice(byte[] data,long offset,int size){byte[] result=new byte[size];Buffer.BlockCopy(data,(int)offset,result,0,size);return result;}
    private static void Fault(Task task,string reason){try{Assert(task.Wait(2000),"pending fetch did not drain");}catch(AggregateException){Assert(task.IsFaulted,reason);return;}throw new Exception("generated assertion: "+reason);}
    private static void Reject(Action action,string reason){try{action();}catch(IOException){return;}throw new Exception("generated assertion: "+reason);}
    private static void Positive()
    {
        byte[] data=new byte[70000];for(int i=0;i<data.Length;i++)data[i]=(byte)(i%251);
        using(BlockingCollection<DragReadNeed> output=new BlockingCollection<DragReadNeed>(32))
        using(DragDataPump pump=new DragDataPump(Scope(),new DragEntry[]{Entry(data)},delegate{return 0;},output.Add))
        using(DragLease lease=new DragLease(Scope(),new DragEntry[]{Entry(data)},pump.Fetch,delegate{return pump.Alive;},delegate{return 0;}))
        {
            IntPtr target=Marshal.AllocHGlobal(data.Length);
            try
            {
                Task<int> read=Task.Factory.StartNew(delegate{return lease.Copy(0,0,(uint)data.Length,target);});string request=null;
                for(int i=0;i<2;i++)
                {
                    DragReadNeed need=Take(output);if(request==null)request=need.Request;
                    Assert(need.Request==request&&need.Index==0&&need.Offset==(i==0?0:65536)&&need.Length==(i==0?65536:4464),"chunk registration correlation");
                    byte[] chunk=Slice(data,need.Offset,need.Length);pump.Accept(new DragPacket("bytes",0,need.Offset,need.Request,chunk));Assert(Array.TrueForAll(chunk,b=>b==0),"accepted packet not erased");
                }
                pump.Accept(new DragPacket("end",0,0,request,null));Assert(read.Wait(2000)&&read.Result==data.Length,"verified native stream did not finish");
                byte[] copy=new byte[data.Length];Marshal.Copy(target,copy,0,copy.Length);Assert(Sha(copy)==Sha(data),"native stream bytes differ");Array.Clear(copy,0,copy.Length);
                Assert(pump.WaitIdle(0),"completed request retained");Reject(delegate{pump.Accept(new DragPacket("end",0,0,request,null));},"completed request replay accepted");
            }
            finally{Marshal.FreeHGlobal(target);}
        }
    }
    private static void InvalidResponses()
    {
        foreach(string mode in new string[]{"unknown","index","offset","short","early-end","duplicate"})
        using(BlockingCollection<DragReadNeed> output=new BlockingCollection<DragReadNeed>(32))
        using(DragDataPump pump=new DragDataPump(Scope(),new DragEntry[]{Entry(new byte[]{7,8})},delegate{return 0;},output.Add))
        {
            Task<byte[]> fetch=Task.Factory.StartNew(delegate{return pump.Fetch(0);});DragReadNeed need=Take(output);
            if(mode=="duplicate")pump.Accept(new DragPacket("bytes",0,0,need.Request,new byte[]{7,8}));
            byte[] bytes=mode=="short"?new byte[]{7}:new byte[]{7,8};
            DragPacket packet=mode=="early-end"?new DragPacket("end",0,0,need.Request,null):new DragPacket("bytes",mode=="index"?1:0,mode=="offset"?1:0,mode=="unknown"?Guid.NewGuid().ToString("D"):need.Request,bytes);
            Reject(delegate{pump.Accept(packet);},"invalid "+mode+" response accepted");Assert(Array.TrueForAll(bytes,b=>b==0)||mode=="early-end","rejected packet not erased");Fault(fetch,"invalid response published bytes");Assert(pump.WaitIdle(0),"invalid response did not drain");
        }
    }
    private static void Deadlines()
    {
        foreach(string mode in new string[]{"chunk","idle","absolute","backward","clock","cancel"})
        using(BlockingCollection<DragReadNeed> output=new BlockingCollection<DragReadNeed>(32))
        {
            long now=0;bool fail=false;
            using(DragDataPump pump=new DragDataPump(Scope(),new DragEntry[]{Entry(new byte[]{1})},delegate{if(fail)throw new IOException();return now;},output.Add))
            {
                Task<byte[]> fetch=Task.Factory.StartNew(delegate{return pump.Fetch(0);});DragReadNeed need=Take(output);
                if(mode=="chunk"){now=4000;Assert(pump.Beat(Scope()),"valid heartbeat failed");now=5000;}
                if(mode=="idle")now=5000;
                if(mode=="absolute")
                {
                    // A pending request itself cannot survive heartbeat extensions.
                    // Complete this request first, then test the independent absolute budget.
                    pump.Accept(new DragPacket("bytes",0,0,need.Request,new byte[]{1}));pump.Accept(new DragPacket("end",0,0,need.Request,null));Assert(fetch.Wait(2000),"initial request not complete");Array.Clear(fetch.Result,0,fetch.Result.Length);
                    for(now=4000;now<900000;now+=4000)Assert(pump.Beat(Scope()),"absolute heartbeat setup failed");now=900000;
                }
                if(mode=="backward")now=-1;
                if(mode=="clock")fail=true;
                if(mode=="cancel")pump.Dispose();
                Assert(!pump.Alive,"expired "+mode+" pump alive");if(mode!="absolute")Fault(fetch,"expired request published");now=0;fail=false;Assert(!pump.Beat(Scope()),"expired pump revived");Assert(pump.WaitIdle(0),"expired fetch did not drain");
            }
        }
    }
    private static void EmptyAndScope()
    {
        using(BlockingCollection<DragReadNeed> output=new BlockingCollection<DragReadNeed>(32))
        using(DragDataPump pump=new DragDataPump(Scope(),new DragEntry[]{Entry(new byte[0])},delegate{return 0;},output.Add))
        {
            DragScope other=new DragScope(Scope().Owner,Scope().Origin,Guid.NewGuid().ToString("D"),Scope().Generation);Assert(!pump.Beat(other),"wrong scope heartbeat accepted");
            Task<byte[]> fetch=Task.Factory.StartNew(delegate{return pump.Fetch(0);});DragReadNeed need=Take(output);Assert(need.Length==0,"empty request length");pump.Accept(new DragPacket("end",0,0,need.Request,null));Assert(fetch.Wait(2000)&&fetch.Result.Length==0,"empty source failed");Reject(delegate{pump.Fetch(0);},"same file requested twice");
        }
    }
    private static void QueueAndConcurrency()
    {
        using(DragDataPump failed=new DragDataPump(Scope(),new DragEntry[]{Entry(new byte[]{1})},delegate{return 0;},delegate{throw new IOException("generated full queue");}))
        {Reject(delegate{failed.Fetch(0);},"failed send returned data");Assert(!failed.Alive&&failed.WaitIdle(0),"failed send leaked pending operation");}
        DragEntry[] entries=new DragEntry[17];for(int i=0;i<entries.Length;i++)entries[i]=new DragEntry("file"+i+".txt",false,1,Sha(new byte[]{1}));
        using(BlockingCollection<DragReadNeed> output=new BlockingCollection<DragReadNeed>(32))
        using(DragDataPump pump=new DragDataPump(Scope(),entries,delegate{return 0;},output.Add))
        {
            Task<byte[]>[] reads=new Task<byte[]>[16];
            for(int i=0;i<reads.Length;i++){int index=i;reads[i]=Task.Factory.StartNew(delegate{return pump.Fetch(index);},CancellationToken.None,TaskCreationOptions.LongRunning,TaskScheduler.Default);Take(output);}
            Task<byte[]> overflow=Task.Factory.StartNew(delegate{return pump.Fetch(16);},CancellationToken.None,TaskCreationOptions.LongRunning,TaskScheduler.Default);bool refused=false;
            try{overflow.Wait(2000);}catch(AggregateException){refused=overflow.IsFaulted;}
            finally{pump.Dispose();foreach(Task<byte[]> read in reads)Fault(read,"cancelled concurrent fetch returned data");Fault(overflow,"overflow request returned data");}
            Assert(refused,"seventeenth pending file accepted");Assert(pump.WaitIdle(0),"concurrent cancellation did not drain");
        }
    }
    internal static int Main()
    {
        try{Positive();InvalidResponses();Deadlines();EmptyAndScope();QueueAndConcurrency();Console.WriteLine("native_drag_pump_generated_registration_chunk_deadline_scope_cancel_and_verified_stream_passed");return 0;}
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
