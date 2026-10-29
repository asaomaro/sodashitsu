// Internal normal-desktop selection adapter. No file bytes, clipboard, input or Shell execution.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Automation;

namespace Sodashitsu.NativeDrag
{
    public static class ExplorerSelection
    {
        public sealed class Snapshot
        {
            public long Window; public int Process; public string Hit; public string[] Paths;
        }
        public interface IDriver { Snapshot Read(int x,int y); }
        // The host must run native COM/UIA calls in a disposable STA worker with its own
        // wall-clock timeout and process-exit fence. A stalled provider cannot be aborted here.
        public static Snapshot Capture(IDriver driver,int x,int y,Func<bool> authority,Func<long> clock)
        {
            long start=clock();if(start<0||!authority())throw new InvalidOperationException("Explorer selection not permitted");
            Snapshot first=driver.Read(x,y);Validate(first);
            first=new Snapshot{Window=first.Window,Process=first.Process,Hit=first.Hit,Paths=(string[])first.Paths.Clone()};
            if(!authority())throw new InvalidOperationException("Explorer selection revoked");
            Snapshot second=driver.Read(x,y);Validate(second);
            if(!authority())throw new InvalidOperationException("Explorer selection revoked");
            long end=clock();if(end<start||end-start>=750||first.Window!=second.Window||first.Process!=second.Process||first.Hit!=second.Hit||first.Paths.Length!=second.Paths.Length)throw new InvalidOperationException("Explorer selection changed or expired");
            for(int i=0;i<first.Paths.Length;i++)if(first.Paths[i]!=second.Paths[i])throw new InvalidOperationException("Explorer selection changed");
            return new Snapshot{Window=second.Window,Process=second.Process,Hit=second.Hit,Paths=(string[])second.Paths.Clone()};
        }
        private static void Validate(Snapshot value)
        {
            if(value==null||value.Window==0||value.Process<=0||String.IsNullOrEmpty(value.Hit)||value.Hit.Length>1024||value.Paths==null||value.Paths.Length==0||value.Paths.Length>1000)throw new InvalidOperationException("Explorer selection unavailable");
            HashSet<string> seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach(string path in value.Paths)
                if(String.IsNullOrEmpty(path)||path.Length>4096||path.IndexOf('\0')>=0||(path.Length<3||!Char.IsLetter(path[0])||path[1]!=':'||path[2]!='\\')||!seen.Add(path))throw new InvalidOperationException("Explorer selection is not a local filesystem selection");
        }
        public sealed class NativeDriver:IDriver
        {
            [StructLayout(LayoutKind.Sequential)] private struct POINT {public int X,Y;}
            [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
            [DllImport("user32.dll",SetLastError=true)] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
            [DllImport("kernel32.dll")] private static extern uint WTSGetActiveConsoleSessionId();
            [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(POINT point);
            [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr window,uint flags);
            [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
            [DllImport("user32.dll",SetLastError=true)] private static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
            [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool GetUserObjectInformation(IntPtr desktop,int index,StringBuilder name,uint size,out uint needed);
            [DllImport("user32.dll")] private static extern bool CloseDesktop(IntPtr desktop);
            [DllImport("advapi32.dll",SetLastError=true)] private static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
            [DllImport("advapi32.dll",SetLastError=true)] private static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int size,out int needed);
            [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
            private static object Get(object target,string member) {return target.GetType().InvokeMember(member,BindingFlags.GetProperty,null,target,null);}
            private static object Call(object target,string member,params object[] args) {return target.GetType().InvokeMember(member,BindingFlags.InvokeMethod,null,target,args);}
            private static void Release(object value) {if(value!=null&&Marshal.IsComObject(value))Marshal.ReleaseComObject(value);}
            private static void NormalDesktop()
            {
                IntPtr desktop=OpenInputDesktop(0,false,1);if(desktop==IntPtr.Zero)throw new InvalidOperationException("Normal desktop unavailable");
                try {uint needed;StringBuilder name=new StringBuilder(256);if(!GetUserObjectInformation(desktop,2,name,512,out needed)||name.ToString()!="Default")throw new InvalidOperationException("Normal desktop required");}
                finally {CloseDesktop(desktop);}
            }
            private static void NormalExplorer(uint pid)
            {
                using(Process process=Process.GetProcessById(checked((int)pid)))
                using(Process current=Process.GetCurrentProcess())
                {
                    string trusted=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"explorer.exe");
                    if((uint)current.SessionId!=WTSGetActiveConsoleSessionId()||process.SessionId!=current.SessionId||!String.Equals(process.MainModule.FileName,trusted,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Current-session Explorer required");
                    IntPtr ownToken;if(!OpenProcessToken(current.Handle,8,out ownToken))throw new InvalidOperationException("Caller identity unavailable");
                    try {int needed;IntPtr ownElevation=Marshal.AllocHGlobal(4);try {if(!GetTokenInformation(ownToken,20,ownElevation,4,out needed)||Marshal.ReadInt32(ownElevation)!=0)throw new InvalidOperationException("Elevated caller refused");}finally {Marshal.FreeHGlobal(ownElevation);}}finally {CloseHandle(ownToken);}
                    IntPtr token;if(!OpenProcessToken(process.Handle,8,out token))throw new InvalidOperationException("Explorer identity unavailable");
                    try
                    {
                        int needed;IntPtr elevation=Marshal.AllocHGlobal(4);
                        try {if(!GetTokenInformation(token,20,elevation,4,out needed)||Marshal.ReadInt32(elevation)!=0)throw new InvalidOperationException("Elevated Explorer refused");}
                        finally {Marshal.FreeHGlobal(elevation);}
                        using(WindowsIdentity explorer=new WindowsIdentity(token))
                        using(WindowsIdentity caller=WindowsIdentity.GetCurrent())
                            if(explorer.User==null||caller.User==null||!explorer.User.Equals(caller.User))throw new InvalidOperationException("Explorer owner mismatch");
                    }
                    finally {CloseHandle(token);}
                }
            }
            public Snapshot Read(int x,int y)
            {
                IntPtr previous=SetThreadDpiAwarenessContext(new IntPtr(-4));
                if(previous==IntPtr.Zero)throw new InvalidOperationException("Physical Explorer coordinates unavailable");
                try {return ReadPhysical(x,y);}finally {SetThreadDpiAwarenessContext(previous);}
            }
            private Snapshot ReadPhysical(int x,int y)
            {
                if(Thread.CurrentThread.GetApartmentState()!=ApartmentState.STA)throw new InvalidOperationException("Explorer STA worker required");
                NormalDesktop();IntPtr window=GetForegroundWindow();uint pid;GetWindowThreadProcessId(window,out pid);
                if(window==IntPtr.Zero||GetAncestor(WindowFromPoint(new POINT{X=x,Y=y}),2)!=window)throw new InvalidOperationException("Explorer pointer mismatch");NormalExplorer(pid);
                AutomationElement element=AutomationElement.FromPoint(new Point(x,y));string hit=null,label=null;
                for(int depth=0;element!=null&&depth<16;depth++,element=TreeWalker.RawViewWalker.GetParent(element))
                {
                    AutomationElement.AutomationElementInformation info=element.Current;
                    if(info.ProcessId!=(int)pid)throw new InvalidOperationException("Explorer hit process mismatch");
                    if(info.ControlType==ControlType.ListItem||info.ControlType==ControlType.DataItem)
                    {
                        object pattern;
                        if(info.IsOffscreen||!element.TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern)||!((SelectionItemPattern)pattern).Current.IsSelected)throw new InvalidOperationException("Selected Explorer item required");
                        hit=String.Join(".",Array.ConvertAll(element.GetRuntimeId(),v=>v.ToString(System.Globalization.CultureInfo.InvariantCulture)));label=info.Name;break;
                    }
                }
                if(String.IsNullOrEmpty(hit)||String.IsNullOrEmpty(label))throw new InvalidOperationException("Explorer item unavailable");
                object shell=null,windows=null;string[] paths=null;
                try
                {
                    shell=Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application",true));windows=Call(shell,"Windows");int count=Convert.ToInt32(Get(windows,"Count"));if(count<0||count>256)throw new InvalidOperationException("Explorer window limit");
                    for(int i=0;i<count;i++)
                    {
                        object browser=null,document=null,items=null;
                        try
                        {
                            browser=Call(windows,"Item",i);if(browser==null||Convert.ToInt64(Get(browser,"HWND"))!=window.ToInt64())continue;
                            if(paths!=null)throw new InvalidOperationException("Ambiguous Explorer tabs");
                            document=Get(browser,"Document");items=Call(document,"SelectedItems");int selected=Convert.ToInt32(Get(items,"Count"));if(selected<1||selected>1000)throw new InvalidOperationException("Explorer selection limit");
                            paths=new string[selected];bool matched=false;
                            for(int n=0;n<selected;n++)
                            {
                                object item=null;
                                try {item=Call(items,"Item",n);if(!Convert.ToBoolean(Get(item,"IsFileSystem")))throw new InvalidOperationException("Non-filesystem Explorer item");paths[n]=Convert.ToString(Get(item,"Path"));if(Convert.ToString(Get(item,"Name"))==label)matched=true;}
                                finally {Release(item);}
                            }
                            if(!matched)throw new InvalidOperationException("Explorer hit selection mismatch");
                        }
                        finally {Release(items);Release(document);Release(browser);}
                    }
                }
                finally {Release(windows);Release(shell);}
                NormalDesktop();if(GetForegroundWindow()!=window)throw new InvalidOperationException("Explorer foreground changed");
                if(paths==null)throw new InvalidOperationException("Explorer window unavailable");Array.Sort(paths,StringComparer.Ordinal);
                return new Snapshot{Window=window.ToInt64(),Process=checked((int)pid),Hit=hit,Paths=paths};
            }
        }
    }
}
