// Windows-only opt-in backend. No service or elevation; display changes need a separate local ceiling.
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static class SodaDesktopHost {
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx,dy; public uint mouseData,dwFlags,time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mouse; [FieldOffset(0)] public KEYBDINPUT key; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
    [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool GetUserObjectInformation(IntPtr h, int index, StringBuilder data, uint size, out uint needed);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window,IntPtr dc);
    [DllImport("gdi32.dll",SetLastError=true)] static extern bool StretchBlt(IntPtr dst,int x,int y,int w,int h,IntPtr src,int sx,int sy,int sw,int sh,uint op);
    [DllImport("gdi32.dll")] static extern int SetStretchBltMode(IntPtr dc,int mode);
    [DllImport("gdi32.dll")] static extern bool SetBrushOrgEx(IntPtr dc,int x,int y,IntPtr previous);
    static void CaptureScaled(Graphics target,int width,int height) {
        IntPtr source=GetDC(IntPtr.Zero);if(source==IntPtr.Zero)throw new InvalidOperationException("Capture unavailable");
        try { IntPtr dest=target.GetHdc();try { SetStretchBltMode(dest,4);SetBrushOrgEx(dest,0,0,IntPtr.Zero);if(!StretchBlt(dest,0,0,width,height,source,Bounds.Left,Bounds.Top,Bounds.Width,Bounds.Height,0x00CC0020))throw new InvalidOperationException("Capture failed"); } finally { target.ReleaseHdc(dest); } }
        finally { ReleaseDC(IntPtr.Zero,source); }
    }
    static void RetireCapture(ref SodaDesktopDxgi dxgi,Action beforeDispose) {if(beforeDispose!=null)beforeDispose();dxgi.Dispose();dxgi=null;}
    static void CaptureFrame(Graphics target,int width,int height,bool cursorVisible,ref SodaDesktopDxgi dxgi,Action beforeDispose=null) {
        if(dxgi!=null) {try {if(!dxgi.Capture(target))CaptureScaled(target,width,height);}catch {RetireCapture(ref dxgi,beforeDispose);CaptureScaled(target,width,height);}}
        else CaptureScaled(target,width,height);
        Point cursor=Cursor.Position;
        if(cursorVisible && Bounds.Contains(cursor)) {int x=(int)((cursor.X-Bounds.Left)*(double)width/Bounds.Width),y=(int)((cursor.Y-Bounds.Top)*(double)height/Bounds.Height);Cursors.Default.Draw(target,new Rectangle(x,y,16,24));}
    }
    static readonly object Gate=new object();
    static readonly HashSet<ushort> Keys=new HashSet<ushort>();
    static readonly HashSet<int> Buttons=new HashSet<int>();
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=3*1024*1024 };
    static readonly JavaScriptSerializer OutputJson=new JavaScriptSerializer { MaxJsonLength=3*1024*1024 };
    static readonly object OutputGate=new object();
    static readonly Stopwatch Clock=Stopwatch.StartNew();
    static volatile bool Stopping=false;
    static bool Control=false;
    static bool InputAckPipe=false;
    static bool DeferNativeSnapshots=false;
    static long LastNativeInput=-1000;
    static long LastHeartbeat=0;
    static Rectangle Bounds;static SodaDesktopMonitorLayout ActiveMonitors;static int MonitorNotice;static string CaptureDevice;
    static SodaDesktopMonitorLayout.IDriver MonitorDriver=new SodaDesktopMonitorLayout.NativeDriver();
    static Func<bool> MemoryDesktop;static Action<INPUT> MemoryInput;static Action<object> MemoryOutput;
    static bool SourceMatches(string device){SodaDesktopMonitorLayout.Item[] ignored;return SourceMatches(device,out ignored);}
    static bool SourceMatches(string device,out SodaDesktopMonitorLayout.Item[] current){current=null;if(ActiveMonitors==null)return SodaDesktopDisplay.Matches(device,Bounds);bool same=false;try{current=MonitorDriver.Read();same=ActiveMonitors.MatchesItems(current);}catch{}if(!same&&Interlocked.CompareExchange(ref MonitorNotice,1,0)==0)Output(new{type="monitor_topology_changed"});return same;}

    static void Output(object value) { lock(OutputGate){if(MemoryOutput!=null){MemoryOutput(value);return;}Console.Out.WriteLine(OutputJson.Serialize(value)); Console.Out.Flush();} }
    static void InputAck(long seq) {
        if(InputAckPipe){Console.Error.WriteLine("\nSODA_DESKTOP_INPUT_ACK "+seq.ToString(System.Globalization.CultureInfo.InvariantCulture));Console.Error.Flush();}
        else Output(new {type="input_ack",seq});
    }
    static bool ApplyInput(Dictionary<string,object> msg,ref long inputSeq,Action applied=null) {
        long id=Convert.ToInt64(msg["seq"]),expires=Convert.ToInt64(msg["expiresAt"]),utc=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if(!Control || id<=inputSeq || expires<utc || expires>utc+1500)return false;
        inputSeq=id;if(!Apply(Obj(msg["input"])))return false;
        if(DeferNativeSnapshots&&msg.ContainsKey("deferNativeSnapshot")&&msg["deferNativeSnapshot"] is bool&&(bool)msg["deferNativeSnapshot"])Interlocked.Exchange(ref LastNativeInput,Clock.ElapsedMilliseconds);
        if(applied!=null)applied();InputAck(id);return true;
    }
    static Dictionary<string,object> Obj(object value) { return (Dictionary<string,object>)value; }
    static int Num(Dictionary<string,object> value,string key) { return Convert.ToInt32(value[key]); }
    static bool Secure;
    static Func<int> SecureLockState;
    static Func<bool> SecureGuard;
    static Func<object> ProtectedCapture;
    static Func<object,bool> ProtectedPublish;
    static bool SecureAttentionAllowed=true;
    static object CaptureScope(){return ProtectedCapture==null?null:ProtectedCapture();}
    static bool PublishScope(object ticket){return ProtectedPublish==null||ticket!=null&&ProtectedPublish(ticket);}
    // Delegates come only from the authenticated installed worker, never configure.
    public static void RunProtected(Func<bool> current,Func<object> capture,Func<object,bool> publish) {
        if(current==null||capture==null||publish==null)throw new ArgumentNullException();
        if(!System.Security.Principal.WindowsIdentity.GetCurrent().IsSystem||!current())throw new InvalidOperationException("Protected desktop unavailable");
        Secure=true;SecureGuard=current;ProtectedCapture=capture;ProtectedPublish=publish;SecureAttentionAllowed=false;
        try{Run(0,true,false,false,null);}
        finally{Secure=false;SecureGuard=null;ProtectedCapture=null;ProtectedPublish=null;SecureAttentionAllowed=true;}
    }
    static bool AllowedDesktop() { if(VirtualAlive!=null&&!VirtualAlive())return false;if(MemoryDesktop!=null)return MemoryDesktop();return Secure ? SecureGuard!=null && SecureGuard() : DefaultDesktop(); }
    public static void RunSecure(Func<int> lockState,Func<bool> secureGuard) {
        if(!System.Security.Principal.WindowsIdentity.GetCurrent().IsSystem || !secureGuard())throw new InvalidOperationException("Secure desktop unavailable");
        SecureLockState=lockState;SecureGuard=secureGuard;Secure=true;
        try { Run(0,true,false,false,null); }
        finally { if(SecureLockState()!=0 && SecureLockState()==1)Output(new {type="session_unlocked"}); }
    }
    public static void DismissLockScreen(Func<bool> guard) {
        // Human-requested fixed Enter only. PIN/text input belongs to Winlogon.
        if(System.Security.Principal.WindowsIdentity.GetCurrent().IsSystem||!guard())throw new InvalidOperationException("Lock screen unavailable");
        var down=new INPUT();down.type=1;down.data.key.vk=13;
        var up=down;up.data.key.flags=2;
        if(SendInput(2,new[]{down,up},Marshal.SizeOf(typeof(INPUT)))!=2)throw new InvalidOperationException("Lock screen input denied");
    }
    static bool DefaultDesktop() {
        IntPtr h=OpenInputDesktop(0,false,1);
        if(h==IntPtr.Zero) return false;
        try { uint needed; var name=new StringBuilder(256); return GetUserObjectInformation(h,2,name,512,out needed) && name.ToString()=="Default"; }
        finally { CloseDesktop(h); }
    }
    static void Emit(INPUT value) { if(Secure && !AllowedDesktop())throw new InvalidOperationException("Secure desktop ended");if(MemoryInput!=null){MemoryInput(value);return;}if(SendInput(1,new INPUT[]{value},Marshal.SizeOf(typeof(INPUT)))!=1) throw new InvalidOperationException("Input denied"); }
    static INPUT KeyInput(ushort token,bool down) {
        ushort vk=(ushort)(token&255);
        bool extended=(token&0x100)!=0 || vk>=33&&vk<=46 || vk==111 || vk==144 || vk==163 || vk==165 || vk>=91&&vk<=93 || vk>=166&&vk<=183;
        var v=new INPUT();v.type=1;v.data.key.vk=vk;v.data.key.flags=(down?0u:2u)|(extended?1u:0u);return v;
    }
    static void Key(ushort token,bool down){Emit(KeyInput(token,down));}
    static INPUT ButtonInput(int button,bool down) {
        if(button<0||button>4)throw new InvalidOperationException("Unsupported button");
        var v=new INPUT();v.type=0;
        v.data.mouse.dwFlags=button==0?(down?2u:4u):button==1?(down?32u:64u):button==2?(down?8u:16u):(down?128u:256u);
        v.data.mouse.mouseData=button>=3?(uint)(button-2):0u;
        return v;
    }
    static void ApplyKey(HashSet<ushort> held,ushort key,bool down,Action<ushort,bool> emit) {
        if(down){held.Add(key);emit(key,true);}else if(held.Remove(key))emit(key,false);
    }
    static void Mouse(uint flags,uint data,int x,int y) { var v=new INPUT();v.type=0;v.data.mouse.dx=x;v.data.mouse.dy=y;v.data.mouse.dwFlags=flags;v.data.mouse.mouseData=data;Emit(v); }
    static ushort VirtualKey(string code) {
        if(code.Length==4 && code.StartsWith("Key") && code[3]>='A' && code[3]<='Z') return (ushort)code[3];
        if(code.Length==6 && code.StartsWith("Digit") && code[5]>='0' && code[5]<='9') return (ushort)code[5];
        int f; if(code.StartsWith("F") && Int32.TryParse(code.Substring(1),out f) && f>=1 && f<=24) return (ushort)(111+f);
        if(code.Length==7 && code.StartsWith("Numpad") && code[6]>='0' && code[6]<='9') return (ushort)(96+code[6]-'0');
        var map=new Dictionary<string,ushort> { {"Enter",13},{"Escape",27},{"Tab",9},{"Space",32},{"Backspace",8},{"Delete",46},{"Insert",45},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34},{"ArrowLeft",37},{"ArrowUp",38},{"ArrowRight",39},{"ArrowDown",40},{"ShiftLeft",160},{"ShiftRight",161},{"ControlLeft",162},{"ControlRight",163},{"AltLeft",164},{"AltRight",165},{"MetaLeft",91},{"MetaRight",92},{"CapsLock",20},{"ImeOn",0x16},{"ImeOff",0x1A},{"Minus",189},{"Equal",187},{"BracketLeft",219},{"BracketRight",221},{"Backslash",220},{"Semicolon",186},{"Quote",222},{"Backquote",192},{"Comma",188},{"Period",190},{"Slash",191},{"NumpadEnter",13},{"NumpadMultiply",106},{"NumpadAdd",107},{"NumpadComma",108},{"NumpadSubtract",109},{"NumpadDecimal",110},{"NumpadDivide",111},{"NumpadEqual",146},{"NumLock",144},{"ScrollLock",145},{"Pause",19},{"PrintScreen",44},{"ContextMenu",93},{"Convert",28},{"NonConvert",29},{"KanaMode",21},{"IntlBackslash",226},{"IntlRo",226},{"IntlYen",220},{"Lang3",241},{"Lang4",242},{"Lang5",25},{"ZenkakuHankaku",25},{"AudioVolumeMute",173},{"AudioVolumeDown",174},{"AudioVolumeUp",175},{"VolumeMute",173},{"VolumeDown",174},{"VolumeUp",175},{"MediaTrackNext",176},{"MediaTrackPrevious",177},{"MediaStop",178},{"MediaPlayPause",179},{"LaunchMail",180},{"MediaSelect",181},{"LaunchApp1",182},{"LaunchApp2",183},{"BrowserBack",166},{"BrowserForward",167},{"BrowserRefresh",168},{"BrowserStop",169},{"BrowserSearch",170},{"BrowserFavorites",171},{"BrowserHome",172} };
        ushort result; if(!map.TryGetValue(code,out result)) throw new InvalidOperationException("Unsupported key");return result;
    }
    static void StopAudio(ref IDisposable audio) {
        var owned=audio;audio=null;if(owned==null)return;
        try{owned.Dispose();}catch{Release();Environment.Exit(1);}
    }
    static void Release() {
        lock(Gate) {
            Control=false;
            if(Secure && !AllowedDesktop()){Keys.Clear();Buttons.Clear();return;}
            foreach(ushort key in Keys) { try { Key(key,false); } catch {} } Keys.Clear();
            foreach(int button in Buttons) { try { Emit(ButtonInput(button,false)); } catch {} } Buttons.Clear();
        }
    }
    static bool Apply(Dictionary<string,object> input) {
        lock(Gate) {
            if(!Control || Stopping || Clock.ElapsedMilliseconds-Interlocked.Read(ref LastHeartbeat)>6000 || !AllowedDesktop()) { Release();return false; }
            SodaDesktopMonitorLayout.Item[] currentMonitors=null;
            if(CaptureDevice!=null&&!SourceMatches(CaptureDevice,out currentMonitors)){Stopping=true;Release();return false;}
            string kind=(string)input["kind"];
            if(kind=="key") {
                string code=(string)input["code"];ushort key=VirtualKey(code);bool down=(bool)input["down"];
                if(code=="NumpadEnter")key|=0x100;
                ApplyKey(Keys,key,down,Key);
            } else if(kind=="text") {
                string text=(string)input["text"]; if(text.Length<1 || text.Length>1024) throw new InvalidOperationException();
                foreach(char c in text) { var a=new INPUT();a.type=1;a.data.key.scan=c;a.data.key.flags=4;Emit(a);a.data.key.flags=6;Emit(a); }
            } else if(kind=="wheel") {
                int delta=Num(input,"delta");if(Math.Abs(delta)>1200)throw new InvalidOperationException();Mouse(0x800,unchecked((uint)delta),0,0);
            } else if(kind=="pointer") {
                double x=Convert.ToDouble(input["x"]),y=Convert.ToDouble(input["y"]);
                if(Double.IsNaN(x)||Double.IsNaN(y)||x<0||x>1||y<0||y>1)throw new InvalidOperationException();
                if(ActiveMonitors!=null&&!ActiveMonitors.Contains(x,y)){int released=Num(input,"button");if(released<0||released>4)throw new InvalidOperationException();if((string)input["event"]=="up"&&Buttons.Remove(released))Emit(ButtonInput(released,false));return true;}
                // Read the same native pixel coordinate space used by capture.
                // WinForms virtual bounds can be DPI-virtualized by the host.
                var monitors=currentMonitors??MonitorDriver.Read();if(monitors.Length<1)throw new InvalidOperationException("Monitor not found");Rectangle all=monitors[0].Bounds;foreach(var monitor in monitors)all=Rectangle.Union(all,monitor.Bounds);
                Point absolute=SodaDesktopDisplay.AbsolutePointer(Bounds,all,x,y);
                Mouse(0x8000|0x4000|1,0,absolute.X,absolute.Y);
                int button=Num(input,"button");if(button<0||button>4)throw new InvalidOperationException();
                string action=(string)input["event"];
                if(action=="down" && Buttons.Add(button)) Emit(ButtonInput(button,true));
                else if(action=="up" && Buttons.Remove(button)) Emit(ButtonInput(button,false));
            } else throw new InvalidOperationException();
            return true;
        }
    }
    sealed class MemoryMonitors:SodaDesktopMonitorLayout.IDriver {public SodaDesktopMonitorLayout.Item[] Items;public int Reads;public SodaDesktopMonitorLayout.Item[] Read(){Reads++;return Items;}}
    // A fresh validation process only. Every desktop, topology, emit and output
    // endpoint is memory-backed before any production input code is called.
    public static void VerifyQueuedMonitorInput(){
        if(Control||CaptureDevice!=null||ActiveMonitors!=null||MemoryInput!=null||MemoryDesktop!=null||MemoryOutput!=null||Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Fresh validation process required");
        Rectangle oldBounds=Bounds;bool oldStopping=Stopping;long oldHeartbeat=LastHeartbeat;var oldDriver=MonitorDriver;int oldNotice=MonitorNotice;
        var sent=new List<INPUT>();int notices=0;var fake=new MemoryMonitors{Items=new[]{new SodaDesktopMonitorLayout.Item("a",new Rectangle(0,0,800,600),true,100)}};
        MemoryInput=sent.Add;MemoryDesktop=()=>true;MemoryOutput=value=>{notices++;};MonitorDriver=fake;ActiveMonitors=new SodaDesktopMonitorLayout(fake,"a");CaptureDevice="a";Bounds=ActiveMonitors.Bounds;Control=true;Stopping=false;MonitorNotice=0;LastHeartbeat=Clock.ElapsedMilliseconds;
        try{
            var queue=new SodaDesktopCommandQueue<string>(8,v=>false,v=>{});queue.Submit("keyA");queue.Submit("pointer");queue.Submit("clipboard-wait-completes-after-topology-change");queue.Submit("keyB");
            while(queue.ProcessOne(value=>{if(value=="clipboard-wait-completes-after-topology-change")fake.Items=new[]{new SodaDesktopMonitorLayout.Item("a",new Rectangle(0,0,1024,768),true,100)};else if(value=="pointer")Apply(new Dictionary<string,object>{{"kind","pointer"},{"x",0.5},{"y",0.5},{"event","move"},{"button",0}});else Apply(new Dictionary<string,object>{{"kind","key"},{"code",value=="keyA"?"KeyA":"KeyB"},{"down",true}});})){}
            if(!Stopping||Control||Keys.Count!=0||sent.Count!=3||sent[0].data.key.vk!=65||(sent[0].data.key.flags&2)!=0||sent[1].type!=0||sent[2].data.key.vk!=65||(sent[2].data.key.flags&2)==0||notices!=1||fake.Reads!=4)throw new InvalidOperationException("Queued input after topology change was not rejected and released");
        }finally{Release();MemoryInput=null;MemoryDesktop=null;MemoryOutput=null;ActiveMonitors=null;CaptureDevice=null;MonitorDriver=oldDriver;Bounds=oldBounds;Stopping=oldStopping;LastHeartbeat=oldHeartbeat;MonitorNotice=oldNotice;}
    }
    // Compare exact scaled pixels, then merge adjacent 64px tiles into rectangles.
    static byte[] Levels(int bits) {
        int levels=(1<<bits)-1;var table=new byte[256];
        for(int i=0;i<256;i++)table[i]=(byte)(((i*levels+127)/255*255+levels/2)/levels);
        return table;
    }
    static readonly byte[] Q2=Levels(2),Q3=Levels(3),Q5=Levels(5),Q6=Levels(6);
    // Reduced palette remains a standard 24bpp JPEG/PNG, not a packed RGB565/RGB332 wire format.
    static void ReduceColors(byte[] bytes,string mode) {
        if(mode=="full")return;
        for(int i=0;i<bytes.Length;i+=3) {
            if(mode=="gray16") {
                int luminance=(29*bytes[i]+150*bytes[i+1]+77*bytes[i+2]+128)>>8;
                byte gray=(byte)(((luminance+8)/17)*17);bytes[i]=bytes[i+1]=bytes[i+2]=gray;
            } else if(mode=="rgb565") {bytes[i]=Q5[bytes[i]];bytes[i+1]=Q6[bytes[i+1]];bytes[i+2]=Q5[bytes[i+2]];}
            else if(mode=="rgb332") {bytes[i]=Q2[bytes[i]];bytes[i+1]=Q3[bytes[i+1]];bytes[i+2]=Q3[bytes[i+2]];}
            else throw new InvalidOperationException("Invalid color mode");
        }
    }
    static void ReadPixels(Bitmap bitmap,byte[] bytes,string mode) {
        var data=bitmap.LockBits(new Rectangle(0,0,bitmap.Width,bitmap.Height),mode=="full"?ImageLockMode.ReadOnly:ImageLockMode.ReadWrite,PixelFormat.Format24bppRgb);
        try {
            int row=bitmap.Width*3;for(int y=0;y<bitmap.Height;y++)Marshal.Copy(IntPtr.Add(data.Scan0,y*data.Stride),bytes,y*row,row);
            ReduceColors(bytes,mode);
            if(mode!="full")for(int y=0;y<bitmap.Height;y++)Marshal.Copy(bytes,y*row,IntPtr.Add(data.Scan0,y*data.Stride),row);
        } finally { bitmap.UnlockBits(data); }
    }
    static List<Rectangle> DirtyTiles(byte[] current,byte[] previous,int width,int height,bool initialized) {
        var rects=new List<Rectangle>();
        if(!initialized){rects.Add(new Rectangle(0,0,width,height));return rects;}
        for(int y=0;y<height;y+=64) {
            int run=-1;
            for(int x=0;x<=width;x+=64) {
                bool dirty=false;int tw=Math.Min(64,width-x),th=Math.Min(64,height-y);
                if(x<width)for(int yy=y;yy<y+th&&!dirty;yy++)for(int i=(yy*width+x)*3,end=i+tw*3;i<end;i++)if(current[i]!=previous[i]){dirty=true;break;}
                if(dirty && run<0)run=x;
                if(run>=0 && (!dirty || x+64>=width)) {
                    int end=dirty?width:x;var r=new Rectangle(run,y,end-run,th);bool merged=false;
                    for(int i=rects.Count-1;i>=0;i--)if(rects[i].X==r.X && rects[i].Width==r.Width && rects[i].Bottom==y){var old=rects[i];rects[i]=new Rectangle(old.X,old.Y,old.Width,old.Height+th);merged=true;break;}
                    if(!merged)rects.Add(r);run=-1;
                }
            }
        }
        return rects;
    }
    static string ReadBoundedLine() {
        var line=new StringBuilder();
        while(true) {
            int c=Console.In.Read();
            if(c<0)return line.Length==0?null:line.ToString();
            if(c=='\n')return line.ToString().TrimEnd('\r');
            if(line.Length>=65536)throw new InvalidOperationException("Input line limit");
            line.Append((char)c);
        }
    }
    sealed class PreparedFrame {
        public Dictionary<string,object> info;
        public byte[] image;
        public long started;
        public bool full;
        public string contentId;
        public object scopeTicket;
    }
    static bool AdmitPrepared(PreparedFrame frame){
        if(!AllowedDesktop()||!PublishScope(frame.scopeTicket)){Stopping=true;return false;}return true;
    }
    static Action MemoryPreparedWait;
    static bool PublishPrepared(PreparedFrame frame){
        var payload=new {type="frame",info=frame.info,data=Convert.ToBase64String(frame.image)};
        if(MemoryPreparedWait!=null)MemoryPreparedWait();
        lock(OutputGate){
            string wire=MemoryOutput==null?OutputJson.Serialize(payload):null;
            // Check after waiting for stdout and after JSON/base64 preparation.
            if(!AdmitPrepared(frame))return false;
            if(MemoryOutput!=null)MemoryOutput(payload);
            else{Console.Out.WriteLine(wire);Console.Out.Flush();}
            return true;
        }
    }
    public static void VerifyProtectedQueuedOutput(Func<bool> current,Func<object> capture,Func<object,bool> publish,Action transition){
        if(Secure||MemoryInput!=null||MemoryOutput!=null||MemoryPreparedWait!=null)throw new InvalidOperationException("Fresh validation process required");
        bool oldStopping=Stopping;int frames=0;System.Threading.Tasks.Task<bool> waiting=null;
        Secure=true;SecureGuard=current;ProtectedCapture=capture;ProtectedPublish=publish;MemoryOutput=value=>frames++;Stopping=false;
        using(var reached=new ManualResetEventSlim(false))try{
            var frame=new PreparedFrame{scopeTicket=CaptureScope(),image=new byte[]{1,2,3},info=new Dictionary<string,object>{{"seq",1}}};
            MemoryPreparedWait=()=>reached.Set();
            lock(OutputGate){
                waiting=System.Threading.Tasks.Task.Run(()=>PublishPrepared(frame));
                if(!reached.Wait(1000))throw new Exception("Queued publication did not reach output gate");
                transition();
            }
            if(!waiting.Wait(1000)||waiting.Result||frames!=0||!Stopping)throw new Exception("Old frame published after output gate wait");
        }finally{
            if(waiting!=null&&!waiting.IsCompleted)waiting.Wait(2000);
            MemoryPreparedWait=null;MemoryOutput=null;Secure=false;SecureGuard=null;ProtectedCapture=null;ProtectedPublish=null;Stopping=oldStopping;
        }
        Console.WriteLine("protected_output_gate_passed: generated frame blocked after scope transition while stdout gate was held");
    }
    // The validator supplies generated scope facts and intercepts every input.
    public static void VerifyProtectedBoundaries(Func<bool> current,Func<object> capture,Func<object,bool> publish,Action transition){
        if(Secure||MemoryInput!=null||MemoryDesktop!=null||Keys.Count!=0||Buttons.Count!=0)throw new InvalidOperationException("Fresh validation process required");
        bool oldStopping=Stopping;var sent=new List<INPUT>();
        Secure=true;SecureGuard=current;ProtectedCapture=capture;ProtectedPublish=publish;MemoryInput=sent.Add;Stopping=false;
        try{
            var frame=new PreparedFrame{scopeTicket=CaptureScope()};
            if(!AdmitPrepared(frame))throw new Exception("Stable prepared frame rejected");
            Keys.Add(65);Key(65,true);Buttons.Add(0);Emit(ButtonInput(0,true));Release();
            if(sent.Count!=4||Keys.Count!=0||Buttons.Count!=0)throw new Exception("Stable protected release failed");
            Keys.Add(65);Key(65,true);Buttons.Add(0);Emit(ButtonInput(0,true));
            transition();
            if(AdmitPrepared(frame)||!Stopping)throw new Exception("Queued protected frame survived scope transition");
            Release();if(sent.Count!=6||Keys.Count!=0||Buttons.Count!=0)throw new Exception("Protected release reached new desktop");
            bool denied=false;try{Key(66,true);}catch(InvalidOperationException){denied=true;}
            if(!denied||sent.Count!=6)throw new Exception("Protected Emit bypassed scope guard");
        }finally{Keys.Clear();Buttons.Clear();Control=false;MemoryInput=null;Secure=false;SecureGuard=null;ProtectedCapture=null;ProtectedPublish=null;Stopping=oldStopping;}
        Console.WriteLine("protected_host_boundaries_passed: queued frame discarded; key/mouse release and direct input blocked after transition; generated facts/input only");
    }
    static object OpenVirtualOnNormalDesktop(Func<bool> normal,Func<object> open){if(!normal())throw new InvalidOperationException("Virtual display requires the normal input desktop");return open();}
    public static void VerifyVirtualDesktopGuard(){
        bool opened=false,rejected=false;try{OpenVirtualOnNormalDesktop(()=>false,()=>{opened=true;return new object();});}catch(InvalidOperationException){rejected=true;}
        if(!rejected||opened)throw new InvalidOperationException("Virtual device was opened before normal desktop guard");
        object expected=new object();if(!Object.ReferenceEquals(OpenVirtualOnNormalDesktop(()=>true,()=>expected),expected))throw new InvalidOperationException("Normal virtual creation path");
        Console.WriteLine("virtual_desktop_preflight_guard_passed: fake normal/secure guards; no native device or desktop APIs");
    }
    static SodaDesktopDisplay.Lease DisplayLease;
    static IDisposable VirtualLease;static Func<bool> VirtualAlive;static Func<string> VirtualFailure;static bool VirtualRequested;
    public static void Run(int monitorIndex,bool locallyAllowInput,bool locallyAllowClipboard=false,bool locallyAllowDisplayResize=false,string sourcePath=null,Func<int> lockState=null,bool locallyAllowMonitors=false,bool locallyAllowVirtualDisplay=false) {
        VirtualRequested=false;bool failureReported=false;
        try { RunCore(monitorIndex,locallyAllowInput,locallyAllowClipboard,locallyAllowDisplayResize,sourcePath,locallyAllowMonitors,locallyAllowVirtualDisplay); }
        catch(Exception error){if(VirtualRequested&&locallyAllowVirtualDisplay){try{var type=typeof(SodaDesktopHost).Assembly.GetType("SodaDesktopVirtualFailure");if(type!=null){Output(new {type="virtual_display_failure",code=(string)type.GetMethod("Of").Invoke(null,new object[]{error})});failureReported=true;}}catch{}}throw;}
        finally { if(DisplayLease!=null){try{DisplayLease.Dispose();}catch{Console.Error.WriteLine("Display restore failed; restore resolution locally in Windows Settings.");}DisplayLease=null;}
            if(VirtualLease!=null){try{try{if(!failureReported&&VirtualRequested&&VirtualAlive!=null&&!VirtualAlive())Output(new {type="virtual_display_failure",code=VirtualFailure!=null?VirtualFailure():"target_changed"});}catch{}Release();}finally{try{VirtualLease.Dispose();}finally{VirtualLease=null;VirtualAlive=null;VirtualFailure=null;}}}
            if(!Secure && lockState!=null && lockState()==0)Output(new {type="session_locked"});
        }
    }
    public static bool TryCreateNativeVideo(int width,int height,int fps,int bitrate,SodaDesktopDxgi capture,out SodaDesktopH264 encoder,out bool cpuOnly){return TryCreateNativeCodec(width,height,fps,bitrate,capture,"h264",out encoder,out cpuOnly);}
    public static bool TryCreateNativeCodec(int width,int height,int fps,int bitrate,SodaDesktopDxgi capture,string codec,out SodaDesktopH264 encoder,out bool cpuOnly){
        encoder=null;cpuOnly=false;
        try{cpuOnly=capture!=null&&!capture.ConfigureVideoOutput(width,height);encoder=SodaDesktopH264.CreateCodecForDesktop(width,height,fps,bitrate,cpuOnly?null:capture,codec);return true;}
        catch{if(encoder!=null)encoder.Dispose();encoder=null;return false;}
    }
    static void RunCore(int monitorIndex,bool locallyAllowInput,bool locallyAllowClipboard,bool locallyAllowDisplayResize,string sourcePath,bool locallyAllowMonitors,bool locallyAllowVirtualDisplay) {
        if(!Secure && !Environment.UserInteractive)throw new InvalidOperationException("Interactive Windows session required");
        ActiveMonitors=null;CaptureDevice=null;MonitorNotice=0;MonitorDriver=new SodaDesktopMonitorLayout.NativeDriver();SetProcessDPIAware();
        string first=ReadBoundedLine();if(first==null || first.Length>65536)return;
        var config=Obj(Json.DeserializeObject(first));if((string)config["type"]!="configure")throw new InvalidOperationException();
        var options=Obj(config["options"]);int maxWidth=Num(options,"width"),fps=Num(options,"fps"),quality=Num(options,"quality");
        if(maxWidth<320||maxWidth>1920||fps<1||fps>30||quality<20||quality>90)throw new InvalidOperationException();
        VirtualRequested=false;string virtualDevice=null;
        bool virtualRequested=options.ContainsKey("virtualDisplay")&&options["virtualDisplay"] is bool&&(bool)options["virtualDisplay"];
        VirtualRequested=virtualRequested;
        if(virtualRequested){
            if(Secure||!locallyAllowVirtualDisplay||!config.ContainsKey("allowVirtualDisplay")||!(config["allowVirtualDisplay"] is bool)||!(bool)config["allowVirtualDisplay"]||options.ContainsKey("monitorDevice"))throw new InvalidOperationException("Virtual display not permitted");
            var type=typeof(SodaDesktopHost).Assembly.GetType("SodaDesktopVirtualClient");if(type==null)throw new InvalidOperationException("Virtual display client unavailable");
            var client=OpenVirtualOnNormalDesktop(AllowedDesktop,()=>type.GetMethod("Open").Invoke(null,new object[]{SodaDesktopUnlock.InstalledExecutable()}));VirtualLease=(IDisposable)client;
            var failed=type.GetProperty("FailureCode");VirtualFailure=()=>failed!=null?(failed.GetValue(client,null) as string??"target_changed"):"target_changed";
            var alive=type.GetProperty("Alive");VirtualAlive=()=>Convert.ToBoolean(alive.GetValue(client,null));virtualDevice=(string)type.GetProperty("DeviceName").GetValue(client,null);
        }
        var screens=Screen.AllScreens;
        if(screens.Length<1)throw new InvalidOperationException("Monitor not found");
        if(virtualDevice!=null){monitorIndex=Array.FindIndex(screens,item=>String.Equals(item.DeviceName,virtualDevice,StringComparison.OrdinalIgnoreCase));if(monitorIndex<0)throw new InvalidOperationException("Owned virtual monitor unavailable");ActiveMonitors=new SodaDesktopMonitorLayout(new SodaDesktopMonitorLayout.NativeDriver(),virtualDevice);}
        bool defaultExists=monitorIndex>=0&&monitorIndex<screens.Length;string sourceDevice=screens[defaultExists?monitorIndex:0].DeviceName;
        bool monitorCeiling=!Secure&&locallyAllowMonitors&&config.ContainsKey("allowMonitors")&&(bool)config["allowMonitors"]&&options.ContainsKey("monitors")&&(bool)options["monitors"];
        if(!defaultExists&&!(monitorCeiling&&options.ContainsKey("monitorDevice")))throw new InvalidOperationException("Monitor not found");
        if(monitorCeiling){string selected=options.ContainsKey("monitorDevice")?(string)options["monitorDevice"]:sourceDevice;if(selected=="all"){foreach(var item in new SodaDesktopMonitorLayout.NativeDriver().Read())SodaDesktopDisplay.WaitForPrevious(item.Id);}else SodaDesktopDisplay.WaitForPrevious(selected);ActiveMonitors=new SodaDesktopMonitorLayout(new SodaDesktopMonitorLayout.NativeDriver(),selected);if(selected!="all")sourceDevice=selected;else if(ActiveMonitors.Items.Length==1)sourceDevice=ActiveMonitors.Items[0].Id;}
        else{if(!Secure&&options.ContainsKey("monitorDevice"))throw new InvalidOperationException("Monitor selection not permitted");if(!Secure)SodaDesktopDisplay.WaitForPrevious(sourceDevice);}
        Bounds=ActiveMonitors!=null?ActiveMonitors.Bounds:SodaDesktopDisplay.RectangleOf(new SodaDesktopDisplay.NativeDriver(null).Current(sourceDevice));
        if(!AllowedDesktop() || Bounds.Width<1 || Bounds.Height<1 || (long)Bounds.Width*Bounds.Height>40000000)throw new InvalidOperationException("Desktop unavailable");
        string sourceTitle=ActiveMonitors!=null&&ActiveMonitors.Selected=="all"?"All monitors":sourceDevice;
        int maxFps=fps,maxQuality=quality;
        bool clipboardCeiling=!Secure && locallyAllowClipboard && config.ContainsKey("allowClipboard") && (bool)config["allowClipboard"];
        bool clipboardAllowed=false;long clipboardGeneration=0;
        bool allow=locallyAllowInput && (bool)config["allowInput"];
        bool deltas=options.ContainsKey("deltas") && (bool)options["deltas"];
        string colorMode="full";bool showCursor=true;
        if(options.ContainsKey("image")){var image=Obj(options["image"]);colorMode=(string)image["colorMode"];showCursor=(bool)image["showCursor"];}
        if(colorMode!="full"&&colorMode!="rgb565"&&colorMode!="rgb332"&&colorMode!="gray16")throw new InvalidOperationException("Invalid color mode");
        bool displayCeiling=!Secure && (ActiveMonitors!=null?ActiveMonitors.Items.Length:screens.Length)==1 && locallyAllowDisplayResize && config.ContainsKey("allowDisplayResize") && (bool)config["allowDisplayResize"];
        var displayModes=displayCeiling?new SodaDesktopDisplay.NativeDriver(sourcePath).Modes(sourceDevice):new List<SodaDesktopDisplay.Mode>();
        if(!Secure && options.ContainsKey("display")) {
            if(!displayCeiling)throw new InvalidOperationException("Display resize not permitted");
            var requested=Obj(options["display"]);
            DisplayLease=new SodaDesktopDisplay.Lease(new SodaDesktopDisplay.NativeDriver(sourcePath),sourceDevice,Num(requested,"width"),Num(requested,"height"));
            Bounds=DisplayLease.Bounds;maxWidth=Bounds.Width;if(ActiveMonitors!=null)ActiveMonitors=new SodaDesktopMonitorLayout(new SodaDesktopMonitorLayout.NativeDriver(),ActiveMonitors.Selected);
        }
        CaptureDevice=sourceDevice;
        int w=Math.Min(Bounds.Width,maxWidth),h=(int)Math.Round(Bounds.Height*(double)w/Bounds.Width);
        if(h>2400){w=(int)Math.Round(w*2400.0/h);h=2400;}
        if((long)w*h>8000000)throw new InvalidOperationException();
        Interlocked.Exchange(ref LastHeartbeat,Clock.ElapsedMilliseconds);
        Form form=null;
        if(!Secure) { form=new Form { Text="Sodashitsu - desktop sharing", Width=380, Height=110, TopMost=true, StartPosition=FormStartPosition.CenterScreen };
        var stop=new Button { Text="Stop sharing", Dock=DockStyle.Fill };
        stop.Click+=(sender,e)=>{Stopping=true;Release();};form.FormClosed+=(sender,e)=>{Stopping=true;Release();};form.Controls.Add(stop);form.Show(); }
        var watchdog=new System.Threading.Timer((state)=>{
            if(Clock.ElapsedMilliseconds-Interlocked.Read(ref LastHeartbeat)>8000) { Stopping=true;Release();Environment.Exit(0); }
            else if(!AllowedDesktop()){Stopping=true;Release();}
        },null,500,500);
        SodaDesktopDxgi dxgi=null;
        SodaDesktopCursor cursorPump=null;
        bool separateCursor=!Secure&&showCursor&&config.ContainsKey("separateCursor")&&config["separateCursor"] is bool&&(bool)config["separateCursor"];
        SodaDesktopH264 video=null;string videoId=null;IDisposable audio=null;string audioId=null;
        IDisposable richClipboardWorker=null;System.Reflection.MethodInfo richSubmit=null;Type richType=typeof(SodaDesktopHost).Assembly.GetType("SodaDesktopRichClipboard");
        bool richCeiling=clipboardCeiling&&richType!=null&&config.ContainsKey("richClipboard")&&config["richClipboard"] is bool&&(bool)config["richClipboard"];
        SodaDesktopVideoRate videoRate=null;SodaDesktopVideoProfile videoProfile=null;
        int videoGeneration=1,videoWidth=w,videoHeight=h;bool videoCpuOnly=false;
        string videoCodec="h264",videoCodecFallback=null;
        Bitmap videoBitmap=null;Graphics videoResize=null;
        long videoSeq=0;double videoNext=0;int videoFps=maxFps,videoBitrate=2500;var videoWindow=new SodaDesktopVideoWindow(1);byte[] videoNv12=null;
        InputAckPipe=!Secure&&config.ContainsKey("inputAckPipe")&&config["inputAckPipe"] is bool&&(bool)config["inputAckPipe"];
        bool nativeCeiling=!Secure && config.ContainsKey("allowNativeVideo") && config["allowNativeVideo"] is bool && (bool)config["allowNativeVideo"];
        Type audioType=typeof(SodaDesktopHost).Assembly.GetType("SodaDesktopAudio");
        bool audioCeiling=nativeCeiling&&audioType!=null&&config.ContainsKey("allowSystemAudio")&&config["allowSystemAudio"] is bool&&(bool)config["allowSystemAudio"];
        int audioPid=audioCeiling&&config.ContainsKey("audioClientPid")?Num(config,"audioClientPid"):0;if(audioPid<=0)audioCeiling=false;
        bool nativeCodecs=nativeCeiling&&config.ContainsKey("nativeCodecs")&&config["nativeCodecs"] is bool&&(bool)config["nativeCodecs"];
        var codecCandidates=new List<string>();
        if(nativeCodecs){try{var probe=typeof(SodaDesktopHost).Assembly.GetType("SodaDesktopCodecProbe");if(probe==null)nativeCodecs=false;else foreach(var candidate in (Array)probe.GetMethod("Read").Invoke(null,null)){var type=candidate.GetType();if(Convert.ToUInt32(type.GetField("count").GetValue(candidate))>0)codecCandidates.Add((string)type.GetField("codec").GetValue(candidate));}}catch{nativeCodecs=false;}}
        bool nativeDatagrams=nativeCeiling&&config.ContainsKey("nativeDatagrams")&&config["nativeDatagrams"] is bool&&(bool)config["nativeDatagrams"];
        bool nativeAdaptive=nativeCeiling&&config.ContainsKey("nativeAdaptive")&&config["nativeAdaptive"] is bool&&(bool)config["nativeAdaptive"];
        bool nativeCadence=nativeCeiling&&config.ContainsKey("nativeCadence")&&config["nativeCadence"] is bool&&(bool)config["nativeCadence"];
        int nativeRateCeiling=nativeCeiling&&config.ContainsKey("nativeMaxFps")&&Num(config,"nativeMaxFps")==60?60:maxFps;
        DeferNativeSnapshots=nativeCeiling&&config.ContainsKey("deferNativeSnapshots")&&config["deferNativeSnapshots"] is bool&&(bool)config["deferNativeSnapshots"];
        bool nativePipeline=nativeCeiling && config.ContainsKey("nativeVideoWindow") && Num(config,"nativeVideoWindow")==3;
        // Only new providers opt in. Old providers/helpers keep their existing wire contract.
        if(!Secure && Environment.GetEnvironmentVariable("SODA_DESKTOP_CAPTURE")!="gdi" && config.ContainsKey("captureBackends")) {
            var backends=config["captureBackends"] as object[];
            if((ActiveMonitors==null||ActiveMonitors.Selected!="all"||ActiveMonitors.Items.Length==1)&&backends!=null && Array.IndexOf(backends,"dxgi")>=0)dxgi=SodaDesktopDxgi.TryCreate(sourceDevice,Bounds,w,h);
        }
        try {
            var ready=new Dictionary<string,object>{{"type","ready"},{"title",Environment.MachineName+" / "+Environment.UserName+" / "+sourceTitle},{"allowInput",allow},{"width",Bounds.Width},{"height",Bounds.Height},{"backend",dxgi!=null?"windows-dxgi":"windows-gdi"},{"image",new {colorMode,showCursor}},{"allowClipboard",clipboardCeiling},{"dynamicQuality",true}};
            if(options.ContainsKey("imeKeys") && options["imeKeys"] is bool && (bool)options["imeKeys"])ready["imeKeys"]=true;
            if(options.ContainsKey("extendedInput") && options["extendedInput"] is bool && (bool)options["extendedInput"])ready["extendedInput"]=true;
            if(separateCursor)ready["cursor"]=true;
            if(VirtualLease!=null)ready["virtualDisplay"]=true;
            if(InputAckPipe)ready["inputAckPipe"]=true;
            if(richCeiling)ready["richClipboard"]=true;
            if(audioCeiling)ready["nativeAudio"]=true;
            if(nativeCeiling)ready["nativeVideo"]=true;if(nativeDatagrams)ready["nativeDatagrams"]=true;
            if(nativeCodecs){ready["nativeCodecs"]=true;ready["nativeCodecCandidates"]=codecCandidates.ToArray();}
            if(nativeAdaptive)ready["nativeAdaptive"]=true;
            if(nativeCadence)ready["nativeCadence"]=true;
            if(nativeCeiling&&nativeRateCeiling==60)ready["nativeMaxFps"]=60;
            if(DeferNativeSnapshots)ready["deferNativeSnapshots"]=true;
            if(nativePipeline)ready["nativeVideoWindow"]=3;
            if(Secure)ready["secureDesktop"]=true;
            if(displayModes.Count>0)ready["display"]=new {modes=displayModes.ConvertAll(m=>new {width=m.Width,height=m.Height})};
            if(ActiveMonitors!=null)ready["monitorLayout"]=ActiveMonitors.Message();
            Output(ready);
            if(separateCursor)cursorPump=new SodaDesktopCursor(()=>dxgi,Bounds,showCursor,()=>!Stopping&&AllowedDesktop(),OutputGate,Output);
            var jpeg=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");
            using(var args=new EncoderParameters(1))
            using(var scaled=new Bitmap(w,h,PixelFormat.Format24bppRgb))
            using(var resize=Graphics.FromImage(scaled)) {
                args.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,(long)quality);
                resize.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;
                // Console.In.ReadLineAsync is synchronous on .NET Framework's SyncTextReader.
                // Keep all stdin waits off the capture/UI loop and bound the queued commands.
                long sequence=0,pending=0,inputSeq=0,lastFull=-30000,lastReport=-1000,inputRevision=0,preparedRevision=0;
                var commands=new SodaDesktopCommandQueue<Dictionary<string,object>>(64,
                    msg=>(string)msg["type"]=="input",
                    msg=>{
                        if(Stopping)return;
                        ApplyInput(msg,ref inputSeq,()=>Interlocked.Increment(ref inputRevision));
                    },msg=>{string type=(string)msg["type"];return type=="ack"||type=="native_video_ack"||type=="heartbeat";});
                Action beforeCaptureDispose=()=>{
                    if(video!=null&&video.GpuInput){commands.EnableFast(false);video.Dispose();video=null;Output(new {type="native_video_stopped",id=videoId});videoId=null;videoWindow=new SodaDesktopVideoWindow(1);}
                };
                var reader=new Thread(()=>{
                    var parser=new JavaScriptSerializer {MaxJsonLength=65536};
                    try { while(!Stopping) { string data=ReadBoundedLine();if(data==null || !commands.Submit(Obj(parser.DeserializeObject(data)))){Stopping=true;break;} } }
                    catch { Stopping=true; }
                    finally { Release(); }
                });
                reader.IsBackground=true;reader.Start();
                var preparation=new SodaDesktopFramePreparation<PreparedFrame>(!Secure);
                bool forceFull=true,initialized=false;string contentId=null;
                byte[] current=deltas || colorMode!="full"?new byte[w*h*3]:null,previous=deltas?new byte[w*h*3]:null;
                using(var sha=SHA256.Create()) {
                while(!Stopping) {
                    if(!Secure)Application.DoEvents();
                    if(!AllowedDesktop() || !SourceMatches(sourceDevice))break;
                    int handled=0;
                    while(!Stopping && handled++<64 && commands.ProcessOne(msg=> {
                        string type=(string)msg["type"];
                        if(type=="heartbeat")Interlocked.Exchange(ref LastHeartbeat,Clock.ElapsedMilliseconds);
                        else if(type=="sas" && Secure && SecureAttentionAllowed && Control && AllowedDesktop()) { Output(new {type="sas_request"}); }
                        else if(type=="clipboard_rich") {
                            try{
                                if(!richCeiling)throw new InvalidOperationException("Rich clipboard not permitted");
                                if(richClipboardWorker==null){
                                    richClipboardWorker=(IDisposable)Activator.CreateInstance(richType,new object[]{(Action<object>)Output,(Func<bool>)(()=>clipboardAllowed&&!Stopping&&AllowedDesktop()&&Clock.ElapsedMilliseconds-Interlocked.Read(ref LastHeartbeat)<6000),(Func<long>)(()=>Interlocked.Read(ref clipboardGeneration)),(Func<long>)(()=>DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()),(Func<bool>)(()=>allow&&!Stopping)});
                                    richSubmit=richType.GetMethod("Submit",new Type[]{typeof(object)});
                                }
                                richSubmit.Invoke(richClipboardWorker,new object[]{msg});
                            }catch{string richId=msg.ContainsKey("id")?msg["id"]as string:null;Guid parsedRich;if(richId!=null&&Guid.TryParse(richId,out parsedRich))Output(new{type="clipboard_rich_result",id=richId,ok=false,stage="done"});}
                        }
                        else if(type=="native_audio") {
                            string requested=(string)msg["id"];Guid audioGuid;if(!Guid.TryParse(requested,out audioGuid))throw new InvalidOperationException("Audio id");
                            if((bool)msg["enabled"]){
                                if(!audioCeiling)throw new InvalidOperationException("System audio not permitted");
                                StopAudio(ref audio);audioId=null;
                                if(video!=null&&videoId==requested)try{audio=(IDisposable)Activator.CreateInstance(audioType,new object[]{(string)msg["pipeName"],audioPid,(Func<bool>)(()=>!Stopping&&AllowedDesktop()),(Func<long>)(()=>Clock.ElapsedMilliseconds*1000)});audioId=requested;}catch{audio=null;}
                            }else if(audioId==requested){StopAudio(ref audio);audioId=null;}
                        }
                        else if(type=="native_video") {
                            string requested=(string)msg["id"];Guid parsed;if(!Guid.TryParse(requested,out parsed))throw new InvalidOperationException("Video id");
                            if((bool)msg["enabled"]) {
                                StopAudio(ref audio);audioId=null;
                                if(!nativeCeiling)throw new InvalidOperationException("Native video not permitted");
                                commands.EnableFast(false);if(video!=null){video.Dispose();video=null;}videoId=requested;videoCodec=nativeCodecs&&msg.ContainsKey("codec")?(string)msg["codec"]:"h264";videoCodecFallback=null;videoProfile=null;videoGeneration=1;videoWidth=w;videoHeight=h;videoCpuOnly=false;videoNv12=null;if(videoResize!=null)videoResize.Dispose();videoResize=null;if(videoBitmap!=null)videoBitmap.Dispose();videoBitmap=null;videoSeq=0;videoNext=0;videoWindow=new SodaDesktopVideoWindow(nativePipeline&&msg.ContainsKey("window")&&Num(msg,"window")==3?3:1);
                                try {videoFps=Num(msg,"fps");videoBitrate=Num(msg,"bitrateKbps");videoRate=new SodaDesktopVideoRate(videoFps,videoBitrate);if(videoFps>nativeRateCeiling)throw new InvalidOperationException("Video rate ceiling");if(!TryCreateNativeCodec(w,h,videoFps,videoBitrate,dxgi,videoCodec,out video,out videoCpuOnly)){if(videoCodec=="h264")throw new InvalidOperationException("Native video unavailable");videoCodec="h264";videoCodecFallback="unavailable";if(!TryCreateNativeVideo(w,h,videoFps,videoBitrate,dxgi,out video,out videoCpuOnly))throw new InvalidOperationException("Native fallback unavailable");}commands.EnableFast(true);}
                                catch {Output(new {type="native_video_stopped",id=videoId});videoId=null;}
                            } else if(videoId==requested) {StopAudio(ref audio);audioId=null;commands.EnableFast(false);if(video!=null)video.Dispose();video=null;videoId=null;videoWindow=new SodaDesktopVideoWindow(1);}
                        }
                        else if(type=="native_profile") {
                            if(!nativeAdaptive)throw new InvalidOperationException("Native adaptive not negotiated");
                            if(video!=null&&(string)msg["id"]==videoId){if(videoProfile!=null)throw new InvalidOperationException("Profile already pending");videoProfile=new SodaDesktopVideoProfile(Num(msg,"generation"),videoGeneration,Num(msg,"width"),Num(msg,"height"),w,h,Num(msg,"fps"),Num(msg,"bitrateKbps"),videoRate,Clock.ElapsedMilliseconds);}
                        }
                        else if(type=="native_profile_resume") {
                            if(!nativeAdaptive)throw new InvalidOperationException("Native adaptive not negotiated");
                            if(video!=null&&(string)msg["id"]==videoId&&videoProfile!=null)videoProfile.Resume(Num(msg,"generation"),Convert.ToInt64(msg["baseSeq"]));
                        }
                        else if(type=="native_rate") {
                            if(!nativeCadence)throw new InvalidOperationException("Native cadence not negotiated");
                            if(video!=null&&(string)msg["id"]==videoId&&videoProfile==null)try{int nextFps=Num(msg,"fps"),nextBitrate=Num(msg,"kbps");videoRate.Apply(nextFps,nextBitrate,video.SetBitrate);videoFps=videoRate.Fps;videoNext=Math.Min(videoNext,Clock.Elapsed.TotalMilliseconds+1000.0/videoFps);}catch{commands.EnableFast(false);video.Dispose();video=null;Output(new {type="native_video_stopped",id=videoId});videoId=null;}
                        }
                        else if(type=="native_keyframe"||type=="native_bitrate") {
                            if(!nativeDatagrams)throw new InvalidOperationException("Native datagrams not permitted");
                            if(video!=null&&(string)msg["id"]==videoId)try{if(type=="native_keyframe")video.ForceKeyFrame();else {int rate=Num(msg,"kbps");if(rate>videoBitrate)throw new InvalidOperationException("Video bitrate ceiling");video.SetBitrate(rate);}}catch{commands.EnableFast(false);video.Dispose();video=null;Output(new {type="native_video_stopped",id=videoId});videoId=null;}
                        }
                        else if(type=="native_video_ack") {
                            if(video!=null && (string)msg["id"]==videoId) {videoWindow.Ack(Convert.ToInt64(msg["seq"]));}
                        }
                        else if(type=="keyframe"){forceFull=true;preparation.Invalidate(true);}
                        else if(type=="policy") {
                            int rate=Num(msg,"fps"),q=Num(msg,"quality");if(rate<1||rate>maxFps||q<20||q>maxQuality)throw new InvalidOperationException("Policy limit");
                            fps=rate;quality=q;args.Param[0].Dispose();args.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,(long)q);preparation.Invalidate(true);
                        } else if(type=="clipboard_control") {clipboardAllowed=clipboardCeiling && (bool)msg["enabled"];clipboardGeneration=Convert.ToInt64(msg["generation"]);}
                        else if(type=="clipboard") {
                            long id=Convert.ToInt64(msg["id"]),expires=Convert.ToInt64(msg["expiresAt"]),utc=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                            bool ok=false;string text=null;
                            if(clipboardAllowed && Convert.ToInt64(msg["generation"])==clipboardGeneration && expires>=utc && expires<=utc+1500 && Clock.ElapsedMilliseconds-Interlocked.Read(ref LastHeartbeat)<6000 && DefaultDesktop()) {
                                try {
                                    string op=(string)msg["operation"];
                                    if(op=="read") {text=Clipboard.ContainsText(TextDataFormat.UnicodeText)?Clipboard.GetText(TextDataFormat.UnicodeText):"";ok=text.Length<=8192;if(!ok)text=null;}
                                    else if(op=="write" && allow) {text=(string)msg["text"];if(text.Length<=8192){if(text.Length==0)Clipboard.Clear();else Clipboard.SetText(text,TextDataFormat.UnicodeText);ok=true;}text=null;}
                                } catch {ok=false;text=null;}
                            }
                            if(text!=null)Output(new {type="clipboard_result",id,ok,text});else Output(new {type="clipboard_result",id,ok});
                        }
                        else if(type=="release") { preparation.Invalidate(false);lock(Gate){bool keep=Control;Release();Control=keep;} }
                        else if(type=="control") { preparation.Invalidate(false);Release();lock(Gate){Control=allow && (bool)msg["enabled"];} }
                        else if(type=="ack") { if(Convert.ToInt64(msg["seq"])!=pending)throw new InvalidOperationException();pending=0; }
                        else if(type=="input") {
                            if(ApplyInput(msg,ref inputSeq))preparation.Invalidate(false);
                        } else if(type=="stop") { Stopping=true;return; }
                        else throw new InvalidOperationException();
                    })) {}
                    if(form!=null)form.Text="Sodashitsu - "+(Control?"CONTROL":"VIEW ONLY")+" - "+sourceTitle;
                    long now=Clock.ElapsedMilliseconds;
                    if(videoProfile!=null&&video!=null&&videoProfile.Expired(now)){commands.EnableFast(false);video.Dispose();video=null;videoProfile=null;Output(new {type="native_video_stopped",id=videoId});videoId=null;}
                    if(videoProfile!=null&&video!=null&&!videoProfile.Configured&&videoWindow.Count==0){
                        try{
                            commands.EnableFast(false);video.Dispose();video=null;
                            videoWidth=videoProfile.Width;videoHeight=videoProfile.Height;
                            if(!videoCpuOnly&&dxgi!=null&&!dxgi.ConfigureVideoOutput(videoWidth,videoHeight))videoCpuOnly=true;
                            videoNv12=null;if(videoResize!=null)videoResize.Dispose();if(videoBitmap!=null)videoBitmap.Dispose();
                            videoBitmap=new Bitmap(videoWidth,videoHeight,PixelFormat.Format24bppRgb);videoResize=Graphics.FromImage(videoBitmap);videoResize.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.Bilinear;
                            video=SodaDesktopH264.CreateCodecForDesktop(videoWidth,videoHeight,videoRate.MaximumFps,videoProfile.Bitrate,videoCpuOnly?null:dxgi,videoCodec);
                            videoRate.Adopt(videoProfile.Fps,videoProfile.Bitrate);videoFps=videoRate.Fps;videoGeneration=videoProfile.Generation;videoProfile.Configured=true;videoNext=0;commands.EnableFast(true);
                        }catch{if(video!=null)video.Dispose();video=null;videoProfile=null;Output(new {type="native_video_stopped",id=videoId});videoId=null;}
                    }
                    if(video!=null && videoWindow.Count>0 && now-videoWindow.OldestAt>2500) {
                        commands.EnableFast(false);video.Dispose();video=null;Output(new {type="native_video_stopped",id=videoId});videoId=null;videoWindow=new SodaDesktopVideoWindow(1);
                    }
                    if(!Stopping && video!=null && videoWindow.CanSend && (videoProfile==null||(videoProfile.Configured&&(!videoProfile.Prepared||videoProfile.Resumed))) && Clock.Elapsed.TotalMilliseconds>=videoNext) {
                        try {
                            double videoStarted=Clock.Elapsed.TotalMilliseconds;
                            var captureTimer=Stopwatch.StartNew();double conversionMs=0;
                            Point cursor=Cursor.Position;bool cursorVisible=showCursor&&(cursorPump==null||!cursorPump.Active)&&Bounds.Contains(cursor);
                            int cursorX=(int)((cursor.X-Bounds.Left)*(double)videoWidth/Bounds.Width),cursorY=(int)((cursor.Y-Bounds.Top)*(double)videoHeight/Bounds.Height);
                            SodaDesktopH264.Packet packet=null;double videoCaptureMs;
                            bool held=videoProfile!=null&&videoProfile.Resumed;
                            if(held){packet=videoProfile.Take();videoCaptureMs=0;}
                            else if(video.GpuInput) {
                                using(var surface=dxgi.CaptureGpuFrame(cursorX,cursorY,cursorVisible,out conversionMs)) {
                                    videoCaptureMs=Math.Max(0,captureTimer.Elapsed.TotalMilliseconds-conversionMs);
                                    if(surface!=null)packet=video.EncodeGpuFrame(surface,Clock.ElapsedMilliseconds*1000,conversionMs);
                                }
                            } else {
                                if(videoNv12==null)videoNv12=new byte[checked(videoWidth*videoHeight*3/2)];
                                bool gpu=!video.FullChroma&&!videoCpuOnly&&dxgi!=null&&dxgi.TryCaptureNv12(videoNv12,cursorX,cursorY,cursorVisible,out conversionMs);
                                if(!gpu){CaptureFrame(resize,w,h,showCursor&&(cursorPump==null||!cursorPump.Active),ref dxgi,beforeCaptureDispose);if(videoBitmap!=null)videoResize.DrawImage(scaled,new Rectangle(0,0,videoWidth,videoHeight));}
                                videoCaptureMs=Math.Max(0,captureTimer.Elapsed.TotalMilliseconds-conversionMs);
                                packet=gpu?video.EncodePreparedNv12(videoNv12,Clock.ElapsedMilliseconds*1000,conversionMs):video.EncodeBitmap(videoBitmap??scaled,Clock.ElapsedMilliseconds*1000);
                            }
                            if(!AllowedDesktop())break;
                            videoNext=videoStarted+1000.0/videoFps;
                            if(packet!=null) {
                            if(videoProfile!=null&&!videoProfile.Resumed){videoProfile.Hold(packet,videoSeq);Output(new {type="native_profile_applied",id=videoId,generation=videoProfile.Generation,baseSeq=videoSeq,width=videoWidth,height=videoHeight,codec=packet.codec});continue;}
                            if(held)videoProfile=null;
                            if(videoSeq==0 && (!packet.key || packet.codec==null))throw new InvalidOperationException("Initial SPS/IDR required");
                            videoSeq++;videoWindow.Sent(videoSeq,Clock.ElapsedMilliseconds);videoNext=videoStarted+1000.0/videoFps;
                            var encoded=new Dictionary<string,object>{{"type","native_frame"},{"id",videoId},{"seq",videoSeq},{"timestamp",packet.timestamp},{"key",packet.key},{"width",videoWidth},{"height",videoHeight},{"data",Convert.ToBase64String(packet.data)}};
                            if(nativeCodecs){encoded["codecName"]=videoCodec;if(videoCodecFallback!=null)encoded["codecFallback"]=videoCodecFallback;}
                            if(nativeAdaptive)encoded["generation"]=videoGeneration;
                            if(videoWindow.Capacity==3||nativeCadence){encoded["captureMs"]=videoCaptureMs;encoded["conversionMs"]=video.ConversionMs;encoded["encodeMs"]=video.EncodingMs;}
                            if(packet.codec!=null)encoded["codec"]=packet.codec;Output(encoded);
                            }
                        } catch {
                            bool surfaceFailure=video!=null&&video.GpuInput,unpublished=videoSeq==0&&videoProfile==null,codecFallback=nativeCodecs&&videoCodec!="h264";
                            commands.EnableFast(false);if(video!=null)video.Dispose();video=null;
                            if(surfaceFailure&&dxgi!=null)dxgi.DisableGpuSurfaces();
                            // Before any packet is published, a new memory-input
                            // encoder can start cleanly with its own SPS/IDR.
                            if((surfaceFailure||codecFallback)&&unpublished)try{video=new SodaDesktopH264(w,h,videoFps,videoBitrate);if(codecFallback){videoCodec="h264";videoCodecFallback="encoder";}videoNv12=null;commands.EnableFast(true);}catch{}
                            if(video==null){videoProfile=null;Output(new {type="native_video_stopped",id=videoId});videoId=null;videoWindow=new SodaDesktopVideoWindow(1);}
                        }
                        now=Clock.ElapsedMilliseconds;
                    }
                    long revision=Interlocked.Read(ref inputRevision);
                    if(revision!=preparedRevision){preparation.Invalidate(false);preparedRevision=revision;}
                    if(!Stopping && preparation.CanPrepare(now,pending,video!=null&&DeferNativeSnapshots,forceFull,Interlocked.Read(ref LastNativeInput))) {
                        object scopeTicket=CaptureScope();if(!PublishScope(scopeTicket)){Stopping=true;break;}
                        long frameStarted=Clock.ElapsedMilliseconds;var t=Stopwatch.StartNew();CaptureFrame(resize,w,h,showCursor&&(cursorPump==null||!cursorPump.Active),ref dxgi,beforeCaptureDispose);
                        var rects=new List<Rectangle>();
                        bool changed=true;string capturedId=contentId;
                        var prepared=new PreparedFrame {started=frameStarted,scopeTicket=scopeTicket};
                        if(deltas || colorMode!="full")ReadPixels(scaled,current,colorMode);
                        if(deltas){rects=DirtyTiles(current,previous,w,h,initialized);changed=rects.Count>0;if(changed)capturedId=BitConverter.ToString(sha.ComputeHash(current)).Replace("-","").ToLowerInvariant();}
                        double capture=t.Elapsed.TotalMilliseconds;t.Restart();
                        bool full=!deltas || forceFull || frameStarted-lastFull>=30000;
                        long area=0;foreach(var r in rects)area+=(long)r.Width*r.Height;
                        if(changed && (rects.Count>8 || area>=(long)w*h*3/5))full=true;
                        bool report=changed || full || frameStarted-lastReport>=1000;
                        if(report)using(var stream=new MemoryStream()) {
                            object update=null;string format="image/jpeg";
                            if(full){scaled.Save(stream,jpeg,args);}
                            else if(changed) {
                                format="image/png";var patches=new List<object>();
                                foreach(var r in rects)using(var patch=scaled.Clone(r,PixelFormat.Format24bppRgb)) {
                                    int offset=(int)stream.Length;using(var encoded=new MemoryStream()){patch.Save(encoded,ImageFormat.Png);encoded.WriteTo(stream);patches.Add(new {x=r.X,y=r.Y,width=r.Width,height=r.Height,offset,length=(int)encoded.Length});}
                                }
                                update=new {kind="patch",baseSeq=sequence,patches};
                                if(stream.Length>2*1024*1024){stream.SetLength(0);stream.Position=0;scaled.Save(stream,jpeg,args);format="image/jpeg";update=null;full=true;}
                            } else update=new {kind="unchanged",baseSeq=sequence};
                            byte[] image=stream.ToArray();if(image.Length>2*1024*1024)throw new InvalidOperationException("Frame limit");
                            double encode=t.Elapsed.TotalMilliseconds;
                            if(!AdmitPrepared(prepared))break;
                            var info=new Dictionary<string,object>{{"seq",sequence+1},{"width",w},{"height",h},{"format",format},{"captureMs",capture},{"encodeMs",encode}};
                            if(deltas)info["contentId"]=capturedId;
                            if(update!=null)info["update"]=update;
                            using(var process=Process.GetCurrentProcess()){info["sourceCpuMs"]=process.TotalProcessorTime.TotalMilliseconds;info["sourceMemoryBytes"]=process.WorkingSet64;}
                            prepared.info=info;prepared.image=image;prepared.full=full;prepared.contentId=capturedId;
                        }
                        preparation.Set(prepared,frameStarted,Clock.ElapsedMilliseconds,fps);
                    }
                    commands.Synchronize(()=> {
                    revision=Interlocked.Read(ref inputRevision);
                    if(revision!=preparedRevision){preparation.Invalidate(false);preparedRevision=revision;}
                    var outgoing=preparation.Take(pending,Clock.ElapsedMilliseconds,fps);
                    if(!Stopping&&outgoing!=null&&outgoing.info!=null) {
                        if(!PublishPrepared(outgoing))return;
                        sequence++;pending=sequence;
                        lastReport=outgoing.started;contentId=outgoing.contentId;
                        if(outgoing.full){lastFull=outgoing.started;forceFull=false;}
                        if(deltas){var swap=previous;previous=current;current=swap;initialized=true;}
                    }
                    });
                    if(video==null)Thread.Sleep(2);
                    else {int pause=SodaDesktopVideoDelay.FrameDelay(Clock.Elapsed.TotalMilliseconds,videoNext,videoWindow.CanSend);if(pause>0)video.Pause(pause);}
                }
                }
            }
        } finally { Stopping=true;Release();StopAudio(ref richClipboardWorker);StopAudio(ref audio);if(cursorPump!=null&&!cursorPump.Stop(1000))Environment.Exit(1);if(video!=null)video.Dispose();if(videoResize!=null)videoResize.Dispose();if(videoBitmap!=null)videoBitmap.Dispose();if(dxgi!=null)dxgi.Dispose();if(form!=null)form.Dispose();watchdog.Dispose(); }
    }
}

