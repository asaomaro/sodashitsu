// Real cover protocol loop with fake guards/actions: no capture, OS input or service.
using System;
using System.Collections.Concurrent;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;

namespace SodaDesktopTests {
    public static class LockCoverChecks {
        sealed class Commands:TextReader {
            readonly BlockingCollection<int> bytes=new BlockingCollection<int>();
            public void Send(string line){foreach(char c in line+"\n")bytes.Add(c);}
            public override int Read(){try{return bytes.Take();}catch(InvalidOperationException){return -1;}}
            protected override void Dispose(bool disposing){bytes.CompleteAdding();base.Dispose(disposing);}
        }
        sealed class Output:TextWriter {
            readonly ConcurrentQueue<string> lines=new ConcurrentQueue<string>();
            public override Encoding Encoding{get{return Encoding.UTF8;}}
            public override void WriteLine(string value){lines.Enqueue(value);}
            public string Text{get{return String.Join("\n",lines.ToArray());}}
        }
        static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        static void Exchange(bool allowed,string[] messages,bool accepted) {
            using(var input=new Commands())using(var output=new Output()) {
                int guard=1,dismissed=0;Exception failure=null;
                var thread=new Thread(()=>{
                    try {
                        typeof(SodaDesktopUnlock).GetMethod("ServeUserLockScreen",BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,new object[]{
                            input,output,new Func<bool>(()=>Volatile.Read(ref guard)==1),new Func<int>(()=>0),
                            new Action(()=>{Interlocked.Increment(ref dismissed);Interlocked.Exchange(ref guard,0);}),allowed});
                    }catch(TargetInvocationException e){failure=e.InnerException;}catch(Exception e){failure=e;}
                }){IsBackground=true};
                try {
                    input.Send("{\"type\":\"configure\",\"allowInput\":true,\"options\":{}}");thread.Start();
                    Check(SpinWait.SpinUntil(()=>output.Text.Contains("\"type\":\"ready\"")||failure!=null,3000),"Cover did not become ready");
                    Check(output.Text.Contains("\"lockScreenCover\":true")&&output.Text.Contains("\"secureDesktop\":true"),"Cover lost its human-only ceiling");
                    foreach(string message in messages)input.Send(message);
                    Check(thread.Join(3000),"Cover protocol did not finish");
                    Check(dismissed==(accepted?1:0),"Cover accepted an unauthorized action");
                    Check(accepted?failure==null:failure is InvalidOperationException,"Unexpected cover command result");
                    Check(!output.Text.Contains("\"type\":\"frame\"")&&!output.Text.Contains("must-not-send"),"Cover exposed a desktop frame or input text");
                    if(accepted)Check(output.Text.Contains("lock_screen_changed"),"Cover transition was lost");
                }finally{input.Dispose();thread.Join(3000);}
            }
        }
        public static void Run() {
            var worker=typeof(SodaDesktopUnlock).GetMethod("RunSecureWorker",BindingFlags.NonPublic|BindingFlags.Static);
            foreach(bool throws in new[]{false,true})foreach(string after in new[]{"worker_input_desktop_default","worker_session_unlocked","worker_identity","worker_input_desktop_other",null})using(var output=new StringWriter()) {
                int checks=0,runs=0;
                worker.Invoke(null,new object[]{output,new Func<string>(()=>++checks==1?null:after),new Action(()=>{runs++;if(throws)throw new InvalidOperationException("must-not-expose");})});
                string expected=after??(throws?"worker_initialization":null);
                Check(runs==1&&checks==2,"Worker did not recheck its guard after capture stopped");
                Check(expected==null?output.ToString()=="":output.ToString().Contains("\"code\":\""+expected+"\""),
                    "Worker lost the post-capture transition or reclassified a real failure");
                Check(!output.ToString().Contains("must-not-expose"),"Worker exposed exception details");
            }
            foreach(bool throws in new[]{false,true})using(var output=new StringWriter()) {
                int checks=0;
                worker.Invoke(null,new object[]{output,new Func<string>(()=>{if(++checks==2)throw new InvalidOperationException("must-not-expose");return null;}),new Action(()=>{if(throws)throw new InvalidOperationException();})});
                Check(output.ToString().Contains("worker_guard")&&!output.ToString().Contains("must-not-expose"),"Unknown worker state was retried or exposed");
            }
            using(var output=new StringWriter()) {
                int runs=0;
                worker.Invoke(null,new object[]{output,new Func<string>(()=>"worker_identity"),new Action(()=>runs++)});
                Check(runs==0&&output.ToString().Contains("worker_identity"),"Worker ran before initial guard approval");
            }
            var finish=typeof(SodaDesktopUnlock).GetMethod("FinishShare",BindingFlags.NonPublic|BindingFlags.Static);
            foreach(string source in new[]{"cover","normal","secure","transition"})using(var output=new StringWriter()) {
                finish.Invoke(null,new object[]{0,new Func<string>(()=>source),output});
                Check(output.ToString().Contains(source=="cover"||source=="normal"?"source_transition":"worker_ended"),
                    "Installed-worker EOF lost the verified transition or retried an unverified desktop");
            }
            var select=typeof(SodaDesktopUnlock).GetMethod("SelectSource",BindingFlags.NonPublic|BindingFlags.Static);
            int step=0;
            string selected=(string)select.Invoke(null,new object[]{new Func<int>(()=>0),new Func<bool>(()=>step>=3),new Func<bool>(()=>step==1),new Action(()=>step++)});
            Check(selected=="cover"&&step>=6,"A transient desktop denial selected the secure worker");
            step=0;
            selected=(string)select.Invoke(null,new object[]{new Func<int>(()=>0),new Func<bool>(()=>false),new Func<bool>(()=>false),new Action(()=>step++)});
            Check(selected=="transition"&&step==80,"Unverified desktop selected a capturing source or waited without a bound");
            selected=(string)select.Invoke(null,new object[]{new Func<int>(()=>0),new Func<bool>(()=>false),new Func<bool>(()=>true),new Action(()=>{})});
            Check(selected=="secure","Stable secure-desktop hint did not reach the guarded worker");
            foreach(int lostAt in new[]{1,2})using(var output=new StringWriter()) {
                int checks=0,actions=0;
                using(var input=new StringReader("{\"type\":\"configure\",\"allowInput\":true,\"options\":{}}\n")) {
                    typeof(SodaDesktopUnlock).GetMethod("ServeUserLockScreen",BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,new object[]{
                        input,output,new Func<bool>(()=>++checks<lostAt),new Func<int>(()=>0),new Action(()=>actions++),true});
                }
                Check(output.ToString().Contains("source_transition")&&!output.ToString().Contains("\"ready\"")&&actions==0,
                    "A configure-time desktop transition ended without a safe retry marker");
            }
            var dormant=typeof(SodaDesktopUnlock).GetMethod("DormantLockScreen",BindingFlags.NonPublic|BindingFlags.Static);
            foreach(bool system in new[]{false,true})foreach(int state in new[]{-1,0,1})foreach(bool inputDefault in new[]{false,true})foreach(bool noForeground in new[]{false,true}) {
                bool offered=(bool)dormant.Invoke(null,new object[]{system,new Func<int>(()=>state),new Func<bool>(()=>inputDefault),new Func<bool>(()=>noForeground)});
                Check(offered==(!system&&state==0&&inputDefault&&noForeground),"Dormant lock screen was rejected without LockApp, or an unverified desktop was accepted");
            }
            for(int changed=0;changed<3;changed++) {
                int states=0,desktops=0,foregrounds=0;int target=changed;
                bool offered=(bool)dormant.Invoke(null,new object[]{false,new Func<int>(()=>++states==2&&target==0?1:0),
                    new Func<bool>(()=>!(++desktops==2&&target==1)),new Func<bool>(()=>!(++foregrounds==2&&target==2))});
                Check(!offered,"Dormant screen ignored a changed session, desktop or foreground");
            }
            var prepare=typeof(SodaDesktopUnlock).GetMethod("PrepareUserLockScreen",BindingFlags.NonPublic|BindingFlags.Static);
            int wakes=0,keys=0;bool visible=false;
            prepare.Invoke(null,new object[]{new Func<bool>(()=>visible),new Func<bool>(()=>true),new Action(()=>{wakes++;}),new Action(()=>{keys++;})});
            Check(wakes==1&&keys==0,"Inactive lock screen received a key before foreground verification");
            prepare.Invoke(null,new object[]{new Func<bool>(()=>visible),new Func<bool>(()=>true),new Action(()=>{wakes++;visible=true;}),new Action(()=>{Check(visible,"Key guard missing");keys++;})});
            Check(wakes==2&&keys==0,"Wake chained a key without a fresh human action");
            prepare.Invoke(null,new object[]{new Func<bool>(()=>visible),new Func<bool>(()=>false),new Action(()=>{wakes++;}),new Action(()=>{keys++;})});
            Check(wakes==2&&keys==1,"Fresh visible lock screen action did not advance");
            visible=false;bool rejected=false;
            try{prepare.Invoke(null,new object[]{new Func<bool>(()=>false),new Func<bool>(()=>false),new Action(()=>{wakes++;}),new Action(()=>{keys++;})});}
            catch(TargetInvocationException e){rejected=e.InnerException is InvalidOperationException;}
            Check(rejected&&wakes==2&&keys==1,"Unverified desktop accepted wake or input");
            string control="{\"type\":\"control\",\"enabled\":true}",dismiss="{\"type\":\"dismiss_lock_screen\"}";
            Exchange(true,new[]{dismiss},false);
            Exchange(false,new[]{control,dismiss},false);
            Exchange(true,new[]{control,"{\"type\":\"input\",\"input\":{\"kind\":\"text\",\"text\":\"must-not-send\"}}"},false);
            Exchange(true,new[]{control,dismiss},true);
            Console.WriteLine("desktop_lock_cover_checks_passed");
        }
    }
}
