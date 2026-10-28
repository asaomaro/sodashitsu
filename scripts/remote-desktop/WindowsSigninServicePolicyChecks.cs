using System;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
public static class SodaDesktopSigninServicePolicyChecks {
    const string Name="SodaDesktopSignin-generated",Exe="C:\\Program Files\\Sodashitsu\\generated\\DesktopSigninService.exe";
    static byte[] Security(string sddl){var descriptor=new RawSecurityDescriptor(sddl);var bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);return bytes;}
    static SodaDesktopSigninServicePolicy.Facts Safe(){return new SodaDesktopSigninServicePolicy.Facts{Name=Name,Binary="\""+Exe+"\"",Account="LocalSystem",Group="",Dependencies="",RecoveryCommand="",RebootMessage="",Type=0x10,Start=3,ErrorControl=1,Actions=new uint[0],Security=Security("O:SYG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;CCLCSWLORC;;;BU)")};}
    static void Denied(Action<SodaDesktopSigninServicePolicy.Facts> mutate,string message){var facts=Safe();mutate(facts);bool failed=false;try{SodaDesktopSigninServicePolicy.Validate(facts,Name,Exe);}catch(InvalidOperationException){failed=true;}if(!failed)throw new InvalidOperationException(message);}
    static void Refused(Action run,string message){bool failed=false;try{run();}catch(InvalidOperationException){failed=true;}if(!failed)throw new InvalidOperationException(message);}
    static void Parser(){
        if(IntPtr.Size!=8||Marshal.SizeOf(typeof(SodaDesktopSigninServicePolicy.Config))!=64||Marshal.OffsetOf(typeof(SodaDesktopSigninServicePolicy.Config),"Binary").ToInt32()!=16||Marshal.OffsetOf(typeof(SodaDesktopSigninServicePolicy.Config),"Dependencies").ToInt32()!=40||Marshal.SizeOf(typeof(SodaDesktopSigninServicePolicy.FailureActions))!=40||Marshal.OffsetOf(typeof(SodaDesktopSigninServicePolicy.FailureActions),"Actions").ToInt32()!=32)throw new InvalidOperationException("SCM x64 ABI mismatch");
        using(var buffer=new SodaDesktopSigninServicePolicy.Buffer(256)){
            IntPtr binary=IntPtr.Add(buffer.Pointer,64),account=IntPtr.Add(buffer.Pointer,192);char[] path="generated.exe\0".ToCharArray(),identity="LocalSystem\0".ToCharArray();Marshal.Copy(path,0,binary,path.Length);Marshal.Copy(identity,0,account,identity.Length);
            var config=new SodaDesktopSigninServicePolicy.Config{Type=16,Start=3,Error=1,Binary=binary,Account=account};Marshal.StructureToPtr(config,buffer.Pointer,false);var facts=Safe();SodaDesktopSigninServicePolicy.Configuration(buffer,facts);if(facts.Binary!="generated.exe"||facts.Account!="LocalSystem"||facts.Dependencies!="")throw new InvalidOperationException("SCM generated config decode changed");
            Refused(()=>buffer.Offset(IntPtr.Add(buffer.Pointer,-1),2),"SCM accepted pointer before buffer");Refused(()=>buffer.Offset(IntPtr.Add(buffer.Pointer,255),2),"SCM accepted pointer past buffer");Refused(()=>buffer.Offset(buffer.Pointer,257),"SCM accepted oversized field");
            for(int i=64;i<256;i+=2)Marshal.WriteInt16(buffer.Pointer,i,65);Refused(()=>buffer.Text(binary,false),"SCM accepted unterminated text");Marshal.WriteInt16(buffer.Pointer,254,0);Refused(()=>buffer.Text(binary,true),"SCM accepted unterminated MULTI_SZ");
        }
        using(var buffer=new SodaDesktopSigninServicePolicy.Buffer(256)){
            var actions=new SodaDesktopSigninServicePolicy.FailureActions{Count=1,Actions=IntPtr.Add(buffer.Pointer,56)};Marshal.StructureToPtr(actions,buffer.Pointer,false);Marshal.WriteInt32(buffer.Pointer,56,0);var facts=Safe();SodaDesktopSigninServicePolicy.Recovery(buffer,facts);if(facts.Actions.Length!=1||facts.Actions[0]!=0)throw new InvalidOperationException("SCM action decode changed");
            actions.Count=17;Marshal.StructureToPtr(actions,buffer.Pointer,false);Refused(()=>SodaDesktopSigninServicePolicy.Recovery(buffer,facts),"SCM accepted excessive action count");actions.Count=2;actions.Actions=IntPtr.Add(buffer.Pointer,248);Marshal.StructureToPtr(actions,buffer.Pointer,false);Refused(()=>SodaDesktopSigninServicePolicy.Recovery(buffer,facts),"SCM accepted action array outside buffer");
        }
    }
    public static void Run(){
        Parser();SodaDesktopSigninServicePolicy.Validate(Safe(),Name,Exe);
        if(!SodaDesktopSigninControllerMutex.Policy(Security("O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)")))throw new InvalidOperationException("Controller private mutex policy rejected");
        foreach(string sddl in new[]{"O:BUG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)","O:SYG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;RC;;;BU)","O:SYG:SYD:P(A;;GA;;;SY)","O:SYG:SYD:"})if(SodaDesktopSigninControllerMutex.Policy(Security(sddl)))throw new InvalidOperationException("Unsafe controller mutex ACL accepted");
        Denied(f=>f.Binary=Exe,"Unquoted service path accepted");Denied(f=>f.Binary+=" --owner other","Extra service arguments accepted");Denied(f=>f.Binary="\"C:\\Other\\DesktopSigninService.exe\"","Other service executable accepted");
        Denied(f=>f.Name="SodaDesktopUnlock-generated","Wrong service namespace accepted");Denied(f=>f.Account="generated-user","Non-System service account accepted");Denied(f=>f.Type=0x110,"Interactive service type accepted");Denied(f=>f.Type=0x20,"Shared-process service accepted");Denied(f=>f.Start=2,"Automatic startup accepted");Denied(f=>f.ErrorControl=3,"Unexpected service error policy accepted");
        Denied(f=>f.Group="group","Service load group accepted");Denied(f=>f.Dependencies="other","Service dependencies accepted");Denied(f=>f.RecoveryCommand="cmd.exe","Recovery program accepted");Denied(f=>f.RebootMessage="reboot","Recovery reboot message accepted");Denied(f=>f.ResetPeriod=1,"Recovery reset policy accepted");Denied(f=>f.Actions=new uint[]{1},"Recovery restart action accepted");Denied(f=>f.Actions=new uint[]{3},"Recovery run-command action accepted");Denied(f=>f.Actions=null,"Missing recovery facts accepted");Denied(f=>f.Delayed=1,"Delayed startup accepted");Denied(f=>f.FailureOnCrash=1,"Failure actions on noncrash accepted");Denied(f=>f.Triggers=1,"Service triggers accepted");Denied(f=>f.LaunchProtected=1,"Unexpected launch protection accepted");
        foreach(string right in new[]{"DC","RP","WP","DT","CR","SD","WD","WO","GA","GW","GX"}){string acl="O:SYG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;"+right+";;;BU)";Denied(f=>f.Security=Security(acl),"Untrusted service control right accepted: "+right);}
        Denied(f=>f.Security=Security("O:BUG:SYD:P(A;;GA;;;SY)(A;;GA;;;BA)"),"Untrusted service owner accepted");Denied(f=>f.Security=Security("O:SYG:SYD:"),"Empty service ACL accepted");Denied(f=>f.Security=Security("O:SYG:SYD:P(A;;GA;;;SY)"),"Missing administrator controller accepted");Denied(f=>f.Security=new byte[]{1,2,3},"Malformed service ACL accepted");
        Console.WriteLine("signin_service_policy_generated_closed_configuration_and_acl_passed");
    }
}
