using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Sodashitsu.NativeDrag;
internal static class NativeDragWorkerChecks
{
    private static void Assert(bool value,string reason){if(!value)throw new Exception("generated assertion: "+reason);}
    private sealed class EmptySlot:IDisposable {public void Dispose(){}}
    private sealed class Pipe:Stream
    {
        private readonly BlockingCollection<byte> bytes=new BlockingCollection<byte>();
        internal void Feed(string text){foreach(byte value in Encoding.UTF8.GetBytes(text))bytes.Add(value);}
        internal void End(){bytes.CompleteAdding();}
        public override int ReadByte(){try{return bytes.Take();}catch(InvalidOperationException){return -1;}}
        public override int Read(byte[] b,int o,int c){if(c==0)return 0;int value=ReadByte();if(value<0)return 0;b[o]=(byte)value;return 1;}
        public override bool CanRead{get{return true;}}public override bool CanWrite{get{return false;}}public override bool CanSeek{get{return false;}}
        public override long Length{get{throw new NotSupportedException();}}public override long Position{get{throw new NotSupportedException();}set{throw new NotSupportedException();}}
        public override void Flush(){}public override long Seek(long a,SeekOrigin b){throw new NotSupportedException();}public override void SetLength(long n){throw new NotSupportedException();}public override void Write(byte[] b,int o,int c){throw new NotSupportedException();}
    }
    private sealed class Output:TextWriter
    {
        public override Encoding Encoding{get{return Encoding.UTF8;}}
        internal readonly List<string> Types=new List<string>();internal readonly Pipe Input;internal int Sequence=3;internal bool Corrupt;internal bool Block;
        private readonly JavaScriptSerializer json=new JavaScriptSerializer();internal const string Nonce="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        internal Output(Pipe input){Input=input;}
        public override void WriteLine(string text)
        {
            if(Block){Thread.Sleep(60000);return;}
            Dictionary<string,object> value=(Dictionary<string,object>)json.DeserializeObject(text);string type=(string)value["type"];Types.Add(type);
            if(type=="need")
            {
                int offset=Convert.ToInt32(value["offset"]),length=Convert.ToInt32(value["length"]);byte[] data=new byte[length];for(int i=0;i<length;i++)data[i]=(byte)((i+offset)%251);if(Corrupt&&data.Length!=0)data[0]^=1;
                if(length!=0)Input.Feed(json.Serialize(new{type="bytes",nonce=Nonce,seq=Sequence++,request=(string)value["request"],index=0,offset,data=Convert.ToBase64String(data)})+"\n");
                if(offset+length==70000)Input.Feed(json.Serialize(new{type="end",nonce=Nonce,seq=Sequence++,request=(string)value["request"],index=0})+"\n");
                Array.Clear(data,0,data.Length);
            }
        }
    }
    private sealed class Backend:IDragBackend
    {
        internal string Mode;internal int Drops;internal bool Initialized,Finished;private bool held=true;private int allowedCalls;private NativeDragDataObject data;private DragLease lease;
        internal Backend(string mode){Mode=mode;}
        public bool Allowed(){allowedCalls++;if(allowedCalls==3&&Mode=="late-release")held=false;if(allowedCalls==3&&Mode=="late-expire"||allowedCalls==5&&Mode=="phase2-expire"||allowedCalls==6&&Mode=="backend-expire")Thread.Sleep(800);return Mode!="denied";}
        public bool LeftHeld(){return Mode!="released"&&held;}
        public void Initialize(){Initialized=true;}
        public void Finish(){Finished=true;}
        private void Read()
        {
            IntPtr pointer=Marshal.AllocHGlobal(70000);try{Assert(lease.Copy(0,0,70000,pointer)==70000,"worker verified stream failed");byte[] bytes=new byte[70000];Marshal.Copy(pointer,bytes,0,bytes.Length);for(int i=0;i<bytes.Length;i++)Assert(bytes[i]==(byte)(i%251),"worker payload mismatch");Array.Clear(bytes,0,bytes.Length);}finally{Marshal.FreeHGlobal(pointer);}
        }
        public int Drop(NativeDragDataObject source,DragLease active,Action finalAdmission,out uint effect)
        {
            DragOutcome result=NativeDragAdmission.Invoke(Allowed,LeftHeld,finalAdmission,delegate{uint nativeEffect;int code=NativeDrop(source,active,out nativeEffect);return new DragOutcome(code,nativeEffect);});effect=result.Effect;return result.Result;
        }
        private int NativeDrop(NativeDragDataObject source,DragLease active,out uint effect)
        {
            Drops++;data=source;lease=active;effect=1;
            if(Mode=="stuck"){Thread.Sleep(60000);return 0;}
            if(Mode=="cancel"){effect=0;return 0x40101;}
            if(Mode=="async"||Mode=="failed-async")
            {
                Assert(data.SetAsyncMode(true)==0&&data.StartOperation(null)==0,"worker target async start");if(Mode=="failed-async")data.EndOperation(unchecked((int)0x80004005),null,1);return 0x40100;
            }
            if(Mode!="blocked-output")Read();return 0x40100;
        }
        public void Pump(){Read();Assert(data.EndOperation(0,null,1)==0,"worker target async completion");}
    }
    private static void Initial(Pipe input)
    {
        byte[] data=new byte[70000];for(int i=0;i<data.Length;i++)data[i]=(byte)(i%251);string sha;using(SHA256 hash=SHA256.Create())sha=BitConverter.ToString(hash.ComputeHash(data)).Replace("-","").ToLowerInvariant();Array.Clear(data,0,data.Length);
        JavaScriptSerializer json=new JavaScriptSerializer();input.Feed(Output.Nonce+"\n");
        input.Feed(json.Serialize(new{type="begin",nonce=Output.Nonce,seq=0,owner="11111111-1111-4111-8111-111111111111",origin="https://example.test",gesture="22222222-2222-4222-8222-222222222222",generation="33333333-3333-4333-8333-333333333333",count=1,bytes=70000})+"\n");
        input.Feed(json.Serialize(new{type="entry",nonce=Output.Nonce,seq=1,index=0,name="generated.txt",directory=false,bytes=70000,sha256=sha})+"\n");input.Feed(json.Serialize(new{type="seal",nonce=Output.Nonce,seq=2})+"\n");
    }
    private static int Case(string mode,bool child)
    {
        Pipe input=new Pipe();Output output=new Output(input){Corrupt=mode=="bad-sha",Block=mode=="blocked-output"};if(mode!="blocked-input")Initial(input);Backend backend=new Backend(mode);bool forced=false;
        try
        {
            int result=NativeDragWorker.Run(input,output,backend,delegate{return new EmptySlot();},child?(Action<int>)Environment.Exit:delegate(int code){forced=true;});
            bool success=mode=="sync"||mode=="async";
            Assert(result==(success?0:3),"worker result "+mode);Assert(!forced,"unexpected generated force exit");
            Assert(output.Types.Contains("finished")==success,"failed/cancelled worker emitted completion");
            if(mode=="released"||mode=="denied"||mode=="late-release"||mode=="late-expire"||mode=="phase2-expire"||mode=="backend-expire")Assert(backend.Drops==0,"worker started without live gesture/desktop");
            if(mode!="denied")Assert(backend.Initialized&&backend.Finished,"worker COM backend not finalized");
            return child?result:0;
        }
        finally{input.End();}
    }
    [STAThread]internal static int Main(string[] args)
    {
        if(args.Length==2&&args[0]=="child")return Case(args[1],true);
        try
        {
            foreach(string mode in new string[]{"sync","async","failed-async","cancel","released","denied","bad-sha","late-release","late-expire","phase2-expire","backend-expire"})Case(mode,false);
            foreach(string mode in new string[]{"stuck","blocked-input","blocked-output"})
            {
                ProcessStartInfo start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"child "+mode){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
                using(Process child=Process.Start(start))
                {
                    if(!child.WaitForExit(14000)){child.Kill();child.WaitForExit();throw new Exception("generated assertion: blocked "+mode+" outlived process watchdog");}
                    Assert(child.ExitCode==3,"blocked "+mode+" did not finish as process failure");
                }
            }
            Console.WriteLine("native_drag_worker_generated_sync_async_failure_scope_gesture_sha_and_blocked_process_watchdog_passed_no_real_ole");return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}
