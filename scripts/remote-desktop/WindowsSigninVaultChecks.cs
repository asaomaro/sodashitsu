// Generated buffers/facts only; never reads a real enrollment or account.
using System;
using System.Security.Cryptography;
using System.Text;
using System.IO;

public static class SodaDesktopSigninVaultChecks {
    const string Owner="S-1-5-21-1-2-3-1001",Other="S-1-5-21-1-2-3-1002";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static bool Equal(byte[] a,byte[] b){return Convert.ToBase64String(a)==Convert.ToBase64String(b);}
    static void Reject(Action action){try{action();}catch(Exception error){Check(error.Message=="Signin enrollment is unavailable","Private protection error escaped");return;}throw new InvalidOperationException("Unsafe generated enrollment accepted");}
    static SodaDesktopSigninVault.Info Info(){return new SodaDesktopSigninVault.Info{Attributes=128,Volume=1,SizeLow=100,Links=1,IndexLow=42,WriteLow=12};}
    public static void Run(){
        SodaDesktopSigninVault.VerifyLayouts();
        var data=Encoding.UTF8.GetBytes("Sodashitsu generated signin enrollment only");
        var cipher=SodaDesktopSigninVault.Protect(data,Owner);var plain=SodaDesktopSigninVault.Unprotect(cipher,Owner);
        Check(Equal(data,plain),"Generated machine-scope round trip failed");
        Reject(()=>SodaDesktopSigninVault.Unprotect(cipher,Other));
        var changed=(byte[])cipher.Clone();changed[changed.Length-1]^=1;Reject(()=>SodaDesktopSigninVault.Unprotect(changed,Owner));
        Reject(()=>SodaDesktopSigninVault.Unprotect(new byte[]{1,2,3},Owner));
        Reject(()=>SodaDesktopSigninVault.Protect(new byte[16385],Owner));
        Reject(()=>SodaDesktopSigninVault.Unprotect(new byte[65537],Owner));
        Reject(()=>SodaDesktopSigninVault.Protect(data,"S-1-5-18"));
        Reject(()=>SodaDesktopSigninVault.Protect(data,"private invalid owner"));
        var endpointEntropy=Encoding.UTF8.GetBytes("Sodashitsu desktop endpoint identity v1");
        var endpoint=ProtectedData.Protect(data,endpointEntropy,DataProtectionScope.CurrentUser);
        Reject(()=>SodaDesktopSigninVault.Unprotect(endpoint,Owner));
        // Observe the native API rather than assuming its Unprotect scope flag
        // rejects every same-user CurrentUser blob. ACLs remain mandatory.
        var sameEntropy=Encoding.UTF8.GetBytes("Sodashitsu signin enrollment v1\0"+Owner);
        var userCipher=ProtectedData.Protect(data,sameEntropy,DataProtectionScope.CurrentUser);
        byte[] observed=null;bool accepted=false;
        try {observed=SodaDesktopSigninVault.Unprotect(userCipher,Owner);accepted=true;Check(Equal(data,observed),"Observed scope result was not our generated data");}
        catch(InvalidOperationException error){Check(error.Message=="Signin enrollment is unavailable","Unexpected observed scope failure");}
        finally {if(observed!=null)Array.Clear(observed,0,observed.Length);}
        Console.WriteLine("signin_vault_same_user_current_user_blob_accepted="+accepted.ToString().ToLowerInvariant());
        var path=SodaDesktopSigninVault.StoragePath(Owner);var otherPath=SodaDesktopSigninVault.StoragePath(Other);
        Check(path!=otherPath && Path.GetFileName(path)=="enrollment.dpapi" && !path.Contains(Owner),"Owner storage slots are not separated");
        var facts=new SodaDesktopSigninVault.FileFacts(Info(),1);Check(facts.Regular&&facts.Same(new SodaDesktopSigninVault.FileFacts(Info(),1)),"Generated regular file rejected");
        foreach(int variant in new[]{0,1,2,3,4,5,6}){
            var info=Info();uint type=1;
            if(variant==0)type=3;if(variant==1)info.Links=2;if(variant==2)info.Attributes|=1024;if(variant==3)info.Attributes|=16;if(variant==4)info.SizeLow=65537;if(variant==5)info.SizeHigh=1;if(variant==6)info.SizeLow=0;
            var invalid=new SodaDesktopSigninVault.FileFacts(info,type);Check(!invalid.Regular&&!facts.Same(invalid),"Unsafe generated file accepted");
        }
        foreach(int variant in new[]{0,1,2,3,4}){
            var info=Info();if(variant==0)info.Volume++;if(variant==1)info.IndexLow++;if(variant==2)info.SizeLow++;if(variant==3)info.WriteLow++;if(variant==4)info.Attributes|=2;
            Check(!facts.Same(new SodaDesktopSigninVault.FileFacts(info,1)),"Changed generated file accepted");
        }
        foreach(var bytes in new[]{data,cipher,plain,changed,endpoint,userCipher,endpointEntropy,sameEntropy})Array.Clear(bytes,0,bytes.Length);
        Console.WriteLine("signin_vault_generated_crypto_and_facts_passed");
    }
}
