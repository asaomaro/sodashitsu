// One private, disposable STA operation. Never accepts paths or a program to execute.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
namespace Sodashitsu.NativeDrag
{
    public sealed class ExplorerSelectionRequest
    {
        public string Nonce; public string Epoch; public int X; public int Y; public long Window; public int Process;
    }
    public static class ExplorerSelectionWorker
    {
        [StructLayout(LayoutKind.Sequential)] private struct POINT {public int X,Y;}
        [DllImport("user32.dll")] private static extern bool GetPhysicalCursorPos(out POINT point);
        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
        private static bool Physical(ExplorerSelectionRequest request)
        {
            POINT point;uint pid;IntPtr window=GetForegroundWindow();GetWindowThreadProcessId(window,out pid);
            return window.ToInt64()==request.Window&&pid==request.Process&&GetPhysicalCursorPos(out point)&&point.X==request.X&&point.Y==request.Y&&(GetAsyncKeyState(1)&0x8000)!=0;
        }
        private sealed class BoundDriver:ExplorerSelection.IDriver
        {
            private readonly ExplorerSelection.IDriver driver;private readonly ExplorerSelectionRequest request;private readonly Func<bool> authority;
            internal BoundDriver(ExplorerSelection.IDriver driver,ExplorerSelectionRequest request,Func<bool> authority){this.driver=driver;this.request=request;this.authority=authority;}
            public ExplorerSelection.Snapshot Read(int x,int y)
            {
                if(!authority())throw new InvalidOperationException("Pointer gesture expired");
                ExplorerSelection.Snapshot result=driver.Read(x,y);
                if(!authority()||result==null||result.Window!=request.Window||result.Process!=request.Process)throw new InvalidOperationException("Applied pointer target changed");
                return result;
            }
        }
        public static string Execute(ExplorerSelectionRequest request,ExplorerSelection.IDriver driver,Func<bool> authority,Func<long> clock)
        {
            Guid epoch;
            if(request==null||request.Nonce==null||request.Nonce.Length!=64||!System.Text.RegularExpressions.Regex.IsMatch(request.Nonce,"\\A[a-f0-9]{64}\\z")||!Guid.TryParseExact(request.Epoch,"D",out epoch)||epoch==Guid.Empty||request.Window==0||request.Process<=0)throw new InvalidOperationException("Invalid private selection request");
            ExplorerSelection.Snapshot selection=ExplorerSelection.Capture(new BoundDriver(driver,request,authority),request.X,request.Y,authority,clock);
            if(!authority())throw new InvalidOperationException("Pointer gesture expired");
            string result=new JavaScriptSerializer().Serialize(new {nonce=request.Nonce,epoch=request.Epoch,window=selection.Window,pid=selection.Process,paths=selection.Paths});
            if(Encoding.UTF8.GetByteCount(result)>4194304)throw new InvalidOperationException("Selection metadata limit");
            if(!authority())throw new InvalidOperationException("Pointer gesture expired");
            return result;
        }
        [STAThread] public static int Main(string[] args)
        {
            if(args.Length==1&&args[0]=="--preflight"){Console.WriteLine("soda-explorer-selection-preflight-v1");return 0;}
            // Independent process timer also cuts off a blocked UIA/COM call or pipe.
            using(Timer watchdog=new Timer(delegate {Environment.Exit(124);},null,6000,Timeout.Infinite))
            try
            {
                if(args.Length!=0)throw new InvalidOperationException("Arguments refused");
                Stream input=Console.OpenStandardInput();MemoryStream bytes=new MemoryStream();
                for(int i=0;i<2048;i++){int value=input.ReadByte();if(value<0)throw new InvalidOperationException("Selection input ended");if(value==10)break;bytes.WriteByte((byte)value);if(i==2047)throw new InvalidOperationException("Selection input limit");}
                string text=new UTF8Encoding(false,true).GetString(bytes.ToArray());JavaScriptSerializer json=new JavaScriptSerializer();
                Dictionary<string,object> fields=json.DeserializeObject(text) as Dictionary<string,object>;
                if(fields==null||fields.Count!=6)throw new InvalidOperationException("Selection fields refused");
                foreach(string key in new string[]{"Nonce","Epoch","X","Y","Window","Process"})if(!fields.ContainsKey(key))throw new InvalidOperationException("Selection fields refused");
                ExplorerSelectionRequest request=json.Deserialize<ExplorerSelectionRequest>(text);Stopwatch clock=Stopwatch.StartNew();
                string result=Execute(request,new ExplorerSelection.NativeDriver(),delegate{return clock.ElapsedMilliseconds<750&&Physical(request);},delegate{return clock.ElapsedMilliseconds;});
                Console.OutputEncoding=new UTF8Encoding(false,true);Console.WriteLine(result);Console.Out.Flush();return 0;
            }
            catch{return 1;}
        }
    }
}
