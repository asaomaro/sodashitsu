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
        try {
            var ready=new Dictionary<string,object>{{"type","ready"},{"title",Environment.MachineName+" / "+Environment.UserName+" / "+screen.DeviceName},{"allowInput",allow},{"width",Bounds.Width},{"height",Bounds.Height},{"backend","windows-gdi"},{"image",new {colorMode,showCursor}},{"allowClipboard",clipboardCeiling},{"dynamicQuality",true}};
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
                long sequence=0,pending=0,next=0,inputSeq=0,lastFull=-30000,lastReport=-1000;
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
                        else if(type=="keyframe"){forceFull=true;next=0;}
                        else if(type=="policy") {
                            int rate=Num(msg,"fps"),q=Num(msg,"quality");if(rate<1||rate>maxFps||q<20||q>maxQuality)throw new InvalidOperationException("Policy limit");
                            fps=rate;quality=q;args.Param[0].Dispose();args.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,(long)q);next=0;
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
                        else if(type=="release") { lock(Gate){bool keep=Control;Release();Control=keep;} }
                        else if(type=="control") { Release();lock(Gate){Control=allow && (bool)msg["enabled"];} }
                        else if(type=="ack") { if(Convert.ToInt64(msg["seq"])!=pending)throw new InvalidOperationException();pending=0; }
                        else if(type=="input") {
                            long id=Convert.ToInt64(msg["seq"]),expires=Convert.ToInt64(msg["expiresAt"]);
                            if(Control && id>inputSeq && expires>=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() && expires<=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()+1500) { inputSeq=id;if(Apply(Obj(msg["input"])))Output(new { type="input_ack",seq=id }); }
                        } else if(type=="stop") { Stopping=true;break; }
                        else throw new InvalidOperationException();
                    }
                    if(form!=null)form.Text="Sodashitsu - "+(Control?"CONTROL":"VIEW ONLY")+" - "+screen.DeviceName;
                    long now=Clock.ElapsedMilliseconds;
                    if(!Stopping && pending==0 && now>=next) {
                        long frameStarted=Clock.ElapsedMilliseconds;var t=Stopwatch.StartNew();CaptureScaled(resize,w,h);
                        // PoC cursor: standard arrow at the Windows cursor position; shape is not captured.
                        Point cursor=Cursor.Position;
                        if(showCursor && Bounds.Contains(cursor)) { int cx=(int)((cursor.X-Bounds.Left)*(double)w/Bounds.Width),cy=(int)((cursor.Y-Bounds.Top)*(double)h/Bounds.Height);Cursors.Default.Draw(resize,new Rectangle(cx,cy,16,24)); }
                        var rects=new List<Rectangle>();
                        bool changed=true;
                        if(deltas || colorMode!="full")ReadPixels(scaled,current,colorMode);
                        if(deltas){rects=DirtyTiles(current,previous,w,h,initialized);changed=rects.Count>0;if(changed)contentId=BitConverter.ToString(sha.ComputeHash(current)).Replace("-","").ToLowerInvariant();}
                        double capture=t.Elapsed.TotalMilliseconds;t.Restart();
                        bool full=!deltas || forceFull || frameStarted-lastFull>=30000;
                        long area=0;foreach(var r in rects)area+=(long)r.Width*r.Height;
                        if(changed && (rects.Count>8 || area>=(long)w*h*3/5))full=true;
                        bool report=changed || full || frameStarted-lastReport>=1000;
                        if(report)using(var stream=new MemoryStream()) {
                            object update=null;string format="image/jpeg";
                            if(full){scaled.Save(stream,jpeg,args);lastFull=frameStarted;forceFull=false;}
                            else if(changed) {
                                format="image/png";var patches=new List<object>();
                                foreach(var r in rects)using(var patch=scaled.Clone(r,PixelFormat.Format24bppRgb)) {
                                    int offset=(int)stream.Length;using(var encoded=new MemoryStream()){patch.Save(encoded,ImageFormat.Png);encoded.WriteTo(stream);patches.Add(new {x=r.X,y=r.Y,width=r.Width,height=r.Height,offset,length=(int)encoded.Length});}
                                }
                                update=new {kind="patch",baseSeq=sequence,patches};
                                if(stream.Length>2*1024*1024){stream.SetLength(0);stream.Position=0;scaled.Save(stream,jpeg,args);format="image/jpeg";update=null;lastFull=frameStarted;}
                            } else update=new {kind="unchanged",baseSeq=sequence};
                            byte[] image=stream.ToArray();if(image.Length>2*1024*1024)throw new InvalidOperationException("Frame limit");
                            double encode=t.Elapsed.TotalMilliseconds;
                            if(!AllowedDesktop())break;
                            var info=new Dictionary<string,object>{{"seq",++sequence},{"width",w},{"height",h},{"format",format},{"captureMs",capture},{"encodeMs",encode}};
                            if(deltas)info["contentId"]=contentId;
                            if(update!=null)info["update"]=update;
                            using(var process=Process.GetCurrentProcess()){info["sourceCpuMs"]=process.TotalProcessorTime.TotalMilliseconds;info["sourceMemoryBytes"]=process.WorkingSet64;}
                            pending=sequence;Output(new {type="frame",info,data=Convert.ToBase64String(image)});lastReport=frameStarted;
                            if(deltas){var swap=previous;previous=current;current=swap;initialized=true;}
                        }
                        next=frameStarted+Math.Max(1,1000/fps);
                    }
                    Thread.Sleep(2);
                }
                }
            }
        } finally { Stopping=true;watchdog.Dispose();Release();if(form!=null)form.Dispose(); }
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
