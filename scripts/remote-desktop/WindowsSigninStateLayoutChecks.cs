using System;
using System.IO;
using System.Security.AccessControl;
public static class SodaDesktopSigninStateLayoutChecks {
    const string Owner="S-1-5-21-1-2-3-1001";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static byte[] Acl(string sddl){var descriptor=new RawSecurityDescriptor(sddl);var bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);return bytes;}
    public static void Run(){
        string root=SodaDesktopSigninVault.StateRoot();
        Check(root==Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu","DesktopSigninData"),"State root crossed into metadata-writable ProgramData");
        SodaDesktopSigninVault.RequireNoLegacyState(Owner,p=>true);
        bool rejected=false;try{SodaDesktopSigninVault.RequireNoLegacyState(Owner,p=>false);}catch(InvalidOperationException){rejected=true;}
        Check(rejected,"Legacy owner state was silently replaced");
        var paths=SodaDesktopSigninInstallFiles.Paths.Installed(Owner,Guid.NewGuid().ToString("N"));
        Check(paths.DataParent==root&&paths.Slot==SodaDesktopSigninVault.StateDirectory(Owner)&&Path.Combine(paths.Slot,"enrollment.dpapi")==SodaDesktopSigninVault.StoragePath(Owner),"Installer and vault state locations disagree");
        var privateAcl=Acl("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)");
        var readable=Acl("O:BAG:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FR;;;BU)");
        foreach(string path in new[]{root,paths.Slot,Path.Combine(paths.Slot,"runtime")}){
            Check(SodaDesktopSigninQuiescence.StateAncestor(path,privateAcl),"Private state rejected");
            Check(!SodaDesktopSigninQuiescence.StateAncestor(path,readable),"State root permitted ordinary reads");
        }
        var programData=Acl("O:SYG:SYD:(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FR;;;BU)(A;CI;0x116;;;BU)");
        Check(!SodaDesktopSigninPackage.CodeAcl(programData,false),"Metadata-writable ancestor ACL was relaxed");
        // Existing ancestors only, read-only native handles. Never creates a
        // directory, opens an enrollment file, or touches SCM/input/keys.
        for(string path=root;!String.IsNullOrEmpty(path);path=Path.GetDirectoryName(path)){
            if(!Directory.Exists(path))continue;
            using(var held=SodaDesktopSigninPackageNative.OpenCore(path,true,false,0,bytes=>SodaDesktopSigninQuiescence.StateAncestor(path,bytes),null))
                SodaDesktopSigninPackageNative.CheckCore(held,bytes=>SodaDesktopSigninQuiescence.StateAncestor(path,bytes));
        }
        Console.WriteLine("signin_private_state_layout_legacy_refusal_strict_acl_and_existing_ancestor_handles_passed");
    }
}
