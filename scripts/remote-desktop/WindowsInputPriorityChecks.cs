// No OS input/capture: commands use fake callbacks and a deliberately blocked worker.
using System;
using System.Collections.Generic;
using System.Threading;
namespace SodaDesktopTests {
 public static class InputPriorityChecks {
  static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
  public static double Measure(bool fast) {
   double sum=0;
   for(int trial=0;trial<5;trial++)using(var started=new ManualResetEvent(false))using(var applied=new ManualResetEvent(false)) {
    var clock=new System.Diagnostics.Stopwatch();double latency=-1;Exception fault=null;
    var queue=new SodaDesktopCommandQueue<string>(64,s=>true,s=>{latency=clock.Elapsed.TotalMilliseconds;applied.Set();});queue.EnableFast(fast);
    var worker=new Thread(()=>{try{started.Set();Thread.Sleep(100);queue.ProcessOne(s=>{latency=clock.Elapsed.TotalMilliseconds;applied.Set();});}catch(Exception e){fault=e;}});worker.IsBackground=true;worker.Start();
    Check(started.WaitOne(1000),"Latency worker not started");clock.Start();queue.Submit("input");
    Check(applied.WaitOne(2000)&&worker.Join(2000)&&fault==null,"Latency worker failed");sum+=latency;
   }
   return sum/5;
  }
  public static void Benchmark() {
   double serial=Measure(false),priority=Measure(true);
   Console.WriteLine(new System.Web.Script.Serialization.JavaScriptSerializer().Serialize(new {source="fake input; synthetic 100ms video work; no OS input, capture, network or browser",trials=5,serialMeanMs=serial,priorityMeanMs=priority}));
  }
  public static void Run() {
   var applied=new List<string>();
   var queue=new SodaDesktopCommandQueue<string>(2,s=>s.StartsWith("input"),s=>applied.Add(s));
   Check(queue.Submit("input-legacy"),"Legacy input rejected");Check(applied.Count==0,"Legacy input ran on reader thread");
   Check(queue.ProcessOne(s=>applied.Add(s))&&applied[0]=="input-legacy","Legacy dispatch changed");applied.Clear();
   queue.EnableFast(true);queue.Submit("input-first");Check(applied.Count==1,"Native input waited for frame worker");applied.Clear();
   queue.Submit("control-off");queue.Submit("input-second");Check(!queue.Submit("input-overflow"),"Input queue lost its bound");
   Check(applied.Count==0,"Input overtook pending control");
   queue.ProcessOne(s=>{applied.Add(s);queue.EnableFast(false);});queue.ProcessOne(s=>applied.Add(s));
   Check(String.Join(",",applied.ToArray())=="control-off,input-second","Control/input order changed");
   queue.Submit("input-disabled");Check(applied.Count==2,"Stopped video kept input fast path enabled");queue.ProcessOne(s=>{});
   queue.EnableFast(true);applied.Clear();queue.Submit("release");queue.Submit("input-after-release");
   while(queue.ProcessOne(s=>applied.Add(s))){}
   Check(String.Join(",",applied.ToArray())=="release,input-after-release","Input overtook release");

   var bypassed=new List<string>();var bookkeeping=new SodaDesktopCommandQueue<string>(64,s=>s.StartsWith("input"),s=>bypassed.Add(s),s=>s=="ack"||s=="heartbeat");bookkeeping.EnableFast(true);
   bookkeeping.Submit("ack");bookkeeping.Submit("heartbeat");bookkeeping.Submit("input-after-ack");
   Check(bypassed.Count==1,"Bookkeeping ACK stalled native input");
   bookkeeping.Submit("release");bookkeeping.Submit("input-after-barrier");bookkeeping.Submit("input-last");
   Check(bypassed.Count==1,"Input overtook an older queued input or release");
   while(bookkeeping.ProcessOne(s=>bypassed.Add(s))){}
   Check(String.Join(",",bypassed.ToArray())=="input-after-ack,ack,heartbeat,release,input-after-barrier,input-last","Bookkeeping bypass lost ordered commands");
   var poisoned=new SodaDesktopCommandQueue<string>(64,s=>true,s=>bypassed.Add(s));poisoned.EnableFast(true);
   try{poisoned.Synchronize(()=>{throw new InvalidOperationException("fake commit failure");});}catch(InvalidOperationException){}
   int count=bypassed.Count;poisoned.Submit("input-after-failure");Check(count==bypassed.Count,"Failed dispatch left fast input enabled");

   using(var inWork=new ManualResetEvent(false))using(var finishWork=new ManualResetEvent(false))using(var received=new ManualResetEvent(false)) {
    var live=new SodaDesktopCommandQueue<string>(64,s=>s=="input",s=>received.Set());live.EnableFast(true);
    Exception fault=null;var worker=new Thread(()=>{try{inWork.Set();if(!finishWork.WaitOne(3000))throw new InvalidOperationException("Test worker not released");live.ProcessOne(s=>received.Set());}catch(Exception e){fault=e;}});
    worker.IsBackground=true;worker.Start();
    try {Check(inWork.WaitOne(1000),"Test worker not started");live.Submit("input");Check(received.WaitOne(200),"Input blocked behind unfinished video work");}
    finally {finishWork.Set();Check(worker.Join(2000),"Test worker did not stop");}
    Check(fault==null,"Blocked worker failed");
   }
   // Control is removed from the queue while its handler still owns the gate.
   using(var handling=new ManualResetEvent(false))using(var finish=new ManualResetEvent(false))using(var attempted=new ManualResetEvent(false))using(var done=new ManualResetEvent(false)) {
    bool controlApplied=false,inputAfterControl=false;Exception fault=null;
    var ordered=new SodaDesktopCommandQueue<string>(64,s=>s=="input",s=>{inputAfterControl=controlApplied;done.Set();});ordered.EnableFast(true);ordered.Submit("control");
    var worker=new Thread(()=>{try{ordered.ProcessOne(s=>{handling.Set();if(!finish.WaitOne(2000))throw new InvalidOperationException("Control not released");controlApplied=true;});}catch(Exception e){fault=e;}});
    var reader=new Thread(()=>{try{attempted.Set();ordered.Submit("input");}catch(Exception e){fault=e;}});
    worker.IsBackground=reader.IsBackground=true;worker.Start();
    try {Check(handling.WaitOne(1000),"Control worker not started");reader.Start();Check(attempted.WaitOne(1000),"Input reader not started");Check(!done.WaitOne(50),"Input overtook in-progress control");}
    finally {finish.Set();Check(worker.Join(2000)&&reader.Join(2000),"Ordered workers did not stop");}
    Check(fault==null&&inputAfterControl&&done.WaitOne(0),"Input did not observe applied control");
   }
   using(var committing=new ManualResetEvent(false))using(var finish=new ManualResetEvent(false))using(var attempted=new ManualResetEvent(false))using(var appliedInput=new ManualResetEvent(false)) {
    bool framePublished=false,inputAfterFrame=false;Exception fault=null;
    var atomic=new SodaDesktopCommandQueue<string>(64,s=>true,s=>{inputAfterFrame=framePublished;appliedInput.Set();});atomic.EnableFast(true);
    var worker=new Thread(()=>{try{atomic.Synchronize(()=>{committing.Set();if(!finish.WaitOne(2000))throw new InvalidOperationException("Frame commit not released");framePublished=true;});}catch(Exception e){fault=e;}});
    var reader=new Thread(()=>{try{attempted.Set();atomic.Submit("input");}catch(Exception e){fault=e;}});bool readerStarted=false;
    worker.IsBackground=reader.IsBackground=true;worker.Start();
    try {Check(committing.WaitOne(1000),"Frame commit not started");reader.Start();readerStarted=true;Check(attempted.WaitOne(1000),"Frame reader not started");Check(!appliedInput.WaitOne(50),"Input ACK overtook unfinished frame commit");}
    finally {finish.Set();bool stopped=worker.Join(2000);if(readerStarted)stopped=reader.Join(2000)&&stopped;Check(stopped,"Frame commit workers did not stop");}
    Check(fault==null&&inputAfterFrame&&appliedInput.WaitOne(0),"Input/frame publication was not atomic");
   }
   Console.WriteLine("desktop_input_priority_checks_passed: native input during blocked video work; bounded queue; control/release FIFO; in-progress control and snapshot commit serialization; legacy fallback; fake input only");
  }
 }
}
