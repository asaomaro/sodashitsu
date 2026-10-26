// Fake clipboard only. Never reads/writes the current user's clipboard.
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace SodaDesktopTests {
public static class RichClipboardChecks {
    sealed class Board : SodaDesktopRichClipboard.IBoard {
        public Dictionary<string,object> Value=new Dictionary<string,object>{{"text","generated"},{"html","<table><tr><td style=\"color:red\">表😀</td></tr></table>"},{"rtf",Convert.ToBase64String(new byte[]{123,92,114,116,102,49,32,0x82,0xa0,125})}};
        public long Seq=7;public int Reads,Writes;public bool Disposed;public Action BeforeWrite;public long Sequence{get{return Seq;}}
        public Dictionary<string,object> Read(Func<bool> valid){if(!valid())throw new InvalidOperationException();Reads++;return new Dictionary<string,object>(Value);}
        public void Write(Dictionary<string,object> value,long expected,Func<bool> valid){if(BeforeWrite!=null)BeforeWrite();SodaDesktopRichClipboard.ValidateCommit(valid,expected,Seq);Writes++;Value=new Dictionary<string,object>(value);Seq++;}
        public void Dispose(){Disposed=true;}
    }
    static void Need(bool ok,string reason){if(!ok)throw new Exception(reason);}
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=4194304};
    static Dictionary<string,object> Map(object value){return (Dictionary<string,object>)Json.DeserializeObject(Json.Serialize(value));}
    static Dictionary<string,object> Receive(BlockingCollection<object> responses){object raw;Need(responses.TryTake(out raw,2000),"Clipboard response deadline");return Map(raw);}
    public static void Run(){
        string fragment="<table><tr><td style=\"color:red\">表😀</td></tr></table>",html=SodaDesktopRichClipboard.HtmlClipboard(fragment);byte[] encoded=Encoding.UTF8.GetBytes(html);string content=SodaDesktopRichClipboard.HtmlContent(encoded);Need(content.Contains(fragment),"CF_HTML UTF8 offsets");int a=Int32.Parse(html.Substring(html.IndexOf("StartFragment:")+14,10)),b=Int32.Parse(html.Substring(html.IndexOf("EndFragment:")+12,10));Need(Encoding.UTF8.GetString(encoded,a,b-a)==fragment,"CF_HTML fragment byte positions");
        string fragmentOnly="Version:1.0\r\nStartHTML: -1\r\nEndHTML: -1\r\nStartFragment: {0:D10}\r\nEndFragment: {1:D10}\r\n";
        int prefix=Encoding.ASCII.GetByteCount(String.Format(fragmentOnly,0,0));byte[] fragmentBytes=Encoding.UTF8.GetBytes(String.Format(fragmentOnly,prefix,prefix+Encoding.UTF8.GetByteCount(fragment))+fragment);Need(SodaDesktopRichClipboard.HtmlContent(fragmentBytes)==fragment,"CF_HTML absent context and spaced offsets");
        byte[] binaryRtf={123,92,114,116,102,49,32,92,98,105,110,51,32,65,0,66,125,0,0};var rtfRaw=Convert.FromBase64String(SodaDesktopRichClipboard.RtfContent(binaryRtf));Need(rtfRaw.Length==17&&rtfRaw[14]==0,"RTF internal NUL must survive");
        using(var image=new System.Drawing.Bitmap(4,4)){image.SetPixel(1,1,System.Drawing.Color.Lime);using(var stream=new MemoryStream()){image.Save(stream,System.Drawing.Imaging.ImageFormat.Png);var png=stream.ToArray();var dib=SodaDesktopRichClipboard.PngDib(png);int pixel=124+(1*4+1)*4;Need(BitConverter.ToInt32(dib,0)==124&&BitConverter.ToInt32(dib,4)==4&&BitConverter.ToInt32(dib,8)==-4,"PNG DIBV5 dimensions");Need(dib[pixel]==0&&dib[pixel+1]==255&&dib[pixel+2]==0&&dib[pixel+3]==255,"PNG DIBV5 BGRA pixels");}}
        SodaDesktopRichClipboard.Validate(new Dictionary<string,object>{{"text",new string('x',100000)}});
        var board=new Board();bool allowed=true,writeAllowed=true;long generation=1,now=1000;int activations=0;var output=new BlockingCollection<object>();
        var worker=new SodaDesktopRichClipboard(output.Add,()=>allowed,()=>generation,()=>now,()=>writeAllowed,()=>{activations++;return board;});
        Action<string,string,Dictionary<string,object>> send=(id,op,extra)=>{var m=new Dictionary<string,object>{{"type","clipboard_rich"},{"id",id},{"operation",op},{"generation",generation},{"expiresAt",now+1000}};if(extra!=null)foreach(var pair in extra)m.Add(pair.Key,pair.Value);worker.Submit(m);};
        try{
            Thread.Sleep(30);Need(activations==0,"No clipboard activation before a request");
            string read=Guid.NewGuid().ToString();send(read,"read",null);var first=Receive(output);Need((bool)first["ok"]&&first["stage"].ToString()=="begin","Clipboard read begin");int size=Convert.ToInt32(first["size"]),offset=0;var bytes=new List<byte>();while(offset<size){send(read,"pull",new Dictionary<string,object>{{"offset",offset}});var response=Receive(output);Need((bool)response["ok"],"Clipboard read chunk");var chunk=Convert.FromBase64String((string)response["data"]);bytes.AddRange(chunk);offset=Convert.ToInt32(response["offset"]);}Need(Encoding.UTF8.GetString(bytes.ToArray()).Contains("style"),"Clipboard retains HTML formatting");
            var value=new Dictionary<string,object>{{"text","changed😀"},{"html",fragment},{"rtf",board.Value["rtf"]}};byte[] write=Encoding.UTF8.GetBytes(Json.Serialize(value));string id=Guid.NewGuid().ToString();send(id,"begin",new Dictionary<string,object>{{"size",write.Length}});Need((bool)Receive(output)["ok"],"Clipboard write begin");send(id,"push",new Dictionary<string,object>{{"offset",0},{"data",Convert.ToBase64String(write)}});Need((bool)Receive(output)["ok"],"Clipboard write chunk");Need(board.Writes==0,"Clipboard must not apply before commit");send(id,"commit",null);Need((bool)Receive(output)["ok"]&&board.Writes==1&&board.Value["html"].ToString()==fragment,"Clipboard write atomic commit");
            id=Guid.NewGuid().ToString();send(id,"begin",new Dictionary<string,object>{{"size",write.Length}});Receive(output);send(id,"push",new Dictionary<string,object>{{"offset",0},{"data",Convert.ToBase64String(write)}});Receive(output);generation++;send(id,"commit",null);Need(!(bool)Receive(output)["ok"]&&board.Writes==1,"Revocation must reject clipboard commit");
            id=Guid.NewGuid().ToString();send(id,"begin",new Dictionary<string,object>{{"size",write.Length}});Receive(output);send(id,"push",new Dictionary<string,object>{{"offset",0},{"data",Convert.ToBase64String(write)}});Receive(output);board.Seq++;send(id,"commit",null);Need(!(bool)Receive(output)["ok"]&&board.Writes==1,"Local clipboard change must reject commit");
            id=Guid.NewGuid().ToString();send(id,"begin",new Dictionary<string,object>{{"size",write.Length}});Receive(output);send(id,"push",new Dictionary<string,object>{{"offset",0},{"data",Convert.ToBase64String(write)}});Receive(output);board.BeforeWrite=()=>{allowed=false;};send(id,"commit",null);Need(!(bool)Receive(output)["ok"]&&board.Writes==1,"Cancellation during native preparation must prevent commit");
            allowed=true;board.BeforeWrite=null;writeAllowed=false;id=Guid.NewGuid().ToString();send(id,"begin",new Dictionary<string,object>{{"size",write.Length}});Need(!(bool)Receive(output)["ok"]&&board.Writes==1,"Local input ceiling must reject rich clipboard write");
            writeAllowed=true;id=Guid.NewGuid().ToString();send(id,"begin",new Dictionary<string,object>{{"size",write.Length}});Receive(output);send(id,"push",new Dictionary<string,object>{{"offset",0},{"data",Convert.ToBase64String(write)}});Receive(output);board.BeforeWrite=()=>{send(id,"cancel",null);try{send(Guid.NewGuid().ToString(),"cancel",null);}catch(InvalidOperationException){}};send(id,"commit",null);Need(!(bool)Receive(output)["ok"]&&board.Writes==1,"Explicit cancel during native preparation must prevent commit");Receive(output);
            allowed=false;id=Guid.NewGuid().ToString();send(id,"read",null);Need(!(bool)Receive(output)["ok"]&&board.Reads==1,"Permission must prevent clipboard read");
        }finally{worker.Dispose();output.Dispose();}Need(board.Disposed,"Clipboard backend released");
        Console.WriteLine("desktop_rich_clipboard_checks_passed: generated HTML/RTF, UTF8 offsets, bounded chunks, final commit, revocation/local change, no real clipboard/input/capture");
    }
}
}
