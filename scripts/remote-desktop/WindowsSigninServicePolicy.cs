// Read-only SCM inspection. No registration/start/stop/change/ACL repair API.
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
public static class SodaDesktopSigninServicePolicy {
    static Exception Failure(){return new InvalidOperationException("Signin service configuration is unavailable");}
    internal sealed class Facts {
        internal string Name,Binary,Account;
        internal uint Type,Start;internal byte[] Security;
    }
    public static string Name(string owner){return "SodaDesktopSignin-"+SodaDesktopSigninPackage.Slot(owner).Substring(0,16);}
    internal static string LegacyName(string owner){return "SodaDesktopSignin-"+SodaDesktopSigninPackage.Slot(owner);}
    public static string Executable(string owner){return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu","DesktopSignin-"+SodaDesktopSigninPackage.Slot(owner),"DesktopSigninNative.exe");}
    internal static bool Acl(byte[] bytes){
        try{
            var descriptor=new RawSecurityDescriptor(bytes,0);if(descriptor.Owner==null||descriptor.Owner.Value!="S-1-5-18"&&descriptor.Owner.Value!="S-1-5-32-544"||descriptor.DiscretionaryAcl==null||(descriptor.ControlFlags&ControlFlags.DiscretionaryAclPresent)==0)return false;
            bool system=false,admins=false;
            foreach(GenericAce raw in descriptor.DiscretionaryAcl){
                var ace=raw as CommonAce;if(ace==null||ace.IsCallback||ace.AceQualifier!=AceQualifier.AccessAllowed||(ace.AceFlags&AceFlags.InheritOnly)!=0)return false;
                string sid=ace.SecurityIdentifier.Value;uint mask=unchecked((uint)ace.AccessMask);
                if(sid=="S-1-5-18"||sid=="S-1-5-32-544"){
                    bool full=(mask&0x10000000)!=0||(mask&0x000f01ff)==0x000f01ff;if(sid=="S-1-5-18")system|=full;else admins|=full;
                }else if((mask&~0x0002008du)!=0)return false; // query/read/interrogate only
            }
            return system&&admins;
        }catch{return false;}
    }
    internal static void Validate(Facts f,string name,string executable){ValidateStart(f,name,executable,false);}
    internal static void ValidateDisabled(Facts f,string name,string executable){ValidateStart(f,name,executable,true);}
    static void ValidateStart(Facts f,string name,string executable,bool disabled){
        if(f==null||f.Name!=name||String.IsNullOrEmpty(executable)||!Path.IsPathRooted(executable)||executable.IndexOf('"')>=0||executable.IndexOf('%')>=0||!String.Equals(f.Binary,"\""+executable+"\"",StringComparison.OrdinalIgnoreCase)||f.Account!="LocalSystem"||f.Type!=0x10||(disabled?f.Start!=4:f.Start!=2&&f.Start!=3)||!Acl(f.Security))throw Failure();
    }
    [StructLayout(LayoutKind.Sequential)]internal struct Config {internal uint Type,Start,Error;internal IntPtr Binary,Group;internal uint Tag;internal IntPtr Dependencies,Account,Display;}
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr OpenSCManagerW(string machine,string database,uint access);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern IntPtr OpenServiceW(IntPtr manager,string name,uint access);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool CloseServiceHandle(IntPtr handle);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool QueryServiceConfigW(IntPtr service,IntPtr buffer,uint size,out uint needed);
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool QueryServiceObjectSecurity(IntPtr service,uint information,IntPtr buffer,uint size,out uint needed);
    internal sealed class Buffer:IDisposable {
        internal readonly IntPtr Pointer;internal readonly int Size;
        internal Buffer(int size){if(size<4||size>65536)throw Failure();Size=size;Pointer=Marshal.AllocHGlobal(size);for(int i=0;i<size;i++)Marshal.WriteByte(Pointer,i,0);}
        internal int Offset(IntPtr pointer,int bytes){long offset=pointer.ToInt64()-Pointer.ToInt64();if(pointer==IntPtr.Zero||bytes<0||offset<0||offset>Size||bytes>Size-offset)throw Failure();return (int)offset;}
        internal string Text(IntPtr pointer){if(pointer==IntPtr.Zero)return "";int at=Offset(pointer,2);var result=new System.Text.StringBuilder();for(int count=0;count<4096;count++,at+=2){if(at>Size-2)throw Failure();char value=(char)Marshal.ReadInt16(Pointer,at);if(value=='\0')return result.ToString();result.Append(value);}throw Failure();}
        public void Dispose(){Marshal.FreeHGlobal(Pointer);}
    }
    static Buffer Read(IntPtr service,bool security){
        uint needed;bool ok=security?QueryServiceObjectSecurity(service,5,IntPtr.Zero,0,out needed):QueryServiceConfigW(service,IntPtr.Zero,0,out needed);
        if(ok||Marshal.GetLastWin32Error()!=122||needed<4||needed>65536)throw Failure();var buffer=new Buffer((int)needed);bool transferred=false;
        try{uint returned;ok=security?QueryServiceObjectSecurity(service,5,buffer.Pointer,(uint)buffer.Size,out returned):QueryServiceConfigW(service,buffer.Pointer,(uint)buffer.Size,out returned);if(!ok||returned>buffer.Size)throw Failure();transferred=true;return buffer;}finally{if(!transferred)buffer.Dispose();}
    }
    internal static byte[] Security(IntPtr service){using(var buffer=Read(service,true)){var bytes=new byte[buffer.Size];Marshal.Copy(buffer.Pointer,bytes,0,bytes.Length);return bytes;}}
    internal static void Configuration(Buffer buffer,Facts facts){if(buffer.Size<Marshal.SizeOf(typeof(Config)))throw Failure();var config=(Config)Marshal.PtrToStructure(buffer.Pointer,typeof(Config));facts.Type=config.Type;facts.Start=config.Start;facts.Binary=buffer.Text(config.Binary);facts.Account=buffer.Text(config.Account);}
    public static void Inspect(string owner){Inspect(owner,false,false);}
    internal static void InspectDisabled(string owner){Inspect(owner,true,false);}
    internal static void InspectLegacy(string owner,bool disabled){Inspect(owner,disabled,true);}
    internal static uint StartupType(string owner,bool legacy){return Inspect(owner,false,legacy);}
    static uint Inspect(string owner,bool disabled,bool legacy){
        owner=SodaDesktopSigninPackage.OwnerSid(owner);string name=legacy?LegacyName(owner):Name(owner),executable=Executable(owner);IntPtr manager=IntPtr.Zero,service=IntPtr.Zero;
        try{
            manager=OpenSCManagerW(null,null,1);if(manager==IntPtr.Zero)throw Failure();service=OpenServiceW(manager,name,0x00020001);if(service==IntPtr.Zero)throw Failure();var facts=new Facts{Name=name};
            using(var buffer=Read(service,false))Configuration(buffer,facts);facts.Security=Security(service);
            ValidateStart(facts,name,executable,disabled);return facts.Start;
        }finally{if(service!=IntPtr.Zero)CloseServiceHandle(service);if(manager!=IntPtr.Zero)CloseServiceHandle(manager);}
    }
}
