using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
public static class SodaDesktopSigninServicePolicyChecks {
    const string Name="SodaDesktopSignin-generated";
    static readonly string Exe=Path.Combine(Path.GetTempPath(),"generated","DesktopSigninNative.exe");
    static byte[] Security(string sddl){var descriptor=new RawSecurityDescriptor(sddl);var bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);return bytes;}
    static byte[] EmptySecurity(){var sid=new SecurityIdentifier("S-1-5-18");var descriptor=new RawSecurityDescriptor(ControlFlags.DiscretionaryAclPresent,sid,sid,null,new RawAcl(2,0));var bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);return bytes;}
    static SodaDesktopSigninServicePolicy.Facts Safe(){return new SodaDesktopSigninServicePolicy.Facts{Name=Name,Binary="\""+Exe+"\"",Account="LocalSystem",Type=0x10,Start=3,Security=Security("O:SYG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;CCLCSWLORC;;;BU)")};}
    static void Denied(Action<SodaDesktopSigninServicePolicy.Facts> mutate,string message){var facts=Safe();mutate(facts);Refused(()=>SodaDesktopSigninServicePolicy.Validate(facts,Name,Exe),message);}
    static void Refused(Action run,string message){bool failed=false;try{run();}catch(InvalidOperationException){failed=true;}if(!failed)throw new InvalidOperationException(message);}
    public static void Run(){
        foreach(uint startup in new uint[]{2,3}){var facts=Safe();facts.Start=startup;SodaDesktopSigninServicePolicy.Validate(facts,Name,Exe);}
        var disabled=Safe();disabled.Start=4;SodaDesktopSigninServicePolicy.ValidateDisabled(disabled,Name,Exe);
        foreach(uint startup in new uint[]{0,1,4,5})Denied(f=>f.Start=startup,"Non-startable service configuration accepted");
        Denied(f=>f.Binary=Exe,"Unquoted service path accepted");Denied(f=>f.Binary+=" --owner other","Extra service arguments accepted");Denied(f=>f.Binary="\""+Path.Combine(Path.GetTempPath(),"other.exe")+"\"","Other service executable accepted");
        Denied(f=>f.Name="OtherService","Wrong service namespace accepted");Denied(f=>f.Account="generated-user","Non-System service account accepted");Denied(f=>f.Type=0x110,"Interactive service type accepted");Denied(f=>f.Type=0x20,"Shared-process service accepted");
        foreach(string right in new[]{"DC","RP","WP","DT","CR","SD","WD","WO","GA","GW","GX"})Denied(f=>f.Security=Security("O:SYG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;"+right+";;;BU)"),"Untrusted service control right accepted: "+right);
        Denied(f=>f.Security=Security("O:BUG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)"),"Untrusted service owner accepted");Denied(f=>f.Security=EmptySecurity(),"Empty service ACL accepted");Denied(f=>f.Security=Security("O:SYG:SYD:P(A;;GA;;;SY)"),"Missing administrator controller accepted");
        if(IntPtr.Size!=8||Marshal.SizeOf(typeof(SodaDesktopSigninServicePolicy.Config))!=64||Marshal.OffsetOf(typeof(SodaDesktopSigninServicePolicy.Config),"Binary").ToInt32()!=16||Marshal.OffsetOf(typeof(SodaDesktopSigninServicePolicy.Config),"Account").ToInt32()!=48)throw new InvalidOperationException("SCM x64 ABI mismatch");
        using(var buffer=new SodaDesktopSigninServicePolicy.Buffer(256)){
            IntPtr binary=IntPtr.Add(buffer.Pointer,64),account=IntPtr.Add(buffer.Pointer,192);char[] path="generated.exe\0".ToCharArray(),identity="LocalSystem\0".ToCharArray();Marshal.Copy(path,0,binary,path.Length);Marshal.Copy(identity,0,account,identity.Length);
            var config=new SodaDesktopSigninServicePolicy.Config{Type=16,Start=2,Error=1,Binary=binary,Account=account};Marshal.StructureToPtr(config,buffer.Pointer,false);var facts=Safe();SodaDesktopSigninServicePolicy.Configuration(buffer,facts);if(facts.Binary!="generated.exe"||facts.Account!="LocalSystem"||facts.Start!=2)throw new InvalidOperationException("SCM config decode changed");
            Refused(()=>buffer.Offset(IntPtr.Add(buffer.Pointer,-1),2),"SCM accepted pointer before buffer");Refused(()=>buffer.Offset(IntPtr.Add(buffer.Pointer,255),2),"SCM accepted pointer past buffer");
            for(int i=64;i<256;i+=2)Marshal.WriteInt16(buffer.Pointer,i,65);Refused(()=>buffer.Text(binary),"SCM accepted unterminated text");
        }
        Console.WriteLine("signin_service_standard_start_modes_identity_and_acl_passed");
    }
}
