// Root-executed operator phase only. Main runner NEVER launches this executable.
using System;using System.IO;using System.Diagnostics;using System.Runtime.InteropServices;using System.Threading;using System.Collections.Generic;
public static class Phase3BCOperator {
 [DllImport("user32.dll",SetLastError=true)]static extern bool LockWorkStation();
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Execute{public int size;public uint mask;public IntPtr window;public string verb,file,args,directory;public int show;public IntPtr instance,idList;public string className;public IntPtr classKey;public uint hotkey;public IntPtr icon,process;}
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool ShellExecuteEx(ref Execute value);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr value);
 public static int Main(string[] args){if(args.Length!=1)return 2;try{
  string root=Path.GetDirectoryName(Path.GetFullPath(args[0]));if(args[0].IndexOf('"')>=0)throw new InvalidOperationException("manifest-argument");var m=Phase3BC.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));string scenario=(string)m["scenario"];if(!Object.Equals(m["approved"],true)||(scenario!="B"&&scenario!="C"))throw new InvalidOperationException("operator-not-approved");
  int controller=Convert.ToInt32(m["controllerPid"]);long started=Int64.Parse((string)m["controllerStartedTicks"]);DateTime expires=DateTime.Parse((string)m["expiresAt"],null,System.Globalization.DateTimeStyles.RoundtripKind).ToUniversalTime();
  if((expires-DateTime.UtcNow).TotalSeconds>240||expires<=DateTime.UtcNow)throw new InvalidOperationException("operator-ttl");var expiry=new Thread(()=>{Thread.Sleep(Math.Max(1,(int)Math.Min(240000,(expires-DateTime.UtcNow).TotalMilliseconds)));Environment.Exit(2);});expiry.IsBackground=true;expiry.Start();
  using(var owner=Process.GetProcessById(controller)){
   Func<bool> current=delegate{try{return DateTime.UtcNow<expires&&!owner.HasExited&&owner.StartTime.ToUniversalTime().Ticks==started&&Phase3BC.SameToken(Phase3Native.Facts(Process.GetCurrentProcess().Id),Phase3Native.Facts(controller),"C")&&Phase3Native.DefaultDesktop();}catch{return false;}};
   if(!current()||Phase3Native.Hash(Phase3Native.Executable(controller))!=(string)m["controllerExeSha256"])throw new InvalidOperationException("operator-scope");
   // Root supplies this after verifying the existing authorized memory-only recovery route.
   string gate=Path.Combine(root,"operator-go"),recovery=Path.Combine(root,"recovery-ready.json");if(!File.Exists(gate)||!File.Exists(recovery))throw new InvalidOperationException("operator-go-and-recovery-required");var r=Phase3BC.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(recovery));double issued=Convert.ToDouble(r["atMs"]);if(!Object.Equals(r["ready"],true)||Convert.ToInt32(r["controllerPid"])!=controller||issued>Phase3BC.UnixMs()||Phase3BC.UnixMs()-issued>30000)throw new InvalidOperationException("fresh-recovery-unproven");
   Phase3BC.Receipt(Path.Combine(root,"operator-claim.json"),new{scenario,oneShot=true});
   if(scenario=="B"){
    var wait=Stopwatch.StartNew();while(!File.Exists(Path.Combine(root,"stable-tone.json"))){if(wait.ElapsedMilliseconds>15000||!current()||File.Exists(Path.Combine(root,"stop")))throw new InvalidOperationException("stable-tone-unreachable");Thread.Sleep(5);}
    if(!current()||Phase3Native.Hash(Phase3Native.Executable(controller))!=(string)m["controllerExeSha256"]||Phase3BC.UnixMs()-issued>30000)throw new InvalidOperationException("operator-recovery-expired");double requested=Phase3BC.UnixMs();if(!LockWorkStation())throw new InvalidOperationException("lock-call-failed");Phase3BC.Receipt(Path.Combine(root,"lock-requested.json"),new{ok=true,requestedAtMs=requested,actualLockUnconfirmed=true});return 0;
   }
   string noop=Path.Combine((string)m["fixtureBin"],"uac-noop.exe");if(Phase3Native.Hash(noop)!=(string)m["noopExeSha256"]||Phase3Native.Hash(Phase3Native.Executable(controller))!=(string)m["controllerExeSha256"]||!current())throw new InvalidOperationException("own-noop-hash");Phase3BC.Receipt(Path.Combine(root,"uac-request-issued.json"),new{ownRequest=true,atMs=Phase3BC.UnixMs(),actualUacUnconfirmed=true});
   var request=new Execute{size=Marshal.SizeOf(typeof(Execute)),mask=0x40,verb="runas",file=noop,args="\""+args[0]+"\"",directory=root,show=0};bool launched=ShellExecuteEx(ref request);int error=Marshal.GetLastWin32Error();
   try{if(!launched&&error!=1223)throw new InvalidOperationException("own-uac-request-failed");Phase3BC.Receipt(Path.Combine(root,"uac-resolved.json"),new{resolved=true,cancelled=!launched&&error==1223,ownNoopStarted=launched,atMs=Phase3BC.UnixMs()});return 0;}finally{if(request.process!=IntPtr.Zero)CloseHandle(request.process);}
  }
 }catch{return 2;}}
}
public static class Phase3BCNoop {
 public static int Main(string[] args){if(args.Length!=1)return 2;try{var m=Phase3BC.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));string root=Path.GetDirectoryName(Path.GetFullPath(args[0]));int parent=Convert.ToInt32(m["controllerPid"]);var me=Phase3Native.Facts(Process.GetCurrentProcess().Id);var owner=Phase3Native.Facts(parent);if(!Object.Equals(m["approved"],true)||!Object.Equals(m["scenario"],"C")||me.System||!me.Elevated||me.Owner!=owner.Owner||me.Logon!=owner.Logon||me.Session!=owner.Session)throw new InvalidOperationException("own-noop-scope");Phase3BC.Receipt(Path.Combine(root,"noop-started.json"),new{pid=Process.GetCurrentProcess().Id,startedTicks=Process.GetCurrentProcess().StartTime.ToUniversalTime().Ticks.ToString(),exeSha256=Phase3Native.Hash(Phase3Native.Executable(Process.GetCurrentProcess().Id)),elevated=true});return 0;}catch{return 2;}}
}
