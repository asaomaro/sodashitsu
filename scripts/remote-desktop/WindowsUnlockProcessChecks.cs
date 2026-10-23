// Isolated process tests: no services, screen capture, desktop switching or OS input.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Text;

namespace SodaDesktopTests {
    public static class UnlockProcessChecks {
        [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
        [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr handle);
        [DllImport("advapi32.dll",SetLastError=true)]static extern bool SetKernelObjectSecurity(IntPtr handle,uint information,byte[] descriptor);
        static object Call(string name,params object[] args) {
            try{return typeof(SodaDesktopUnlock).GetMethod(name,BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,args);}
            catch(TargetInvocationException e){throw e.InnerException;}
        }
        static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        static byte[] Bytes(GenericSecurityDescriptor descriptor){var bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);return bytes;}
        static byte[] AceBytes(GenericAce ace){var bytes=new byte[ace.BinaryLength];ace.GetBinaryForm(bytes,0);return bytes;}
        static bool Equal(byte[] a,byte[] b){return Convert.ToBase64String(a)==Convert.ToBase64String(b);}
        static void Rejected(byte[] descriptor,string sid) {
            bool rejected=false;try{Call("AddProcessQuery",descriptor,sid);}catch(InvalidOperationException){rejected=true;}
            Check(rejected,"Unsafe process descriptor or non-logon SID accepted");
        }
        public static void Run() {Run(null);}
        public static void Run(string sourceRoot) {
            string shell=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),@"WindowsPowerShell\v1.0\powershell.exe");
            var owned=(IDisposable)Call("StartProxy",shell,"-NoProfile -NonInteractive -Command Start-Sleep -Seconds 30");
            var ownedObserver=Process.GetProcessById(((Process)owned.GetType().GetField("Process").GetValue(owned)).Id);
            IntPtr observedHandle=ownedObserver.Handle;
            try {
                owned.Dispose();
                Check(ownedObserver.WaitForExit(3000),"Closing proxy job did not reap its child");
            }finally{try{if(!ownedObserver.HasExited)ownedObserver.Kill();}catch{}owned.Dispose();ownedObserver.Dispose();}
            if(sourceRoot!=null) {
                string root=sourceRoot.Replace("'","''");
                string command="$ErrorActionPreference='Stop';Add-Type -Path @('"+root+@"\WindowsDesktopUnlock.cs','"+root+@"\WindowsDesktopHost.cs') -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll,System.ServiceProcess.dll;"+
                    "$child=[SodaDesktopUnlock].GetMethod('StartProxy',[Reflection.BindingFlags]'NonPublic,Static').Invoke($null,@('"+shell.Replace("'","''")+"','-NoProfile -NonInteractive -Command Start-Sleep -Seconds 30'));"+
                    "[Console]::Out.WriteLine($child.Process.Id);[Console]::Out.Flush();Start-Sleep -Seconds 30";
                var start=new ProcessStartInfo(shell,"-NoProfile -NonInteractive -EncodedCommand "+Convert.ToBase64String(Encoding.Unicode.GetBytes(command))) {
                    UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true
                };
                using(var parent=Process.Start(start)) {
                    Process child=null;
                    try {
                        var line=System.Threading.Tasks.Task.Run(()=>parent.StandardOutput.ReadLine());
                        Check(line.Wait(15000)&&line.Result!=null,"Proxy parent did not announce its child");
                        child=Process.GetProcessById(Int32.Parse(line.Result));
                        parent.Kill();Check(parent.WaitForExit(3000),"Proxy parent did not exit");
                        Check(child.WaitForExit(3000),"Terminating proxy parent leaked its child");
                        var eof=System.Threading.Tasks.Task.Run(()=>parent.StandardOutput.ReadToEnd());
                        Check(eof.Wait(3000),"Proxy descendant held the protocol output open");
                    }finally {if(!parent.HasExited)parent.Kill();if(child!=null){if(!child.HasExited)child.Kill();child.Dispose();}}
                }
            }
            // Pure key translation only; no SendInput, capture or IME state change.
            var virtualKey=typeof(SodaDesktopHost).GetMethod("VirtualKey",BindingFlags.NonPublic|BindingFlags.Static);
            Check((ushort)virtualKey.Invoke(null,new object[]{"ImeOn"})==0x16,"IME ON did not map to VK_IME_ON");
            Check((ushort)virtualKey.Invoke(null,new object[]{"ImeOff"})==0x1A,"IME OFF did not map to VK_IME_OFF");
            bool entered=false;
            using(var output=new StringWriter()) {
                Call("RunSecureWorker",output,new Func<string>(()=>"worker_session_unavailable"),new Action(()=>{entered=true;}));
                Check(!entered,"Rejected secure desktop entered the screen/input host");
                Check(output.ToString().Contains("\"code\":\"worker_session_unavailable\""),"Guard failure stage was lost");
            }
            using(var output=new StringWriter()) {
                Call("RunSecureWorker",output,new Func<string>(()=>{throw new IOException("private guard details");}),new Action(()=>{entered=true;}));
                Check(!entered&&output.ToString().Contains("worker_guard")&&!output.ToString().Contains("private"),"Guard exception leaked details or entered the screen/input host");
            }
            using(var output=new StringWriter()) {
                Call("RunSecureWorker",output,new Func<string>(()=>null),new Action(()=>{throw new IOException("private input, image, path");}));
                Check(output.ToString().Contains("worker_initialization")&&!output.ToString().Contains("private"),"Worker failure leaked exception text or lost its stage");
            }
            using(var identity=WindowsIdentity.GetCurrent()) {
                string logon=(string)Call("LogonSid",identity);
                var original=new RawSecurityDescriptor("O:SYG:SYD:P(D;;0x20;;;BU)(A;;0x1fffff;;;SY)(A;ID;0x10;;;BU)");
                var updated=new RawSecurityDescriptor((byte[])Call("AddProcessQuery",Bytes(original),logon),0);
                Check(original.Owner==updated.Owner&&original.Group==updated.Group&&original.ControlFlags==updated.ControlFlags,"Process descriptor metadata changed");
                Check(updated.DiscretionaryAcl.Count==original.DiscretionaryAcl.Count+1,"Unexpected ACE count");
                for(int i=0;i<original.DiscretionaryAcl.Count;i++)
                    Check(Equal(AceBytes(original.DiscretionaryAcl[i]),AceBytes(updated.DiscretionaryAcl[i<2?i:i+1])),"Existing ACE changed");
                var added=(CommonAce)updated.DiscretionaryAcl[2];
                Check(added.SecurityIdentifier.Value==logon&&added.AccessMask==0x1000&&added.AceQualifier==AceQualifier.AccessAllowed&&added.AceFlags==AceFlags.None,"Query grant exceeds the verified logon/limited-query scope");
                Rejected(Bytes(new RawSecurityDescriptor(ControlFlags.None,null,null,null,null)),logon);
                Rejected(Bytes(new RawSecurityDescriptor(ControlFlags.DiscretionaryAclPresent,null,null,null,null)),logon);
                Rejected(Bytes(original),identity.User.Value);

                var start=new ProcessStartInfo("powershell.exe","-NoProfile -NonInteractive -Command Start-Sleep -Seconds 30") {
                    UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true
                };
                using(var process=Process.Start(start)) {
                    IntPtr handle=process.Handle;
                    var prior=(byte[])Call("ProcessDacl",handle);
                    try {
                        // Restrict only this disposable child. Retain its original handle for cleanup.
                        var restricted=new RawSecurityDescriptor("D:P(A;;0x1febff;;;SY)(A;;0x1febff;;;BA)(A;;0x1febff;;;"+identity.User.Value+")");
                        Check(SetKernelObjectSecurity(handle,4,Bytes(restricted)),"Cannot prepare disposable process DACL");
                        var before=OpenProcess(0x1000,false,process.Id);
                        if(before!=IntPtr.Zero){CloseHandle(before);throw new InvalidOperationException("Test must reproduce limited-query access denial");}
                        Check(Marshal.GetLastWin32Error()==5,"Unexpected pre-grant error");
                        Call("GrantProcessQuery",handle,logon);
                        var after=OpenProcess(0x1000,false,process.Id);
                        Check(after!=IntPtr.Zero,"Limited query still denied after logon grant");CloseHandle(after);
                        Check(!String.IsNullOrEmpty((string)Call("Image",process)),"Production image authentication failed");
                        var broad=OpenProcess(0x400,false,process.Id);
                        if(broad!=IntPtr.Zero){CloseHandle(broad);throw new InvalidOperationException("Broader process query was granted");}
                    } finally {
                        bool restored=SetKernelObjectSecurity(handle,4,prior);
                        if(!process.HasExited)process.Kill();process.WaitForExit();
                        Check(restored,"Cannot restore disposable process DACL");
                    }
                }
            }
            Console.WriteLine("desktop_unlock_process_query_passed");
        }
    }
}
