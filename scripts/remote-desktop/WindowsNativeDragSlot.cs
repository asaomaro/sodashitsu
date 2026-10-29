// One native drag worker per current user/PC. A released mutex is not process-exit proof:
// the next worker reads the DPAPI identity and waits on that exact retained process handle.
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace Sodashitsu.NativeDrag
{
    internal sealed class NativeDragSlot:IDisposable
    {
        [StructLayout(LayoutKind.Sequential)] private struct SECURITY_ATTRIBUTES {internal int Length;internal IntPtr Descriptor;internal int Inherit;}
        [StructLayout(LayoutKind.Sequential)] private struct FILE_INFO {internal uint Attributes,CreatedLow,CreatedHigh,AccessedLow,AccessedHigh,WrittenLow,WrittenHigh,Volume,High,Low,Links,IndexHigh,IndexLow;}
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool CreateDirectoryW(string path,ref SECURITY_ATTRIBUTES attributes);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] private static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)] private static extern bool GetFileInformationByHandle(SafeFileHandle file,out FILE_INFO info);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)] private static extern SafeProcessHandle OpenProcess(uint access,bool inherit,uint pid);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)] private static extern bool GetProcessTimes(SafeProcessHandle process,out ulong created,out ulong exited,out ulong kernel,out ulong user);
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)] private static extern uint WaitForSingleObject(SafeProcessHandle process,uint timeout);
        private static readonly byte[] Entropy=Encoding.ASCII.GetBytes("sodashitsu-native-drag-slot-v1");
        private readonly List<SafeFileHandle> parents=new List<SafeFileHandle>();
        private Mutex mutex;private bool owned;private readonly int thread=Thread.CurrentThread.ManagedThreadId;
        private static Exception Failure(){return new InvalidOperationException("Native drag previous process exit or private state could not be verified");}
        private NativeDragSlot(){}
        internal static NativeDragSlot Acquire()
        {
            using(WindowsIdentity identity=WindowsIdentity.GetCurrent())
            {
                if(identity.IsSystem||identity.User==null||new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))throw Failure();
                return AcquireCore(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"SodashitsuNativeDrag"),"Global\\Sodashitsu.NativeDrag."+identity.User.Value,identity.User);
            }
        }
        private static void Policy(FileSystemSecurity security,SecurityIdentifier user,bool directory)
        {
            if(!user.Equals(security.GetOwner(typeof(SecurityIdentifier)))||directory&&!security.AreAccessRulesProtected)throw Failure();bool full=false;
            foreach(FileSystemAccessRule rule in security.GetAccessRules(true,true,typeof(SecurityIdentifier)))
            {
                if(rule.AccessControlType!=AccessControlType.Allow)continue;
                if(!user.Equals(rule.IdentityReference))throw Failure();
                if((rule.FileSystemRights&FileSystemRights.FullControl)==FileSystemRights.FullControl)full=true;
            }
            if(!full)throw Failure();
        }
        private SafeFileHandle Pin(string path,bool directory)
        {
            SafeFileHandle handle=CreateFileW(path,0x80000000,3,IntPtr.Zero,3,0x00200000U|(directory?0x02000000U:0),IntPtr.Zero);
            if(handle.IsInvalid){handle.Dispose();throw Failure();}
            FILE_INFO info;
            if(!GetFileInformationByHandle(handle,out info)||(info.Attributes&0x400)!=0||((info.Attributes&0x10)!=0)!=directory||!directory&&info.Links!=1){handle.Dispose();throw Failure();}
            return handle;
        }
        private void PinParents(string path)
        {
            string full=Path.GetFullPath(path),root=Path.GetPathRoot(full);
            if(full!=path||root.Length!=3||root[1]!=':'||root[2]!='\\')throw Failure();
            string current=root;parents.Add(Pin(current,true));
            foreach(string part in full.Substring(root.Length).Split('\\')){if(part.Length==0)throw Failure();current=Path.Combine(current,part);parents.Add(Pin(current,true));}
        }
        // Tests supply only their own new private directory and unique mutex name.
        internal static NativeDragSlot AcquireCore(string directory,string mutexName,SecurityIdentifier user,Action waiting=null)
        {
            NativeDragSlot result=new NativeDragSlot();
            try
            {
                MutexSecurity mutexPolicy=new MutexSecurity();mutexPolicy.SetOwner(user);mutexPolicy.SetAccessRuleProtection(true,false);mutexPolicy.AddAccessRule(new MutexAccessRule(user,MutexRights.FullControl,AccessControlType.Allow));bool created;
                result.mutex=new Mutex(false,mutexName,out created,mutexPolicy);
                try{result.owned=result.mutex.WaitOne(0);}catch(AbandonedMutexException){result.owned=true;}
                if(!result.owned)throw Failure();
                result.PinParents(Path.GetDirectoryName(directory));
                DirectorySecurity policy=new DirectorySecurity();policy.SetOwner(user);policy.SetAccessRuleProtection(true,false);policy.AddAccessRule(new FileSystemAccessRule(user,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
                byte[] descriptor=policy.GetSecurityDescriptorBinaryForm();GCHandle pinned=GCHandle.Alloc(descriptor,GCHandleType.Pinned);bool fresh;
                try {SECURITY_ATTRIBUTES attributes=new SECURITY_ATTRIBUTES{Length=Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)),Descriptor=pinned.AddrOfPinnedObject()};fresh=CreateDirectoryW(directory,ref attributes);if(!fresh&&Marshal.GetLastWin32Error()!=183)throw Failure();}
                finally{pinned.Free();Array.Clear(descriptor,0,descriptor.Length);}
                result.parents.Add(result.Pin(directory,true));Policy(Directory.GetAccessControl(directory),user,true);
                string journal=Path.Combine(directory,"worker.dpapi");
                if(!fresh)result.Previous(journal,user,waiting);
                result.Record(journal,user,fresh);return result;
            }
            catch{result.Dispose();throw;}
        }
        private void Previous(string path,SecurityIdentifier user,Action waiting)
        {
            byte[] protectedBytes=null,plain=null;
            try
            {
                using(SafeFileHandle pinned=Pin(path,false))
                using(FileStream input=new FileStream(pinned,FileAccess.Read,4096,false))
                {
                    Policy(File.GetAccessControl(path),user,false);if(input.Length<1||input.Length>16384)throw Failure();protectedBytes=new byte[(int)input.Length];int at=0;
                    while(at<protectedBytes.Length){int count=input.Read(protectedBytes,at,protectedBytes.Length-at);if(count==0)throw Failure();at+=count;}if(input.ReadByte()!=-1)throw Failure();
                }
                plain=ProtectedData.Unprotect(protectedBytes,Entropy,DataProtectionScope.CurrentUser);string[] fields=new UTF8Encoding(false,true).GetString(plain).Split('\n');uint pid;ulong created;
                if(fields.Length!=4||fields[0]!="native-drag-slot-v1"||fields[1]!=user.Value||!UInt32.TryParse(fields[2],NumberStyles.None,CultureInfo.InvariantCulture,out pid)||pid==0||!UInt64.TryParse(fields[3],NumberStyles.None,CultureInfo.InvariantCulture,out created)||created==0)throw Failure();
                using(SafeProcessHandle process=OpenProcess(0x00101000,false,pid))
                {
                    if(process.IsInvalid){int error=Marshal.GetLastWin32Error();if(error==87)return;throw Failure();}
                    ulong actual,exited,kernel,cpu;if(!GetProcessTimes(process,out actual,out exited,out kernel,out cpu))throw Failure();
                    if(actual!=created)return; // The original process exited; its PID has been reused.
                    if(waiting!=null)waiting();
                    if(WaitForSingleObject(process,5000)!=0)throw Failure();
                }
            }
            finally{if(protectedBytes!=null)Array.Clear(protectedBytes,0,protectedBytes.Length);if(plain!=null)Array.Clear(plain,0,plain.Length);}
        }
        internal static FileSecurity UserFilePolicy(SecurityIdentifier user)
        {
            FileSecurity security=new FileSecurity();security.SetOwner(user);security.SetAccessRuleProtection(true,false);security.AddAccessRule(new FileSystemAccessRule(user,FileSystemRights.FullControl,AccessControlType.Allow));return security;
        }
        private void Record(string path,SecurityIdentifier user,bool fresh)
        {
            byte[] plain=null,encrypted=null;string stage=path+"."+Guid.NewGuid().ToString("N");
            try
            {
                using(Process current=Process.GetCurrentProcess())
                using(SafeProcessHandle process=OpenProcess(0x00101000,false,(uint)current.Id))
                {
                    ulong created,exited,kernel,cpu;if(process.IsInvalid||!GetProcessTimes(process,out created,out exited,out kernel,out cpu)||created==0)throw Failure();
                    plain=Encoding.UTF8.GetBytes("native-drag-slot-v1\n"+user.Value+"\n"+current.Id.ToString(CultureInfo.InvariantCulture)+"\n"+created.ToString(CultureInfo.InvariantCulture));
                }
                encrypted=ProtectedData.Protect(plain,Entropy,DataProtectionScope.CurrentUser);
                using(FileStream output=new FileStream(stage,FileMode.CreateNew,FileSystemRights.FullControl,FileShare.None,4096,FileOptions.None,UserFilePolicy(user))){output.Write(encrypted,0,encrypted.Length);output.Flush(true);}
                if(fresh)File.Move(stage,path);else File.Replace(stage,path,null);
                using(SafeFileHandle pinned=Pin(path,false))Policy(File.GetAccessControl(path),user,false);
            }
            finally{if(plain!=null)Array.Clear(plain,0,plain.Length);if(encrypted!=null)Array.Clear(encrypted,0,encrypted.Length);}
        }
        public void Dispose()
        {
            if(owned&&thread!=Thread.CurrentThread.ManagedThreadId)throw new InvalidOperationException("Native slot must close on its owning thread");
            for(int i=parents.Count-1;i>=0;i--)parents[i].Dispose();parents.Clear();
            if(owned){owned=false;mutex.ReleaseMutex();}if(mutex!=null){mutex.Dispose();mutex=null;}
            // Keep worker.dpapi. The next admission must prove this process has actually exited.
        }
    }
}
