// Test-only partial; excluded from the installed executable.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
public static partial class SodaDesktopSigninWorker {
    static void Generated(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    public static void VerifyGeneratedData(){
        SodaDesktopSigninPresence.VerifyGeneratedData();
        bool inactive=false;try{SodaDesktopSigninScopeNative.RequireCandidate(false);}catch(SodaDesktopSigninInactiveException){inactive=true;}Generated(inactive,"Inactive candidate was not classified");
        int inactivePublished=0,inactiveReceived=0;bool brokerAuthenticated=false;
        InactivePresence(Purpose.Presence,type=>{Generated(type=="signin_inactive","Presence inactive type changed");inactivePublished++;},()=>{Generated(inactivePublished==1,"Inactive result not published before wait");brokerAuthenticated=true;inactiveReceived++;return "{\"type\":\"heartbeat\"}";});
        Generated(brokerAuthenticated&&inactiveReceived==1,"Inactive worker exited before broker authentication");
        foreach(var viewerPurpose in new[]{Purpose.View,Purpose.Input}){string closure=null;InactivePresence(viewerPurpose,type=>closure=type,()=>"{\"type\":\"configure\",\"width\":1280,\"fps\":10,\"quality\":65}");Generated(closure=="signin_unavailable","Viewer inactive promoted to presence");}
        int pulses=0,captures=0,releases=0;DispatchPurpose(Purpose.Presence,()=>pulses++,()=>captures++);CleanupPurpose(Purpose.Presence,()=>releases++);
        Generated(pulses==1&&captures==0,"Presence dispatched capture");Generated(releases==0,"Presence dispatched input cleanup");
        foreach(var normalPurpose in new[]{Purpose.View,Purpose.Input}){DispatchPurpose(normalPurpose,()=>pulses++,()=>captures++);CleanupPurpose(normalPurpose,()=>releases++);}Generated(pulses==1&&captures==2&&releases==2,"Normal purpose routing changed");
        long presenceClock=0;var generatedPresence=new SodaDesktopSigninPresence(()=>presenceClock,()=>true);bool presenceStopped;
        Generated(PresenceCommand(Purpose.Presence,Object("{\"type\":\"heartbeat\"}"),generatedPresence,out presenceStopped)&&!presenceStopped,"Presence heartbeat route rejected");
        foreach(string command in new[]{"configure","control","input","release","ack","quality","keyframe"}){bool denied=false;try{PresenceCommand(Purpose.Presence,Object("{\"type\":\""+command+"\"}"),new SodaDesktopSigninPresence(()=>presenceClock,()=>true),out presenceStopped);}catch(InvalidOperationException){denied=true;}Generated(denied,"Presence route accepted active command");}
        Generated(PresenceCommand(Purpose.Presence,Object("{\"type\":\"stop\"}"),generatedPresence,out presenceStopped)&&presenceStopped&&!generatedPresence.Current(),"Presence stop route rejected");
        Generated(PurposeName(ParsePurpose("presence"))=="presence","Presence purpose changed");
        bool rejectedPurpose=false;try{PurposeName((Purpose)99);}catch(InvalidOperationException){rejectedPurpose=true;}Generated(rejectedPurpose,"Unknown presence purpose accepted");
        Require(Marshal.SizeOf(typeof(Mode))==220&&Marshal.OffsetOf(typeof(Mode),"Orientation").ToInt32()==84&&Marshal.SizeOf(typeof(Device))==840&&Marshal.SizeOf(typeof(Input))==40&&Marshal.SizeOf(typeof(Mouse))==32&&Marshal.SizeOf(typeof(Key))==24);
        Require(VirtualKey("ControlLeft")==162&&VirtualKey("Space")==32&&VirtualKey("ImeOn")==0x16&&VirtualKey("ImeOff")==0x1a);
        var enter=KeyEvent(VirtualKey("NumpadEnter"),true);Require(enter.Data.Key.Vk==13&&(enter.Data.Key.Flags&1)!=0);
        Require(Line(new StringReader("generated\r\n"),32)=="generated");bool rejected=false;try{Line(new StringReader("12345\n"),4);}catch(InvalidOperationException){rejected=true;}Require(rejected);
        rejected=false;try{Keys(Object("{\"type\":\"stop\",\"extra\":true}"),"type");}catch(InvalidOperationException){rejected=true;}Require(rejected);
        var held=new HashSet<ushort>();var buttons=new HashSet<int>();var emitted=new List<Input>();var cleaned=new List<Input>();
        rejected=false;try{Apply(Object("{\"kind\":\"pointer\",\"x\":0.5,\"y\":0.5,\"event\":\"invalid\",\"button\":0}"),value=>emitted.Add(value),values=>emitted.AddRange(values),held,buttons);}catch(InvalidOperationException){rejected=true;}Generated(rejected&&emitted.Count==0,"Invalid pointer event produced input");
        rejected=false;try{Apply(Object("{\"kind\":\"pointer\",\"x\":0.5,\"y\":0.5,\"event\":\"down\",\"button\":5}"),value=>emitted.Add(value),values=>emitted.AddRange(values),held,buttons);}catch(InvalidOperationException){rejected=true;}Generated(rejected&&emitted.Count==0,"Invalid pointer button produced input");
        bool textSourceActive=true,unicodePaired=true;rejected=false;
        try{Apply(Object("{\"kind\":\"text\",\"text\":\"generated\"}"),value=>{Require(textSourceActive);emitted.Add(value);textSourceActive=false;},values=>{Require(textSourceActive);unicodePaired=unicodePaired&&values.Length==2&&values[0].Data.Key.Flags==4&&values[1].Data.Key.Flags==6&&values[0].Data.Key.Scan==values[1].Data.Key.Scan;emitted.AddRange(values);textSourceActive=false;},held,buttons);}catch(InvalidOperationException){rejected=true;}
        Generated(unicodePaired,"Unicode pair omitted matching keyup");Generated(rejected&&emitted.Count==2&&cleaned.Count==0,"Signin text continued after source loss");
        var initial=new SodaDesktopSigninTarget.Snapshot(new[]{1920,1200,0,0,1920,1200,1},"generated-primary");var snapshot=initial;var target=new SodaDesktopSigninTarget(initial,()=>snapshot);Require(target.Current());snapshot=new SodaDesktopSigninTarget.Snapshot(new[]{1920,1200,0,0,1920,1200,1},"generated-new-primary");Generated(!target.Current(),"Changed target was accepted");snapshot=initial;Generated(!target.Current(),"Changed target revived");
        target=new SodaDesktopSigninTarget(initial,()=>snapshot);snapshot=new SodaDesktopSigninTarget.Snapshot(new[]{1280,800,0,0,1280,800,1},"generated-primary");Require(!target.Current());
        snapshot=initial;target=new SodaDesktopSigninTarget(initial,()=>snapshot);emitted.Clear();cleaned.Clear();rejected=false;
        try{Apply(Object("{\"kind\":\"text\",\"text\":\"generated\"}"),value=>{Require(target.Current());emitted.Add(value);snapshot=new SodaDesktopSigninTarget.Snapshot(new[]{1920,1200,0,0,1920,1200,1},"changed-primary");},values=>{Require(target.Current());emitted.AddRange(values);snapshot=new SodaDesktopSigninTarget.Snapshot(new[]{1920,1200,0,0,1920,1200,1},"changed-primary");},held,buttons);}catch(InvalidOperationException){rejected=true;}Require(rejected&&emitted.Count==2&&cleaned.Count==0);
        var mode=new Mode{Fields=0x180080,Width=1920,Height=1200,Orientation=0,Bits=32};var metrics=new[]{1920,1200,0,0,1920,1200,1};var normal=BindTarget("generated-primary",mode,metrics);snapshot=normal;target=new SodaDesktopSigninTarget(normal,()=>snapshot);mode.Orientation=2;snapshot=BindTarget("generated-primary",mode,metrics);Generated(!target.Current(),"Rotated primary was accepted");
        using(var memory=new MemoryStream()){
            using(var output=Utf8Writer(memory))output.WriteLine("生成");Generated(new UTF8Encoding(false,true).GetString(memory.ToArray())=="生成"+Environment.NewLine,"Broker UTF8 output changed");
            memory.Position=0;using(var input=Utf8Reader(memory))Generated(Line(input,32)=="生成","Broker UTF8 input changed");
        }
        // Use an actual Windows pipe: MemoryStream.Flush is a no-op after
        // Dispose and cannot catch the borrowed StreamWriter disposal regression.
        string pipeName="SodaSigninPumpFixture-"+Guid.NewGuid().ToString("N");
        using(var pipe=new NamedPipeServerStream(pipeName,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous))
        using(var peer=new NamedPipeClientStream(".",pipeName,PipeDirection.InOut)){
            var connection=pipe.BeginWaitForConnection(null,null);peer.Connect(2000);pipe.EndWaitForConnection(connection);peer.Dispose();
            bool childStopped=false;var order=new List<string>();
            try{Pump(new StringReader(""),new StringWriter(),pipe,()=>true,()=>true,()=>{childStopped=true;order.Add("job-zero");return true;});}
            catch(ObjectDisposedException){throw new InvalidOperationException("Pump reflushed a closed pipe");}
            order.Add("terminal");Generated(childStopped&&order.Count==2&&order[0]=="job-zero"&&order[1]=="terminal","Pump terminal preceded child cleanup");
            bool closed=false;try{pipe.ReadByte();}catch(ObjectDisposedException){closed=true;}Generated(closed,"Pump left pipe open");
        }
        foreach(string code in new[]{"Enter","NumpadEnter","Digit3","Numpad3"}){
            held.Clear();buttons.Clear();int singles=0,pairs=0;bool sourceActive=true;
            Apply(Object("{\"kind\":\"key\",\"code\":\""+code+"\",\"down\":true}"),value=>singles++,values=>{Generated(values.Length==2&&values[0].Data.Key.Vk==values[1].Data.Key.Vk&&(values[1].Data.Key.Flags&2)!=0,"Authentication pair omitted release");EmitPair(values,()=>sourceActive,items=>{pairs++;sourceActive=false;return 2;});},held,buttons);
            Generated(pairs==1&&singles==0&&held.Count==0&&!sourceActive,"Authentication key was not neutral at desktop transition");
            Apply(Object("{\"kind\":\"key\",\"code\":\""+code+"\",\"down\":false}"),value=>singles++,values=>pairs++,held,buttons);Generated(pairs==1&&singles==0,"Authentication keyup was replayed");
        }
        var pair=new[]{KeyEvent(13,true),KeyEvent(13,false)};int submitted=0;
        rejected=false;try{EmitPair(pair,()=>false,items=>{submitted++;return 2;});}catch(InvalidOperationException){rejected=true;}Generated(rejected&&submitted==0,"Expired authentication input was sent");
        foreach(uint count in new uint[]{0,1}){rejected=false;try{EmitPair(pair,()=>true,items=>count);}catch(InvalidOperationException){rejected=true;}Generated(rejected,"Partial authentication pair accepted");}
        held.Clear();buttons.Clear();held.Add(162);int chordSingles=0,chordPairs=0;Apply(Object("{\"kind\":\"key\",\"code\":\"Enter\",\"down\":true}"),value=>chordSingles++,values=>chordPairs++,held,buttons);Generated(chordSingles==1&&chordPairs==0&&held.Contains(13),"Chord was converted to authentication pair");held.Clear();
        int targetReads=0;var calls=new List<string>();Func<SodaDesktopSigninTarget.Snapshot> readTarget=()=>{targetReads++;return initial;};
        Generated(InitialTarget(Purpose.Presence,readTarget)==null&&targetReads==0,"Presence enumerated physical target");
        var presenceFacts=ReadScope(Purpose.Presence,()=>{calls.Add("target");return false;},()=>{calls.Add("native");return new SodaDesktopSigninScope.Facts{Candidate=true};});
        Generated(presenceFacts.Candidate&&String.Join(",",calls)=="native","Presence blocked on physical target");
        foreach(var normalPurpose in new[]{Purpose.View,Purpose.Input}){
            int prior=targetReads;Generated(InitialTarget(normalPurpose,readTarget)==initial&&targetReads==prior+1,"Viewer skipped initial target");
            calls.Clear();var checkedFacts=ReadScope(normalPurpose,()=>{calls.Add("target");return true;},()=>{calls.Add("native");return new SodaDesktopSigninScope.Facts{Candidate=true};});
            Generated(checkedFacts.Candidate&&String.Join(",",calls)=="target,native,target","Viewer skipped target recheck");
            calls.Clear();checkedFacts=ReadScope(normalPurpose,()=>{calls.Add("target");return false;},()=>{calls.Add("native");return new SodaDesktopSigninScope.Facts{Candidate=true};});Generated(!checkedFacts.Candidate&&calls.Count==1,"Viewer accepted missing target");
            int checks=0;checkedFacts=ReadScope(normalPurpose,()=>++checks==1,()=>new SodaDesktopSigninScope.Facts{Candidate=true});Generated(!checkedFacts.Candidate&&checks==2,"Viewer accepted changed target");
        }
        var snapshots=new HashSet<string>(StringComparer.Ordinal);string snapshotId="11111111-1111-4111-8111-111111111111";
        QueueSnapshots(Object("{\"type\":\"keyframe\",\"snapshotIds\":[\""+snapshotId+"\"]}"),snapshots);Generated(snapshots.Contains(snapshotId),"Snapshot request was lost before capture");
        var capturing=new string[snapshots.Count];snapshots.CopyTo(capturing);QueueSnapshots(Object("{\"type\":\"keyframe\",\"snapshotIds\":[\"22222222-2222-4222-8222-222222222222\"]}"),snapshots);
        Generated(capturing.Length==1&&snapshots.Count==2,"Later snapshot request was attached to an older capture");foreach(string id in capturing)snapshots.Remove(id);Generated(snapshots.Count==1,"Frame commit discarded a later snapshot request");
        foreach(string invalid in new[]{"{\"type\":\"keyframe\",\"snapshotIds\":[]}","{\"type\":\"keyframe\",\"snapshotIds\":[\"invalid\"]}"}){bool denied=false;try{QueueSnapshots(Object(invalid),snapshots);}catch(InvalidOperationException){denied=true;}Generated(denied,"Invalid snapshot request accepted");}
        foreach(int code in new[]{201,203,208,215})Generated(new SodaDesktopSigninWorkerNative.DiagnosticFailure(code).Code==code,"Fixed diagnostic code was lost");
        foreach(int code in new[]{0,1,107,200,216,240,Int32.MaxValue})Generated(new SodaDesktopSigninWorkerNative.DiagnosticFailure(code).Code==1,"Unknown diagnostic code accepted");
        SodaDesktopSigninWorkerNative.VerifyLayouts();Console.WriteLine("signin_worker_generated_data_and_abi_passed");
    }
}
