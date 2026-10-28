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
using System.Web.Script.Serialization;

public static class SodaDesktopSigninWorker {
    internal const string Owner="__SIGNIN_WORKER_OWNER_SID__";
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=3000000,RecursionLimit=8};
    static Exception Failure(){return new InvalidOperationException("Signin worker is unavailable");}
    static void Require(bool value){if(!value)throw Failure();}
    internal static string Line(TextReader reader,int maximum){var text=new StringBuilder();int value;while((value=reader.Read())!=-1){if(value==10){if(text.Length>0&&text[text.Length-1]==13)text.Length--;return text.ToString();}if(text.Length>=maximum)throw Failure();text.Append((char)value);}if(text.Length!=0)throw Failure();return null;}
    static void Send(TextWriter writer,object value){writer.WriteLine(Json.Serialize(value));writer.Flush();}
    internal static void Broker(bool input){
        Require(SodaDesktopSigninVault.SystemPrimary()&&Process.GetCurrentProcess().SessionId==0);
        using(var package=SodaDesktopSigninPackageNative.VerifyWorker(Owner))using(var runtime=SodaDesktopSigninHost.RuntimeLease.Open()){
            uint console=SodaDesktopSigninWorkerNative.WTSGetActiveConsoleSessionId();Require(console>0&&console<=Int32.MaxValue);Guid nonce=Guid.NewGuid();
            using(var pipe=SodaDesktopSigninWorkerNative.Server(SodaDesktopSigninWorkerNative.PipeName(Owner,nonce))){
                uint pid;var child=SodaDesktopSigninWorkerNative.Start(Owner,nonce,(int)console,input,runtime.Path,out pid);
                try{
                    var pending=pipe.BeginWaitForConnection(null,null);var timer=Stopwatch.StartNew();
                    using(var wait=pending.AsyncWaitHandle){while(!wait.WaitOne(20)){Require(timer.ElapsedMilliseconds<5000&&package.Current()&&child.Running());}pipe.EndWaitForConnection(pending);}
                    uint actual;Require(SodaDesktopSigninWorkerNative.GetNamedPipeClientProcessId(pipe.SafePipeHandle,out actual)&&actual==pid&&child.Running());
                    using(var reader=new StreamReader(pipe,new UTF8Encoding(false,true),false,65536,true))using(var writer=new StreamWriter(pipe,new UTF8Encoding(false),4096,true))using(var stop=new ManualResetEvent(false)){
                        var inbound=new Thread(()=>{try{string line;while((line=Line(Console.In,16384))!=null){writer.WriteLine(line);writer.Flush();}}catch{}finally{try{stop.Set();}catch{}}}){IsBackground=true};
                        var outbound=new Thread(()=>{try{string line;while((line=Line(reader,3000000))!=null){Console.Out.WriteLine(line);Console.Out.Flush();}}catch{}finally{try{stop.Set();}catch{}}}){IsBackground=true};
                        inbound.Start();outbound.Start();timer.Restart();while(!stop.WaitOne(50)&&child.Running()&&package.Current()&&timer.ElapsedMilliseconds<120000){}
                        if(!child.Stop())Environment.FailFast("Signin worker could not stop");pipe.Dispose();
                        // Closing this broker's stdin is controlled by the Node
                        // owner. A blocked background stdin read ends at process exit.
                        if(!outbound.Join(1000))Environment.FailFast("Signin output did not stop");
                    }
                }finally{if(!child.Stop())Environment.FailFast("Signin worker could not stop");child.Dispose();}
            }
        }
    }
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
    static void Emit(Input value,Func<bool> current){Require(current());Require(SendInput(1,new[]{value},Marshal.SizeOf(typeof(Input)))==1);}
    static ushort VirtualKey(string code){
        if(code.Length==4&&code.StartsWith("Key")&&code[3]>='A'&&code[3]<='Z')return (ushort)code[3];
        if(code.Length==6&&code.StartsWith("Digit")&&code[5]>='0'&&code[5]<='9')return (ushort)code[5];
        int n;if(code.StartsWith("F")&&Int32.TryParse(code.Substring(1),out n)&&n>=1&&n<=24)return (ushort)(111+n);
        if(code.Length==7&&code.StartsWith("Numpad")&&code[6]>='0'&&code[6]<='9')return (ushort)(96+code[6]-'0');
        var map=new Dictionary<string,ushort>{{"Enter",13},{"Escape",27},{"Tab",9},{"Space",32},{"Backspace",8},{"Delete",46},{"Insert",45},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34},{"ArrowLeft",37},{"ArrowUp",38},{"ArrowRight",39},{"ArrowDown",40},{"ShiftLeft",160},{"ShiftRight",161},{"ControlLeft",162},{"ControlRight",163},{"AltLeft",164},{"AltRight",165},{"MetaLeft",91},{"MetaRight",92},{"CapsLock",20},{"ImeOn",0x16},{"ImeOff",0x1a},{"Minus",189},{"Equal",187},{"BracketLeft",219},{"BracketRight",221},{"Backslash",220},{"Semicolon",186},{"Quote",222},{"Backquote",192},{"Comma",188},{"Period",190},{"Slash",191},{"NumpadEnter",0x10d},{"NumpadMultiply",106},{"NumpadAdd",107},{"NumpadComma",108},{"NumpadSubtract",109},{"NumpadDecimal",110},{"NumpadDivide",111},{"NumpadEqual",146},{"NumLock",144},{"ScrollLock",145},{"Pause",19},{"PrintScreen",44},{"ContextMenu",93},{"Convert",28},{"NonConvert",29},{"KanaMode",21},{"IntlBackslash",226},{"IntlRo",226},{"IntlYen",220},{"Lang3",241},{"Lang4",242},{"Lang5",25},{"ZenkakuHankaku",25},{"AudioVolumeMute",173},{"AudioVolumeDown",174},{"AudioVolumeUp",175},{"VolumeMute",173},{"VolumeDown",174},{"VolumeUp",175},{"MediaTrackNext",176},{"MediaTrackPrevious",177},{"MediaStop",178},{"MediaPlayPause",179},{"LaunchMail",180},{"MediaSelect",181},{"LaunchApp1",182},{"LaunchApp2",183},{"BrowserBack",166},{"BrowserForward",167},{"BrowserRefresh",168},{"BrowserStop",169},{"BrowserSearch",170},{"BrowserFavorites",171},{"BrowserHome",172}};
        ushort result;Require(map.TryGetValue(code,out result));return result;
    }
    static Input KeyEvent(ushort key,bool down){var result=new Input{Type=1};result.Data.Key.Vk=(ushort)(key&255);result.Data.Key.Flags=(down?0u:2u)|(((key&0x100)!=0||key>=33&&key<=46||key==111||key==144||key==163||key==165||key>=91&&key<=93||key>=166&&key<=183)?1u:0u);return result;}
    static void Apply(Dictionary<string,object> value,Func<bool> current,HashSet<ushort> held,HashSet<int> buttons){
        string kind=Text(value,"kind",16);
        if(kind=="key"){
            Keys(value,"kind","code","down");ushort key=VirtualKey(Text(value,"code",32));bool down=Boolean(value,"down");if(down){held.Add(key);Emit(KeyEvent(key,true),current);}else if(held.Remove(key))Emit(KeyEvent(key,false),current);return;
        }
        if(kind=="text"){
            Keys(value,"kind","text");foreach(char c in Text(value,"text",1024)){var key=new Input{Type=1};key.Data.Key.Scan=c;key.Data.Key.Flags=4;Emit(key,current);key.Data.Key.Flags=6;Emit(key,current);}return;
        }
        if(kind=="wheel"){Keys(value,"kind","delta");var wheel=new Input();wheel.Data.Mouse.Flags=0x800;wheel.Data.Mouse.Data=unchecked((uint)(int)Integer(value,"delta",-1200,1200));Emit(wheel,current);return;}
        Require(kind=="pointer");Keys(value,"kind","x","y","event","button");double x=Convert.ToDouble(value["x"]),y=Convert.ToDouble(value["y"]);Require(!Double.IsNaN(x)&&!Double.IsInfinity(x)&&x>=0&&x<=1&&!Double.IsNaN(y)&&!Double.IsInfinity(y)&&y>=0&&y<=1);
        var pointer=new Input();pointer.Data.Mouse.Flags=0x8001;pointer.Data.Mouse.X=(int)Math.Round(x*65535);pointer.Data.Mouse.Y=(int)Math.Round(y*65535);Emit(pointer,current);
        string action=Text(value,"event",8);int button=(int)Integer(value,"button",0,4);if(action=="move")return;Require(action=="down"||action=="up");bool press=action=="down";if(press)buttons.Add(button);else if(!buttons.Remove(button))return;
        var click=new Input();click.Data.Mouse.Flags=button==0?(press?2u:4u):button==1?(press?32u:64u):button==2?(press?8u:16u):(press?128u:256u);click.Data.Mouse.Data=button>=3?(uint)(button-2):0u;Emit(click,current);
    }
    static void Release(HashSet<ushort> held,HashSet<int> buttons,Func<bool> current){
        foreach(ushort key in held)if(current())Emit(KeyEvent(key,false),current);held.Clear();
        foreach(int button in buttons)if(current()){var click=new Input();click.Data.Mouse.Flags=button==0?4u:button==1?64u:button==2?16u:256u;click.Data.Mouse.Data=button>=3?(uint)(button-2):0u;Emit(click,current);}buttons.Clear();
    }
    static void Run(Guid nonce,int brokerPid,long brokerStarted,int session,bool input){
        Require(SodaDesktopSigninVault.SystemPrimary());
        using(var package=SodaDesktopSigninPackageNative.VerifyWorker(Owner))using(var pipe=new NamedPipeClientStream(".",SodaDesktopSigninWorkerNative.PipeName(Owner,nonce),PipeDirection.InOut,PipeOptions.None,System.Security.Principal.TokenImpersonationLevel.Anonymous)){
            pipe.Connect(5000);uint actual;Require(SodaDesktopSigninWorkerNative.GetNamedPipeServerProcessId(pipe.SafePipeHandle,out actual)&&actual==(uint)brokerPid);
            using(var native=new SodaDesktopSigninScopeNative(Owner,session,brokerPid,brokerStarted,nonce))using(var self=Process.GetCurrentProcess())using(var reader=new StreamReader(pipe,new UTF8Encoding(false,true),false,16384,true))using(var writer=new StreamWriter(pipe,new UTF8Encoding(false),65536,true)){
                var clock=Stopwatch.StartNew();var scope=new SodaDesktopSigninScope(session,brokerPid,brokerStarted,self.Id,self.StartTime.ToUniversalTime().Ticks,nonce,input,()=>clock.ElapsedMilliseconds);
                Func<bool> current=()=>package.Current()&&scope.Current(native.Read);var commands=new BlockingCollection<string>(32);var held=new HashSet<ushort>();var buttons=new HashSet<int>();bool stop=false,configured=false;long pending=0,lastBeat=0,next=0;int width=1280,fps=10,quality=65;
                var thread=new Thread(()=>{try{string line;while((line=Line(reader,16384))!=null){if(!commands.TryAdd(line))break;}}catch{}finally{try{commands.CompleteAdding();}catch{}}}){IsBackground=true};thread.Start();
                try{
                    while(!stop&&current()&&clock.ElapsedMilliseconds-lastBeat<15000){
                        string line;while(commands.TryTake(out line)){
                            Require(current());var message=Object(line);string type=Text(message,"type",32);
                            if(type=="configure"){
                                Keys(message,"type","width","fps","quality");Require(!configured);width=(int)Integer(message,"width",320,1920);fps=(int)Integer(message,"fps",1,30);quality=(int)Integer(message,"quality",20,90);configured=true;
                                int w=GetSystemMetrics(0),h=GetSystemMetrics(1);Require(w>0&&h>0&&w<=8192&&h<=8192&&(long)w*h<=16000000&&current());Send(writer,new{type="ready",title="Windowsのサインイン画面",allowInput=input,width=w,height=h,backend="windows-gdi",secureDesktop=true,imeKeys=true,extendedInput=true});
                            }else if(type=="heartbeat"){Keys(message,"type");lastBeat=clock.ElapsedMilliseconds;}
                            else if(type=="stop"){Keys(message,"type");stop=true;break;}
                            else if(type=="control"){Keys(message,"type","enabled");Release(held,buttons,current);bool enabled=scope.Control(Boolean(message,"enabled"),native.Read);Send(writer,new{type="control",enabled});}
                            else if(type=="release"){Keys(message,"type");Release(held,buttons,current);}
                            else if(type=="ack"){Keys(message,"type","seq");long seq=Integer(message,"seq",1,9007199254740991);Require(seq==pending&&scope.Drawn(seq,native.Read));pending=0;}
                            else if(type=="quality"){Keys(message,"type","fps","quality");fps=(int)Integer(message,"fps",1,30);quality=(int)Integer(message,"quality",20,90);}
                            else if(type=="keyframe"){Keys(message,"type");}
                            else if(type=="input"){
                                Keys(message,"type","seq","frameSeq","input");long seq=Integer(message,"seq",1,9007199254740991),frame=Integer(message,"frameSeq",1,9007199254740991);Require(scope.Input(seq,frame,native.Read));var value=message["input"] as Dictionary<string,object>;Require(value!=null);Apply(value,current,held,buttons);Require(current());Send(writer,new{type="input_ack",seq});
                            }else throw Failure();
                        }
                        if(commands.IsCompleted||stop)break;
                        if(configured&&pending==0&&clock.ElapsedMilliseconds>=next){
                            var ticket=scope.Capture(native.Read);Require(ticket!=null&&current());var capture=Stopwatch.StartNew();int w=GetSystemMetrics(0),h=GetSystemMetrics(1);Require(w>0&&h>0&&w<=8192&&h<=8192&&(long)w*h<=16000000);
                            using(var original=new Bitmap(w,h,PixelFormat.Format24bppRgb)){
                                using(var graphics=Graphics.FromImage(original))graphics.CopyFromScreen(0,0,0,0,new Size(w,h),CopyPixelOperation.SourceCopy);
                                Require(current());double captureMs=capture.Elapsed.TotalMilliseconds;var encode=Stopwatch.StartNew();double ratio=Math.Min(1,Math.Min((double)width/w,2400d/h));int outW=Math.Max(1,(int)(w*ratio)),outH=Math.Max(1,(int)(h*ratio));
                                using(var scaled=new Bitmap(outW,outH,PixelFormat.Format24bppRgb))using(var bytes=new MemoryStream()){
                                    using(var graphics=Graphics.FromImage(scaled))graphics.DrawImage(original,0,0,outW,outH);
                                    ImageCodecInfo codec=null;foreach(var item in ImageCodecInfo.GetImageEncoders())if(item.FormatID==ImageFormat.Jpeg.Guid)codec=item;Require(codec!=null);
                                    using(var parameters=new EncoderParameters(1)){parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,(long)quality);scaled.Save(bytes,codec,parameters);}
                                    Require(bytes.Length>0&&bytes.Length<=2097152);
                                    string encoded=Json.Serialize(new{type="frame",info=new{seq=ticket.Serial,width=outW,height=outH,format="image/jpeg",captureMs,encodeMs=encode.Elapsed.TotalMilliseconds},data=Convert.ToBase64String(bytes.ToArray())});
                                    Require(scope.Publish(ticket,native.Read)&&current());pending=ticket.Serial;writer.WriteLine(encoded);writer.Flush();next=clock.ElapsedMilliseconds+1000/fps;
                                }
                            }
                        }Thread.Sleep(2);
                    }
                }finally{Release(held,buttons,current);scope.Close();pipe.Dispose();if(!thread.Join(1000))Environment.Exit(1);commands.Dispose();}
            }
        }
    }
    public static void VerifyGeneratedData(){
        Require(Marshal.SizeOf(typeof(Input))==40&&Marshal.SizeOf(typeof(Mouse))==32&&Marshal.SizeOf(typeof(Key))==24);
        Require(VirtualKey("ControlLeft")==162&&VirtualKey("Space")==32&&VirtualKey("ImeOn")==0x16&&VirtualKey("ImeOff")==0x1a);
        var enter=KeyEvent(VirtualKey("NumpadEnter"),true);Require(enter.Data.Key.Vk==13&&(enter.Data.Key.Flags&1)!=0);
        Require(Line(new StringReader("generated\r\n"),32)=="generated");bool rejected=false;try{Line(new StringReader("12345\n"),4);}catch(InvalidOperationException){rejected=true;}Require(rejected);
        rejected=false;try{Keys(Object("{\"type\":\"stop\",\"extra\":true}"),"type");}catch(InvalidOperationException){rejected=true;}Require(rejected);
        SodaDesktopSigninWorkerNative.VerifyLayouts();Console.WriteLine("signin_worker_generated_data_and_abi_passed");
    }
    public static void Main(string[] args){
        try{
            Require(Environment.Is64BitProcess&&SodaDesktopSigninVault.SystemPrimary());SodaDesktopSigninPackage.OwnerSid(Owner);
            if(args.Length==2&&args[0]=="--broker"&&(args[1]=="input"||args[1]=="view")){Broker(args[1]=="input");return;}
            Require(args.Length==6&&args[0]=="--worker");Guid nonce=Guid.Empty;int broker=0,session=0;long started=0;Require(Guid.TryParseExact(args[1],"D",out nonce)&&nonce!=Guid.Empty&&args[1]==nonce.ToString("D")&&Int32.TryParse(args[2],out broker)&&broker>0&&Int64.TryParse(args[3],out started)&&started>0&&Int32.TryParse(args[4],out session)&&session>0&&(args[5]=="input"||args[5]=="view"));
            Run(nonce,broker,started,session,args[5]=="input");
        }catch{Environment.Exit(1);}
    }
}
