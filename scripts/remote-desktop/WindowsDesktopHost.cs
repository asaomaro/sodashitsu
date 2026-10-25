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
    static readonly object Gate=new object();
    static readonly HashSet<ushort> Keys=new HashSet<ushort>();
    static readonly HashSet<int> Buttons=new HashSet<int>();
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer { MaxJsonLength=3*1024*1024 };
    static readonly Stopwatch Clock=Stopwatch.StartNew();
    static volatile bool Stopping=false;
    static bool Control=false;
    static long LastHeartbeat=0;
    static Rectangle Bounds;

    static void Output(object value) { Console.Out.WriteLine(Json.Serialize(value)); Console.Out.Flush(); }
    static Dictionary<string,object> Obj(object value) { return (Dictionary<string,object>)value; }
    static int Num(Dictionary<string,object> value,string key) { return Convert.ToInt32(value[key]); }
    static bool Secure;
    static Func<int> SecureLockState;
    static Func<bool> SecureGuard;
    static bool AllowedDesktop() { return Secure ? SecureGuard!=null && SecureGuard() : DefaultDesktop(); }
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
    static void Emit(INPUT value) { if(Secure && !AllowedDesktop())throw new InvalidOperationException("Secure desktop ended");if(SendInput(1,new INPUT[]{value},Marshal.SizeOf(typeof(INPUT)))!=1) throw new InvalidOperationException("Input denied"); }
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
                // Read the same native pixel coordinate space used by capture.
                // WinForms virtual bounds can be DPI-virtualized by the host.
                var devices=new List<string>();foreach(var screen in Screen.AllScreens)devices.Add(screen.DeviceName);
                Rectangle all=SodaDesktopDisplay.VirtualRectangle(new SodaDesktopDisplay.NativeDriver(null),devices);
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
    }
    static SodaDesktopDisplay.Lease DisplayLease;
    public static void Run(int monitorIndex,bool locallyAllowInput,bool locallyAllowClipboard=false,bool locallyAllowDisplayResize=false,string sourcePath=null,Func<int> lockState=null) {
        try { RunCore(monitorIndex,locallyAllowInput,locallyAllowClipboard,locallyAllowDisplayResize,sourcePath); }
        finally { if(DisplayLease!=null){try{DisplayLease.Dispose();}catch{Console.Error.WriteLine("Display restore failed; restore resolution locally in Windows Settings.");}DisplayLease=null;}
            if(!Secure && lockState!=null && lockState()==0)Output(new {type="session_locked"});
        }
    }
    static void RunCore(int monitorIndex,bool locallyAllowInput,bool locallyAllowClipboard,bool locallyAllowDisplayResize,string sourcePath) {
        if(!Secure && !Environment.UserInteractive)throw new InvalidOperationException("Interactive Windows session required");
        SetProcessDPIAware();
        var screens=Screen.AllScreens;
        if(monitorIndex<0 || monitorIndex>=screens.Length)throw new InvalidOperationException("Monitor not found");
        var screen=screens[monitorIndex];
        if(!Secure)SodaDesktopDisplay.WaitForPrevious(screen.DeviceName);
        Bounds=SodaDesktopDisplay.RectangleOf(new SodaDesktopDisplay.NativeDriver(null).Current(screen.DeviceName));
        if(!AllowedDesktop() || Bounds.Width<1 || Bounds.Height<1 || (long)Bounds.Width*Bounds.Height>40000000)throw new InvalidOperationException("Desktop unavailable");
        string first=ReadBoundedLine();if(first==null || first.Length>65536)return;
        var config=Obj(Json.DeserializeObject(first));if((string)config["type"]!="configure")throw new InvalidOperationException();
        var options=Obj(config["options"]);int maxWidth=Num(options,"width"),fps=Num(options,"fps"),quality=Num(options,"quality");
        if(maxWidth<320||maxWidth>1920||fps<1||fps>30||quality<20||quality>90)throw new InvalidOperationException();
        int maxFps=fps,maxQuality=quality;
        bool clipboardCeiling=!Secure && locallyAllowClipboard && config.ContainsKey("allowClipboard") && (bool)config["allowClipboard"];
        bool clipboardAllowed=false;long clipboardGeneration=0;
        bool allow=locallyAllowInput && (bool)config["allowInput"];
        bool deltas=options.ContainsKey("deltas") && (bool)options["deltas"];
        string colorMode="full";bool showCursor=true;
        if(options.ContainsKey("image")){var image=Obj(options["image"]);colorMode=(string)image["colorMode"];showCursor=(bool)image["showCursor"];}
        if(colorMode!="full"&&colorMode!="rgb565"&&colorMode!="rgb332"&&colorMode!="gray16")throw new InvalidOperationException("Invalid color mode");
        bool displayCeiling=!Secure && screens.Length==1 && locallyAllowDisplayResize && config.ContainsKey("allowDisplayResize") && (bool)config["allowDisplayResize"];
        var displayModes=displayCeiling?new SodaDesktopDisplay.NativeDriver(sourcePath).Modes(screen.DeviceName):new List<SodaDesktopDisplay.Mode>();
        if(!Secure && options.ContainsKey("display")) {
            if(!displayCeiling)throw new InvalidOperationException("Display resize not permitted");
            var requested=Obj(options["display"]);
            DisplayLease=new SodaDesktopDisplay.Lease(new SodaDesktopDisplay.NativeDriver(sourcePath),screen.DeviceName,Num(requested,"width"),Num(requested,"height"));
            Bounds=DisplayLease.Bounds;maxWidth=Bounds.Width;
        }
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
        // Only new providers opt in. Old providers/helpers keep their existing wire contract.
        if(!Secure && Environment.GetEnvironmentVariable("SODA_DESKTOP_CAPTURE")!="gdi" && config.ContainsKey("captureBackends")) {
            var backends=config["captureBackends"] as object[];
            if(backends!=null && Array.IndexOf(backends,"dxgi")>=0)dxgi=SodaDesktopDxgi.TryCreate(screen.DeviceName,Bounds,w,h);
        }
        try {
            var ready=new Dictionary<string,object>{{"type","ready"},{"title",Environment.MachineName+" / "+Environment.UserName+" / "+screen.DeviceName},{"allowInput",allow},{"width",Bounds.Width},{"height",Bounds.Height},{"backend",dxgi!=null?"windows-dxgi":"windows-gdi"},{"image",new {colorMode,showCursor}},{"allowClipboard",clipboardCeiling},{"dynamicQuality",true}};
            if(options.ContainsKey("imeKeys") && options["imeKeys"] is bool && (bool)options["imeKeys"])ready["imeKeys"]=true;
            if(options.ContainsKey("extendedInput") && options["extendedInput"] is bool && (bool)options["extendedInput"])ready["extendedInput"]=true;
            if(Secure)ready["secureDesktop"]=true;
            if(displayModes.Count>0)ready["display"]=new {modes=displayModes.ConvertAll(m=>new {width=m.Width,height=m.Height})};
            Output(ready);
            var jpeg=Array.Find(ImageCodecInfo.GetImageEncoders(),c=>c.MimeType=="image/jpeg");
            using(var args=new EncoderParameters(1))
            using(var scaled=new Bitmap(w,h,PixelFormat.Format24bppRgb))
            using(var resize=Graphics.FromImage(scaled)) {
                args.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,(long)quality);
                resize.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;
                // Console.In.ReadLineAsync is synchronous on .NET Framework's SyncTextReader.
                // Keep all stdin waits off the capture/UI loop and bound the queued commands.
                var lines=new BlockingCollection<string>(64);
                var reader=new Thread(()=>{
                    try { while(!Stopping) { string data=ReadBoundedLine();if(data==null || !lines.TryAdd(data)){Stopping=true;break;} } }
                    catch { Stopping=true; }
                    finally { Release(); }
                });
                reader.IsBackground=true;reader.Start();
                long sequence=0,pending=0,inputSeq=0,lastFull=-30000,lastReport=-1000;
                var preparation=new SodaDesktopFramePreparation<PreparedFrame>(!Secure);
                bool forceFull=true,initialized=false;string contentId=null;
                byte[] current=deltas || colorMode!="full"?new byte[w*h*3]:null,previous=deltas?new byte[w*h*3]:null;
                using(var sha=SHA256.Create()) {
                while(!Stopping) {
                    if(!Secure)Application.DoEvents();
                    if(!AllowedDesktop() || !SodaDesktopDisplay.Matches(screen.DeviceName,Bounds))break;
                    int handled=0;string data;
                    while(!Stopping && handled++<64 && lines.TryTake(out data)) {
                        var msg=Obj(Json.DeserializeObject(data));string type=(string)msg["type"];
                        if(type=="heartbeat")Interlocked.Exchange(ref LastHeartbeat,Clock.ElapsedMilliseconds);
                        else if(type=="sas" && Secure && Control && AllowedDesktop()) { Output(new {type="sas_request"}); }
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
                            long id=Convert.ToInt64(msg["seq"]),expires=Convert.ToInt64(msg["expiresAt"]);
                            if(Control && id>inputSeq && expires>=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() && expires<=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+1500) { inputSeq=id;if(Apply(Obj(msg["input"]))){preparation.Invalidate(false);Output(new { type="input_ack",seq=id });} }
                        } else if(type=="stop") { Stopping=true;break; }
                        else throw new InvalidOperationException();
                    }
                    if(form!=null)form.Text="Sodashitsu - "+(Control?"CONTROL":"VIEW ONLY")+" - "+screen.DeviceName;
                    long now=Clock.ElapsedMilliseconds;
                    if(!Stopping && preparation.CanPrepare(now,pending)) {
                        long frameStarted=Clock.ElapsedMilliseconds;var t=Stopwatch.StartNew();if(dxgi!=null) {
                            try { if(!dxgi.Capture(resize))CaptureScaled(resize,w,h); }
                            catch { dxgi.Dispose();dxgi=null;CaptureScaled(resize,w,h); }
                        } else CaptureScaled(resize,w,h);
                        // PoC cursor: standard arrow at the Windows cursor position; shape is not captured.
                        Point cursor=Cursor.Position;
                        if(showCursor && Bounds.Contains(cursor)) { int cx=(int)((cursor.X-Bounds.Left)*(double)w/Bounds.Width),cy=(int)((cursor.Y-Bounds.Top)*(double)h/Bounds.Height);Cursors.Default.Draw(resize,new Rectangle(cx,cy,16,24)); }
                        var rects=new List<Rectangle>();
                        bool changed=true;string capturedId=contentId;
                        var prepared=new PreparedFrame {started=frameStarted};
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
                            if(!AllowedDesktop())break;
                            var info=new Dictionary<string,object>{{"seq",sequence+1},{"width",w},{"height",h},{"format",format},{"captureMs",capture},{"encodeMs",encode}};
                            if(deltas)info["contentId"]=capturedId;
                            if(update!=null)info["update"]=update;
                            using(var process=Process.GetCurrentProcess()){info["sourceCpuMs"]=process.TotalProcessorTime.TotalMilliseconds;info["sourceMemoryBytes"]=process.WorkingSet64;}
                            prepared.info=info;prepared.image=image;prepared.full=full;prepared.contentId=capturedId;
                        }
                        preparation.Set(prepared,frameStarted,Clock.ElapsedMilliseconds,fps);
                    }
                    var outgoing=preparation.Take(pending,Clock.ElapsedMilliseconds,fps);
                    if(!Stopping&&outgoing!=null&&outgoing.info!=null) {
                        if(!AllowedDesktop())break;
                        sequence++;pending=sequence;
                        Output(new {type="frame",info=outgoing.info,data=Convert.ToBase64String(outgoing.image)});
                        lastReport=outgoing.started;contentId=outgoing.contentId;
                        if(outgoing.full){lastFull=outgoing.started;forceFull=false;}
                        if(deltas){var swap=previous;previous=current;current=swap;initialized=true;}
                    }
                    Thread.Sleep(2);
                }
                }
            }
        } finally { Stopping=true;watchdog.Dispose();Release();if(dxgi!=null)dxgi.Dispose();if(form!=null)form.Dispose(); }
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
    public bool CanPrepare(long now,long pending=0){return prepared==null&&now>=Next&&(overlap||pending==0);}
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
    Bitmap bitmap;
    byte[] row;
    bool hasFrame,disposed;
    readonly int width,height;
    SodaDesktopDxgi(int width,int height) { this.width=width;this.height=height; }
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
    IntPtr Texture(int w,int h,uint usage,uint bind,uint cpu) {
        var desc=new TextureDesc {width=(uint)w,height=(uint)h,mips=1,array=1,format=87,samples=1,usage=usage,bind=bind,cpu=cpu};
        IntPtr value;Check(Method<CreateTexture>(device,5)(device,ref desc,IntPtr.Zero,out value));return value;
    }
    IntPtr Shader(string hlsl,string profile,int slot) {
        IntPtr code=IntPtr.Zero,errors=IntPtr.Zero;
        try {
            byte[] bytes=Encoding.ASCII.GetBytes(hlsl);Check(D3DCompile(bytes,(UIntPtr)bytes.Length,null,IntPtr.Zero,IntPtr.Zero,"main",profile,0,0,out code,out errors));
            IntPtr shader;Check(Method<CreateShader>(device,slot)(device,Method<BlobPointer>(code,3)(code),Method<BlobSize>(code,4)(code),IntPtr.Zero,out shader));return shader;
        } finally { Release(ref errors);Release(ref code); }
    }
    public bool Capture(Graphics destination) {
        if(disposed)throw new ObjectDisposedException("SodaDesktopDxgi");
        IntPtr resource=IntPtr.Zero,texture=IntPtr.Zero;FrameInfo info;
        int hr=Method<Acquire>(duplication,8)(duplication,hasFrame?0u:16u,out info,out resource);
        if(hr==unchecked((int)0x887a0027)) { if(!hasFrame)return false; }
        else {
            Check(hr);
            try {
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
        Render(destination);return true;
    }
    void Render(Graphics destination) {
        // All scaling occurs before CPU readback. A retained GPU source handles
        // idle/timeouts without reusing a bitmap containing the painted cursor.
        Method<SetShader>(context,11)(context,vertex,IntPtr.Zero,0);
        Method<SetShader>(context,9)(context,pixel,IntPtr.Zero,0);
        Method<SetArray>(context,8)(context,0,1,new[]{sourceView});
        Method<SetArray>(context,10)(context,0,1,new[]{sampler});
        Method<SetTopology>(context,24)(context,4);
        Method<SetTargets>(context,33)(context,1,new[]{targetView},IntPtr.Zero);
        var viewport=new Viewport {width=width,height=height,max=1};Method<SetViewport>(context,44)(context,1,ref viewport);
        Method<Draw>(context,13)(context,3,0);
        Method<SetTargets>(context,33)(context,0,new IntPtr[0],IntPtr.Zero);
        Method<Copy>(context,47)(context,staging,target);
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
    public void Dispose() {
        if(disposed)return;disposed=true;
        if(bitmap!=null){bitmap.Dispose();bitmap=null;}
        Release(ref sampler);Release(ref pixel);Release(ref vertex);Release(ref staging);Release(ref targetView);Release(ref target);Release(ref sourceView);Release(ref source);Release(ref duplication);Release(ref context);Release(ref device);
    }
}
