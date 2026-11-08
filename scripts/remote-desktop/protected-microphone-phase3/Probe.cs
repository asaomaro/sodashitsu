using System.Runtime.InteropServices;using System;using System.IO;using System.Diagnostics;using System.Management;using System.Text.RegularExpressions;using System.Collections.Generic;using System.Web.Script.Serialization;
public static class Phase3Probe {
 [DllImport("shell32.dll",SetLastError=true)]static extern IntPtr CommandLineToArgvW([MarshalAs(UnmanagedType.LPWStr)]string value,out int count);
 [DllImport("kernel32.dll")]static extern IntPtr LocalFree(IntPtr value);
 static string[] Argv(string command){if(command.Length>4096)throw new InvalidOperationException("actor-command-size");int count;IntPtr array=CommandLineToArgvW(command,out count);if(array==IntPtr.Zero)throw new InvalidOperationException("actor-command");try{if(count<1||count>16)throw new InvalidOperationException("actor-command-count");var args=new string[count];for(int n=0;n<count;n++)args[n]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(array,n*IntPtr.Size));return args;}finally{LocalFree(array);}}
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=32768};
 static object Identity(Process process){var facts=Phase3Native.Facts(process.Id);return new{pid=process.Id,startedTicks=process.StartTime.ToUniversalTime().Ticks.ToString(),exeSha256=Phase3Native.Hash(process.MainModule.FileName),normal=!facts.System&&!facts.Elevated,activeConsole=facts.Session>0&&facts.Session==facts.ActiveSession,unlocked=facts.LockState==1};}
 public static int Main(string[] args){try{
  if(args.Length!=1)return 2;var m=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));int owner=Convert.ToInt32(m["controllerPid"]);using(var controller=Process.GetProcessById(owner)){
   var self=Phase3Native.Facts(Process.GetCurrentProcess().Id);var parent=Phase3Native.Facts(owner);if(!(Phase3Native.Same(self,parent)||(Object.Equals(m["operation"],"owner")&&!self.System&&!parent.System&&!self.Elevated&&!parent.Elevated&&self.Owner==parent.Owner&&self.Logon==parent.Logon&&self.Session>0&&self.Session==parent.Session&&self.ActiveSession==self.Session&&parent.ActiveSession==parent.Session))||parent.Elevated)throw new InvalidOperationException("normal-owner-required");
   string operation=(string)m["operation"];object output;
   if(operation=="preflight"){var capture=Phase3Endpoint.Read((string)m["captureEndpoint"],1);var render=Phase3Endpoint.Read((string)m["renderEndpoint"],0);output=new{ok=Phase3Endpoint.Available(capture)&&Phase3Endpoint.Available(render)&&Phase3Native.DefaultDesktop(),owner=Identity(controller),capture,render};}
   else if(operation=="owner")output=new{ok=true,owner=Identity(controller)};
   else if(operation=="receiver"){using(var receiver=Process.GetProcessById(Convert.ToInt32(m["receiverPid"]))){var facts=Phase3Native.Facts(receiver.Id);output=new{ok=Phase3Native.Same(facts,parent)&&facts.Elevated&&receiver.StartTime.ToUniversalTime().Ticks==Int64.Parse((string)m["receiverStartedTicks"])&&Phase3Native.Hash(receiver.MainModule.FileName)==(string)m["receiverExeSha256"],elevated=facts.Elevated,sameOwnerLogonSession=Phase3Native.Same(facts,parent)};}}
   else if(operation=="retired"){bool retired=false;try{using(var target=Process.GetProcessById(Convert.ToInt32(m["ownedPid"]))){retired=target.HasExited||target.StartTime.ToUniversalTime().Ticks!=Int64.Parse((string)m["ownedStartedTicks"]);}}catch(ArgumentException){retired=true;}output=new{ok=true,retired};}
   else if(operation=="actor"){
    int serverPid=Convert.ToInt32(m["serverPid"]);var actors=new List<object>();var queue=new Queue<int>();var seen=new HashSet<int>();queue.Enqueue(serverPid);
    while(queue.Count>0){int pid=queue.Dequeue();if(!seen.Add(pid))continue;if(seen.Count>64)throw new InvalidOperationException("actor-tree-limit");
     using(var search=new ManagementObjectSearcher("root\\CIMV2","SELECT ProcessId,ParentProcessId,CommandLine FROM Win32_Process WHERE ParentProcessId="+pid,new EnumerationOptions{Timeout=TimeSpan.FromSeconds(3),ReturnImmediately=false}))
     using(var rows=search.Get())foreach(ManagementObject row in rows)using(row){int child=Convert.ToInt32(row["ProcessId"]);queue.Enqueue(child);string command=row["CommandLine"]as string;if(command==null)continue;using(var process=Process.GetProcessById(child)){
      string file=process.MainModule.FileName;if(!String.Equals(Path.GetFileName(file),"soda-native-host.exe",StringComparison.OrdinalIgnoreCase))continue;
      var argv=Argv(command);if(argv.Length!=7||!String.Equals(argv[0],file,StringComparison.OrdinalIgnoreCase)||argv[1]!="--role"||argv[2]!="user-microphone"||argv[3]!="--module"||!Regex.IsMatch(argv[4],"^[a-f0-9]{32}$")||argv[5]!="--sha256"||!Regex.IsMatch(argv[6],"^[a-f0-9]{64}$"))continue;
      string module=Path.Combine(Path.GetDirectoryName(file),"role-"+argv[4],"user-microphone.dll");if(Phase3Native.Hash(module)!=argv[6])throw new InvalidOperationException("actor-module-hash");
      var facts=Phase3Native.Facts(child);if(!Phase3Native.Same(facts,parent)||facts.Elevated)throw new InvalidOperationException("actor-scope");actors.Add(new{identity=Identity(process),moduleSha256=argv[6],sameOwnerLogonSession=true});
     }}
    }
    output=new{ok=actors.Count==1,actors};
   }else throw new InvalidOperationException("unknown-operation");
   Console.WriteLine(Json.Serialize(output));return 0;
  }
 }catch{Console.WriteLine("{\"ok\":false,\"reason\":\"native-probe-failed-closed\"}");return 2;}}
}
