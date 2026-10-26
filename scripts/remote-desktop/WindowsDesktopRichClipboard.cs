// Optional normal-desktop clipboard module. No capture/input or clipboard access
// until an explicit, current-generation command is accepted by its STA worker.
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class SodaDesktopRichClipboard : IDisposable {
    public const int ChunkBytes=16384,BundleBytes=4194304,MarkupBytes=524288,TextBytes=524288,PngBytes=2097152;
    public interface IBoard : IDisposable {long Sequence{get;}Dictionary<string,object> Read(Func<bool> valid);void Write(Dictionary<string,object> value,long expectedSequence,Func<bool> valid);}
    readonly BlockingCollection<Dictionary<string,object>> queue=new BlockingCollection<Dictionary<string,object>>(1);
    readonly Action<object> output;readonly Func<bool> allowed,canWrite;readonly Func<long> generation,clock;readonly Func<IBoard> factory;
    readonly Thread thread;volatile bool stopping;
    sealed class Cancellation {public readonly string Id;public volatile bool Cancelled;public Cancellation(string id,bool cancelled){Id=id;Cancelled=cancelled;}}
    readonly object cancellationGate=new object();readonly HashSet<string> cancelledIds=new HashSet<string>();readonly Queue<string> cancellationOrder=new Queue<string>();volatile Cancellation cancellation;
    byte[] bytes;int offset;string id;long ownGeneration,started,last,sequence;bool reading;
    static readonly Encoding Utf8=new UTF8Encoding(false,true);
    static JavaScriptSerializer Serializer(){return new JavaScriptSerializer{MaxJsonLength=BundleBytes,RecursionLimit=16};}
    public SodaDesktopRichClipboard(Action<object> output,Func<bool> allowed,Func<long> generation,Func<long> clock,Func<bool> canWrite):this(output,allowed,generation,clock,canWrite,()=>new WindowsBoard()){}
    public SodaDesktopRichClipboard(Action<object> output,Func<bool> allowed,Func<long> generation,Func<long> clock,Func<bool> canWrite,Func<IBoard> factory){
        if(output==null||allowed==null||generation==null||clock==null||canWrite==null||factory==null)throw new ArgumentNullException();
        this.output=output;this.allowed=allowed;this.generation=generation;this.clock=clock;this.canWrite=canWrite;this.factory=factory;
        thread=new Thread(Loop){IsBackground=true};thread.SetApartmentState(ApartmentState.STA);thread.Start();
    }
    public void Submit(object raw){var m=raw as Dictionary<string,object>;if(m==null)throw new ArgumentException("Clipboard command");if(!stopping&&m.ContainsKey("type")&&m["type"]as string=="clipboard_rich"&&m.ContainsKey("operation")&&m["operation"]as string=="cancel"&&m.ContainsKey("id")&&m["id"]is string&&m.ContainsKey("generation")&&m.ContainsKey("expiresAt")&&Convert.ToInt64(m["generation"])==generation()&&Convert.ToInt64(m["expiresAt"])>=clock()&&Convert.ToInt64(m["expiresAt"])<=clock()+1500){lock(cancellationGate){string cancelled=(string)m["id"];if(cancelledIds.Add(cancelled)){cancellationOrder.Enqueue(cancelled);if(cancellationOrder.Count>32)cancelledIds.Remove(cancellationOrder.Dequeue());}var active=cancellation;if(active!=null&&active.Id==cancelled)active.Cancelled=true;}}
        if(stopping||!queue.TryAdd(m))throw new InvalidOperationException("Clipboard queue limit");}
    public bool Stop(int milliseconds){stopping=true;try{queue.CompleteAdding();}catch(ObjectDisposedException){}return thread.Join(milliseconds);}
    public void Dispose(){if(!Stop(1000))throw new System.TimeoutException("Clipboard worker did not stop");}
    void Reply(object value){if(stopping)return;try{output(value);}catch{stopping=true;}}
    void Clear(){if(bytes!=null)Array.Clear(bytes,0,bytes.Length);bytes=null;offset=0;id=null;cancellation=null;}
    void Loop(){IBoard board=null;try{while(!stopping){Dictionary<string,object> m;if(!queue.TryTake(out m,50)){if(id!=null&&(!Live()||clock()-last>5000||clock()-started>60000))Clear();continue;}try{Handle(m,ref board);}catch{string failed=m.ContainsKey("id")?m["id"] as string:null;if(failed==id)Clear();Guid parsed;if(failed!=null&&Guid.TryParse(failed,out parsed))Reply(new{type="clipboard_rich_result",id=failed,ok=false,stage="done"});}}}finally{Clear();if(board!=null)board.Dispose();queue.Dispose();}}
    bool Live(){return !stopping&&allowed()&&generation()==ownGeneration&&cancellation!=null&&!cancellation.Cancelled&&(reading||canWrite());}
    static int Integer(Dictionary<string,object> m,string name){return Convert.ToInt32(m[name]);}
    static void Exact(Dictionary<string,object> m,params string[] expected){var keys=new HashSet<string>(expected);foreach(var key in m.Keys)if(!keys.Remove(key))throw new InvalidDataException("Clipboard keys");if(keys.Count!=0)throw new InvalidDataException("Clipboard keys");}
    void Handle(Dictionary<string,object> m,ref IBoard board){
        if((string)m["type"]!="clipboard_rich")throw new InvalidDataException("Clipboard type");
        string op=(string)m["operation"],request=(string)m["id"];Guid parsed;if(!Guid.TryParseExact(request,"D",out parsed))throw new InvalidDataException("Clipboard id");
        long now=clock(),expires=Convert.ToInt64(m["expiresAt"]),gen=Convert.ToInt64(m["generation"]);
        if(stopping||!allowed()||generation()!=gen||expires<now||expires>now+1500)throw new InvalidOperationException("Clipboard permission expired");
        if(op=="read"||op=="begin"){
            if(id!=null)throw new InvalidOperationException("Clipboard transaction already active");
            if(op=="read")Exact(m,"type","id","operation","generation","expiresAt");else Exact(m,"type","id","operation","generation","expiresAt","size");
            ownGeneration=gen;id=request;lock(cancellationGate)cancellation=new Cancellation(request,cancelledIds.Contains(request));started=last=now;reading=op=="read";
            if(!Live())throw new InvalidOperationException("Clipboard retired");
            if(board==null)board=factory();sequence=board.Sequence;
            if(reading){var value=board.Read(()=>Live()&&clock()<=expires);Validate(value);bytes=Utf8.GetBytes(Serializer().Serialize(value));if(bytes.Length<1||bytes.Length>BundleBytes)throw new InvalidDataException("Clipboard bundle limit");}
            else{int size=Integer(m,"size");if(size<1||size>BundleBytes)throw new InvalidDataException("Clipboard bundle limit");bytes=new byte[size];}
            if(!Live())throw new InvalidOperationException("Clipboard retired");Reply(new{type="clipboard_rich_result",id,ok=true,stage="begin",size=bytes.Length});return;
        }
        if(op=="cancel"){Exact(m,"type","id","operation","generation","expiresAt");if(id==request)Clear();Reply(new{type="clipboard_rich_result",id=request,ok=true,stage="cancelled"});return;}
        if(id!=request||!Live()||now-last>5000||now-started>60000)throw new InvalidOperationException("Clipboard transaction expired");last=now;
        if(op=="pull"){
            Exact(m,"type","id","operation","generation","expiresAt","offset");if(!reading||Integer(m,"offset")!=offset||offset>=bytes.Length)throw new InvalidDataException("Clipboard offset");
            int count=Math.Min(ChunkBytes,bytes.Length-offset);string data=Convert.ToBase64String(bytes,offset,count);offset+=count;Reply(new{type="clipboard_rich_result",id,ok=true,stage="chunk",offset,data});if(offset==bytes.Length)Clear();return;
        }
        if(op=="push"){
            Exact(m,"type","id","operation","generation","expiresAt","offset","data");if(reading||Integer(m,"offset")!=offset)throw new InvalidDataException("Clipboard offset");string data=(string)m["data"];if(data.Length<4||data.Length>21848)throw new InvalidDataException("Clipboard chunk limit");var chunk=Convert.FromBase64String(data);try{if(chunk.Length<1||chunk.Length>ChunkBytes||offset+chunk.Length>bytes.Length||Convert.ToBase64String(chunk)!=data)throw new InvalidDataException("Clipboard chunk limit");Buffer.BlockCopy(chunk,0,bytes,offset,chunk.Length);offset+=chunk.Length;}finally{Array.Clear(chunk,0,chunk.Length);}Reply(new{type="clipboard_rich_result",id,ok=true,stage="chunk",offset});return;
        }
        if(op=="commit"){
            Exact(m,"type","id","operation","generation","expiresAt");if(reading||offset!=bytes.Length)throw new InvalidDataException("Clipboard incomplete");var value=Serializer().DeserializeObject(Utf8.GetString(bytes))as Dictionary<string,object>;Validate(value);
            if(!Live()||clock()>expires)throw new InvalidOperationException("Clipboard retired");board.Write(value,sequence,()=>Live()&&clock()<=expires);Clear();Reply(new{type="clipboard_rich_result",id=request,ok=true,stage="done"});return;
        }
        if(op=="cancel"){Exact(m,"type","id","operation","generation","expiresAt");Clear();Reply(new{type="clipboard_rich_result",id=request,ok=true,stage="cancelled"});return;}
        throw new InvalidDataException("Clipboard operation");
    }
    public static void Validate(Dictionary<string,object> value){
        if(value==null||value.Count==0||value.Count>4)throw new InvalidDataException("Clipboard formats");
        foreach(var item in value){string text=item.Value as string;if(text==null||text.IndexOf('\0')>=0)throw new InvalidDataException("Clipboard value");
            if(item.Key=="text"){if(text.Length>TextBytes||Utf8.GetByteCount(text)>TextBytes)throw new InvalidDataException("Clipboard text limit");}
            else if(item.Key=="html"){if(Utf8.GetByteCount(text)>MarkupBytes)throw new InvalidDataException("Clipboard markup limit");}
            else if(item.Key=="rtf"){if(text.Length>699052)throw new InvalidDataException("Clipboard RTF limit");var rtf=Convert.FromBase64String(text);try{if(rtf.Length<5||rtf.Length>MarkupBytes||Encoding.ASCII.GetString(rtf,0,5)!="{\\rtf"||!RtfEnds(rtf)||Convert.ToBase64String(rtf)!=text)throw new InvalidDataException("Clipboard RTF format");}finally{Array.Clear(rtf,0,rtf.Length);}}
            else if(item.Key=="png"){if(text.Length<44||text.Length>2796204)throw new InvalidDataException("Clipboard PNG limit");var png=Convert.FromBase64String(text);try{PngSize(png);if(Convert.ToBase64String(png)!=text)throw new InvalidDataException("Clipboard PNG encoding");}finally{Array.Clear(png,0,png.Length);}}
            else throw new InvalidDataException("Clipboard format");
        }
    }
    public static void ValidateCommit(Func<bool> valid,long expectedSequence,long currentSequence){if(!valid())throw new InvalidOperationException("Clipboard retired before native commit");if(expectedSequence!=currentSequence)throw new InvalidOperationException("Clipboard changed locally");}
    static uint Big(byte[] data,int offset){return ((uint)data[offset]<<24)|((uint)data[offset+1]<<16)|((uint)data[offset+2]<<8)|data[offset+3];}
    public static Size PngSize(byte[] png){byte[] sig={137,80,78,71,13,10,26,10};if(png==null||png.Length<33||png.Length>PngBytes)throw new InvalidDataException("Clipboard PNG size");for(int i=0;i<8;i++)if(png[i]!=sig[i])throw new InvalidDataException("Clipboard PNG format");if(Big(png,8)!=13||Encoding.ASCII.GetString(png,12,4)!="IHDR")throw new InvalidDataException("Clipboard PNG header");uint w=Big(png,16),h=Big(png,20);if(w<1||h<1||w>4096||h>4096||(long)w*h>8000000)throw new InvalidDataException("Clipboard PNG dimensions");return new Size((int)w,(int)h);}
    public static string HtmlClipboard(string html){
        if(html==null||Utf8.GetByteCount(html)>MarkupBytes)throw new InvalidDataException("Clipboard HTML limit");
        const string start="<!--StartFragment-->",end="<!--EndFragment-->";int a=html.IndexOf(start,StringComparison.Ordinal),b=html.IndexOf(end,StringComparison.Ordinal);
        if(a<0||b<a){int body=html.IndexOf("<body",StringComparison.OrdinalIgnoreCase),close=html.LastIndexOf("</body>",StringComparison.OrdinalIgnoreCase),open=body<0?-1:html.IndexOf('>',body);if(open>=0&&close>open)html=html.Substring(0,open+1)+start+html.Substring(open+1,close-open-1)+end+html.Substring(close);else html="<html><body>"+start+html+end+"</body></html>";a=html.IndexOf(start,StringComparison.Ordinal);b=html.IndexOf(end,StringComparison.Ordinal);}a+=start.Length;
        const string pattern="Version:1.0\r\nStartHTML:{0:D10}\r\nEndHTML:{1:D10}\r\nStartFragment:{2:D10}\r\nEndFragment:{3:D10}\r\n";
        int header=Encoding.ASCII.GetByteCount(String.Format(System.Globalization.CultureInfo.InvariantCulture,pattern,0,0,0,0));return String.Format(System.Globalization.CultureInfo.InvariantCulture,pattern,header,header+Utf8.GetByteCount(html),header+Utf8.GetByteCount(html.Substring(0,a)),header+Utf8.GetByteCount(html.Substring(0,b)))+html;
    }
    static bool RtfEnds(byte[] raw){int i=raw.Length-1;while(i>=0&&(raw[i]==9||raw[i]==10||raw[i]==13||raw[i]==32))i--;return i>=0&&raw[i]==125;}
    public static string RtfContent(byte[] raw){int size=raw.Length;while(size>0&&raw[size-1]==0)size--;return Convert.ToBase64String(raw,0,size);}
    public static string HtmlContent(byte[] raw){
        string header=Encoding.ASCII.GetString(raw,0,Math.Min(raw.Length,4096));int start=Offset(header,"StartHTML:"),end=Offset(header,"EndHTML:");if(start==-1&&end==-1){start=Offset(header,"StartFragment:");end=Offset(header,"EndFragment:");}if(start<0||end<start||end>raw.Length||end-start>MarkupBytes)throw new InvalidDataException("Clipboard HTML offsets");return Utf8.GetString(raw,start,end-start);
    }
    static int Offset(string text,string label){int a=text.IndexOf(label,StringComparison.Ordinal);if(a<0)return -1;a+=label.Length;while(a<text.Length&&(text[a]==' '||text[a]=='\t'))a++;int b=a;while(b<text.Length&&(text[b]=='-'||(text[b]>='0'&&text[b]<='9')))b++;int value;return Int32.TryParse(text.Substring(a,b-a),out value)?value:-1;}

    public static byte[] PngDib(byte[] png){
            Size size=PngSize(png);using(var stream=new MemoryStream(png))using(var source=Image.FromStream(stream,false,true))using(var image=new Bitmap(size.Width,size.Height,PixelFormat.Format32bppArgb)){
                using(var graphics=Graphics.FromImage(image)){graphics.Clear(Color.Transparent);graphics.DrawImageUnscaled(source,0,0);}
                var bytes=new byte[124+checked(size.Width*size.Height*4)];using(var writer=new BinaryWriter(new MemoryStream(bytes))){writer.Write(124u);writer.Write(size.Width);writer.Write(-size.Height);writer.Write((ushort)1);writer.Write((ushort)32);writer.Write(3u);writer.Write((uint)(bytes.Length-124));writer.BaseStream.Position=40;writer.Write(0x00ff0000u);writer.Write(0x0000ff00u);writer.Write(0x000000ffu);writer.Write(0xff000000u);writer.Write(0x73524742u);writer.BaseStream.Position=108;writer.Write(4u);}
                var locked=image.LockBits(new Rectangle(0,0,size.Width,size.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);try{for(int y=0;y<size.Height;y++)Marshal.Copy(IntPtr.Add(locked.Scan0,y*locked.Stride),bytes,124+y*size.Width*4,size.Width*4);}finally{image.UnlockBits(locked);}return bytes;
            }
        }

    sealed class WindowsBoard : IBoard {
        [StructLayout(LayoutKind.Sequential)]struct BitmapInfo {public int type,width,height,widthBytes;public ushort planes,bits;public IntPtr data;}
        [DllImport("user32.dll",SetLastError=true)]static extern bool OpenClipboard(IntPtr window);
        [DllImport("user32.dll")]static extern bool CloseClipboard();
        [DllImport("user32.dll")]static extern bool EmptyClipboard();
        [DllImport("user32.dll")]static extern IntPtr GetClipboardData(uint format);
        [DllImport("user32.dll")]static extern IntPtr SetClipboardData(uint format,IntPtr handle);
        [DllImport("user32.dll")]static extern bool IsClipboardFormatAvailable(uint format);
        [DllImport("user32.dll")]static extern uint GetClipboardSequenceNumber();
        [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern uint RegisterClipboardFormat(string name);
        [DllImport("kernel32.dll")]static extern UIntPtr GlobalSize(IntPtr handle);
        [DllImport("kernel32.dll")]static extern IntPtr GlobalAlloc(uint flags,UIntPtr size);
        [DllImport("kernel32.dll")]static extern IntPtr GlobalLock(IntPtr handle);
        [DllImport("kernel32.dll")]static extern bool GlobalUnlock(IntPtr handle);
        [DllImport("kernel32.dll")]static extern IntPtr GlobalFree(IntPtr handle);
        [DllImport("gdi32.dll",EntryPoint="GetObjectW")]static extern int GetBitmap(IntPtr bitmap,int size,out BitmapInfo info);
        static uint Format(string name){uint id=RegisterClipboardFormat(name);if(id==0)throw new InvalidOperationException("Clipboard format unavailable");return id;}
        NativeWindow window;readonly uint html=Format("HTML Format"),rtf=Format("Rich Text Format"),png=Format("PNG");
        public long Sequence{get{return GetClipboardSequenceNumber();}}
        void Open(){if(window==null){window=new NativeWindow();window.CreateHandle(new CreateParams{Parent=new IntPtr(-3),Caption="SodaClipboard"});}for(int i=0;i<3;i++){if(OpenClipboard(window.Handle))return;Thread.Sleep(20);}throw new InvalidOperationException("Clipboard busy");}
        static byte[] Data(uint format,int limit){IntPtr handle=GetClipboardData(format);ulong size=GlobalSize(handle).ToUInt64();if(handle==IntPtr.Zero||size<1||size>(ulong)limit+64)throw new InvalidDataException("Clipboard format size");IntPtr p=GlobalLock(handle);if(p==IntPtr.Zero)throw new InvalidDataException("Clipboard lock");try{var bytes=new byte[(int)size];Marshal.Copy(p,bytes,0,bytes.Length);return bytes;}finally{GlobalUnlock(handle);}}
        static byte[] Png(Image image){if(image.Width<1||image.Height<1||image.Width>4096||image.Height>4096||(long)image.Width*image.Height>8000000)throw new InvalidDataException("Clipboard image dimensions");using(var stream=new MemoryStream()){image.Save(stream,ImageFormat.Png);if(stream.Length>PngBytes)throw new InvalidDataException("Clipboard image size");return stream.ToArray();}}
        public Dictionary<string,object> Read(Func<bool> valid){if(!valid())throw new InvalidOperationException("Clipboard retired");var value=new Dictionary<string,object>();Open();try{if(!valid())throw new InvalidOperationException("Clipboard retired");
            if(IsClipboardFormatAvailable(13)){var data=Data(13,TextBytes*2+2);int end=0;while(end+1<data.Length&&(data[end]!=0||data[end+1]!=0))end+=2;if(end>TextBytes*2)throw new InvalidDataException("Clipboard text limit");value["text"]=Encoding.Unicode.GetString(data,0,end);}
            if(IsClipboardFormatAvailable(html))value["html"]=HtmlContent(Data(html,MarkupBytes+4096));
            if(IsClipboardFormatAvailable(rtf))value["rtf"]=RtfContent(Data(rtf,MarkupBytes));
            if(IsClipboardFormatAvailable(png)){var data=Data(png,PngBytes);PngSize(data);using(var stream=new MemoryStream(data))using(var image=Image.FromStream(stream)){value["png"]=Convert.ToBase64String(Png(image));}}
            else if(IsClipboardFormatAvailable(2)){IntPtr bitmap=GetClipboardData(2);BitmapInfo info;if(GetBitmap(bitmap,Marshal.SizeOf(typeof(BitmapInfo)),out info)==0||info.width<1||info.height<1||info.width>4096||info.height>4096||(long)info.width*info.height>8000000)throw new InvalidDataException("Clipboard bitmap dimensions");using(var image=Image.FromHbitmap(bitmap))value["png"]=Convert.ToBase64String(Png(image));}
        }finally{CloseClipboard();}if(value.Count==0)value["text"]="";Validate(value);return value;}
        static IntPtr Memory(byte[] data){IntPtr handle=GlobalAlloc(2,new UIntPtr((uint)data.Length));if(handle==IntPtr.Zero)throw new OutOfMemoryException();try{IntPtr p=GlobalLock(handle);if(p==IntPtr.Zero)throw new OutOfMemoryException();try{Marshal.Copy(data,0,p,data.Length);}finally{GlobalUnlock(handle);}return handle;}catch{GlobalFree(handle);throw;}}
        public void Write(Dictionary<string,object> value,long expectedSequence,Func<bool> valid){
            Validate(value);var memory=new Dictionary<uint,IntPtr>();try{
                foreach(var item in value){byte[] data;uint format;if(item.Key=="text"){format=13;data=Encoding.Unicode.GetBytes((string)item.Value+"\0");}else if(item.Key=="html"){format=html;data=Utf8.GetBytes(HtmlClipboard((string)item.Value)+"\0");}else if(item.Key=="rtf"){format=rtf;var raw=Convert.FromBase64String((string)item.Value);data=new byte[raw.Length+1];Buffer.BlockCopy(raw,0,data,0,raw.Length);Array.Clear(raw,0,raw.Length);}else{format=png;data=Convert.FromBase64String((string)item.Value);PngSize(data);using(var stream=new MemoryStream(data))using(var image=Image.FromStream(stream)){data=Png(image);}}
                    try{memory.Add(format,Memory(data));if(item.Key=="png"){var dib=PngDib(data);try{memory.Add(17,Memory(dib));}finally{Array.Clear(dib,0,dib.Length);}}}finally{Array.Clear(data,0,data.Length);}}
                Open();try{ValidateCommit(valid,expectedSequence,Sequence);if(!EmptyClipboard())throw new InvalidOperationException("Clipboard clear");foreach(var format in new List<uint>(memory.Keys)){if(SetClipboardData(format,memory[format])==IntPtr.Zero)throw new InvalidOperationException("Clipboard apply");memory[format]=IntPtr.Zero;}}finally{CloseClipboard();}
            }finally{foreach(var handle in memory.Values)if(handle!=IntPtr.Zero)GlobalFree(handle);}
        }
        public void Dispose(){if(window!=null){window.DestroyHandle();window=null;}}
    }
}
