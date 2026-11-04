using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninUnclaimedRecoveryChecks {
    const string Owner="S-1-5-21-1-2-3-1001";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}catch(IOException){failed=true;}Check(failed,message);}
    static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    sealed class Fixture:IDisposable {
        internal readonly string Root,HashValue,Nonce=Guid.NewGuid().ToString("D"),RunId=Guid.NewGuid().ToString("D");
        internal readonly SodaDesktopSigninInstallFiles.Paths Paths;internal string Fingerprint,RunHash,AdminHash;internal byte[] RunBytes,AdminBytes;internal long Now=400000;internal bool Active=true,Stopped=true;
        internal Fixture(string kind="initialize",long adminExpires=121000,long runExpires=61000,string intentNonce=null){
            Root=Path.Combine(Path.GetTempPath(),"uc-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(Root);
            Paths=new SodaDesktopSigninInstallFiles.Paths(Path.Combine(Root,"p"),Path.Combine(Root,"d"),Owner,Guid.NewGuid().ToString("N"));HashValue=SodaDesktopSigninInstallSourceChecks.Make(Paths.Code);
            foreach(string name in new[]{"admin","runs","runtime"})Directory.CreateDirectory(Path.Combine(Paths.Slot,name));File.WriteAllBytes(Path.Combine(Paths.Slot,"quiescence.lock"),new byte[]{83});
            using(var pin=Barrier())Fingerprint=pin.Fingerprint;
            var request=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-admin"},{"ownerSid",Owner},{"nonce",Nonce},{"issuedAt",1000L},{"expiresAt",adminExpires},{"operation",new Dictionary<string,object>{{"kind",kind}}}};
            byte[] plain=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(request));try{using(var envelope=SodaDesktopSigninAdminEnvelope.Protect(plain,Owner,Nonce))AdminBytes=envelope.Encode();}finally{Array.Clear(plain,0,plain.Length);}
            AdminHash=Hash(AdminBytes);File.WriteAllBytes(Path.Combine(Paths.Slot,"admin","admin.pending"),AdminBytes);
            var intent=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","intent"},{"ownerSid",Owner},{"runId",RunId},{"packageSha256",HashValue},{"barrierSha256",Fingerprint},{"issuedAt",2000L},{"expiresAt",runExpires},{"mode","admin"},{"adminNonce",intentNonce??Nonce},{"adminSha256",AdminHash}},Owner);
            RunBytes=intent.Protect();RunHash=Hash(RunBytes);File.WriteAllBytes(Path.Combine(Paths.Slot,"runs","intent.pending"),RunBytes);
        }
        internal SodaDesktopSigninQuiescence.Pin Barrier(){return SodaDesktopSigninQuiescence.OpenCore(Path.Combine(Paths.Slot,"quiescence.lock"),new[]{Paths.Slot},(p,a)=>true);}
        internal IDictionary<string,object> Run(Action<string> step=null){return SodaDesktopSigninUnclaimedRecovery.Core(Owner,HashValue,Paths.Slot,RunHash,AdminHash,()=>Stopped,()=>Active,Barrier,(p,a)=>true,p=>Directory.CreateDirectory(p),p=>new FileStream(p,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None),()=>Now,step);}
        internal void Preserved(){
            var runs=Directory.GetFiles(Paths.Slot,"intent.pending",SearchOption.AllDirectories);var admins=Directory.GetFiles(Paths.Slot,"admin.pending",SearchOption.AllDirectories);
            Check(Array.Exists(runs,p=>Hash(File.ReadAllBytes(p))==Hash(RunBytes))&&Array.Exists(admins,p=>Hash(File.ReadAllBytes(p))==Hash(AdminBytes)),"Unclaimed original bytes were lost");
        }
        public void Dispose(){Directory.Delete(Root,true);}
    }
    sealed class UpgradeCalls:SodaDesktopSigninUpgradeScm.Calls {
        bool disabled;internal int Changes;
        public void InspectManual(){Check(!disabled,"Generated service was not manual");}public void InspectDisabled(){Check(disabled,"Generated service was not disabled");}
        public bool Stopped(){return true;}public void Disable(){disabled=true;Changes++;}public void Manual(){disabled=false;Changes++;}public void Dispose(){}
    }
    public static void Run(){
        Check(!SodaDesktopSigninVault.SystemPrimary(),"Generated cancellation requires ordinary account");
        using(var f=new Fixture()){
            var result=f.Run(step=>{if(step=="marker-written")Check(!SodaDesktopSigninRunStorage.MaintenanceAbsent(f.Paths.Slot),"Cancellation marker did not block startup");});
            Check((string)result["state"]=="expired-unclaimed-initialize-canceled"&&!(bool)result["started"],"Cancellation started service or lost receipt");f.Preserved();
            Check(SodaDesktopSigninRunStorage.MaintenanceAbsent(f.Paths.Slot)&&Directory.GetFileSystemEntries(Path.Combine(f.Paths.Slot,"admin")).Length==0,"Canceled state is not initial and empty admin");
            Check(File.Exists(Path.Combine(f.Paths.Slot,(string)result["receipt"]))&&Directory.Exists(Path.Combine(f.Paths.Slot,(string)result["runsArchive"]))&&Directory.Exists(Path.Combine(f.Paths.Slot,(string)result["adminArchive"])) ,"Cancellation audit archive missing");
            using(var pin=f.Barrier())using(var journal=new SodaDesktopSigninRunJournal(Path.Combine(f.Paths.Slot,"runs"),Owner,f.HashValue,pin.Fingerprint,SodaDesktopSigninRunJournal.Role.Reader,()=>true,a=>true,new string[0]))Check(journal.State()=="initial"&&journal.CleanBoundary().RunId==(string)result["newRunId"],"Fresh generation differs from receipt");
            Refused(()=>f.Run(),"Cancellation was replayed");
            string source=Path.Combine(f.Root,"new"),newHash=SodaDesktopSigninInstallSourceChecks.Make(source);var calls=new UpgradeCalls();
            using(var release=SodaDesktopSigninInstallSource.Open(source,Owner,newHash))using(var scm=new SodaDesktopSigninUpgradeScm(calls,()=>true)){
                var upgraded=SodaDesktopSigninUpgrade.Core(Owner,f.HashValue,release,f.Paths,scm,()=>true,f.Barrier,(p,a)=>true,p=>Directory.CreateDirectory(p),p=>new FileStream(p,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None));
                Check((string)upgraded["state"]=="upgraded"&&!(bool)upgraded["started"]&&calls.Changes==2,"Canceled generation could not use normal upgrade");f.Preserved();
            }
        }
        using(var f=new Fixture(adminExpires:301000,runExpires:61000)){f.Now=200000;Refused(()=>f.Run(),"Unexpired admin request canceled");Check(SodaDesktopSigninRunStorage.MaintenanceAbsent(f.Paths.Slot),"Unexpired admin changed state");f.Preserved();}
        using(var f=new Fixture(intentNonce:Guid.NewGuid().ToString("D"))){Refused(()=>f.Run(),"Different admin nonce canceled");f.Preserved();}
        using(var f=new Fixture(kind:"status")){Refused(()=>f.Run(),"Non-initialize operation canceled");f.Preserved();}
        using(var f=new Fixture()){f.RunHash=new string('f',64);Refused(()=>f.Run(),"Wrong source hash accepted");Check(SodaDesktopSigninRunStorage.MaintenanceAbsent(f.Paths.Slot),"Bad hash changed state");f.Preserved();}
        foreach(string entry in new[]{"identity.dpapi","admin/admin.claimed","runs/started","runtime/active"})using(var f=new Fixture()){
            File.WriteAllText(Path.Combine(f.Paths.Slot,entry),"generated retained state");Refused(()=>f.Run(),"Existing key or claimed state canceled");Check(SodaDesktopSigninRunStorage.MaintenanceAbsent(f.Paths.Slot),"Existing state was modified");f.Preserved();
        }
        using(var f=new Fixture()){f.Stopped=false;Refused(()=>f.Run(),"Running service canceled pending request");f.Preserved();}
        using(var f=new Fixture()){Refused(()=>f.Run(step=>{if(step=="marker-written")f.Stopped=false;}),"Running service canceled pending request");f.Preserved();}
        foreach(string failure in new[]{"marker-written","runs-archived","admin-archived","new-directories","initial-written","receipt-written"})using(var f=new Fixture()){
            Refused(()=>f.Run(step=>{if(step==failure)throw new InvalidOperationException("generated interruption");}),"Interrupted cancellation completed");
            Check(!SodaDesktopSigninRunStorage.MaintenanceAbsent(f.Paths.Slot),"Interrupted cancellation permitted startup");f.Preserved();Refused(()=>f.Run(),"Interrupted cancellation was replayed");
        }
        using(var f=new Fixture()){
            Refused(()=>f.Run(step=>{if(step=="runs-archived"){string archive=Directory.GetDirectories(f.Paths.Slot,"runs-unclaimed-*")[0];string path=Path.Combine(archive,"intent.pending");File.Delete(path);File.WriteAllBytes(path,f.RunBytes);}}),"Replaced archive identity accepted");
            Check(!SodaDesktopSigninRunStorage.MaintenanceAbsent(f.Paths.Slot),"Replaced archive cleared marker");f.Preserved();
        }
        using(var f=new Fixture()){
            Refused(()=>f.Run(step=>{if(step=="receipt-written")File.WriteAllText(Path.Combine(f.Paths.Slot,"admin","unexpected"),"generated late change");}),"Late admin modification accepted");
            Check(!SodaDesktopSigninRunStorage.MaintenanceAbsent(f.Paths.Slot),"Late admin change cleared marker");f.Preserved();
        }
        Console.WriteLine("signin_unclaimed_initialize_expiry_archives_interruptions_and_upgrade_passed");
    }
}