// Opt-in temporary display mode lease. The independent guardian restores after
// the capture process dies (including Environment.Exit/forced termination).
public static class SodaDesktopDisplay {
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
    public struct Mode {
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string DeviceName;
        public ushort SpecVersion,DriverVersion,Size,DriverExtra;
        public uint Fields;
        public int X,Y;
        public uint Orientation,FixedOutput;
        public short Color,Duplex,YResolution,TTOption,Collate;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string FormName;
        public ushort LogPixels;
        public uint Bits,Width,Height,Flags,Frequency,ICMMethod,ICMIntent,MediaType,DitherType,Reserved1,Reserved2,PanningWidth,PanningHeight;
    }
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool EnumDisplaySettingsEx(string device,int index,ref Mode mode,uint flags);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int ChangeDisplaySettingsEx(string device,ref Mode mode,IntPtr hwnd,uint flags,IntPtr parameter);
    public interface Driver {
        Mode Current(string device);
        List<Mode> Modes(string device);
        bool Test(string device,Mode mode);
        void Apply(string device,Mode mode);
        void Arm(string device,Mode original,Mode target);
        void Disarm();
    }
    public sealed class NativeDriver : Driver {
        readonly string source;
        EventWaitHandle disarm;
        public NativeDriver(string path) { source=path; }
        static Mode Read(string device,int index) {
            var mode=new Mode { Size=(ushort)Marshal.SizeOf(typeof(Mode)) };
            if(!EnumDisplaySettingsEx(device,index,ref mode,0) || mode.DriverExtra!=0)throw new InvalidOperationException("Display mode unavailable");
            return mode;
        }
        public Mode Current(string device) {return Read(device,-1);}
        public List<Mode> Modes(string device) {
            var result=new List<Mode>();
            for(int i=0;i<1024;i++) {
                var mode=new Mode { Size=(ushort)Marshal.SizeOf(typeof(Mode)) };
                if(!EnumDisplaySettingsEx(device,i,ref mode,0))break;
                if(mode.DriverExtra==0 && mode.Bits==32 && Valid(mode.Width,mode.Height) && !result.Exists(m=>m.Width==mode.Width&&m.Height==mode.Height))result.Add(mode);
                if(result.Count==128)break;
            }
            return result;
        }
        public bool Test(string device,Mode mode) {return ChangeDisplaySettingsEx(device,ref mode,IntPtr.Zero,2,IntPtr.Zero)==0;}
        public void Apply(string device,Mode mode) {if(ChangeDisplaySettingsEx(device,ref mode,IntPtr.Zero,0,IntPtr.Zero)!=0)throw new InvalidOperationException("Display mode rejected");}
        public void Arm(string device,Mode original,Mode target) {
            if(String.IsNullOrEmpty(source) || !File.Exists(source))throw new InvalidOperationException("Display guardian source unavailable");
            string eventName="Local\\SodaDesktopDisplay-"+Guid.NewGuid().ToString("N");
            disarm=new EventWaitHandle(false,EventResetMode.ManualReset,eventName);
            var plan=new Plan { Device=device,Original=original,Target=target,StopEvent=eventName };
            using(var self=Process.GetCurrentProcess()){plan.Parent=self.Id;plan.StartTicks=self.StartTime.ToUniversalTime().Ticks;}
            string data=Convert.ToBase64String(Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(plan)));
            string command="$ErrorActionPreference='Stop'; Add-Type -TypeDefinition ([IO.File]::ReadAllText('"+Path.GetFullPath(source).Replace("'","''")+"')) -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll; [SodaDesktopDisplay]::Watch('"+data+"')";
            string exe=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe");
            var info=new ProcessStartInfo(exe,"-NoProfile -NonInteractive -Command "+Quote(command)) {UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
            using(var guard=Process.Start(info)) {
                guard.BeginErrorReadLine();
                var ready=guard.StandardOutput.ReadLineAsync();
                if(!ready.Wait(7000) || ready.Result!="display_guard_ready" || guard.HasExited) {try{guard.Kill();}catch{}throw new InvalidOperationException("Display guardian unavailable");}
            }
        }
        public void Disarm() {if(disarm!=null){disarm.Set();disarm.Dispose();disarm=null;}}
        static string Quote(string value) {
            var text=new StringBuilder("\"");int slashes=0;
            foreach(char c in value) {if(c=='\\'){slashes++;continue;}if(c=='\"'){text.Append('\\',slashes*2+1);text.Append(c);}else{text.Append('\\',slashes);text.Append(c);}slashes=0;}
            text.Append('\\',slashes*2);return text.Append('"').ToString();
        }
    }
    public sealed class Plan {public string Device,StopEvent;public Mode Original,Target;public int Parent;public long StartTicks;}
    public static Mutex DeviceMutex(string device) {
        string key;using(var sha=SHA256.Create())key=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(device))).Replace("-","");
        return new Mutex(false,"Local\\SodaDesktopDisplayLock-"+key);
    }
    static void Enter(Mutex gate) {try{if(!gate.WaitOne(10000))throw new InvalidOperationException("Previous display restoration is pending");}catch(AbandonedMutexException){}}
    public static void WaitForPrevious(string device) {using(var gate=DeviceMutex(device)){Enter(gate);gate.ReleaseMutex();}}
    public static Mode RestoreSize(Mode current,Mode original) {current.Width=original.Width;current.Height=original.Height;current.Fields=0x180000;return current;}
    public static bool Valid(uint width,uint height) {return width>=320 && width<=4096 && height>=200 && height<=2400 && (long)width*height<=8000000;}
    public static Rectangle RectangleOf(Mode mode) {return new Rectangle(mode.X,mode.Y,(int)mode.Width,(int)mode.Height);}
    public static Rectangle VirtualRectangle(Driver driver,IEnumerable<string> devices) {
        Rectangle bounds=Rectangle.Empty;bool any=false;
        foreach(string device in devices) {
            Rectangle current=RectangleOf(driver.Current(device));
            if(current.Width<1 || current.Height<1)throw new InvalidOperationException("Display bounds unavailable");
            bounds=any?Rectangle.Union(bounds,current):current;any=true;
        }
        if(!any)throw new InvalidOperationException("Display bounds unavailable");
        return bounds;
    }
    public static Point AbsolutePointer(Rectangle monitor,Rectangle desktop,double x,double y) {
        if(desktop.Width<1 || desktop.Height<1 || monitor.Width<1 || monitor.Height<1 || !desktop.Contains(monitor) ||
           Double.IsNaN(x)||Double.IsNaN(y)||x<0||x>1||y<0||y>1)throw new InvalidOperationException("Invalid pointer coordinates");
        int px=monitor.Left+(int)Math.Round(x*(monitor.Width-1)),py=monitor.Top+(int)Math.Round(y*(monitor.Height-1));
        return new Point((int)Math.Round((px-desktop.Left)*65535.0/Math.Max(1,desktop.Width-1)),(int)Math.Round((py-desktop.Top)*65535.0/Math.Max(1,desktop.Height-1)));
    }
    public static bool Same(Mode a,Mode b) {return a.X==b.X&&a.Y==b.Y&&a.Width==b.Width&&a.Height==b.Height&&a.Orientation==b.Orientation;}
    public static bool Matches(string device,Rectangle bounds) {try{return RectangleOf(new NativeDriver(null).Current(device))==bounds;}catch{return false;}}
    public sealed class Lease : IDisposable {
        readonly Driver driver;readonly string device;readonly Mode original,target;bool changed,disposed;
        public readonly Rectangle Bounds;
        public Lease(Driver backend,string name,int width,int height) {
            driver=backend;device=name;original=driver.Current(device);
            if(!Valid((uint)width,(uint)height) || !driver.Modes(device).Exists(m=>m.Width==width&&m.Height==height))throw new InvalidOperationException("Unsupported display resolution");
            target=original;target.Width=(uint)width;target.Height=(uint)height;target.Fields=0x180000;
            Bounds=RectangleOf(target);
            if(Same(original,target))return;
            if(!driver.Test(device,target))throw new InvalidOperationException("Display mode test rejected");
            driver.Arm(device,original,target); // Guardian holds the device lock before acknowledging readiness.
            if(!Same(driver.Current(device),original)){driver.Disarm();throw new InvalidOperationException("Display changed locally");}
            changed=true;
            try {driver.Apply(device,target);if(!Same(driver.Current(device),target))throw new InvalidOperationException("Display mode mismatch");}
            catch {Dispose();throw;}
        }
        public void Dispose() {
            if(disposed)return;disposed=true;
            if(changed) {
                var current=driver.Current(device);
                if(Same(current,target))driver.Apply(device,RestoreSize(current,original));
                driver.Disarm();
            }
        }
    }
    public static void Watch(string encoded) {
        var plan=new JavaScriptSerializer().Deserialize<Plan>(Encoding.UTF8.GetString(Convert.FromBase64String(encoded)));
        using(var parent=Process.GetProcessById(plan.Parent)) {
            if(parent.StartTime.ToUniversalTime().Ticks!=plan.StartTicks)throw new InvalidOperationException("Parent replaced");
            Guard(new NativeDriver(null),plan,()=>parent.HasExited,()=>{Console.WriteLine("display_guard_ready");Console.Out.Flush();});
        }
    }
    public static void Guard(Driver driver,Plan plan,Func<bool> parentExited,Action ready) {
            using(var gate=DeviceMutex(plan.Device)) {
                Enter(gate);
                try {
                    if(parentExited())return; // No readiness acknowledgement, therefore no resize occurred.
                    driver.Current(plan.Device);
                    using(var stop=EventWaitHandle.OpenExisting(plan.StopEvent)) {
                        ready();
                        while(!parentExited())if(stop.WaitOne(250))return;
                        if(stop.WaitOne(0))return;
                        // Hold the device lock until restoration has finished. The next helper waits before reading its original mode.
                        var current=driver.Current(plan.Device);
                        if(Same(current,plan.Target))driver.Apply(plan.Device,RestoreSize(current,plan.Original));
                    }
                } finally {gate.ReleaseMutex();}
            }
    }
}

