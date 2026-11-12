// Minimal installed signin image. No general server, credentials, SAS or files API.
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
    internal enum Purpose { View, Input, Presence }
    internal static string PurposeName(Purpose value){if(value==Purpose.View)return "view";if(value==Purpose.Input)return "input";if(value==Purpose.Presence)return "presence";throw Failure();}
    static Purpose ParsePurpose(string value){if(value=="view")return Purpose.View;if(value=="input")return Purpose.Input;if(value=="presence")return Purpose.Presence;throw Failure();}
    static void DispatchPurpose(Purpose purpose,Action presence,Action capture){PurposeName(purpose);if(purpose==Purpose.Presence)presence();else capture();}
    static void CleanupPurpose(Purpose purpose,Action release){PurposeName(purpose);if(purpose!=Purpose.Presence)release();}
    static bool PresenceCommand(Purpose purpose,Dictionary<string,object> message,SodaDesktopSigninPresence presence,out bool stopped){
        stopped=false;if(purpose!=Purpose.Presence)return false;Keys(message,"type");string type=Text(message,"type",32);Require(presence.Command(type));stopped=type=="stop";return true;
    }
    static void InactivePresence(Purpose purpose,Action<string> publish,Func<string> receive){
        PurposeName(purpose);publish(purpose==Purpose.Presence?"signin_inactive":"signin_unavailable");
        // Keep the process alive until a command arrives through the broker's
        // pump. That pump starts only AFTER live PID/pipe authentication. This
        // removes the inactive-exit race without a timing-based sleep.
        string line=receive();if(line==null)return;var message=Object(line);string type=Text(message,"type",32);
        if(purpose!=Purpose.Presence&&type=="configure"){Keys(message,"type","width","fps","quality");Integer(message,"width",320,1920);Integer(message,"fps",1,30);Integer(message,"quality",20,90);return;}
        Keys(message,"type");Require(type=="heartbeat"||type=="stop");
    }
    // Presence has no pixels, coordinates or input. Its native desktop/WTS
    // observer still revokes on display changes; each view/input worker binds
    // and rechecks its own physical target independently.
    static SodaDesktopSigninTarget.Snapshot InitialTarget(Purpose purpose,Func<SodaDesktopSigninTarget.Snapshot> read){PurposeName(purpose);return purpose==Purpose.Presence?null:read();}
    static SodaDesktopSigninScope.Facts ReadScope(Purpose purpose,Func<bool> targetCurrent,Func<SodaDesktopSigninScope.Facts> nativeRead){
        PurposeName(purpose);if(purpose==Purpose.Presence)return nativeRead();
        if(!targetCurrent())return new SodaDesktopSigninScope.Facts();var facts=nativeRead();if(!targetCurrent())facts.Candidate=false;return facts;
    }
    internal const string Owner="__SIGNIN_WORKER_OWNER_SID__";
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=3000000,RecursionLimit=8};
    static Exception Failure(){return new InvalidOperationException("Signin worker is unavailable");}
    static void Require(bool value){if(!value)throw Failure();}
    internal static string Line(TextReader reader,int maximum){var text=new StringBuilder();int value;while((value=reader.Read())!=-1){if(value==10){if(text.Length>0&&text[text.Length-1]==13)text.Length--;return text.ToString();}if(text.Length>=maximum)throw Failure();text.Append((char)value);}if(text.Length!=0)throw Failure();return null;}
    static void Send(TextWriter writer,object value){writer.WriteLine(Json.Serialize(value));writer.Flush();}
    internal static void Broker(Purpose purpose,TextReader parentIn,TextWriter parentOut){
        int stage=201;try{
        Require(SodaDesktopSigninVault.SystemPrimary()&&Process.GetCurrentProcess().SessionId==0);
        using(var package=SodaDesktopSigninPackageNative.VerifyWorker(Owner))using(var runtime=SodaDesktopSigninHost.RuntimeLease.Open()){
            stage=202;uint console=SodaDesktopSigninWorkerNative.WTSGetActiveConsoleSessionId();Guid nonce=Guid.NewGuid();
            if(purpose==Purpose.Presence){Require(package.Current());Send(parentOut,new{type="signin_context",ownerSid=Owner,packageRoot=Path.GetDirectoryName(package.Bootstrap),stateDir=runtime.Path});}
            // At SCM boot there may not be an attached console yet. This is an
            // inactive source, not a failed service or a reason to reset state.
            if(console==0||console>Int32.MaxValue){Send(parentOut,new{type=purpose==Purpose.Presence?"signin_inactive":"signin_unavailable"});return;}
            using(var host=SodaDesktopSigninWorkerNative.HostBinding.Open(Owner,()=>package.Current()&&runtime.Current())){
            stage=210;using(var pipe=SodaDesktopSigninWorkerNative.Server(SodaDesktopSigninWorkerNative.PipeName(Owner,nonce))){
                stage=211;uint pid;var child=SodaDesktopSigninWorkerNative.Start(Owner,nonce,(int)console,purpose,runtime.Path,host,out pid);
                try{
                    stage=212;var pending=Task.Factory.FromAsync(pipe.BeginWaitForConnection,pipe.EndWaitForConnection,null);var timer=Stopwatch.StartNew();
                    pending.ContinueWith(failed=>failed.Exception.Handle(error=>true),TaskContinuationOptions.OnlyOnFaulted|TaskContinuationOptions.ExecuteSynchronously);
                    while(!pending.IsCompleted){Require(timer.ElapsedMilliseconds<5000&&package.Current()&&child.Running());Thread.Sleep(20);}Require(timer.ElapsedMilliseconds<5000);pending.GetAwaiter().GetResult();
                    stage=213;uint actual;Require(SodaDesktopSigninWorkerNative.GetNamedPipeClientProcessId(pipe.SafePipeHandle,out actual)&&actual==pid&&child.Running());
                    stage=214;Pump(parentIn,parentOut,pipe,()=>child.Running(),()=>package.Current(),()=>child.Stop());
                }finally{if(!child.Stop())Environment.FailFast("Signin worker could not stop");child.Dispose();}
            }
            }
        }
        }catch(SodaDesktopSigninWorkerNative.DiagnosticFailure){throw;}catch{throw new SodaDesktopSigninWorkerNative.DiagnosticFailure(stage);}
    }
    // The pipe owns its handle. The stdin pump can remain blocked until broker
    // exit, so its borrowed writer must not be disposed while that thread lives.
    // In particular, Dispose would Flush the already closed pipe even with
    // leaveOpen=true. Every transmitted line is explicitly flushed instead.
    static void WithPipeText(Stream pipe,int readSize,int writeSize,Action<StreamReader,StreamWriter> action){
        using(var reader=new StreamReader(pipe,new UTF8Encoding(false,true),false,readSize,true)){
            var writer=new StreamWriter(pipe,new UTF8Encoding(false),writeSize,true);action(reader,writer);
        }
    }
    static void Pump(TextReader parentIn,TextWriter parentOut,Stream pipe,Func<bool> running,Func<bool> current,Func<bool> stopChild){
        WithPipeText(pipe,65536,4096,(reader,writer)=>{using(var stop=new ManualResetEvent(false)){
            var inbound=new Thread(()=>{try{string line;while((line=Line(parentIn,16384))!=null){writer.WriteLine(line);writer.Flush();}}catch{}finally{try{stop.Set();}catch{}}}){IsBackground=true};
            var outbound=new Thread(()=>{try{string line;while((line=Line(reader,3000000))!=null){parentOut.WriteLine(line);parentOut.Flush();}}catch{}finally{try{stop.Set();}catch{}}}){IsBackground=true};
            inbound.Start();outbound.Start();while(!stop.WaitOne(50)&&running()&&current()){}
            if(!stopChild())Environment.FailFast("Signin worker could not stop");pipe.Dispose();
            if(!outbound.Join(1000))Environment.FailFast("Signin output did not stop");
        }});
    }
    static StreamReader Utf8Reader(Stream stream){return new StreamReader(stream,new UTF8Encoding(false,true),false,16384,true);}
    static StreamWriter Utf8Writer(Stream stream){return new StreamWriter(stream,new UTF8Encoding(false),65536,true){AutoFlush=true};}
    static Dictionary<string,object> Object(string text){var value=Json.DeserializeObject(text) as Dictionary<string,object>;if(value==null)throw Failure();return value;}
    static void Keys(Dictionary<string,object> value,params string[] keys){Require(value.Count==keys.Length);foreach(string key in keys)Require(value.ContainsKey(key));}
    static long Integer(Dictionary<string,object> value,string key,long minimum,long maximum){object item=value[key];Require(item is int||item is long);long result=Convert.ToInt64(item);Require(result>=minimum&&result<=maximum);return result;}
    static bool Boolean(Dictionary<string,object> value,string key){Require(value[key] is bool);return (bool)value[key];}
    static string Text(Dictionary<string,object> value,string key,int maximum){var result=value[key] as string;Require(result!=null&&result.Length<=maximum);return result;}
    [StructLayout(LayoutKind.Sequential)]struct Mouse{internal int X,Y;internal uint Data,Flags,Time;internal UIntPtr Extra;}
    [StructLayout(LayoutKind.Sequential)]struct Key{internal ushort Vk,Scan;internal uint Flags,Time;internal UIntPtr Extra;}
    [StructLayout(LayoutKind.Explicit)]struct Data{[FieldOffset(0)]internal Mouse Mouse;[FieldOffset(0)]internal Key Key;}
    [StructLayout(LayoutKind.Sequential)]struct Input{internal uint Type;internal Data Data;}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll",SetLastError=true)]static extern uint SendInput(uint count,Input[] input,int size);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll")]static extern int GetSystemMetrics(int index);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Device {
        internal uint Size;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]internal string Name;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]internal string Description;
        internal uint Flags;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]internal string Id;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]internal string Key;
    }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern bool EnumDisplayDevicesW(string device,uint index,ref Device value,uint flags);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll")]static extern bool SetProcessDPIAware();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll")]static extern bool IsProcessDPIAware();
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Mode {
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]internal string Name;
        internal ushort Spec,Driver,Size,Extra;internal uint Fields;internal int X,Y;internal uint Orientation,FixedOutput;
        internal short Color,Duplex,YResolution,TTOption,Collate;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]internal string Form;
        internal ushort LogPixels;internal uint Bits,Width,Height,Flags,Frequency,ICMMethod,ICMIntent,MediaType,DitherType,Reserved1,Reserved2,PanningWidth,PanningHeight;
    }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("user32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)]static extern bool EnumDisplaySettingsExW(string device,int index,ref Mode mode,uint flags);
    static SodaDesktopSigninTarget.Snapshot Target(){
        Device primary=new Device();bool found=false,ended=false;
        for(uint i=0;i<=32;i++){
            var item=new Device{Size=(uint)Marshal.SizeOf(typeof(Device))};if(!EnumDisplayDevicesW(null,i,ref item,0)){ended=true;break;}Require(i<32);
            if((item.Flags&4)!=0){Require(!found&&(item.Flags&1)!=0&&!String.IsNullOrEmpty(item.Name));found=true;primary=item;}
        }Require(ended&&found);var identity=new StringBuilder(primary.Name).Append('|').Append(primary.Id).Append('|').Append(primary.Key).Append('|').Append(primary.Flags);ended=false;
        for(uint i=0;i<=8;i++){
            var monitor=new Device{Size=(uint)Marshal.SizeOf(typeof(Device))};if(!EnumDisplayDevicesW(primary.Name,i,ref monitor,1)){ended=true;break;}Require(i<8);
            identity.Append('|').Append(monitor.Name).Append('|').Append(monitor.Id).Append('|').Append(monitor.Key).Append('|').Append(monitor.Flags);
        }Require(ended);
        var mode=new Mode{Size=(ushort)Marshal.SizeOf(typeof(Mode))};Require(EnumDisplaySettingsExW(primary.Name,-1,ref mode,0));
        return BindTarget(identity.ToString(),mode,new[]{GetSystemMetrics(0),GetSystemMetrics(1),GetSystemMetrics(76),GetSystemMetrics(77),GetSystemMetrics(78),GetSystemMetrics(79),GetSystemMetrics(80)});
    }
    static SodaDesktopSigninTarget.Snapshot BindTarget(string identity,Mode mode,int[] metrics){
        Require((mode.Fields&0x180080)==0x180080&&mode.Orientation<=3);
        var binding=new StringBuilder(identity).Append('|').Append(mode.Orientation).Append('|').Append(mode.X).Append('|').Append(mode.Y).Append('|').Append(mode.Width).Append('|').Append(mode.Height).Append('|').Append(mode.Bits).Append('|').Append(mode.Fields);
        return new SodaDesktopSigninTarget.Snapshot(metrics,binding.ToString());
    }
    static void Emit(Input value,Func<bool> current){Require(current());Require(SendInput(1,new[]{value},Marshal.SizeOf(typeof(Input)))==1);}
    // Authentication can change desktop on key-down. Queue its matching
    // release in that same authorized native call, never in a later desktop.
    static void EmitPair(Input[] values,Func<bool> current,Func<Input[],uint> sender=null){
        Require(values!=null&&values.Length==2&&current());uint sent=sender==null?SendInput(2,values,Marshal.SizeOf(typeof(Input))):sender(values);Require(sent==2);
    }
    static bool BareAuthenticationKey(ushort key,bool down,int held,int buttons){return down&&(key==13||key==0x10d||key>=48&&key<=57||key>=96&&key<=105)&&held==0&&buttons==0;}
    static ushort VirtualKey(string code){
        if(code.Length==4&&code.StartsWith("Key")&&code[3]>='A'&&code[3]<='Z')return (ushort)code[3];
        if(code.Length==6&&code.StartsWith("Digit")&&code[5]>='0'&&code[5]<='9')return (ushort)code[5];
        int n;if(code.StartsWith("F")&&Int32.TryParse(code.Substring(1),out n)&&n>=1&&n<=24)return (ushort)(111+n);
        if(code.Length==7&&code.StartsWith("Numpad")&&code[6]>='0'&&code[6]<='9')return (ushort)(96+code[6]-'0');
        var map=new Dictionary<string,ushort>{{"Enter",13},{"Escape",27},{"Tab",9},{"Space",32},{"Backspace",8},{"Delete",46},{"Insert",45},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34},{"ArrowLeft",37},{"ArrowUp",38},{"ArrowRight",39},{"ArrowDown",40},{"ShiftLeft",160},{"ShiftRight",161},{"ControlLeft",162},{"ControlRight",163},{"AltLeft",164},{"AltRight",165},{"MetaLeft",91},{"MetaRight",92},{"CapsLock",20},{"ImeOn",0x16},{"ImeOff",0x1a},{"Minus",189},{"Equal",187},{"BracketLeft",219},{"BracketRight",221},{"Backslash",220},{"Semicolon",186},{"Quote",222},{"Backquote",192},{"Comma",188},{"Period",190},{"Slash",191},{"NumpadEnter",0x10d},{"NumpadMultiply",106},{"NumpadAdd",107},{"NumpadComma",108},{"NumpadSubtract",109},{"NumpadDecimal",110},{"NumpadDivide",111},{"NumpadEqual",146},{"NumLock",144},{"ScrollLock",145},{"Pause",19},{"PrintScreen",44},{"ContextMenu",93},{"Convert",28},{"NonConvert",29},{"KanaMode",21},{"IntlBackslash",226},{"IntlRo",226},{"IntlYen",220},{"Lang3",241},{"Lang4",242},{"Lang5",25},{"ZenkakuHankaku",25},{"AudioVolumeMute",173},{"AudioVolumeDown",174},{"AudioVolumeUp",175},{"VolumeMute",173},{"VolumeDown",174},{"VolumeUp",175},{"MediaTrackNext",176},{"MediaTrackPrevious",177},{"MediaStop",178},{"MediaPlayPause",179},{"LaunchMail",180},{"MediaSelect",181},{"LaunchApp1",182},{"LaunchApp2",183},{"BrowserBack",166},{"BrowserForward",167},{"BrowserRefresh",168},{"BrowserStop",169},{"BrowserSearch",170},{"BrowserFavorites",171},{"BrowserHome",172}};
        ushort result;Require(map.TryGetValue(code,out result));return result;
    }
    static Input KeyEvent(ushort key,bool down){var result=new Input{Type=1};result.Data.Key.Vk=(ushort)(key&255);result.Data.Key.Flags=(down?0u:2u)|(((key&0x100)!=0||key>=33&&key<=46||key==111||key==144||key==163||key==165||key>=91&&key<=93||key>=166&&key<=183)?1u:0u);return result;}
    static void Apply(Dictionary<string,object> value,Action<Input> emit,Action<Input[]> batch,HashSet<ushort> held,HashSet<int> buttons){
        string kind=Text(value,"kind",16);
        if(kind=="key"){
            Keys(value,"kind","code","down");ushort key=VirtualKey(Text(value,"code",32));bool down=Boolean(value,"down");if(BareAuthenticationKey(key,down,held.Count,buttons.Count)){held.Add(key);batch(new[]{KeyEvent(key,true),KeyEvent(key,false)});held.Remove(key);}else if(down){emit(KeyEvent(key,true));held.Add(key);}else if(held.Contains(key)){emit(KeyEvent(key,false));held.Remove(key);}return;
        }
        if(kind=="text"){
            Keys(value,"kind","text");string text=Text(value,"text",1024);Require(text.Length>0);foreach(char c in text){var key=new Input{Type=1};key.Data.Key.Scan=c;key.Data.Key.Flags=4;var up=key;up.Data.Key.Flags=6;batch(new[]{key,up});}return;
        }
        if(kind=="wheel"){Keys(value,"kind","delta");var wheel=new Input();wheel.Data.Mouse.Flags=0x800;wheel.Data.Mouse.Data=unchecked((uint)(int)Integer(value,"delta",-1200,1200));emit(wheel);return;}
        Require(kind=="pointer");Keys(value,"kind","x","y","event","button");
        string action=Text(value,"event",8);int button=(int)Integer(value,"button",0,4);Require(action=="move"||action=="down"||action=="up");
        Require((value["x"] is int||value["x"] is long||value["x"] is double||value["x"] is decimal)&&(value["y"] is int||value["y"] is long||value["y"] is double||value["y"] is decimal));double x=Convert.ToDouble(value["x"]),y=Convert.ToDouble(value["y"]);Require(!Double.IsNaN(x)&&!Double.IsInfinity(x)&&x>=0&&x<=1&&!Double.IsNaN(y)&&!Double.IsInfinity(y)&&y>=0&&y<=1);
        var pointer=new Input();pointer.Data.Mouse.Flags=0x8001;pointer.Data.Mouse.X=(int)Math.Round(x*65535);pointer.Data.Mouse.Y=(int)Math.Round(y*65535);emit(pointer);
        if(action=="move")return;bool press=action=="down";if(!press&&!buttons.Contains(button))return;
        var click=new Input();click.Data.Mouse.Flags=button==0?(press?2u:4u):button==1?(press?32u:64u):button==2?(press?8u:16u):(press?128u:256u);click.Data.Mouse.Data=button>=3?(uint)(button-2):0u;emit(click);if(press)buttons.Add(button);else buttons.Remove(button);
    }
    static void QueueSnapshots(Dictionary<string,object> message,HashSet<string> requests){
        if(message.Count==1){Keys(message,"type");return;}
        Keys(message,"type","snapshotIds");var values=message["snapshotIds"] as object[];Require(values!=null&&values.Length>=1&&values.Length<=64);
        foreach(var raw in values){var value=raw as string;Guid id;Require(value!=null&&value.Length==36&&Guid.TryParseExact(value,"D",out id)&&(requests.Count<64||requests.Contains(value)));requests.Add(value);}
    }
    static void Release(HashSet<ushort> held,HashSet<int> buttons,Func<bool> current){
        foreach(ushort key in held)if(current())Emit(KeyEvent(key,false),current);held.Clear();
        foreach(int button in buttons)if(current()){var click=new Input();click.Data.Mouse.Flags=button==0?4u:button==1?64u:button==2?16u:256u;click.Data.Mouse.Data=button>=3?(uint)(button-2):0u;Emit(click,current);}buttons.Clear();
    }
    // Overlapped I/O lets the pending command reader coexist with outgoing
    // presence, frames and acknowledgements without waiting for more input.
    internal static NamedPipeClientStream OpenPipe(string name){return new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous,System.Security.Principal.TokenImpersonationLevel.Anonymous);}
    static void Run(Guid nonce,int brokerPid,long brokerStarted,int session,Purpose purpose){
        bool input=purpose==Purpose.Input;Require(PurposeName(purpose)!=null);
        Require(SodaDesktopSigninVault.SystemPrimary());
        using(var package=SodaDesktopSigninPackageNative.VerifyWorker(Owner))using(var runtime=SodaDesktopSigninHost.RuntimeLease.Open())using(var pipe=OpenPipe(SodaDesktopSigninWorkerNative.PipeName(Owner,nonce))){
            pipe.Connect(5000);uint actual;Require(SodaDesktopSigninWorkerNative.GetNamedPipeServerProcessId(pipe.SafePipeHandle,out actual)&&actual==(uint)brokerPid);
            WithPipeText(pipe,16384,65536,(reader,writer)=>{
            SodaDesktopSigninScopeNative native;try{native=new SodaDesktopSigninScopeNative(Owner,session,brokerPid,brokerStarted);}catch(SodaDesktopSigninInactiveException){InactivePresence(purpose,type=>Send(writer,new{type}),()=>Line(reader,16384));return;}
            using(native)using(var self=Process.GetCurrentProcess()){
                var clock=Stopwatch.StartNew();var scope=new SodaDesktopSigninScope(session,brokerPid,brokerStarted,self.Id,self.StartTime.ToUniversalTime().Ticks,input);
                var initialTarget=InitialTarget(purpose,Target);var target=initialTarget==null?null:new SodaDesktopSigninTarget(initialTarget,Target);
                Func<SodaDesktopSigninScope.Facts> read=()=>ReadScope(purpose,()=>target.Current(),native.Read);
                Func<bool> current=()=>package.Current()&&scope.Current(read);var commands=new BlockingCollection<string>(32);var held=new HashSet<ushort>();var buttons=new HashSet<int>();var snapshots=new HashSet<string>(StringComparer.Ordinal);bool stop=false,configured=false;long pending=0,frameSeq=0,next=0;int width=1280,fps=10,quality=65;
                var presence=new SodaDesktopSigninPresence(()=>clock.ElapsedMilliseconds,current);
                var thread=new Thread(()=>{try{string line;while((line=Line(reader,16384))!=null){if(!commands.TryAdd(line))break;}}catch{}finally{try{commands.CompleteAdding();}catch{}}}){IsBackground=true};thread.Start();
                try{
                    while(!stop&&current()){
                        string line;while(commands.TryTake(out line)){
                            Require(current());var message=Object(line);string type=Text(message,"type",32);
                            bool presenceStopped;if(PresenceCommand(purpose,message,presence,out presenceStopped)){if(presenceStopped){stop=true;break;}continue;}
                            if(type=="configure"){
                                Keys(message,"type","width","fps","quality");Require(!configured);width=(int)Integer(message,"width",320,1920);fps=(int)Integer(message,"fps",1,30);quality=(int)Integer(message,"quality",20,90);configured=true;
                                int w=initialTarget.Width,h=initialTarget.Height;Require(w>0&&h>0&&w<=8192&&h<=8192&&(long)w*h<=16000000&&current());Send(writer,new{type="ready",title="Windowsのサインイン画面",allowInput=input,width=w,height=h,backend="windows-gdi",secureDesktop=true,imeKeys=true,extendedInput=true});
                            }else if(type=="heartbeat"){Keys(message,"type");}
                            else if(type=="stop"){Keys(message,"type");stop=true;break;}
                            else if(type=="control"){Keys(message,"type","enabled");Release(held,buttons,current);bool enabled=scope.Control(Boolean(message,"enabled"),read);Send(writer,new{type="control",enabled});}
                            else if(type=="release"){Keys(message,"type");Release(held,buttons,current);}
                            else if(type=="ack"){Keys(message,"type","seq");long seq=Integer(message,"seq",1,9007199254740991);Require(seq==pending);pending=0;}
                            else if(type=="quality"){Keys(message,"type","fps","quality");fps=(int)Integer(message,"fps",1,30);quality=(int)Integer(message,"quality",20,90);}
                            else if(type=="keyframe"){QueueSnapshots(message,snapshots);}
                            else if(type=="input"){
                                Keys(message,"type","seq","input");long seq=Integer(message,"seq",1,9007199254740991);Require(scope.Input(seq,read));var value=message["input"] as Dictionary<string,object>;Require(value!=null);Apply(value,item=>Emit(item,current),items=>EmitPair(items,current),held,buttons);Require(current());Send(writer,new{type="input_ack",seq});
                            }else throw Failure();
                        }
                        if(commands.IsCompleted||stop)break;
                        DispatchPurpose(purpose,()=>{Require(presence.Pulse(record=>{string encoded=Json.Serialize(record);Require(presence.Current());writer.WriteLine(encoded);writer.Flush();}));Thread.Sleep(20);},()=>{
                        if(configured&&pending==0&&clock.ElapsedMilliseconds>=next){
                            Require(current()&&frameSeq<9007199254740991);long sequence=++frameSeq;var snapshotIds=new string[snapshots.Count];snapshots.CopyTo(snapshotIds);var capture=Stopwatch.StartNew();int w=initialTarget.Width,h=initialTarget.Height;Require(w>0&&h>0&&w<=8192&&h<=8192&&(long)w*h<=16000000);
                            using(var original=new Bitmap(w,h,PixelFormat.Format24bppRgb)){
                                using(var graphics=Graphics.FromImage(original))graphics.CopyFromScreen(0,0,0,0,new Size(w,h),CopyPixelOperation.SourceCopy);
                                Require(current());double captureMs=capture.Elapsed.TotalMilliseconds;var encode=Stopwatch.StartNew();double ratio=Math.Min(1,Math.Min((double)width/w,2400d/h));int outW=Math.Max(1,(int)(w*ratio)),outH=Math.Max(1,(int)(h*ratio));
                                using(var scaled=new Bitmap(outW,outH,PixelFormat.Format24bppRgb))using(var bytes=new MemoryStream()){
                                    using(var graphics=Graphics.FromImage(scaled))graphics.DrawImage(original,0,0,outW,outH);
                                    ImageCodecInfo codec=null;foreach(var item in ImageCodecInfo.GetImageEncoders())if(item.FormatID==ImageFormat.Jpeg.Guid)codec=item;Require(codec!=null);
                                    using(var parameters=new EncoderParameters(1)){parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,(long)quality);scaled.Save(bytes,codec,parameters);}
                                    Require(bytes.Length>0&&bytes.Length<=2097152);
                                    var info=new Dictionary<string,object>{{"seq",sequence},{"width",outW},{"height",outH},{"format","image/jpeg"},{"captureMs",captureMs},{"encodeMs",encode.Elapsed.TotalMilliseconds}};
                                    if(snapshotIds.Length>0)info.Add("snapshotIds",snapshotIds);
                                    string encoded=Json.Serialize(new{type="frame",info,data=Convert.ToBase64String(bytes.ToArray())});
                                    Require(current());pending=sequence;writer.WriteLine(encoded);writer.Flush();foreach(string id in snapshotIds)snapshots.Remove(id);next=clock.ElapsedMilliseconds+1000/fps;
                                }
                            }
                        }});Thread.Sleep(2);
                    }
                }finally{presence.Close();CleanupPurpose(purpose,()=>Release(held,buttons,current));scope.Close();pipe.Dispose();if(!thread.Join(1000))Environment.Exit(1);commands.Dispose();}
            }});
        }
    }
    public static void Main(string[] args){
        try{
            Require(Environment.Is64BitProcess&&SodaDesktopSigninVault.SystemPrimary());SodaDesktopSigninPackage.OwnerSid(Owner);
            SetProcessDPIAware();Require(IsProcessDPIAware());
            if(args.Length==2&&args[0]=="--broker"&&(args[1]=="input"||args[1]=="view"||args[1]=="presence")){using(var input=Utf8Reader(Console.OpenStandardInput()))using(var output=Utf8Writer(Console.OpenStandardOutput()))Broker(ParsePurpose(args[1]),input,output);return;}
            Require(args.Length==6&&args[0]=="--worker");Guid nonce=Guid.Empty;int broker=0,session=0;long started=0;Require(Guid.TryParseExact(args[1],"D",out nonce)&&nonce!=Guid.Empty&&args[1]==nonce.ToString("D")&&Int32.TryParse(args[2],out broker)&&broker>0&&Int64.TryParse(args[3],out started)&&started>0&&Int32.TryParse(args[4],out session)&&session>0&&(args[5]=="input"||args[5]=="view"||args[5]=="presence"));
            Run(nonce,broker,started,session,ParsePurpose(args[5]));
        }catch(Exception error){var diagnostic=error as SodaDesktopSigninWorkerNative.DiagnosticFailure;Environment.Exit(diagnostic==null?1:diagnostic.Code);}
    }
}
