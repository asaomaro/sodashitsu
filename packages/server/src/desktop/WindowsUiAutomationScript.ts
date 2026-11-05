/** Fixed Windows UI Automation client. Requests are stdin JSON, never PowerShell source. */
export const windowsUiAutomationScript=String.raw`$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$framework=[Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$refs=@('System.dll','System.Core.dll','System.Web.Extensions.dll',(Join-Path $framework 'WPF\WindowsBase.dll'),(Join-Path $framework 'WPF\UIAutomationClient.dll'),(Join-Path $framework 'WPF\UIAutomationTypes.dll'))
Add-Type -ReferencedAssemblies $refs -TypeDefinition @'
using System;using System.Collections.Generic;using System.Diagnostics;using System.Globalization;using System.Runtime.InteropServices;using System.Text;using System.Security.Cryptography;using System.Windows.Automation;using System.Web.Script.Serialization;
public static class SodaUiAutomation {
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
 [DllImport("user32.dll")]static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern bool GetUserObjectInformation(IntPtr h,int index,StringBuilder text,uint length,out uint needed);
 [DllImport("kernel32.dll")]static extern uint WTSGetActiveConsoleSessionId();
 [DllImport("wtsapi32.dll")]static extern bool WTSQuerySessionInformation(IntPtr server,uint session,int kind,out IntPtr data,out uint length);
 [DllImport("wtsapi32.dll")]static extern void WTSFreeMemory(IntPtr data);
 [DllImport("user32.dll")]static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=1048576};
 static void Require(bool ok){if(!ok)throw new InvalidOperationException("UI information is unavailable or changed");}
 static string Clip(string value,int length){return value==null?"":value.Substring(0,Math.Min(length,value.Length));}
 static void Guard(){
  Require(Environment.Is64BitProcess);
  using(var key=Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))Require(key!=null&&Convert.ToInt32(key.GetValue("CurrentMajorVersionNumber",0))>=10);
  uint session=WTSGetActiveConsoleSessionId();Require(session!=(uint)0xffffffff&&Process.GetCurrentProcess().SessionId==(int)session);
  IntPtr data;uint size;Require(WTSQuerySessionInformation(IntPtr.Zero,session,25,out data,out size));
  try{Require(size>=20&&Marshal.ReadInt32(data)==1&&Marshal.ReadInt32(data,8)==(int)session&&Marshal.ReadInt32(data,12)==0&&Marshal.ReadInt32(data,16)==1);}finally{WTSFreeMemory(data);}
  var desktop=OpenInputDesktop(0,false,1);Require(desktop!=IntPtr.Zero);
  try{uint needed;var name=new StringBuilder(256);Require(GetUserObjectInformation(desktop,2,name,512,out needed)&&name.ToString()=="Default");}finally{CloseDesktop(desktop);}
 }
 static string Signature(AutomationElement e){
  var c=e.Current;string value="";object pattern;
  if(!c.IsPassword&&e.TryGetCurrentPattern(ValuePattern.Pattern,out pattern))value=((ValuePattern)pattern).Current.Value;
  var context=new StringBuilder(c.Name+"\0"+c.AutomationId+"\0"+c.ControlType.ProgrammaticName+"\0"+c.IsPassword+"\0"+value);
  if(e.TryGetCurrentPattern(TogglePattern.Pattern,out pattern))context.Append("\0toggle:").Append(((TogglePattern)pattern).Current.ToggleState);
  if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern))context.Append("\0selected:").Append(((SelectionItemPattern)pattern).Current.IsSelected);
  if(e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern,out pattern))context.Append("\0expanded:").Append(((ExpandCollapsePattern)pattern).Current.ExpandCollapseState);
  var parent=TreeWalker.ControlViewWalker.GetParent(e);int depth=0;
  while(parent!=null&&depth++<12){var a=parent.Current;context.Append("\0").Append(a.Name).Append("\0").Append(a.AutomationId).Append("\0").Append(Json.Serialize(parent.GetRuntimeId()));parent=TreeWalker.ControlViewWalker.GetParent(parent);}
  using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(context.ToString()))).Replace("-","").ToLowerInvariant();
 }
 static List<string> Actions(AutomationElement e){
  var list=new List<string>();var c=e.Current;if(c.IsPassword||!c.IsEnabled)return list;object p;
  if(e.TryGetCurrentPattern(InvokePattern.Pattern,out p))list.Add("invoke");
  if(e.TryGetCurrentPattern(ValuePattern.Pattern,out p)&&!((ValuePattern)p).Current.IsReadOnly)list.Add("set_value");
  if(e.TryGetCurrentPattern(TogglePattern.Pattern,out p))list.Add("toggle");
  if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out p))list.Add("select");
  if(e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern,out p)){list.Add("expand");list.Add("collapse");}
  if(c.IsKeyboardFocusable)list.Add("focus");return list;
 }
 static Dictionary<string,object> Window(AutomationElement e){var c=e.Current;return new Dictionary<string,object>{{"id",unchecked((uint)c.NativeWindowHandle).ToString(CultureInfo.InvariantCulture)},{"name",Clip(c.Name,256)},{"processId",c.ProcessId}};}
 class Entry{public AutomationElement Element;public int Parent,Depth;}
 static List<Entry> Tree(AutomationElement root){
  var rows=new List<Entry>();var queue=new Queue<Entry>();queue.Enqueue(new Entry{Element=root,Parent=-1,Depth=0});var walker=TreeWalker.ControlViewWalker;
  while(queue.Count>0&&rows.Count<512){var current=queue.Dequeue();int index=rows.Count;rows.Add(current);if(current.Depth>=8)continue;
   var child=walker.GetFirstChild(current.Element);int count=0;
   while(child!=null&&queue.Count+rows.Count<512&&count++<256){queue.Enqueue(new Entry{Element=child,Parent=index,Depth=current.Depth+1});child=walker.GetNextSibling(child);}
  }return rows;
 }
 static string Started(int pid){using(var p=Process.GetProcessById(pid)){Require(p.SessionId==Process.GetCurrentProcess().SessionId);return p.StartTime.ToUniversalTime().Ticks.ToString(CultureInfo.InvariantCulture);}}
 static bool RuntimeMatches(int[] left,object right){var values=(object[])right;if(left.Length!=values.Length)return false;for(int i=0;i<left.Length;i++)if(left[i]!=Convert.ToInt32(values[i]))return false;return true;}
 public static string Run(string input){
  try{
   Guard();SetThreadDpiAwarenessContext(new IntPtr(-4));var request=(Dictionary<string,object>)Json.DeserializeObject(input);
   var handle=request.ContainsKey("windowId")?new IntPtr(Int64.Parse((string)request["windowId"],CultureInfo.InvariantCulture)):GetForegroundWindow();Require(handle!=IntPtr.Zero);
   var root=AutomationElement.FromHandle(handle);var info=root.Current;string started=Started(info.ProcessId);var tree=Tree(root);
   if((string)request["mode"]=="observe"){
    var windows=new List<object>();var next=TreeWalker.ControlViewWalker.GetFirstChild(AutomationElement.RootElement);
    while(next!=null&&windows.Count<64){if(next.Current.NativeWindowHandle!=0)windows.Add(Window(next));next=TreeWalker.ControlViewWalker.GetNextSibling(next);}
    var rows=new List<object>();
    foreach(var entry in tree){var e=entry.Element;var c=e.Current;var rect=c.BoundingRectangle;object p;string value=null;
     if(!c.IsPassword&&e.TryGetCurrentPattern(ValuePattern.Pattern,out p))value=Clip(((ValuePattern)p).Current.Value,512);
     rows.Add(new{parent=entry.Parent,name=c.IsPassword?"Password":Clip(c.Name,256),controlType=c.ControlType.ProgrammaticName,automationId=c.IsPassword?"":Clip(c.AutomationId,256),value=value,enabled=c.IsEnabled,offscreen=c.IsOffscreen,password=c.IsPassword,actions=Actions(e),bounds=new{x=rect.IsEmpty?0:rect.X,y=rect.IsEmpty?0:rect.Y,width=rect.IsEmpty?0:rect.Width,height=rect.IsEmpty?0:rect.Height},runtime=e.GetRuntimeId(),signature=Signature(e)});
    }
    Guard();return Json.Serialize(new{window=Window(root),windows=windows,elements=rows,truncated=tree.Count>=512,started=started,rootRuntime=root.GetRuntimeId()});
   }
   Require((string)request["mode"]=="act"&&info.ProcessId==Convert.ToInt32(request["processId"])&&started==(string)request["started"]&&RuntimeMatches(root.GetRuntimeId(),request["rootRuntime"]));
   AutomationElement target=null;foreach(var entry in tree)if(RuntimeMatches(entry.Element.GetRuntimeId(),request["runtime"])){target=entry.Element;break;}
   Require(target!=null&&Signature(target)==(string)request["signature"]&&!target.Current.IsPassword&&target.Current.IsEnabled);
   string action=(string)request["action"];Require(Actions(target).Contains(action));Guard();
   if(action=="invoke")((InvokePattern)target.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
   else if(action=="set_value")((ValuePattern)target.GetCurrentPattern(ValuePattern.Pattern)).SetValue((string)request["value"]);
   else if(action=="toggle")((TogglePattern)target.GetCurrentPattern(TogglePattern.Pattern)).Toggle();
   else if(action=="select")((SelectionItemPattern)target.GetCurrentPattern(SelectionItemPattern.Pattern)).Select();
   else if(action=="expand")((ExpandCollapsePattern)target.GetCurrentPattern(ExpandCollapsePattern.Pattern)).Expand();
   else if(action=="collapse")((ExpandCollapsePattern)target.GetCurrentPattern(ExpandCollapsePattern.Pattern)).Collapse();
   else if(action=="focus")target.SetFocus();else throw new InvalidOperationException();
   return "{\"acted\":true}";
  }catch{return "{\"unavailable\":true}";}
 }
}
'@
[Console]::Out.Write([SodaUiAutomation]::Run([Console]::In.ReadToEnd()))`;