// One prepared frame alongside the single frame awaiting ACK. No transport/schema change.
// Ready-age excludes capture/encode time so slow captures can still make progress.
public sealed class SodaDesktopFramePreparation<T> where T:class {
    T prepared;
    readonly bool overlap;
    long readyAt;
    public SodaDesktopFramePreparation(bool prepareWhileAwaitingAck=true){overlap=prepareWhileAwaitingAck;}
    public long Next {get;private set;}
    public bool CanPrepare(long now,long pending=0,bool nativeVideo=false,bool forceFull=false,long lastNativeInput=-1000){return prepared==null&&now>=Next&&(overlap||pending==0)&&(!nativeVideo||forceFull||now-lastNativeInput>=150);}
    public void Set(T frame,long started,long completed,int fps){
        if(prepared!=null||frame==null||fps<1)throw new InvalidOperationException("Frame preparation overflow");
        prepared=frame;readyAt=completed;Next=started+Math.Max(1,1000/fps);
    }
    public T Take(long pending,long now,int fps){
        if(pending!=0||prepared==null)return null;
        T frame=prepared;prepared=null;
        return now-readyAt<=200?frame:null;
    }
    public void Invalidate(bool immediate){prepared=null;if(immediate)Next=0;}
}

// Normal-desktop-only DXGI/D3D11 backend. No DLL deployment or SDK is required:
// the .NET Framework helper uses the system COM ABI and runtime HLSL compiler.
// Keep this independent of input, transport and the privileged unlock service.
public sealed class SodaDesktopDxgi : IDisposable {
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport("dxgi.dll")] static extern int CreateDXGIFactory1(ref Guid iid,out IntPtr factory);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport("d3d11.dll")] static extern int D3D11CreateDevice(IntPtr adapter,uint driver,IntPtr software,uint flags,IntPtr levels,uint count,uint sdk,out IntPtr device,out uint level,out IntPtr context);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport("d3dcompiler_47.dll",CharSet=CharSet.Ansi)] static extern int D3DCompile(byte[] source,UIntPtr size,string name,IntPtr defines,IntPtr include,string entry,string target,uint flags,uint flags2,out IntPtr code,out IntPtr errors);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
    struct OutputDesc { [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string name;public int left,top,right,bottom,attached;public uint rotation;public IntPtr monitor; }
    [StructLayout(LayoutKind.Sequential)] struct TextureDesc { public uint width,height,mips,array,format,samples,quality,usage,bind,cpu,misc; }
    [StructLayout(LayoutKind.Sequential)] struct Viewport { public float x,y,width,height,min,max; }
    [StructLayout(LayoutKind.Sequential)] struct SamplerDesc { public uint filter,u,v,w;public float bias;public uint anisotropy,comparison;public float r,g,b,a,min,max; }
    [StructLayout(LayoutKind.Sequential)] struct Mapped { public IntPtr data;public uint pitch,depth; }
    readonly object captureGate=new object();
    volatile SodaDesktopCursor.State cursorState;long cursorVersion;bool cursorTracking;
    [StructLayout(LayoutKind.Sequential)] struct PointerInfo {public uint kind,width,height,pitch;public int hotspotX,hotspotY;}
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int PointerShape(IntPtr self,uint size,[Out] byte[] data,out uint required,out PointerInfo info);
    void UpdateCursor(FrameInfo frame) {
        if(!cursorTracking||(frame.mouse==0&&frame.pointerSize==0))return;
        try {
            var shape=cursorState==null?null:cursorState.Shape;
            if(frame.pointerSize>0){if(frame.pointerSize>512*1024)throw new InvalidOperationException("Cursor limit");var bytes=new byte[frame.pointerSize];uint required;PointerInfo info;Check(Method<PointerShape>(duplication,11)(duplication,frame.pointerSize,bytes,out required,out info));if(required>bytes.Length)throw new InvalidOperationException("Cursor limit");
                int h=checked((int)info.height);if(info.kind==1){if((h&1)!=0)throw new InvalidOperationException("Cursor height");h/=2;}
                int length=checked((int)info.pitch*h*(info.kind==1?2:1));if(length>bytes.Length)throw new InvalidOperationException("Cursor bytes");if(length!=bytes.Length)Array.Resize(ref bytes,length);
                shape=new SodaDesktopCursor.Shape {Kind=(int)info.kind,Width=(int)info.width,Height=h,Pitch=(int)info.pitch,HotspotX=info.hotspotX,HotspotY=info.hotspotY,Data=bytes};shape.Validate();cursorVersion++;
            }
            cursorState=new SodaDesktopCursor.State {Shape=shape,Separate=frame.pointerVisible!=0,Version=cursorVersion};
        }catch{cursorState=null;}
    }
    public SodaDesktopCursor.State PollCursor(){lock(captureGate){if(disposed||duplication==IntPtr.Zero)return null;cursorTracking=true;try{AcquireFrame();}catch{cursorState=null;throw;}return hasFrame?cursorState:null;}}
    public void StopCursorTracking(){lock(captureGate){cursorTracking=false;cursorState=null;}}
    [StructLayout(LayoutKind.Sequential)] struct FrameInfo { public long present,mouse;public uint accumulated;public int coalesced,protectedContent;public int pointerX,pointerY,pointerVisible;public uint metadata,pointerSize; }
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EnumObject(IntPtr self,uint index,out IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetOutputDesc(IntPtr self,out OutputDesc value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Duplicate(IntPtr self,IntPtr device,out IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Acquire(IntPtr self,uint timeout,out FrameInfo info,out IntPtr resource);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int EndFrame(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void GetTextureDesc(IntPtr self,out TextureDesc desc);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateTexture(IntPtr self,ref TextureDesc desc,IntPtr initial,out IntPtr texture);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateView(IntPtr self,IntPtr resource,IntPtr desc,out IntPtr view);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateShader(IntPtr self,IntPtr code,UIntPtr size,IntPtr linkage,out IntPtr shader);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateSampler(IntPtr self,ref SamplerDesc desc,out IntPtr sampler);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate IntPtr BlobPointer(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate UIntPtr BlobSize(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void SetArray(IntPtr self,uint start,uint count,[In] IntPtr[] values);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void SetShader(IntPtr self,IntPtr shader,IntPtr classes,uint count);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void SetTopology(IntPtr self,uint topology);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void SetTargets(IntPtr self,uint count,[In] IntPtr[] targets,IntPtr depth);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void SetViewport(IntPtr self,uint count,ref Viewport viewport);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void Draw(IntPtr self,uint vertices,uint start);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void Copy(IntPtr self,IntPtr dest,IntPtr source);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Map(IntPtr self,IntPtr resource,uint subresource,uint type,uint flags,out Mapped mapped);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void Unmap(IntPtr self,IntPtr resource,uint subresource);
    // Vtable indices are from the Windows SDK interfaces (IUnknown included).
    static T Method<T>(IntPtr obj,int slot) where T:class { return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj),slot*IntPtr.Size),typeof(T)) as T; }
    static void Check(int result) { if(result<0)Marshal.ThrowExceptionForHR(result); }
    static void Release(ref IntPtr obj) { if(obj!=IntPtr.Zero){Marshal.Release(obj);obj=IntPtr.Zero;} }
    static IntPtr Query(IntPtr obj,string iid) { var id=new Guid(iid);IntPtr value;Check(Marshal.QueryInterface(obj,ref id,out value));return value; }
    IntPtr device,context,duplication,source,sourceView,target,targetView,staging,vertex,pixel,sampler;
    IntPtr nvTarget,nvView,nvStaging,nvShader,cursorTexture,cursorView,cursorConstants;
    IntPtr surfaceYShader,surfaceUvShader,multithread,surfaceContext;
    string nvShaderSource;
    bool surfaceFailed;
    readonly object surfaceGate=new object();
    sealed class SurfaceSlot {public IntPtr texture,yView,uvView;public bool busy;}
    readonly List<SurfaceSlot> surfaces=new List<SurfaceSlot>();
    byte[] nvRow;
    bool nvFailed;
    Bitmap bitmap;
    byte[] row;
    bool hasFrame,disposed;
    readonly int width,height;int videoWidth,videoHeight;
    public int CpuReadbacks {get;private set;}
    public bool HasDesktopFrame {get{return hasFrame&&!disposed;}}
    public IntPtr GpuDevice {get{if(disposed)throw new ObjectDisposedException("SodaDesktopDxgi");return device;}}
    SodaDesktopDxgi(int width,int height) { this.width=videoWidth=width;this.height=videoHeight=height; }
    public static SodaDesktopDxgi TryCreate(string name,Rectangle bounds,int width,int height) {
        if(IntPtr.Size!=8 || width<1 || height<1 || width>4096 || height>2400 || (long)width*height>8000000)return null;
        var capture=new SodaDesktopDxgi(width,height);
        try { capture.Initialize(name,bounds);return capture; }
        catch { capture.Dispose();return null; }
    }
    void Initialize(string name,Rectangle bounds) {
        IntPtr factory=IntPtr.Zero,adapter=IntPtr.Zero,output=IntPtr.Zero,output1=IntPtr.Zero;
        try {
            Guid iid=new Guid("770aae78-f26f-4dba-a829-253c83d1b387");Check(CreateDXGIFactory1(ref iid,out factory));
            // Select by the same Windows display name AND physical bounds used by
            // input mapping, including outputs on a non-primary GPU.
            bool found=false;
            for(uint a=0;a<32 && !found;a++) {
                int hr=Method<EnumObject>(factory,12)(factory,a,out adapter);
                if(hr==unchecked((int)0x887a0002))break;Check(hr);
                try {
                    for(uint o=0;o<32;o++) {
                        hr=Method<EnumObject>(adapter,7)(adapter,o,out output);
                        if(hr==unchecked((int)0x887a0002))break;Check(hr);
                        try {
                            OutputDesc desc;Check(Method<GetOutputDesc>(output,7)(output,out desc));
                            if(desc.attached==0 || desc.name!=name || desc.left!=bounds.Left || desc.top!=bounds.Top || desc.right!=bounds.Right || desc.bottom!=bounds.Bottom)continue;
                            // Rotated outputs require a different UV transform. GDI
                            // remains the supported backend for those configurations.
                            if(desc.rotation!=1)throw new NotSupportedException("Rotated output");
                            uint level;Check(D3D11CreateDevice(adapter,0,IntPtr.Zero,0x20,IntPtr.Zero,0,7,out device,out level,out context));
                            output1=Query(output,"00cddea8-939b-4b83-a340-a685226666cc");
                            Check(Method<Duplicate>(output1,22)(output1,device,out duplication));
                            found=true;break;
                        } finally { Release(ref output1);Release(ref output); }
                    }
                } finally { Release(ref adapter); }
            }
            if(!found)throw new NotSupportedException("Output unavailable");
            InitializeResources(bounds.Width,bounds.Height);
        } finally { Release(ref output1);Release(ref output);Release(ref adapter);Release(ref factory); }
    }
    void InitializeResources(int sourceWidth,int sourceHeight) {
            source=Texture(sourceWidth,sourceHeight,0,8,0);
            Check(Method<CreateView>(device,7)(device,source,IntPtr.Zero,out sourceView));
            target=Texture(width,height,0,32,0);
            Check(Method<CreateView>(device,9)(device,target,IntPtr.Zero,out targetView));
            staging=Texture(width,height,3,0,0x20000);
            vertex=Shader("struct V {float4 p:SV_Position;float2 uv:TEXCOORD0;}; V main(uint id:SV_VertexID){V v;v.uv=float2((id<<1)&2,id&2);v.p=float4(v.uv*float2(2,-2)+float2(-1,1),0,1);return v;}","vs_4_0",12);
            pixel=Shader("Texture2D image:register(t0);SamplerState linearClamp:register(s0);float4 main(float4 p:SV_Position,float2 uv:TEXCOORD0):SV_Target{return image.Sample(linearClamp,uv);}","ps_4_0",15);
            var descSampler=new SamplerDesc {filter=0x15,u=3,v=3,w=3,comparison=1,anisotropy=1,max=float.MaxValue};
            Check(Method<CreateSampler>(device,23)(device,ref descSampler,out sampler));
            bitmap=new Bitmap(width,height,PixelFormat.Format32bppRgb);row=new byte[checked(width*4)];
    }
    IntPtr Texture(int w,int h,uint usage,uint bind,uint cpu,uint format=87) {
        var desc=new TextureDesc {width=(uint)w,height=(uint)h,mips=1,array=1,format=format,samples=1,usage=usage,bind=bind,cpu=cpu};
        IntPtr value;Check(Method<CreateTexture>(device,5)(device,ref desc,IntPtr.Zero,out value));return value;
    }
    IntPtr Shader(string hlsl,string profile,int slot) {
        IntPtr code=IntPtr.Zero,errors=IntPtr.Zero;
        try {
            byte[] bytes=Encoding.ASCII.GetBytes(hlsl);Check(D3DCompile(bytes,(UIntPtr)bytes.Length,null,IntPtr.Zero,IntPtr.Zero,"main",profile,0,0,out code,out errors));
            IntPtr shader;Check(Method<CreateShader>(device,slot)(device,Method<BlobPointer>(code,3)(code),Method<BlobSize>(code,4)(code),IntPtr.Zero,out shader));return shader;
        } finally { Release(ref errors);Release(ref code); }
    }
    public bool Capture(Graphics destination) {lock(captureGate){
        if(!AcquireFrame())return false;
        Render(destination);return true;
    }}
    bool AcquireFrame() {
        if(disposed)throw new ObjectDisposedException("SodaDesktopDxgi");
        IntPtr resource=IntPtr.Zero,texture=IntPtr.Zero;FrameInfo info;
        int hr=Method<Acquire>(duplication,8)(duplication,hasFrame?0u:16u,out info,out resource);
        if(hr==unchecked((int)0x887a0027)) { if(!hasFrame)return false; }
        else {
            Check(hr);
            try {
                UpdateCursor(info);
                // Pointer-only updates have no new desktop image. Before the
                // first desktop present, use GDI for this frame; never publish
                // the undefined/black initial duplication surface.
                if(info.present==0) { if(!hasFrame)return false; }
                else {
                texture=Query(resource,"6f15aaf2-d208-4e89-9ab4-489535d34f9c");
                TextureDesc acquired,expected;Method<GetTextureDesc>(texture,10)(texture,out acquired);Method<GetTextureDesc>(source,10)(source,out expected);
                if(acquired.width!=expected.width || acquired.height!=expected.height || acquired.format!=87 || acquired.samples!=1)throw new InvalidOperationException("Desktop texture changed");
                Method<Copy>(context,47)(context,source,texture);hasFrame=true;
                }
            } finally { Release(ref texture);Release(ref resource);Check(Method<EndFrame>(duplication,14)(duplication)); }
        }
        return true;
    }
    public bool TryCaptureNv12(byte[] output,int cursorX,int cursorY,bool cursorVisible,out double conversionMs) {lock(captureGate){
        conversionMs=0;
        if(nvFailed||(videoWidth&1)!=0||(videoHeight&1)!=0)return false;
        try {
            if(output==null||output.Length!=(long)videoWidth*videoHeight*3/2)throw new ArgumentException("NV12 dimensions");
            if(!AcquireFrame())return false;
            var timer=Stopwatch.StartNew();RenderNv12(output,cursorX,cursorY,cursorVisible);conversionMs=timer.Elapsed.TotalMilliseconds;return true;
        } catch {nvFailed=true;DisposeNv12();return false;}
    }}
    [StructLayout(LayoutKind.Sequential)] struct BufferDesc {public uint size,usage,bind,cpu,misc,stride;}
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateBuffer(IntPtr self,ref BufferDesc desc,IntPtr initial,out IntPtr buffer);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void Upload(IntPtr self,IntPtr resource,uint subresource,IntPtr box,IntPtr data,uint pitch,uint depth);
    void UploadBytes(IntPtr resource,byte[] bytes,int pitch,IntPtr drawing=default(IntPtr)) {
        if(drawing==IntPtr.Zero)drawing=context;
        var pin=GCHandle.Alloc(bytes,GCHandleType.Pinned);
        try{Method<Upload>(drawing,48)(drawing,resource,0,IntPtr.Zero,pin.AddrOfPinnedObject(),(uint)pitch,0);}finally{pin.Free();}
    }
    void InitializeNv12() {
        int packedWidth=(videoWidth+3)/4;
        nvTarget=Texture(packedWidth,videoHeight*3/2,0,32,0);Check(Method<CreateView>(device,9)(device,nvTarget,IntPtr.Zero,out nvView));
        nvStaging=Texture(packedWidth,videoHeight*3/2,3,0,0x20000);nvRow=new byte[packedWidth*4];
        // Store four NV12 bytes in each BGRA texel. This needs only ordinary
        // render targets; unsupported video-processor/NV12 surfaces are avoided.
        string hlsl=@"Texture2D image:register(t0);Texture2D cursorImage:register(t1);SamplerState linearClamp:register(s0);
cbuffer Cursor:register(b0){float4 cursor;};
int3 rgb(int x,int y){
 float3 color=image.SampleLevel(linearClamp,float2((x+0.5)/WIDTH,(y+0.5)/HEIGHT),0).rgb;
 int2 c=int2(x,y)-int2(cursor.xy);
 if(cursor.z>0&&c.x>=0&&c.y>=0&&c.x<16&&c.y<24){
  float3 black=cursorImage.Load(int3(c,0)).rgb,white=cursorImage.Load(int3(c+int2(0,24),0)).rgb;
  color=black+(white-black)*color;
 }
 return int3(floor(saturate(color)*255+0.5));
}
int value(int x,int row){
 if(x>=WIDTH)return 0;
 if(row<HEIGHT){int3 c=rgb(x,row);return ((47*c.r+157*c.g+16*c.b+128)>>8)+16;}
 int xx=x&~1,yy=(row-HEIGHT)*2;
 int3 c=(rgb(xx,yy)+rgb(xx+1,yy)+rgb(xx,yy+1)+rgb(xx+1,yy+1)+2)/4;
 return (x&1)==0?((-26*c.r-86*c.g+112*c.b+128)>>8)+128:((112*c.r-102*c.g-10*c.b+128)>>8)+128;
}
float4 main(float4 p:SV_Position):SV_Target{
 int x=int(p.x)*4,y=int(p.y);
 return float4(value(x+2,y),value(x+1,y),value(x,y),value(x+3,y))/255.0;
}";
        hlsl=hlsl.Replace("WIDTH",videoWidth.ToString(System.Globalization.CultureInfo.InvariantCulture)+".0").Replace("HEIGHT",videoHeight.ToString(System.Globalization.CultureInfo.InvariantCulture)+".0");
        nvShaderSource=hlsl;
        nvShader=Shader(hlsl,"ps_4_0",15);
        cursorTexture=Texture(16,48,0,8,0);Check(Method<CreateView>(device,7)(device,cursorTexture,IntPtr.Zero,out cursorView));
        var bytes=new byte[16*48*4];
        // Black/white renders preserve opaque, transparent AND/XOR cursor pixels,
        // including inversion. Match the existing fixed 16x24 default cursor.
        for(int background=0;background<2;background++)using(var cursorBitmap=new Bitmap(16,24,PixelFormat.Format32bppRgb)) {
            using(var g=Graphics.FromImage(cursorBitmap)){g.Clear(background==0?Color.Black:Color.White);Cursors.Default.Draw(g,new Rectangle(0,0,16,24));}
            var bits=cursorBitmap.LockBits(new Rectangle(0,0,16,24),ImageLockMode.ReadOnly,PixelFormat.Format32bppRgb);
            try{for(int y=0;y<24;y++)Marshal.Copy(IntPtr.Add(bits.Scan0,y*bits.Stride),bytes,(background*24+y)*16*4,16*4);}finally{cursorBitmap.UnlockBits(bits);}
        }
        UploadBytes(cursorTexture,bytes,16*4);
        var desc=new BufferDesc{size=16,bind=4};Check(Method<CreateBuffer>(device,3)(device,ref desc,IntPtr.Zero,out cursorConstants));
    }
    void RenderNv12(byte[] output,int cursorX,int cursorY,bool cursorVisible) {
        using(var guard=LockContext()){RenderNv12Core(output,cursorX,cursorY,cursorVisible);}
    }
    void RenderNv12Core(byte[] output,int cursorX,int cursorY,bool cursorVisible) {
        if(disposed)throw new ObjectDisposedException("SodaDesktopDxgi");
        if((videoWidth&1)!=0||(videoHeight&1)!=0||output==null||output.Length!=(long)videoWidth*videoHeight*3/2)throw new ArgumentException("NV12 dimensions");
        if(nvShader==IntPtr.Zero)InitializeNv12();
        IntPtr drawing=surfaceContext==IntPtr.Zero?context:surfaceContext;
        byte[] constants=new byte[16];Buffer.BlockCopy(new float[]{cursorX,cursorY,cursorVisible?1:0,0},0,constants,0,16);UploadBytes(cursorConstants,constants,16,drawing);
        DrawPass(drawing,nvShader,nvView,(videoWidth+3)/4,videoHeight*3/2,true);ExecuteSurfaceCommands();
        Method<Copy>(context,47)(context,nvStaging,nvTarget);
        CpuReadbacks++;
        Mapped mapped;Check(Method<Map>(context,14)(context,nvStaging,0,1,0,out mapped));
        try {
            if(mapped.data==IntPtr.Zero||mapped.pitch<(uint)nvRow.Length||mapped.pitch>256*1024)throw new InvalidOperationException("Invalid NV12 row pitch");
            for(int y=0;y<videoHeight*3/2;y++)Marshal.Copy(IntPtr.Add(mapped.data,checked(y*(int)mapped.pitch)),output,y*videoWidth,videoWidth);
        }finally{Method<Unmap>(context,15)(context,nvStaging,0);}
    }
    void DisposeNv12(){
        if(context!=IntPtr.Zero){Method<SetArray>(context,8)(context,0,2,new IntPtr[2]);Method<SetArray>(context,16)(context,0,1,new IntPtr[1]);Method<SetTargets>(context,33)(context,0,new IntPtr[0],IntPtr.Zero);}
        Release(ref cursorConstants);Release(ref cursorView);Release(ref cursorTexture);Release(ref nvShader);Release(ref nvStaging);Release(ref nvView);Release(ref nvTarget);nvRow=null;
    }
    void Render(Graphics destination) {
        using(var guard=LockContext()){RenderCore(destination);}
    }
    void RenderCore(Graphics destination) {
        // All scaling occurs before CPU readback. A retained GPU source handles
        // idle/timeouts without reusing a bitmap containing the painted cursor.
        DrawPass(surfaceContext==IntPtr.Zero?context:surfaceContext,pixel,targetView,width,height,false);ExecuteSurfaceCommands();
        Method<Copy>(context,47)(context,staging,target);
        CpuReadbacks++;
        Mapped mapped;Check(Method<Map>(context,14)(context,staging,0,1,0,out mapped));
        try {
            if(mapped.data==IntPtr.Zero || mapped.pitch<(uint)row.Length || mapped.pitch>256*1024)throw new InvalidOperationException("Invalid GPU row pitch");
            var bits=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.WriteOnly,PixelFormat.Format32bppRgb);
            try {
                for(int y=0;y<height;y++) {
                    Marshal.Copy(IntPtr.Add(mapped.data,checked(y*(int)mapped.pitch)),row,0,row.Length);
                    Marshal.Copy(row,0,IntPtr.Add(bits.Scan0,checked(y*bits.Stride)),row.Length);
                }
            } finally { bitmap.UnlockBits(bits); }
        } finally { Method<Unmap>(context,15)(context,staging,0); }
        destination.DrawImageUnscaled(bitmap,0,0);
    }
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void ContextLock(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int ProtectContext(IntPtr self,int enabled);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CreateContext(IntPtr self,uint flags,out IntPtr deferred);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int FinishCommands(IntPtr self,int restore,out IntPtr commands);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate void ExecuteCommands(IntPtr self,IntPtr commands,int restore);
    void DrawPass(IntPtr drawing,IntPtr shader,IntPtr view,int w,int h,bool cursor) {
        Method<SetShader>(drawing,11)(drawing,vertex,IntPtr.Zero,0);Method<SetShader>(drawing,9)(drawing,shader,IntPtr.Zero,0);
        Method<SetArray>(drawing,8)(drawing,0,2,new[]{sourceView,cursor?cursorView:IntPtr.Zero});Method<SetArray>(drawing,10)(drawing,0,1,new[]{sampler});
        if(cursor)Method<SetArray>(drawing,16)(drawing,0,1,new[]{cursorConstants});
        Method<SetTopology>(drawing,24)(drawing,4);Method<SetTargets>(drawing,33)(drawing,1,new[]{view},IntPtr.Zero);
        var viewport=new Viewport{width=w,height=h,max=1};Method<SetViewport>(drawing,44)(drawing,1,ref viewport);Method<Draw>(drawing,13)(drawing,3,0);
        Method<SetTargets>(drawing,33)(drawing,0,new IntPtr[0],IntPtr.Zero);Method<SetArray>(drawing,8)(drawing,0,2,new IntPtr[2]);
    }
    void ExecuteSurfaceCommands() {
        if(surfaceContext==IntPtr.Zero)return;
        IntPtr commands=IntPtr.Zero;
        try{Check(Method<FinishCommands>(surfaceContext,114)(surfaceContext,0,out commands));Method<ExecuteCommands>(context,58)(context,commands,1);}finally{Release(ref commands);}
    }
    sealed class ContextScope:IDisposable {
        IntPtr pointer;
        public ContextScope(IntPtr pointer){this.pointer=pointer;Method<ContextLock>(pointer,3)(pointer);}
        public void Dispose(){if(pointer!=IntPtr.Zero){Method<ContextLock>(pointer,4)(pointer);pointer=IntPtr.Zero;}}
    }
    IDisposable LockContext(){return multithread==IntPtr.Zero?null:new ContextScope(multithread);}
    [StructLayout(LayoutKind.Sequential)]struct TargetDesc {public uint format,dimension,mip,first,array;}
    IntPtr PlaneView(IntPtr texture,uint format) {
        var desc=new TargetDesc{format=format,dimension=4};IntPtr memory=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(TargetDesc)));
        try{Marshal.StructureToPtr(desc,memory,false);IntPtr view;Check(Method<CreateView>(device,9)(device,texture,memory,out view));return view;}finally{Marshal.FreeHGlobal(memory);}
    }
    public bool TryEnableGpuSurfaces() {lock(captureGate){
        if(disposed||surfaceFailed||device==IntPtr.Zero||context==IntPtr.Zero||videoWidth<2||videoHeight<2||(long)videoWidth*videoHeight>8000000||(videoWidth&1)!=0||(videoHeight&1)!=0)return false;
        if(surfaces.Count==4)return true;
        bool conversionWasReady=nvShader!=IntPtr.Zero;
        try {
            multithread=Query(context,"9b7e4e00-342c-4106-a19f-4f2704f689f0");Method<ProtectContext>(multithread,5)(multithread,1);
            using(var guard=LockContext()) {
                Check(Method<CreateContext>(device,27)(device,0,out surfaceContext));
                if(nvShader==IntPtr.Zero)InitializeNv12();
                string common=nvShaderSource.Substring(0,nvShaderSource.IndexOf("float4 main(",StringComparison.Ordinal));
                surfaceYShader=Shader(common+"float main(float4 p:SV_Position):SV_Target{return value(int(p.x),int(p.y))/255.0;}","ps_4_0",15);
                surfaceUvShader=Shader(common+"float2 main(float4 p:SV_Position):SV_Target{int x=int(p.x)*2,y=int(p.y)+"+videoHeight.ToString(System.Globalization.CultureInfo.InvariantCulture)+";return float2(value(x,y),value(x+1,y))/255.0;}","ps_4_0",15);
                // Fixed pool: a texture is never reused until its MF tracked
                // sample's allocator callback confirms the last consumer released it.
                for(int i=0;i<4;i++) {
                    var slot=new SurfaceSlot();surfaces.Add(slot);
                    slot.texture=Texture(videoWidth,videoHeight,0,0x28,0,103);
                    slot.yView=PlaneView(slot.texture,61);slot.uvView=PlaneView(slot.texture,49);
                }
            }
            return true;
        } catch {surfaceFailed=true;DisposeSurfaces();if(!conversionWasReady)DisposeNv12();return false;}
    }}
    // Call only after the old encoder has shut down. Draw ACK alone does not
    // return tracked MF samples. On timeout retain this one pool untouched;
    // the caller uses memory input and never allocates another pool here.
    public bool ConfigureVideoOutput(int w,int h,int timeoutMs=500){lock(captureGate){
        if(disposed||w<2||h<2||w>width||h>height||(w&1)!=0||(h&1)!=0||timeoutMs<0||timeoutMs>1000)throw new ArgumentException("Video output dimensions");
        var timer=Stopwatch.StartNew();
        lock(surfaceGate){while(surfaces.Exists(slot=>slot.busy)){if(timer.ElapsedMilliseconds>=timeoutMs)return false;Monitor.Wait(surfaceGate,Math.Min(20,Math.Max(1,timeoutMs-(int)timer.ElapsedMilliseconds)));}}
        DisposeSurfaces();DisposeNv12();Release(ref multithread);nvFailed=surfaceFailed=false;videoWidth=w;videoHeight=h;return true;
    }}
    public void DisableGpuSurfaces(){lock(captureGate){surfaceFailed=true;DisposeSurfaces();}}
    public sealed class GpuFrame:IDisposable {
        public readonly IntPtr Texture;
        Action retire;
        int ownership;
        internal GpuFrame(IntPtr texture,Action retire){Texture=texture;this.retire=retire;}
        internal void BeginEncode(){if(Interlocked.CompareExchange(ref ownership,1,0)!=0)throw new InvalidOperationException("GPU frame already submitted or released");}
        internal void Retire(){if(Interlocked.Exchange(ref ownership,2)==2)return;Return();}
        void Return(){var callback=Interlocked.Exchange(ref retire,null);if(callback!=null)callback();}
        public void Dispose(){if(Interlocked.CompareExchange(ref ownership,2,0)==0)Return();}
    }
    public GpuFrame CaptureGpuFrame(int cursorX,int cursorY,bool cursorVisible,out double conversionMs) {lock(captureGate){
        conversionMs=0;if(!AcquireFrame())return null;
        var timing=Stopwatch.StartNew();var frame=RenderGpuFrame(cursorX,cursorY,cursorVisible);conversionMs=timing.Elapsed.TotalMilliseconds;return frame;
    }}
    GpuFrame RenderGpuFrame(int cursorX,int cursorY,bool cursorVisible) {
        if(disposed||surfaceFailed||surfaces.Count!=4)throw new InvalidOperationException("GPU surfaces unavailable");
        SurfaceSlot slot=null;var timer=Stopwatch.StartNew();
        lock(surfaceGate) {
            while(slot==null) {
                if(disposed)throw new ObjectDisposedException("SodaDesktopDxgi");
                foreach(var candidate in surfaces)if(!candidate.busy){slot=candidate;slot.busy=true;break;}
                if(slot==null){if(timer.ElapsedMilliseconds>=1000)throw new System.TimeoutException("GPU surface pool exhausted");Monitor.Wait(surfaceGate,20);}
            }
        }
        var lease=new GpuFrame(slot.texture,()=>{lock(surfaceGate){slot.busy=false;Monitor.PulseAll(surfaceGate);}});
        try {
            using(var guard=LockContext()) {
                var constants=new byte[16];Buffer.BlockCopy(new float[]{cursorX,cursorY,cursorVisible?1:0,0},0,constants,0,16);UploadBytes(cursorConstants,constants,16,surfaceContext);
                for(int plane=0;plane<2;plane++) {
                    DrawPass(surfaceContext,plane==0?surfaceYShader:surfaceUvShader,plane==0?slot.yView:slot.uvView,plane==0?videoWidth:videoWidth/2,plane==0?videoHeight:videoHeight/2,true);
                }
                ExecuteSurfaceCommands();
            }
            return lease;
        } catch {lease.Dispose();throw;}
    }
    void DisposeSurfaces() {
        // Called before encoder construction on partial initialization failure,
        // or after MF shutdown. Late retire callbacks only touch managed state.
        lock(surfaceGate){Monitor.PulseAll(surfaceGate);}
        foreach(var slot in surfaces){Release(ref slot.uvView);Release(ref slot.yView);Release(ref slot.texture);}surfaces.Clear();
        Release(ref surfaceUvShader);Release(ref surfaceYShader);Release(ref surfaceContext);
    }
    public void Dispose() {lock(captureGate){
        if(disposed)return;disposed=true;
        DisposeSurfaces();
        DisposeNv12();
        if(bitmap!=null){bitmap.Dispose();bitmap=null;}
        Release(ref sampler);Release(ref pixel);Release(ref vertex);Release(ref staging);Release(ref targetView);Release(ref target);Release(ref sourceView);Release(ref source);Release(ref duplication);Release(ref multithread);Release(ref context);Release(ref device);
    }}
}

// Hardware-only Media Foundation H.264 encoder. Frames enter as bounded NV12
// system memory; this version does not claim a zero-copy GPU colorspace path.
public sealed class SodaDesktopH264 : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct TypeInfo { public Guid major,subtype; }
    [StructLayout(LayoutKind.Sequential)] struct OutputInfo { public uint flags,size,alignment; }
    [StructLayout(LayoutKind.Sequential)] struct OutputData { public uint stream;public IntPtr sample;public uint status;public IntPtr events; }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFStartup(uint version,uint flags);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFShutdown();
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFTEnumEx(Guid category,uint flags,ref TypeInfo input,ref TypeInfo output,out IntPtr activates,out uint count);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFTEnum2(Guid category,uint flags,ref TypeInfo input,ref TypeInfo output,IntPtr attributes,out IntPtr activates,out uint count);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFCreateAttributes(out IntPtr attributes,uint size);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFCreateMediaType(out IntPtr type);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFCreateSample(out IntPtr sample);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFCreateMemoryBuffer(uint size,out IntPtr buffer);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFCreateDXGIDeviceManager(out uint token,out IntPtr manager);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFCreateDXGISurfaceBuffer(ref Guid iid,IntPtr texture,uint subresource,[MarshalAs(UnmanagedType.Bool)]bool bottomUp,out IntPtr buffer);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)] [DllImport("mfplat.dll")] static extern int MFCreateTrackedSample(out IntPtr sample);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int ResetDevice(IntPtr self,IntPtr device,uint token);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Get32(IntPtr self,ref Guid key,out uint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetAllocator(IntPtr self,IntPtr callback,IntPtr state);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetBlob(IntPtr self,ref Guid key,[In]byte[] bytes,uint size);
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct AdapterDesc {
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string description;
        public uint vendor,device,subsystem,revision;public UIntPtr videoMemory,systemMemory,sharedMemory;public long luid;
    }
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetAdapterDesc(IntPtr self,out AdapterDesc desc);
    [ComVisible(true),Guid("a27003cf-2354-4f2a-8d6a-ab7cff15437e"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface SampleCallback {
        [PreserveSig]int GetParameters(out uint flags,out uint queue);
        [PreserveSig]int Invoke(IntPtr result);
    }
    [ComVisible(true),ClassInterface(ClassInterfaceType.None)]
    public sealed class RetireFrame:SampleCallback {
        readonly SodaDesktopDxgi.GpuFrame frame;
        public RetireFrame(SodaDesktopDxgi.GpuFrame frame){this.frame=frame;}
        public int GetParameters(out uint flags,out uint queue){flags=queue=0;return unchecked((int)0x80004001);}
        public int Invoke(IntPtr result){frame.Retire();return 0;}
    }
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetObject(IntPtr self,out IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Activate(IntPtr self,ref Guid iid,out IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Set32(IntPtr self,ref Guid key,uint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Set64(IntPtr self,ref Guid key,ulong value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetGuid(IntPtr self,ref Guid key,ref Guid value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetType(IntPtr self,uint stream,IntPtr type,uint flags);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int AvailableType(IntPtr self,uint stream,uint index,out IntPtr type);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetGuid(IntPtr self,ref Guid key,out Guid value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Get64(IntPtr self,ref Guid key,out ulong value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetBlob(IntPtr self,ref Guid key,out IntPtr data,out uint length);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Message(IntPtr self,uint message,UIntPtr parameter);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Input(IntPtr self,uint stream,IntPtr sample,uint flags);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int Output(IntPtr self,uint flags,uint count,ref OutputData data,out uint status);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetOutputInfo(IntPtr self,uint stream,out OutputInfo info);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetEvent(IntPtr self,uint flags,out IntPtr value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetNumber(IntPtr self,out uint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetStatus(IntPtr self,out int value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int BufferLock(IntPtr self,out IntPtr data,out uint max,out uint length);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int NoArgs(IntPtr self);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetLength(IntPtr self,uint value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int AddBuffer(IntPtr self,IntPtr buffer);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetTime(IntPtr self,long value);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int CodecValue(IntPtr self,ref Guid key,IntPtr variant);
    static T Method<T>(IntPtr obj,int slot) where T:class { return Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj),slot*IntPtr.Size),typeof(T)) as T; }
    static void Check(int hr) { if(hr<0)Marshal.ThrowExceptionForHR(hr); }
    static void Release(ref IntPtr obj) { if(obj!=IntPtr.Zero){Marshal.Release(obj);obj=IntPtr.Zero;} }
    static IntPtr Query(IntPtr obj,string iid) { Guid id=new Guid(iid);IntPtr value;Check(Marshal.QueryInterface(obj,ref id,out value));return value; }
    static void U32(IntPtr obj,string key,uint value) {Guid id=new Guid(key);Check(Method<Set32>(obj,21)(obj,ref id,value));}
    static void U64(IntPtr obj,string key,ulong value) {Guid id=new Guid(key);Check(Method<Set64>(obj,22)(obj,ref id,value));}
    static void GuidValue(IntPtr obj,string key,Guid value) {Guid id=new Guid(key);Check(Method<SetGuid>(obj,24)(obj,ref id,ref value));}
    static readonly Guid Video=new Guid("73646976-0000-0010-8000-00aa00389b71"),NV12=new Guid("3231564e-0000-0010-8000-00aa00389b71"),H264=new Guid("34363248-0000-0010-8000-00aa00389b71");
    IntPtr transform,eventGenerator,activation,gpuDevice,deviceManager;
    bool started,disposed;
    int inputCredits,outputCredits;
    readonly int width,height,fps,bitrate;
    readonly string codecName;readonly Guid encodedSubtype,inputSubtype;readonly SodaDesktopVideoBitstream packetReader;
    public string CodecName {get{return codecName;}}
    public bool FullChroma {get{return codecName=="h264-444";}}
    byte[] bgr,nv12,sequenceHeader;
    SodaDesktopVideoDelay delay;
    public sealed class Packet { public byte[] data;public bool key;public string codec;public long timestamp; }
    public bool GpuInput {get{return gpuDevice!=IntPtr.Zero;}}
    public static SodaDesktopH264 CreateForDesktop(int width,int height,int fps,int bitrateKbps,SodaDesktopDxgi capture) {
        if(capture!=null&&capture.HasDesktopFrame&&capture.TryEnableGpuSurfaces()) {
            try{return new SodaDesktopH264(width,height,fps,bitrateKbps,capture.GpuDevice);}catch{capture.DisableGpuSurfaces();}
        }
        return new SodaDesktopH264(width,height,fps,bitrateKbps);
    }
    public static SodaDesktopH264 CreateCodecForDesktop(int width,int height,int fps,int bitrateKbps,SodaDesktopDxgi capture,string codec){
        if(codec=="h264")return CreateForDesktop(width,height,fps,bitrateKbps,capture);
        if(codec!="h264-444"&&capture!=null&&capture.HasDesktopFrame&&capture.TryEnableGpuSurfaces()){
            try{return new SodaDesktopH264(width,height,fps,bitrateKbps,capture.GpuDevice,codec);}catch{capture.DisableGpuSurfaces();}
        }
        return new SodaDesktopH264(width,height,fps,bitrateKbps,IntPtr.Zero,codec);
    }
    public SodaDesktopH264(int width,int height,int fps,int bitrateKbps):this(width,height,fps,bitrateKbps,IntPtr.Zero){}
    public SodaDesktopH264(int width,int height,int fps,int bitrateKbps,IntPtr gpuDevice):this(width,height,fps,bitrateKbps,gpuDevice,"h264"){}
    public SodaDesktopH264(int width,int height,int fps,int bitrateKbps,IntPtr gpuDevice,string codecName) {
        if(IntPtr.Size!=8 || width<2 || height<2 || width>4096 || height>2400 || (width&1)!=0 || (height&1)!=0 || (long)width*height>8000000 || fps<1 || fps>60 || bitrateKbps<128 || bitrateKbps>12000)throw new ArgumentException("Native video limits");
        if(codecName!="h264"&&codecName!="h264-444"&&codecName!="hevc"&&codecName!="av1")throw new ArgumentException("Native codec");
        if(codecName=="h264-444"&&gpuDevice!=IntPtr.Zero)throw new NotSupportedException("AYUV memory input required");
        this.codecName=codecName;encodedSubtype=codecName=="hevc"?new Guid("43564548-0000-0010-8000-00aa00389b71"):codecName=="av1"?new Guid("31305641-0000-0010-8000-00aa00389b71"):H264;
        inputSubtype=codecName=="h264-444"?new Guid("56555941-0000-0010-8000-00aa00389b71"):NV12;
        packetReader=codecName=="h264"?null:new SodaDesktopVideoBitstream(codecName=="h264-444"?"h264":codecName,codecName=="h264-444");
        this.width=width;this.height=height;this.fps=fps;this.bitrate=bitrateKbps*1000;
        this.gpuDevice=gpuDevice;if(gpuDevice!=IntPtr.Zero)Marshal.AddRef(gpuDevice);
        try { delay=new SodaDesktopVideoDelay();Initialize(); } catch {Dispose();throw;}
    }
    void Initialize() {
        Check(MFStartup(0x20070,0));started=true;
        if(gpuDevice!=IntPtr.Zero){uint token;Check(MFCreateDXGIDeviceManager(out token,out deviceManager));Check(Method<ResetDevice>(deviceManager,7)(deviceManager,gpuDevice,token));}
        IntPtr list=IntPtr.Zero;uint count=0;
        try {
            var input=new TypeInfo {major=Video,subtype=inputSubtype};var output=new TypeInfo {major=Video,subtype=encodedSubtype};
            // HARDWARE only. Never silently select the CPU Microsoft encoder.
            var category=new Guid("f79eac7d-e545-4387-bdee-d647d7bde42a");
            if(gpuDevice==IntPtr.Zero)Check(MFTEnumEx(category,0x44,ref input,ref output,out list,out count));
            else {
                // Bind enumeration to the capture adapter. A globally preferred
                // encoder on another GPU must not receive this adapter's surface.
                IntPtr dxgi=IntPtr.Zero,adapter=IntPtr.Zero,attributes=IntPtr.Zero;
                try {
                    dxgi=Query(gpuDevice,"54ec77fa-1377-44e6-8c32-88fd5f44c84c");Check(Method<GetObject>(dxgi,7)(dxgi,out adapter));AdapterDesc desc;Check(Method<GetAdapterDesc>(adapter,8)(adapter,out desc));
                    Check(MFCreateAttributes(out attributes,1));Guid key=new Guid("1d39518c-e220-4da8-a07f-ba172552d6b1");Check(Method<SetBlob>(attributes,26)(attributes,ref key,BitConverter.GetBytes(desc.luid),8));
                    Check(MFTEnum2(category,0x44,ref input,ref output,attributes,out list,out count));
                }finally{Release(ref attributes);Release(ref adapter);Release(ref dxgi);}
            }
            if(count==0 || count>64)throw new NotSupportedException("Hardware "+codecName+" unavailable");
            Exception last=null;
            for(int i=0;i<count;i++) {
                IntPtr candidate=Marshal.ReadIntPtr(list,i*IntPtr.Size);
                try { ActivateEncoder(candidate);activation=candidate;Marshal.AddRef(activation);return; }
                catch(Exception e) {last=e;ShutdownTransform();}
            }
            throw new NotSupportedException("No compatible hardware "+codecName+" encoder",last);
        } finally {if(list!=IntPtr.Zero){for(int i=0;i<count;i++){IntPtr a=Marshal.ReadIntPtr(list,i*IntPtr.Size);if(a!=IntPtr.Zero)Marshal.Release(a);}Marshal.FreeCoTaskMem(list);}}
    }
    void ActivateEncoder(IntPtr candidate) {
        Guid iid=new Guid("bf94c121-5b05-4e6f-8000-ba598961414d");Check(Method<Activate>(candidate,33)(candidate,ref iid,out transform));
        IntPtr attributes=IntPtr.Zero;
        try {
            Check(Method<GetObject>(transform,8)(transform,out attributes));U32(attributes,"e5666d6b-3422-4eb6-a421-da7db1f8e207",1);
            if(gpuDevice!=IntPtr.Zero){Guid key=new Guid("206b4fc8-fcf9-4c51-afe3-9764369e33a0");uint aware;Check(Method<Get32>(attributes,7)(attributes,ref key,out aware));if(aware!=1)throw new NotSupportedException("Encoder has no D3D11 input");}
        }
        finally {Release(ref attributes);}
        eventGenerator=Query(transform,"2cd0bd52-bcd5-4b89-b62c-eadc0c031e7d");
        if(gpuDevice!=IntPtr.Zero)Check(Method<Message>(transform,23)(transform,2,new UIntPtr(unchecked((ulong)deviceManager.ToInt64()))));
        Codec("9c27891a-ed7a-40e1-88e8-b22727a024ee",1,true);
        Codec("8d390aac-dc5c-4200-b57f-814d04babab2",0);
        Codec("95f31b26-95a4-41aa-9303-246a7fc6eef1",(uint)fps);
        IntPtr type=IntPtr.Zero;
        try {type=MediaType(encodedSubtype);U32(type,"20332624-fb0d-4d9e-bd0d-cbf6786c102e",(uint)bitrate);U32(type,"ad76a80b-2d5c-4e0b-b375-64e520137036",codecName=="hevc"?1u:codecName=="av1"?1u:codecName=="h264-444"?244u:66u);Check(Method<SetType>(transform,16)(transform,0,type,0));}
        finally {Release(ref type);}
        try {type=MediaType(inputSubtype);Check(Method<SetType>(transform,15)(transform,0,type,0));}
        finally {Release(ref type);}
        Check(Method<Message>(transform,23)(transform,0x10000000,UIntPtr.Zero));Check(Method<Message>(transform,23)(transform,0x10000003,UIntPtr.Zero));
    }
    public void ForceKeyFrame(){if(disposed)throw new ObjectDisposedException("SodaDesktopH264");Codec("398c1b98-8353-475a-9ef2-8f265d260345",1);}
    public void SetBitrate(int kbps){if(disposed)throw new ObjectDisposedException("SodaDesktopH264");if(kbps<128||kbps>12000)throw new ArgumentOutOfRangeException("kbps");Codec("f7222374-2144-4815-b550-a37f8e12ee52",(uint)kbps*1000);}
    void Codec(string key,uint value,bool boolean=false) {
        IntPtr api=IntPtr.Zero,variant=Marshal.AllocCoTaskMem(32);
        try {api=Query(transform,"901db4c7-31ce-41a2-85dc-8fa0bf41b8da");for(int i=0;i<32;i++)Marshal.WriteByte(variant,i,0);Marshal.WriteInt16(variant,boolean?(short)11:(short)19);if(boolean)Marshal.WriteInt16(variant,8,value!=0?(short)-1:(short)0);else Marshal.WriteInt32(variant,8,(int)value);Guid id=new Guid(key);Check(Method<CodecValue>(api,9)(api,ref id,variant));}
        finally {Marshal.FreeCoTaskMem(variant);Release(ref api);}
    }
    IntPtr MediaType(Guid subtype) {
        IntPtr type;Check(MFCreateMediaType(out type));
        try {
            GuidValue(type,"48eba18e-f8c9-4687-bf11-0a74c9f96a8f",Video);GuidValue(type,"f7e34c9a-42e8-4714-b74b-cb29d72c35e5",subtype);
            U64(type,"1652c33d-d6b2-4012-b834-72030849a37d",((ulong)(uint)width<<32)|(uint)height);
            U64(type,"c459a2e8-3d2c-4e44-b132-fee5156c7bb0",((ulong)(uint)fps<<32)|1);
            U64(type,"c6376a1e-8d0a-4027-be45-6d9a0ad39bb6",((ulong)1<<32)|1);U32(type,"e2724bb8-e676-4806-b4b2-a8d6efb44ccd",2);
            if(subtype==inputSubtype)U32(type,"644b4e48-1e02-4516-b0eb-c01ca9d49ac6",(uint)(FullChroma?width*4:width));
            U32(type,"3e23d450-2c75-4d25-a00e-b91670d12327",1);U32(type,"c21b8ee5-b956-4071-8daf-325edf5cab11",2);U32(type,"dbfbe4d7-0740-4ee0-8192-850ab0e21935",2);U32(type,"5fb0fce9-be5c-4935-a811-ec838f8eed93",5);return type;
        } catch {Release(ref type);throw;}
    }
    void Wait(bool output) {
        var timer=Stopwatch.StartNew();
        while((output?outputCredits:inputCredits)==0) {
            if(timer.ElapsedMilliseconds>1000)throw new System.TimeoutException("Hardware encoder stalled");
            IntPtr ev=IntPtr.Zero;int hr=Method<GetEvent>(eventGenerator,3)(eventGenerator,1,out ev);
            if(hr==unchecked((int)0xc00d3e80)){delay.Pause(1);continue;}
            Check(hr);
            try {
                uint type;int status;Check(Method<GetNumber>(ev,33)(ev,out type));Check(Method<GetStatus>(ev,35)(ev,out status));Check(status);
                if(type==601){if(++inputCredits>16)throw new InvalidOperationException("Encoder input event limit");}
                else if(type==602){if(++outputCredits>2)throw new InvalidOperationException("Encoder output event limit");}
            } finally {Release(ref ev);}
        }
    }
    public void Pause(int milliseconds){delay.Pause(milliseconds);}
    public double ConversionMs {get;private set;}
    public double EncodingMs {get;private set;}
    public Packet EncodePreparedNv12(byte[] bytes,long timestamp,double conversionMs) {
        ConversionMs=conversionMs;var timer=Stopwatch.StartNew();var packet=Encode(bytes,timestamp);EncodingMs=timer.Elapsed.TotalMilliseconds;return packet;
    }
    public Packet EncodeBitmap(Bitmap bitmap,long timestamp) {
        var timing=Stopwatch.StartNew();
        if(bitmap.Width!=width || bitmap.Height!=height)throw new ArgumentException("Video bitmap size");
        if(bgr==null){bgr=new byte[width*height*3];nv12=new byte[FullChroma?width*height*4:width*height*3/2];}
        var bits=bitmap.LockBits(new Rectangle(0,0,width,height),ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
        try {for(int y=0;y<height;y++)Marshal.Copy(IntPtr.Add(bits.Scan0,y*bits.Stride),bgr,y*width*3,width*3);}
        finally {bitmap.UnlockBits(bits);}
        if(FullChroma)ConvertAyuv(bgr,nv12,width,height);else ConvertNv12(bgr,nv12,width,height);ConversionMs=timing.Elapsed.TotalMilliseconds;timing.Restart();var packet=Encode(nv12,timestamp);EncodingMs=timing.Elapsed.TotalMilliseconds;return packet;
    }
    public static void ConvertNv12(byte[] bgr,byte[] nv12,int width,int height) {
        if(width<2||height<2||(width&1)!=0||(height&1)!=0||(long)width*height>8000000||bgr.Length!=(long)width*height*3||nv12.Length!=(long)width*height*3/2)throw new ArgumentException("NV12 dimensions");
        // Walk two contiguous rows at a time. Each 2x2 block shares chroma;
        // avoid the four inner-loop index multiplications for every block.
        int uv=width*height;
        for(int y=0;y<height;y+=2) {
        int p=y*width,a=p*3,c=a+width*3;
        for(int x=0;x<width;x+=2,p+=2,a+=6,c+=6,uv+=2) {
            int b0=bgr[a],g0=bgr[a+1],r0=bgr[a+2],b1=bgr[a+3],g1=bgr[a+4],r1=bgr[a+5];
            int b2=bgr[c],g2=bgr[c+1],r2=bgr[c+2],b3=bgr[c+3],g3=bgr[c+4],r3=bgr[c+5];
            nv12[p]=(byte)(((47*r0+157*g0+16*b0+128)>>8)+16);
            nv12[p+1]=(byte)(((47*r1+157*g1+16*b1+128)>>8)+16);
            nv12[p+width]=(byte)(((47*r2+157*g2+16*b2+128)>>8)+16);
            nv12[p+width+1]=(byte)(((47*r3+157*g3+16*b3+128)>>8)+16);
            int r=(r0+r1+r2+r3+2)/4,g=(g0+g1+g2+g3+2)/4,b=(b0+b1+b2+b3+2)/4;
            nv12[uv]=(byte)(((-26*r-86*g+112*b+128)>>8)+128);nv12[uv+1]=(byte)(((112*r-102*g-10*b+128)>>8)+128);
        }
        }
    }
    public Packet Encode(byte[] nv12,long timestamp) {
        if(disposed || gpuDevice!=IntPtr.Zero || nv12.Length!=(FullChroma?width*height*4:width*height*3/2) || timestamp<0)throw new ArgumentException("Invalid video input");
        Wait(false);IntPtr sample=IntPtr.Zero,buffer=IntPtr.Zero;
        try {
            Check(MFCreateSample(out sample));Check(MFCreateMemoryBuffer((uint)nv12.Length,out buffer));
            IntPtr data;uint max,length;Check(Method<BufferLock>(buffer,3)(buffer,out data,out max,out length));
            try {if(max<nv12.Length)throw new InvalidOperationException("Encoder input buffer limit");Marshal.Copy(nv12,0,data,nv12.Length);}
            finally {Check(Method<NoArgs>(buffer,4)(buffer));}
            Check(Method<SetLength>(buffer,6)(buffer,(uint)nv12.Length));Check(Method<AddBuffer>(sample,42)(sample,buffer));
            Check(Method<SetTime>(sample,36)(sample,checked(timestamp*10)));Check(Method<SetTime>(sample,38)(sample,10000000/fps));
            Check(Method<Input>(transform,24)(transform,0,sample,0));inputCredits--;
        } finally {Release(ref buffer);Release(ref sample);}
        return ReceiveOutput(timestamp);
    }
    // Ownership transfers to the tracked sample only after SetAllocator succeeds.
    // Neither ProcessInput success nor output delivery proves the input is free.
    public Packet EncodeGpuFrame(SodaDesktopDxgi.GpuFrame frame,long timestamp,double conversionMs) {
        if(frame==null)throw new ArgumentNullException("frame");
        IntPtr tracked=IntPtr.Zero,sample=IntPtr.Zero,buffer=IntPtr.Zero,callback=IntPtr.Zero;bool allocated=false,owned=false;
        try {
            frame.BeginEncode();owned=true;
            if(disposed||gpuDevice==IntPtr.Zero||timestamp<0)throw new ArgumentException("Invalid GPU video input");
            ConversionMs=conversionMs;var timer=Stopwatch.StartNew();Wait(false);
            Check(MFCreateTrackedSample(out tracked));sample=Query(tracked,"c40a00f2-b93a-4d80-ae8c-5a1c634f58e4");
            Guid iid=new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c");Check(MFCreateDXGISurfaceBuffer(ref iid,frame.Texture,0,false,out buffer));
            Check(Method<AddBuffer>(sample,42)(sample,buffer));
            callback=Marshal.GetComInterfaceForObject(new RetireFrame(frame),typeof(SampleCallback));
            Check(Method<SetAllocator>(tracked,3)(tracked,callback,IntPtr.Zero));allocated=true;
            Check(Method<SetTime>(sample,36)(sample,checked(timestamp*10)));Check(Method<SetTime>(sample,38)(sample,10000000/fps));
            Check(Method<Input>(transform,24)(transform,0,sample,0));inputCredits--;
            // Release our references before waiting; MF now owns its sample.
            Release(ref callback);Release(ref buffer);Release(ref sample);Release(ref tracked);
            var packet=ReceiveOutput(timestamp);EncodingMs=timer.Elapsed.TotalMilliseconds;return packet;
        } finally {Release(ref callback);Release(ref buffer);Release(ref sample);Release(ref tracked);if(owned&&!allocated)frame.Retire();}
    }
    Packet ReceiveOutput(long timestamp) {
        Wait(true);outputCredits--;
        // Some hardware encoders request initial output renegotiation after
        // consuming their first sample. Retry that output, never resubmit input.
        for(int attempt=0;attempt<4;attempt++) {
        var output=new OutputData();IntPtr allocated=IntPtr.Zero,buffer=IntPtr.Zero;bool changed=false;
        try {
            OutputInfo info;Check(Method<GetOutputInfo>(transform,7)(transform,0,out info));
            if((info.flags&0x100)==0) {
                if(info.size>512*1024)throw new InvalidOperationException("Encoder output size limit");
                Check(MFCreateSample(out allocated));Check(MFCreateMemoryBuffer(Math.Max(1,info.size),out buffer));Check(Method<AddBuffer>(allocated,42)(allocated,buffer));Release(ref buffer);output.sample=allocated;
            }
            uint status;int hr=Method<Output>(transform,25)(transform,0,1,ref output,out status);
            if(hr==unchecked((int)0xc00d6d61))changed=true;
            else {
            Check(hr);
            Check(Method<GetObject>(output.sample,41)(output.sample,out buffer));IntPtr data;uint max,length;
            Check(Method<BufferLock>(buffer,3)(buffer,out data,out max,out length));byte[] bytes;
            try {if(length==0 || length>512*1024-9 || length>max)throw new InvalidOperationException("H.264 frame limit");bytes=new byte[length];Marshal.Copy(data,bytes,0,(int)length);}
            finally {Check(Method<NoArgs>(buffer,4)(buffer));}
            var packet=ParseEncoded(bytes,timestamp);
            if(packetReader==null&&packet.key && packet.codec==null && sequenceHeader!=null) {
                if(sequenceHeader.Length+bytes.Length>512*1024-9)throw new InvalidOperationException("H.264 header limit");
                var combined=new byte[sequenceHeader.Length+bytes.Length];Buffer.BlockCopy(sequenceHeader,0,combined,0,sequenceHeader.Length);Buffer.BlockCopy(bytes,0,combined,sequenceHeader.Length,bytes.Length);packet=ParsePacket(combined,timestamp);
            }
            return packet;
            }
        } finally {Release(ref buffer);Release(ref output.events);if(output.sample==allocated)allocated=IntPtr.Zero;Release(ref output.sample);Release(ref allocated);}
        if(changed){RenegotiateOutput();Wait(true);outputCredits--;}
        }
        throw new InvalidOperationException("H.264 output format did not stabilize");
    }
    public static void ConvertAyuv(byte[] bgr,byte[] output,int width,int height){
        if(width<2||height<2||(long)width*height>8000000||bgr.Length!=(long)width*height*3||output.Length!=(long)width*height*4)throw new ArgumentException("AYUV dimensions");
        for(int i=0,j=0;i<bgr.Length;i+=3,j+=4){int b=bgr[i],g=bgr[i+1],r=bgr[i+2];output[j]=(byte)(((112*r-102*g-10*b+128)>>8)+128);output[j+1]=(byte)(((-26*r-86*g+112*b+128)>>8)+128);output[j+2]=(byte)(((47*r+157*g+16*b+128)>>8)+16);output[j+3]=255;}
    }
    Packet ParseEncoded(byte[] bytes,long timestamp){if(packetReader==null)return ParsePacket(bytes,timestamp);var value=packetReader.Normalize(bytes,sequenceHeader);return new Packet{data=value.Data,key=value.Key,codec=value.Codec,timestamp=timestamp};}
    static Packet ParsePacket(byte[] bytes,long timestamp) {
        bool key=false;string codec=null;
        for(int i=0;i+4<bytes.Length;i++)if(bytes[i]==0 && bytes[i+1]==0 && (bytes[i+2]==1 || (bytes[i+2]==0 && bytes[i+3]==1))) {
            int n=i+(bytes[i+2]==1?3:4),kind=bytes[n]&31;
            if(kind==5)key=true;if(kind==7 && n+3<bytes.Length)codec="avc1."+bytes[n+1].ToString("x2")+bytes[n+2].ToString("x2")+bytes[n+3].ToString("x2");i=n;
        }
        return new Packet {data=bytes,key=key,codec=codec,timestamp=timestamp};
    }
    void RenegotiateOutput() {
        for(uint index=0;index<16;index++) {
            IntPtr type=IntPtr.Zero;
            try {
                int hr=Method<AvailableType>(transform,14)(transform,0,index,out type);if(hr==unchecked((int)0xc00d36b9))break;Check(hr);
                Guid subtype,key=new Guid("f7e34c9a-42e8-4714-b74b-cb29d72c35e5");Check(Method<GetGuid>(type,10)(type,ref key,out subtype));if(subtype!=encodedSubtype)continue;
                ulong size;key=new Guid("1652c33d-d6b2-4012-b834-72030849a37d");hr=Method<Get64>(type,8)(type,ref key,out size);
                if(hr>=0 && (size>>32)!=(uint)width || hr>=0 && (uint)size!=(uint)height)continue;
                U64(type,"1652c33d-d6b2-4012-b834-72030849a37d",((ulong)(uint)width<<32)|(uint)height);
                U64(type,"c459a2e8-3d2c-4e44-b132-fee5156c7bb0",((ulong)(uint)fps<<32)|1);U32(type,"20332624-fb0d-4d9e-bd0d-cbf6786c102e",(uint)bitrate);
                hr=Method<SetType>(transform,16)(transform,0,type,0);if(hr<0)continue;
                IntPtr header=IntPtr.Zero;
                try {uint length;key=new Guid("3c036de7-3ad0-4c9e-9216-ee6d6ac21cb3");if(Method<GetBlob>(type,16)(type,ref key,out header,out length)>=0 && length>0 && length<=65536){sequenceHeader=new byte[length];Marshal.Copy(header,sequenceHeader,0,(int)length);}}
                finally {if(header!=IntPtr.Zero)Marshal.FreeCoTaskMem(header);}
                return;
            } finally {Release(ref type);}
        }
        throw new NotSupportedException("No compatible H.264 output format");
    }
    void ShutdownTransform() {
        if(transform!=IntPtr.Zero) {
            IntPtr shutdown=IntPtr.Zero;
            try {shutdown=Query(transform,"97ec2ea4-0e42-4937-97ac-9d6d328824e1");Method<NoArgs>(shutdown,3)(shutdown);}catch{}finally{Release(ref shutdown);}
        }
        Release(ref eventGenerator);Release(ref transform);inputCredits=outputCredits=0;
    }
    public void Dispose() {
        if(disposed)return;disposed=true;ShutdownTransform();
        if(activation!=IntPtr.Zero){try{Method<NoArgs>(activation,34)(activation);}catch{}Release(ref activation);}
        Release(ref deviceManager);Release(ref gpuDevice);
        if(started){MFShutdown();started=false;}
        if(delay!=null){delay.Dispose();delay=null;}
    }
}

// A bounded ordered window; encoded H.264 reference frames are never discarded.
public sealed class SodaDesktopVideoWindow {
    sealed class Pending {public long seq,at;}
    readonly Queue<Pending> pending=new Queue<Pending>();
    long sent,acknowledged;
    public int Capacity {get;private set;}
    public int Count {get{return pending.Count;}}
    public long OldestAt {get{return pending.Count==0?0:pending.Peek().at;}}
    public bool CanSend {get{return pending.Count<Capacity;}}
    public SodaDesktopVideoWindow(int capacity){if(capacity!=1&&capacity!=3)throw new ArgumentException("Video window limit");Capacity=capacity;}
    public void Sent(long sequence,long at){if(!CanSend||sequence!=sent+1)throw new InvalidOperationException("Video window order");pending.Enqueue(new Pending {seq=sequence,at=at});sent=sequence;}
    public void Ack(long sequence){if(sequence<=acknowledged)return;if(pending.Count==0||pending.Peek().seq!=sequence)throw new InvalidOperationException("Video ACK order");pending.Dequeue();acknowledged=sequence;}
}

// Per-encoder timer: no process/system timer-resolution setting and no spinning.
// Windows 10 1803+ supports HIGH_RESOLUTION; older systems retain Sleep fallback.
public sealed class SodaDesktopVideoDelay : IDisposable {
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern Microsoft.Win32.SafeHandles.SafeWaitHandle CreateWaitableTimerExW(IntPtr attributes,string name,uint flags,uint access);
    [DllImport("kernel32.dll",SetLastError=true)]
    [return:MarshalAs(UnmanagedType.Bool)]
    static extern bool SetWaitableTimer(Microsoft.Win32.SafeHandles.SafeWaitHandle timer,ref long dueTime,int period,IntPtr completion,IntPtr argument,bool resume);
    [DllImport("kernel32.dll",SetLastError=true)]
    static extern uint WaitForSingleObject(Microsoft.Win32.SafeHandles.SafeWaitHandle handle,uint milliseconds);
    Microsoft.Win32.SafeHandles.SafeWaitHandle timer;
    bool disposed;
    public bool HighResolution {get{return timer!=null;}}
    public SodaDesktopVideoDelay(bool precise=true) {
        if(!precise)return;
        try {
            var created=CreateWaitableTimerExW(IntPtr.Zero,null,2,0x00100002); // SYNCHRONIZE | TIMER_MODIFY_STATE
            if(created!=null&&!created.IsInvalid)timer=created;
            else if(created!=null)created.Dispose();
        } catch(EntryPointNotFoundException) {} // Optional on older Windows.
    }
    public static int FrameDelay(double now,double next,bool canSend) {
        if(!canSend)return 2;
        if(next<=now)return 0;
        return (int)Math.Min(10,Math.Ceiling(next-now));
    }
    public void Pause(int milliseconds) {
        if(disposed)throw new ObjectDisposedException("SodaDesktopVideoDelay");
        if(milliseconds<1||milliseconds>10)throw new ArgumentOutOfRangeException("milliseconds");
        if(timer!=null) {
            long due=-milliseconds*10000L; // Relative 100ns units, one shot.
            if(SetWaitableTimer(timer,ref due,0,IntPtr.Zero,IntPtr.Zero,false)&&WaitForSingleObject(timer,(uint)(milliseconds+100))==0)return;
            timer.Dispose();timer=null; // An unavailable timer must not break sharing.
        }
        Thread.Sleep(milliseconds);
    }
    public void Dispose(){if(disposed)return;disposed=true;if(timer!=null){timer.Dispose();timer=null;}}
}

// Every command shares the same gate. During native video work only input has
// an immediate path. Only bookkeeping ACK/heartbeat may be bypassed; queued
// input/control/release/stop retains its FIFO position.
public sealed class SodaDesktopCommandQueue<T> {
    readonly Queue<T> pending=new Queue<T>();
    readonly object gate=new object();
    readonly int capacity;
    readonly Func<T,bool> eligible;
    readonly Action<T> apply;
    bool fast;
    int barriers;
    readonly Func<T,bool> bypassable;
    public SodaDesktopCommandQueue(int capacity,Func<T,bool> eligible,Action<T> apply,Func<T,bool> bypassable=null) {
        if(capacity<1)throw new ArgumentOutOfRangeException("capacity");
        this.capacity=capacity;this.eligible=eligible;this.apply=apply;this.bypassable=bypassable??(command=>false);
    }
    public void EnableFast(bool enabled){lock(gate){fast=enabled;}}
    public void Synchronize(Action commit){lock(gate){try{commit();}catch{fast=false;throw;}}}
    public bool Submit(T command) {
        lock(gate) {
            if(fast&&barriers==0&&eligible(command)){try{apply(command);}catch{fast=false;throw;}return true;}
            if(pending.Count>=capacity)return false;
            pending.Enqueue(command);if(!bypassable(command))barriers++;return true;
        }
    }
    public bool ProcessOne(Action<T> dispatch) {
        lock(gate) {
            if(pending.Count==0)return false;
            var command=pending.Dequeue();if(!bypassable(command))barriers--;
            try{dispatch(command);}catch{fast=false;throw;}return true;
        }
    }
}

// Actual cursor data, independent of image cadence. No screen pixels or OS input.
public sealed class SodaDesktopCursor : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct CURSORINFO {public int size,flags;public IntPtr cursor;public Point point;}
    [StructLayout(LayoutKind.Sequential)] struct ICONINFO {public int icon;public uint x,y;public IntPtr mask,color;}
    [StructLayout(LayoutKind.Sequential)] struct BITMAP {public int type,width,height,stride;public ushort planes,bits;public IntPtr pixels;}
    [StructLayout(LayoutKind.Sequential)] struct HEADER {public uint size;public int width,height;public ushort planes,bits;public uint compression,image;public int x,y;public uint colors,important;}
    [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO cursor);
    [DllImport("user32.dll")] static extern IntPtr CopyIcon(IntPtr cursor);
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll")] static extern bool GetIconInfo(IntPtr icon,out ICONINFO info);
    [DllImport("gdi32.dll")] static extern int GetObject(IntPtr bitmap,int size,out BITMAP info);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr previous);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr bitmap);
    [DllImport("gdi32.dll")] static extern int GetDIBits(IntPtr dc,IntPtr bitmap,uint first,uint lines,byte[] pixels,ref HEADER info,uint usage);
    public sealed class Shape {
        public int Kind,Width,Height,Pitch,HotspotX,HotspotY;public bool Premultiplied;public byte[] Data;
        public void Validate(){if((Kind!=1&&Kind!=2&&Kind!=4)||Width<1||Width>256||Height<1||Height>256||HotspotX<0||HotspotX>=Width||HotspotY<0||HotspotY>=Height||Pitch<(Kind==1?(Width+7)/8:Width*4)||Pitch>2048||Data==null||Data.Length!=checked(Pitch*Height*(Kind==1?2:1))||Data.Length>512*1024)throw new InvalidOperationException("Cursor shape limit");}
        public object Info(){return new {kind=Kind,width=Width,height=Height,pitch=Pitch,hotspotX=HotspotX,hotspotY=HotspotY,premultiplied=Premultiplied};}
    }
    public sealed class State {public Shape Shape;public bool Separate;public long Version;}
    static byte[] BitmapPixels(IntPtr bitmap,out int width,out int height,out int depth) {
        BITMAP desc;if(GetObject(bitmap,Marshal.SizeOf(typeof(BITMAP)),out desc)==0)throw new InvalidOperationException("Cursor bitmap unavailable");
        depth=desc.bits;width=desc.width;height=Math.Abs(desc.height);if(width<1||width>256||height<1||height>512)throw new InvalidOperationException("Cursor bitmap limit");
        byte[] data=new byte[checked(width*height*4)];var header=new HEADER {size=40,width=width,height=-height,planes=1,bits=32};IntPtr dc=CreateCompatibleDC(IntPtr.Zero);
        if(dc==IntPtr.Zero)throw new InvalidOperationException("Cursor bitmap context unavailable");
        try{if(GetDIBits(dc,bitmap,0,(uint)height,data,ref header,0)!=height)throw new InvalidOperationException("Cursor bitmap unavailable");}finally{DeleteDC(dc);}return data;
    }
    public static Shape FromIcon(IntPtr icon) {
        ICONINFO info;if(!GetIconInfo(icon,out info))throw new InvalidOperationException("Cursor icon unavailable");
        try {
            int w=0,h=0,depth;byte[] data=null;bool alpha=false;
            if(info.color!=IntPtr.Zero){data=BitmapPixels(info.color,out w,out h,out depth);for(int p=3;p<data.Length;p+=4)if(depth==32&&data[p]!=0){alpha=true;break;}}
            if(!alpha){
                int mw,mh;byte[] mask=BitmapPixels(info.mask,out mw,out mh,out depth);
                if(info.color!=IntPtr.Zero){if(w!=mw||h!=mh)throw new InvalidOperationException("Cursor mask dimensions");}
                else {if((mh&1)!=0)throw new InvalidOperationException("Cursor mask dimensions");w=mw;h=mh/2;data=new byte[checked(w*h*4)];for(int y=0;y<h;y++)for(int x=0;x<w;x++){int p=(y*w+x)*4;byte xor=mask[((y+h)*w+x)*4];data[p]=data[p+1]=data[p+2]=xor;}}
                for(int p=0;p<data.Length;p+=4)data[p+3]=mask[p]==0?(byte)0:(byte)255;
            }
            var shape=new Shape {Kind=alpha?2:4,Width=w,Height=h,Pitch=w*4,HotspotX=(int)info.x,HotspotY=(int)info.y,Premultiplied=false,Data=data};shape.Validate();return shape;
        }finally{if(info.color!=IntPtr.Zero)DeleteObject(info.color);if(info.mask!=IntPtr.Zero)DeleteObject(info.mask);}
    }
    readonly Func<SodaDesktopDxgi> capture;readonly Func<bool> allowed;readonly Action<Dictionary<string,object>> output;readonly object outputGate;readonly Rectangle bounds;readonly bool show;
    readonly Thread thread;volatile bool stopping;public volatile bool Active=true;
    readonly Stopwatch cursorClock=Stopwatch.StartNew();long lastSent=-1000;
    long sequence,shapeId,driverVersion=-1;IntPtr lastHandle;SodaDesktopDxgi lastCapture;Shape shape;int oldX=Int32.MinValue,oldY;bool? oldVisible;long sentShape;
    public SodaDesktopCursor(Func<SodaDesktopDxgi> capture,Rectangle bounds,bool show,Func<bool> allowed,object outputGate,Action<Dictionary<string,object>> output){this.capture=capture;this.bounds=bounds;this.show=show;this.allowed=allowed;this.outputGate=outputGate;this.output=output;thread=new Thread(Run){IsBackground=true};thread.Start();}
    void Run(){try{using(var delay=new SodaDesktopVideoDelay()){while(!stopping){lock(outputGate){if(stopping||!allowed())break;Tick();}delay.Pause(8);if(!stopping)delay.Pause(8);}}}
        catch{}
        finally{Active=false;try{var dxgi=capture();if(dxgi!=null)dxgi.StopCursorTracking();}catch{}try{lock(outputGate){if(!stopping&&allowed())output(new Dictionary<string,object>{{"type","cursor"},{"seq",++sequence},{"visible",false},{"x",0},{"y",0},{"shapeId",0}});}}catch{}}}
    void Tick(){
        var info=new CURSORINFO {size=Marshal.SizeOf(typeof(CURSORINFO))};if(!GetCursorInfo(ref info))throw new InvalidOperationException("Cursor unavailable");
        var dxgi=capture();State state=dxgi==null?null:dxgi.PollCursor();
        if(dxgi!=lastCapture){lastCapture=dxgi;driverVersion=-1;lastHandle=IntPtr.Zero;shape=null;}
        bool visible=show&&(info.flags&1)!=0&&(info.flags&2)==0&&bounds.Contains(info.point)&&(state==null||state.Separate);
        if(visible){
            if(shape==null||lastHandle!=info.cursor){IntPtr copy=CopyIcon(info.cursor);if(copy==IntPtr.Zero)throw new InvalidOperationException("Cursor unavailable");try{shape=FromIcon(copy);}finally{DestroyIcon(copy);}lastHandle=info.cursor;shapeId++;}
            if(state!=null&&state.Shape!=null&&state.Version!=driverVersion){shape=state.Shape;driverVersion=state.Version;shapeId++;}
        }
        int x=visible?info.point.X-bounds.Left:0,y=visible?info.point.Y-bounds.Top:0;
        if(oldVisible==visible&&oldX==x&&oldY==y&&sentShape==shapeId&&cursorClock.ElapsedMilliseconds-lastSent<500)return;
        if(!allowed())return;
        oldVisible=visible;oldX=x;oldY=y;lastSent=cursorClock.ElapsedMilliseconds;
        var msg=new Dictionary<string,object>{{"type","cursor"},{"seq",++sequence},{"visible",visible},{"x",(double)x/bounds.Width},{"y",(double)y/bounds.Height},{"shapeId",visible?shapeId:0}};
        if(visible&&sentShape!=shapeId){msg["shape"]=shape.Info();msg["data"]=Convert.ToBase64String(shape.Data);sentShape=shapeId;}
        output(msg);
    }
    public bool Stop(int milliseconds){if(milliseconds<1||milliseconds>1000)throw new ArgumentOutOfRangeException("milliseconds");stopping=true;Active=false;return Thread.CurrentThread!=thread&&thread.Join(milliseconds);}
    public void Dispose(){if(!Stop(1000))throw new System.TimeoutException("Cursor worker did not stop");}
}

// Read-only topology plus physical-coordinate geometry. Fake driver tests never
// call Screen, enumerate native monitors, capture pixels or send input.
public sealed class SodaDesktopMonitorLayout {
    public sealed class Item {
        public readonly string Id;public readonly Rectangle Bounds;public readonly bool Primary;public readonly int? Scale;
        public Item(string id,Rectangle bounds,bool primary,int? scale=null){Id=id;Bounds=bounds;Primary=primary;Scale=scale;}
    }
    public interface IDriver {Item[] Read();}
    public sealed class NativeDriver:IDriver {
        delegate bool MonitorProc(IntPtr monitor,IntPtr dc,IntPtr rectangle,IntPtr state);
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct MonitorInfo {public int size;public RectangleNative bounds,work;public uint flags;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)]public string device;}
        [StructLayout(LayoutKind.Sequential)]struct RectangleNative {public int left,top,right,bottom;}
        [DllImport("user32.dll")]static extern bool EnumDisplayMonitors(IntPtr dc,IntPtr clip,MonitorProc callback,IntPtr state);
        [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="GetMonitorInfoW")]static extern bool GetMonitorInfo(IntPtr monitor,ref MonitorInfo info);
        [DllImport("shcore.dll")]static extern int GetScaleFactorForMonitor(IntPtr monitor,out int scale);
        public Item[] Read(){
            var monitors=new List<MonitorInfo>();var scales=new Dictionary<string,int>();
            MonitorProc read=(monitor,dc,rect,state)=>{var info=new MonitorInfo{size=Marshal.SizeOf(typeof(MonitorInfo))};if(!GetMonitorInfo(monitor,ref info))return false;monitors.Add(info);try{int scale;if(GetScaleFactorForMonitor(monitor,out scale)==0&&scale>=50&&scale<=1000)scales[info.device]=scale;}catch(EntryPointNotFoundException){}catch(DllNotFoundException){}return true;};
            if(!EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,read,IntPtr.Zero))throw new InvalidOperationException("Monitor enumeration failed");
            var result=new List<Item>();var driver=new SodaDesktopDisplay.NativeDriver(null);
            foreach(var monitor in monitors){int scale;result.Add(new Item(monitor.device,SodaDesktopDisplay.RectangleOf(driver.Current(monitor.device)),(monitor.flags&1)!=0,scales.TryGetValue(monitor.device,out scale)?(int?)scale:null));}
            return result.ToArray();
        }
    }
    public readonly Item[] Items;public readonly string Selected;public readonly Rectangle Bounds;public readonly bool AllSupported;
    static bool Valid(Rectangle bounds){return bounds.Width>0&&bounds.Height>0&&bounds.Width<=32768&&bounds.Height<=32768&&(long)bounds.Width*bounds.Height<=40000000;}
    public SodaDesktopMonitorLayout(IDriver driver,string selected){
        var items=driver.Read();if(items==null||items.Length<1||items.Length>16)throw new InvalidOperationException("Monitor count");
        var ids=new HashSet<string>();Rectangle all=items[0].Bounds;Item chosen=null;
        foreach(var item in items){if(item==null||String.IsNullOrEmpty(item.Id)||item.Id.Length>128||item.Id=="all"||!ids.Add(item.Id)||!Valid(item.Bounds)||item.Bounds.Left<-65536||item.Bounds.Left>65536||item.Bounds.Top<-65536||item.Bounds.Top>65536||item.Scale.HasValue&&(item.Scale.Value<50||item.Scale.Value>1000))throw new InvalidOperationException("Monitor layout");all=Rectangle.Union(all,item.Bounds);if(item.Id==selected)chosen=item;}
        AllSupported=Valid(all);if(selected=="all"){if(!AllSupported)throw new InvalidOperationException("Combined monitor area limit");Bounds=all;}else{if(chosen==null)throw new InvalidOperationException("Monitor not found");Bounds=chosen.Bounds;}
        Items=(Item[])items.Clone();Selected=selected;
    }
    sealed class SnapshotDriver:IDriver {readonly Item[] items;public SnapshotDriver(Item[] items){this.items=items;}public Item[] Read(){return items;}}
    public bool Matches(IDriver driver){try{return MatchesItems(driver.Read());}catch{return false;}}
    public bool MatchesItems(Item[] items){try{var other=new SodaDesktopMonitorLayout(new SnapshotDriver(items),Selected);if(other.Items.Length!=Items.Length||other.Bounds!=Bounds)return false;foreach(var item in Items){Item match=null;foreach(var next in other.Items)if(next.Id==item.Id){match=next;break;}if(match==null||match.Bounds!=item.Bounds||match.Primary!=item.Primary||match.Scale!=item.Scale)return false;}return true;}catch{return false;}}
    public bool Contains(double x,double y){if(Double.IsNaN(x)||Double.IsNaN(y)||Double.IsInfinity(x)||Double.IsInfinity(y)||x<0||x>1||y<0||y>1)return false;var point=new Point(Bounds.Left+(int)Math.Round(x*(Bounds.Width-1)),Bounds.Top+(int)Math.Round(y*(Bounds.Height-1)));foreach(var item in Items)if(item.Bounds.Contains(point))return true;return false;}
    public object Message(){var items=new List<object>();foreach(var item in Items){var value=new Dictionary<string,object>{{"id",item.Id},{"x",item.Bounds.Left},{"y",item.Bounds.Top},{"width",item.Bounds.Width},{"height",item.Bounds.Height},{"primary",item.Primary}};if(item.Scale.HasValue)value["scalePercent"]=item.Scale.Value;items.Add(value);}return new{selected=Selected,bounds=new{x=Bounds.Left,y=Bounds.Top,width=Bounds.Width,height=Bounds.Height},allSupported=AllSupported,monitors=items};}
}

// A private cadence update cannot raise the encoder's original negotiated limits.
// It changes capture scheduling, never the MF media type, clock or input grants.
public sealed class SodaDesktopVideoRate {
    readonly int maxFps,maxBitrate;
    int bitrate;
    public int Fps {get;private set;}
    public int MaximumFps {get{return maxFps;}}
    public void Adopt(int fps,int nextBitrate){Validate(fps,nextBitrate);Fps=fps;bitrate=nextBitrate;}
    public SodaDesktopVideoRate(int fps,int bitrate){if(fps<1||fps>60||bitrate<128||bitrate>12000)throw new ArgumentException("Video rate limits");maxFps=Fps=fps;maxBitrate=this.bitrate=bitrate;}
    public void Apply(int fps,int nextBitrate,Action<int> setBitrate){Validate(fps,nextBitrate);if(nextBitrate!=bitrate)setBitrate(nextBitrate);bitrate=nextBitrate;Fps=fps;}
    public void Validate(int fps,int bitrate){if(fps<1||fps>maxFps||bitrate<128||bitrate>maxBitrate)throw new ArgumentException("Video rate ceiling");}
}

// One bounded reconfiguration transaction; never an OS/display-mode operation.
public sealed class SodaDesktopVideoProfile {
    public readonly int Generation,Width,Height,Fps,Bitrate;
    public readonly long At;
    public long BaseSeq {get;private set;}
    public bool Configured {get;set;}
    public bool Prepared {get;private set;}
    public bool Resumed {get;private set;}
    SodaDesktopH264.Packet held;
    public SodaDesktopVideoProfile(int generation,int current,int width,int height,int maxWidth,int maxHeight,int fps,int bitrate,SodaDesktopVideoRate rate,long at){
        if(generation!=current+1||generation<2||width<2||height<2||width>maxWidth||height>maxHeight||(width&1)!=0||(height&1)!=0||Math.Abs((double)width/height-(double)maxWidth/maxHeight)>.02)throw new ArgumentException("Video profile limits");
        rate.Validate(fps,bitrate);Generation=generation;Width=width;Height=height;Fps=fps;Bitrate=bitrate;At=at;
    }
    public void Hold(SodaDesktopH264.Packet packet,long baseSeq){
        if(Prepared||packet==null||!packet.key||packet.codec==null||packet.data==null||packet.data.Length<1||packet.data.Length>512*1024-9)throw new InvalidOperationException("Profile requires bounded SPS/IDR");
        held=packet;BaseSeq=baseSeq;Prepared=true;
    }
    public void Resume(int generation,long baseSeq){if(!Prepared||Resumed||generation!=Generation||baseSeq!=BaseSeq)throw new InvalidOperationException("Profile resume fence");Resumed=true;}
    public SodaDesktopH264.Packet Take(){if(!Resumed||held==null)throw new InvalidOperationException("Profile not resumed");var packet=held;held=null;return packet;}
    public bool Expired(long now){return now-At>=3000;}
}
// Bounded codec-specific access units. No decoder, GPU, screen or input APIs.
public sealed class SodaDesktopVideoBitstream {
    public sealed class Unit {public byte[] Data;public string Codec;public bool Key;}
    sealed class Bits {
        readonly byte[] bytes;int position;
        public Bits(byte[] bytes){this.bytes=bytes;}
        public uint Read(int count){if(count<0||count>32||position+(long)count>bytes.Length*8L)throw new FormatException("Truncated video header");uint value=0;for(int i=0;i<count;i++,position++)value=(value<<1)|(uint)((bytes[position/8]>>(7-position%8))&1);return value;}
        public void Skip(int count){while(count>0){int n=Math.Min(32,count);Read(n);count-=n;}}
        public uint Ue(){int zero=0;while(Read(1)==0)if(++zero>30)throw new FormatException("Video header integer limit");return ((1u<<zero)-1)+Read(zero);}
    }
    readonly string family;readonly bool fullChroma;
    readonly Dictionary<int,byte[]> parameterSets=new Dictionary<int,byte[]>();
    int lengthSize=4;byte[] av1Header;bool av1Reduced;
    string codec;
    public SodaDesktopVideoBitstream(string family,bool fullChroma=false){if(family!="h264"&&family!="hevc"&&family!="av1")throw new ArgumentException("Video codec family");this.family=family;this.fullChroma=fullChroma;}
    static byte[] Slice(byte[] data,int offset,int length){if(offset<0||length<0||offset+(long)length>data.Length)throw new FormatException("Video header length");var value=new byte[length];Buffer.BlockCopy(data,offset,value,0,length);return value;}
    static byte[] Rbsp(byte[] nal,int header){var bytes=new List<byte>();int zeros=0;for(int i=header;i<nal.Length;i++){byte b=nal[i];if(zeros>=2&&b==3){if(i+1>=nal.Length||nal[i+1]>3)throw new FormatException("Invalid emulation prevention");zeros=0;continue;}bytes.Add(b);zeros=b==0?zeros+1:0;}return bytes.ToArray();}
    static int Start(byte[] data,int at){if(at+3<=data.Length&&data[at]==0&&data[at+1]==0){if(data[at+2]==1)return 3;if(at+4<=data.Length&&data[at+2]==0&&data[at+3]==1)return 4;}return 0;}
    List<byte[]> Nals(byte[] data){
        var nals=new List<byte[]>();int at=0;
        if(Start(data,0)>0){while(at<data.Length){int prefix=Start(data,at);if(prefix==0)throw new FormatException("Invalid Annex-B prefix");int begin=at+prefix,end=begin;while(end<data.Length&&Start(data,end)==0)end++;while(end>begin&&data[end-1]==0)end--;if(end<=begin)throw new FormatException("Empty video NAL");nals.Add(Slice(data,begin,end-begin));at=begin;while(at<data.Length&&Start(data,at)==0)at++;if(nals.Count>128)throw new FormatException("NAL count limit");}}
        else{while(at<data.Length){if(at+lengthSize>data.Length)throw new FormatException("Truncated NAL size");uint size=0;for(int i=0;i<lengthSize;i++)size=(size<<8)|data[at++];if(size==0||size>data.Length-at)throw new FormatException("NAL size limit");nals.Add(Slice(data,at,(int)size));at+=(int)size;if(nals.Count>128)throw new FormatException("NAL count limit");}}
        return nals;
    }
    static byte[] Annex(List<byte[]> nals){using(var output=new MemoryStream()){foreach(var nal in nals){output.Write(new byte[]{0,0,0,1},0,4);output.Write(nal,0,nal.Length);}if(output.Length>512*1024-9)throw new FormatException("Access unit limit");return output.ToArray();}}
    List<byte[]> Configuration(byte[] header){
        if(header==null||header.Length==0)return new List<byte[]>();if(header.Length>65536)throw new FormatException("Codec header limit");
        if(Start(header,0)>0)return Nals(header);
        var nals=new List<byte[]>();int at,count;
        if(family=="h264"&&header.Length>=7&&header[0]==1){lengthSize=(header[4]&3)+1;at=6;count=header[5]&31;for(int round=0;round<2;round++){for(int i=0;i<count;i++){if(at+2>header.Length)throw new FormatException("AVC config size");int size=(header[at]<<8)|header[at+1];at+=2;nals.Add(Slice(header,at,size));at+=size;}if(round==0){if(at>=header.Length)throw new FormatException("AVC config PPS");count=header[at++];}}}
        else if(family=="hevc"&&header.Length>=23&&header[0]==1){lengthSize=(header[21]&3)+1;at=23;for(int array=0;array<header[22];array++){if(at+3>header.Length)throw new FormatException("HEVC config array");at++;count=(header[at]<<8)|header[at+1];at+=2;if(count>128)throw new FormatException("HEVC config NAL count");for(int i=0;i<count;i++){if(at+2>header.Length)throw new FormatException("HEVC config size");int size=(header[at]<<8)|header[at+1];at+=2;nals.Add(Slice(header,at,size));at+=size;}}if(at!=header.Length)throw new FormatException("HEVC config trailing bytes");}
        else return Nals(header);
        return nals;
    }
    void Parameter(byte[] nal){
        int kind=family=="hevc"?(nal[0]>>1)&63:nal[0]&31;
        if(family=="hevc"?(kind<32||kind>34):(kind!=7&&kind!=8))return;
        if(nal.Length>65536)throw new FormatException("Parameter set limit");parameterSets[kind]=nal;
        if(family=="h264"&&kind==7){if(nal.Length<4)throw new FormatException("AVC SPS");var bits=new Bits(Rbsp(nal,1));uint profile=bits.Read(8);bits.Skip(16);bits.Ue();if(fullChroma&&(profile!=244||bits.Ue()!=3))throw new NotSupportedException("Encoder did not produce H264 4:4:4");if(fullChroma&&bits.Read(1)!=0)throw new NotSupportedException("Separate AVC colour planes");codec="avc1."+nal[1].ToString("x2")+nal[2].ToString("x2")+nal[3].ToString("x2");}
        if(family=="hevc"&&kind==33){var bits=new Bits(Rbsp(nal,2));bits.Skip(8);uint space=bits.Read(2),tier=bits.Read(1),profile=bits.Read(5),flags=bits.Read(32),compatibility=0;for(int i=0;i<32;i++){compatibility=(compatibility<<1)|(flags&1);flags>>=1;}var constraints=new byte[6];for(int i=0;i<6;i++)constraints[i]=(byte)bits.Read(8);uint level=bits.Read(8);int end=6;while(end>0&&constraints[end-1]==0)end--;codec="hev1."+(space==0?"":((char)('A'+space-1)).ToString())+profile+"."+compatibility.ToString("X")+"."+(tier==0?"L":"H")+level;for(int i=0;i<end;i++)codec+="."+constraints[i].ToString("X2");}
    }
    public Unit Normalize(byte[] bytes,byte[] header=null){
        if(bytes==null||bytes.Length==0||bytes.Length>512*1024-9)throw new FormatException("Access unit size");if(family=="av1")return Av1(bytes,header);
        foreach(var nal in Configuration(header))Parameter(nal);var nals=Nals(bytes);bool vcl=false,key=true;var present=new HashSet<int>();
        int pictures=0,delimiters=0;
        foreach(var nal in nals){
            if(nal.Length<(family=="hevc"?2:1)||(nal[0]&128)!=0)throw new FormatException("Invalid NAL header");
            int kind=family=="hevc"?(nal[0]>>1)&63:nal[0]&31;
            if(family=="hevc"&&(((nal[0]&1)<<5)|(nal[1]>>3))!=0)throw new NotSupportedException("Layered HEVC input");
            if(family=="hevc"&&(nal[1]&7)==0)throw new FormatException("HEVC temporal id");
            if(kind==(family=="hevc"?35:9)){if(++delimiters>1||vcl)throw new FormatException("Multiple video access units");}
            if(vcl&&(family=="hevc"?kind>=32&&kind<=34:kind==7||kind==8))throw new FormatException("Video parameter sets after picture");
            Parameter(nal);present.Add(kind);
            if(family=="hevc"?kind<=31:kind>=1&&kind<=5){
                bool first=family=="hevc"?new Bits(Rbsp(nal,2)).Read(1)!=0:new Bits(Rbsp(nal,1)).Ue()==0;
                if(first&&++pictures>1)throw new FormatException("Multiple video pictures in one unit");if(!vcl&&!first)throw new FormatException("First video slice missing");
                vcl=true;key&=family=="hevc"?kind>=16&&kind<=21:kind==5;
            }
        }
        if(!vcl)throw new FormatException("Video frame missing");if(key&&codec==null)throw new FormatException("Random-access codec header missing");
        if(key){int[] required=family=="hevc"?new[]{32,33,34}:new[]{7,8};var prefix=new List<byte[]>();foreach(int kind in required){if(!parameterSets.ContainsKey(kind))throw new FormatException("Random-access parameter set missing");if(!present.Contains(kind))prefix.Add(parameterSets[kind]);}prefix.AddRange(nals);nals=prefix;}
        return new Unit{Data=Annex(nals),Key=key,Codec=codec};
    }
    sealed class Obu {public int Type;public byte[] Data,Raw;}
    static List<Obu> Obus(byte[] data){
        var result=new List<Obu>();int at=0;
        while(at<data.Length){int begin=at;byte value=data[at++];if((value&0x81)!=0||(value&2)==0)throw new FormatException("AV1 low-overhead OBU required");int kind=(value>>3)&15;if(kind==0||kind>=9&&kind<=14)throw new FormatException("Reserved AV1 OBU");if((value&4)!=0){if(at>=data.Length||(data[at]&7)!=0)throw new FormatException("AV1 extension");at++;}
            uint size=0;bool ended=false;for(int i=0;i<4;i++){if(at>=data.Length)throw new FormatException("Truncated AV1 size");byte part=data[at++];size|=(uint)(part&127)<<(7*i);if((part&128)==0){ended=true;break;}}
            if(!ended||size>data.Length-at)throw new FormatException("AV1 OBU size limit");var payload=Slice(data,at,(int)size);at+=(int)size;result.Add(new Obu{Type=kind,Data=payload,Raw=Slice(data,begin,at-begin)});if(result.Count>128)throw new FormatException("AV1 OBU count limit");
        }
        return result;
    }
    void Av1Sequence(Obu obu){
        if(obu.Data.Length>65536)throw new FormatException("AV1 sequence limit");var bits=new Bits(obu.Data);uint profile=bits.Read(3);if(profile>2)throw new NotSupportedException("AV1 profile");bits.Skip(1);bool reduced=bits.Read(1)!=0;uint level=0,tier=0;
        if(reduced)level=bits.Read(5);
        else{
            bool model=false;int delayLength=0;
            if(bits.Read(1)!=0){bits.Skip(64);if(bits.Read(1)!=0)bits.Ue();model=bits.Read(1)!=0;if(model){delayLength=(int)bits.Read(5)+1;bits.Skip(42);}}
            bool initial=bits.Read(1)!=0;int points=(int)bits.Read(5)+1;
            for(int i=0;i<points;i++){bits.Skip(12);uint candidate=bits.Read(5),candidateTier=candidate>7?bits.Read(1):0;if(i==0){level=candidate;tier=candidateTier;}if(model&&bits.Read(1)!=0)bits.Skip(delayLength*2+1);if(initial&&bits.Read(1)!=0)bits.Skip(4);}
        }
        int widthBits=(int)bits.Read(4)+1,heightBits=(int)bits.Read(4)+1;bits.Skip(widthBits+heightBits);
        if(!reduced&&bits.Read(1)!=0)bits.Skip(7);bits.Skip(3);
        if(!reduced){bits.Skip(4);bool order=bits.Read(1)!=0;if(order)bits.Skip(2);uint screen=bits.Read(1)!=0?2:bits.Read(1);if(screen>0&&bits.Read(1)==0)bits.Skip(1);if(order)bits.Skip(3);}
        bits.Skip(3);bool high=bits.Read(1)!=0;int depth=profile==2&&high?(bits.Read(1)!=0?12:10):(high?10:8);
        codec="av01."+profile+"."+level.ToString("D2",System.Globalization.CultureInfo.InvariantCulture)+(tier==0?"M":"H")+"."+depth.ToString("D2",System.Globalization.CultureInfo.InvariantCulture);av1Reduced=reduced;av1Header=obu.Raw;
    }
    Unit Av1(byte[] data,byte[] header){
        if(header!=null&&header.Length>0){if(header.Length>65536)throw new FormatException("AV1 config limit");var config=(header[0]==0x81&&header.Length>=4)?Slice(header,4,header.Length-4):header;foreach(var obu in Obus(config))if(obu.Type==1)Av1Sequence(obu);}
        var units=Obus(data);bool present=false,key=false,frame=false;int delimiters=0;
        foreach(var obu in units){if(obu.Type==2){if(++delimiters>1||frame||obu.Data.Length!=0)throw new FormatException("AV1 temporal unit boundary");}if(obu.Type==1){Av1Sequence(obu);present=true;}if(obu.Type==3||obu.Type==6){if(frame)throw new FormatException("Multiple AV1 frames in one unit");frame=true;if(codec==null)throw new FormatException("AV1 sequence header missing");if(av1Reduced)key=true;else{var bits=new Bits(obu.Data);if(bits.Read(1)==0){uint kind=bits.Read(2),show=bits.Read(1);key=kind==0&&show==1;}}}}
        if(!frame)throw new FormatException("AV1 frame missing");
        if(key&&!present){if(av1Header==null)throw new FormatException("AV1 random-access header missing");int insert=units.Count>0&&units[0].Type==2?1:0;units.Insert(insert,new Obu{Type=1,Raw=av1Header});}
        using(var output=new MemoryStream()){foreach(var obu in units)output.Write(obu.Raw,0,obu.Raw.Length);if(output.Length>512*1024-9)throw new FormatException("AV1 access unit limit");return new Unit{Data=output.ToArray(),Codec=codec,Key=key};}
    }
}
