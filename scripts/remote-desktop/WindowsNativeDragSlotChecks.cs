using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using Sodashitsu.NativeDrag;
internal static class NativeDragSlotChecks
{
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool CreateHardLinkW(string path,string existing,IntPtr security);
    private static void Assert(bool value,string reason){if(!value)throw new Exception("generated assertion: "+reason);}
    private static readonly List<Process> Owned=new List<Process>();
    private static Process Start(string directory,string name,string mode)
    {
        ProcessStartInfo start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"child \""+directory+"\" \""+name+"\" "+mode){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
        Process process=Process.Start(start);Owned.Add(process);return process;
    }
    private static int Child(string directory,string name,string mode)
    {
        try
        {
            using(WindowsIdentity identity=WindowsIdentity.GetCurrent())
            using(NativeDragSlot slot=NativeDragSlot.AcquireCore(directory,name,identity.User,delegate{Console.WriteLine("waiting_for_previous_exit");Console.Out.Flush();}))
            {
                Console.WriteLine("slot_ready");Console.Out.Flush();
                if(mode=="linger")Assert(Console.In.ReadLine()=="release","fixture release gate missing");
            }
            if(mode=="linger"){Console.WriteLine("mutex_released_process_alive");Console.Out.Flush();Assert(Console.In.ReadLine()=="exit","fixture exit gate missing");}
            return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);Console.WriteLine("slot_refused");return 3;}
    }
    private static int Finish(Process process)
    {
        if(!process.WaitForExit(7000)){process.Kill();process.WaitForExit();throw new Exception("generated assertion: owned fixture worker failed to exit");}return process.ExitCode;
    }
    private static void Policy()
    {
        using(WindowsIdentity identity=WindowsIdentity.GetCurrent())
        {
            FileSecurity createdFile=NativeDragSlot.UserFilePolicy(identity.User);
            Assert(identity.User.Equals(createdFile.GetOwner(typeof(SecurityIdentifier)))&&createdFile.AreAccessRulesProtected,"journal creation owner must be explicit current user");
            DirectorySecurity unsafePolicy=new DirectorySecurity();unsafePolicy.SetOwner(identity.User);unsafePolicy.SetAccessRuleProtection(true,false);unsafePolicy.AddAccessRule(new FileSystemAccessRule(identity.User,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
            unsafePolicy.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.WorldSid,null),FileSystemRights.ReadData,AccessControlType.Allow));
            try{typeof(NativeDragSlot).GetMethod("Policy",BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,new object[]{unsafePolicy,identity.User,true});}
            catch(TargetInvocationException error){if(error.InnerException is InvalidOperationException)return;throw;}
            throw new Exception("generated assertion: broad read ACL accepted");
        }
    }
    internal static int Main(string[] args)
    {
        if(args.Length==4&&args[0]=="child")return Child(args[1],args[2],args[3]);
        string fixture=Path.Combine(Path.GetTempPath(),"soda-native-slot-generated-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(fixture);
        try
        {
            Policy();string directory=Path.Combine(fixture,"state"),name="Local\\SodashitsuNativeSlotGenerated."+Guid.NewGuid().ToString("N");
            Process first=Start(directory,name,"linger");
            {
                string firstLine=first.StandardOutput.ReadLine();if(firstLine!="slot_ready"){Finish(first);throw new Exception("generated assertion: first private fixture slot refused: "+first.StandardError.ReadToEnd());}
                Process busy=Start(directory,name,"normal");Assert(Finish(busy)==3,"concurrent native slot accepted");
                first.StandardInput.WriteLine("release");first.StandardInput.Flush();
                Assert(first.StandardOutput.ReadLine()=="mutex_released_process_alive","fixture process did not linger after mutex release");
                Process next=Start(directory,name,"normal");
                {
                    Assert(next.StandardOutput.ReadLine()=="waiting_for_previous_exit","next admission did not inspect old process");
                    Task<string> ready=Task.Factory.StartNew(delegate{return next.StandardOutput.ReadLine();});
                    try {Assert(!first.HasExited&&!ready.Wait(150),"mutex release substituted for actual process exit");}
                    finally {first.StandardInput.WriteLine("exit");first.StandardInput.Flush();}
                    Assert(ready.Wait(5000)&&ready.Result=="slot_ready"&&Finish(next)==0,"next slot did not recover after actual process exit");
                }
                Assert(Finish(first)==0,"fixture worker failed");
            }
            string journal=Path.Combine(directory,"worker.dpapi"),alias=Path.Combine(directory,"alias");byte[] original=File.ReadAllBytes(journal);
            Assert(CreateHardLinkW(alias,journal,IntPtr.Zero),"generated hardlink fixture unavailable");
            Process linked=Start(directory,name,"normal");Assert(Finish(linked)==3,"multiply linked native journal accepted");File.Delete(alias);
            File.WriteAllBytes(journal,new byte[]{1,2,3});Process corrupt=Start(directory,name,"normal");Assert(Finish(corrupt)==3,"corrupt native journal accepted");
            File.WriteAllBytes(journal,original);Array.Clear(original,0,original.Length);Process restored=Start(directory,name,"normal");Assert(Finish(restored)==0,"valid old exited process journal could not recover");
            Console.WriteLine("native_drag_slot_generated_private_dpapi_retained_process_exit_busy_hardlink_and_corrupt_passed");return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
        finally
        {
            foreach(Process child in Owned){try{if(!child.HasExited&&!child.WaitForExit(2000)){child.Kill();child.WaitForExit();}}finally{child.Dispose();}}
            Owned.Clear();Directory.Delete(fixture,true);
        }
    }
}
