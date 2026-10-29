using System;
using System.IO;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
public static class SodaDesktopSigninRunSessionChecks {
    const string Owner="S-1-5-21-1-2-3-1001",RunId="11111111-1111-4111-8111-111111111111",Other="22222222-2222-4222-8222-222222222222";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}catch(IOException){failed=true;}Check(failed,message);}
    static SodaDesktopSigninRunRecord Record(string kind,string run){var f=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind",kind},{"ownerSid",Owner},{"runId",run},{"packageSha256",new string('a',64)},{"barrierSha256",new string('b',64)}};if(kind=="intent"){f.Add("issuedAt",10000);f.Add("expiresAt",310000);f.Add("mode","normal");}else f.Add("createdAt",10000);return SodaDesktopSigninRunRecord.Build(f,Owner);}
    sealed class Fixture:IDisposable {
        internal readonly string Path=System.IO.Path.Combine(System.IO.Path.GetTempPath(),"soda-session-"+Guid.NewGuid().ToString("N"));internal long Wall=10001,Mono;internal bool Scope=true,Stopped;
        internal SodaDesktopSigninRunRecord Started;internal Action OnWall=null;
        internal Fixture(){Directory.CreateDirectory(Path);using(var installer=Journal(SodaDesktopSigninRunJournal.Role.Installer))installer.Initialize(Record("initial",Other));using(var controller=Journal(SodaDesktopSigninRunJournal.Role.Controller))controller.Prepare(Record("intent",RunId));}
        internal SodaDesktopSigninRunJournal Journal(SodaDesktopSigninRunJournal.Role role){return new SodaDesktopSigninRunJournal(Path,Owner,new string('a',64),new string('b',64),role,()=>Scope,bytes=>true,new string[0]);}
        internal SodaDesktopSigninRunSession Open(bool ack=true,Func<int,bool> wait=null){return SodaDesktopSigninRunSession.OpenCore(Journal(SodaDesktopSigninRunJournal.Role.Host),new SodaDesktopSigninProcessEvidence.Identity(1234,"134000000000000000"),()=>Scope,()=>Stopped,wait??(ms=>{Mono+=1000;return Stopped;}),()=>{if(OnWall!=null)OnWall();return Wall;},()=>Mono,intent=>true,started=>{Started=started;if(ack){var f=started.Fields();f["kind"]="observation";f.Remove("startedAt");f.Remove("intentSha256");f.Add("startedSha256",started.Digest());using(var observer=Journal(SodaDesktopSigninRunJournal.Role.Observer))observer.Observation(SodaDesktopSigninRunRecord.Build(f,Owner));}});}
        internal bool HasStop(){return File.Exists(System.IO.Path.Combine(Path,"stopped"));}
        public void Dispose(){Directory.Delete(Path,true);}
    }
    public static void Run(){
        using(var f=new Fixture())using(var run=f.Open()){Check(run.Ready()&&Admit(run),"Observed run was not admitted");f.Stopped=true;run.CompleteCore(()=>true,()=>f.Scope);Check(f.HasStop(),"Clean child did not publish stop receipt");Refused(()=>run.CompleteCore(()=>true,()=>true),"Clean completion was replayed");}
        using(var f=new Fixture())using(var run=f.Open()){Refused(()=>run.CompleteCore(()=>true,()=>true),"Unresumed run published receipt");Check(!f.HasStop(),"Unresumed run left stop receipt");}
        using(var f=new Fixture())using(var run=f.Open()){Check(Admit(run)&&!run.Resume(),"Run admitted repeated resume");Check(!f.HasStop(),"Repeated resume created receipt");}
        using(var f=new Fixture()){Refused(()=>{using(var run=f.Open(false)){}} ,"Run started without controller observation");Check(f.Mono>=10000&&!f.HasStop(),"Missing observation did not expire without receipt");}
        using(var f=new Fixture()){Refused(()=>{using(var run=f.Open(false,ms=>{f.Stopped=true;return true;})){}} ,"Stopped unobserved run started");Check(!f.HasStop(),"Stopped handshake published receipt");}
        using(var f=new Fixture())using(var run=f.Open()){f.Mono=10000;Check(!run.Ready()&&!Admit(run)&&!f.HasStop(),"Expired admission started child");}
        using(var f=new Fixture())using(var run=f.Open()){f.Scope=false;Check(!Admit(run),"Revoked admission resumed child");f.Scope=true;Check(!Admit(run)&&!f.HasStop(),"Revoked admission revived");}
        using(var f=new Fixture())using(var run=f.Open()){Check(Admit(run),"Unclean fixture not admitted");Refused(()=>run.CompleteCore(()=>false,()=>true),"Unclean child published receipt");Check(!f.HasStop(),"Unclean child left receipt");Refused(()=>run.CompleteCore(()=>true,()=>true),"Failed completion retried as clean");}
        using(var f=new Fixture())using(var run=f.Open()){Check(Admit(run),"Lost-proof fixture not admitted");int checks=0;Refused(()=>run.CompleteCore(()=>true,()=>++checks<3),"Final retained proof was ignored");Check(!f.HasStop(),"Lost retained proof left receipt");}
        using(var f=new Fixture())using(var run=f.Open()){Check(Admit(run),"Reentrant fixture not admitted");bool reenter=true;Refused(()=>run.CompleteCore(()=>true,()=>{if(reenter){reenter=false;run.CompleteCore(()=>true,()=>true);}return true;}),"Reentrant completion was accepted");Check(!f.HasStop(),"Reentrant completion published receipt");}
        using(var f=new Fixture())using(var run=f.Open()){Check(Admit(run),"Clock-reentry fixture not admitted");f.OnWall=()=>{try{run.CompleteCore(()=>true,()=>true);}catch(InvalidOperationException){}};Refused(()=>run.CompleteCore(()=>true,()=>true),"Clock callback restored completion authority");Check(!f.HasStop(),"Clock callback published receipt after terminal reentry");}
        using(var f=new Fixture())using(var run=f.Open()){Check(Admit(run),"Backward-wall fixture not admitted");f.Wall=10000;Refused(()=>run.CompleteCore(()=>true,()=>true),"Backward completion clock accepted");Check(!f.HasStop(),"Backward completion clock left receipt");}
        Mode();Fingerprint();Console.WriteLine("signin_host_lifecycle_generated_handshake_admission_receipt_and_mode_bindings_passed");
    }
    static bool Admit(SodaDesktopSigninRunSession run){return run.Resume()&&run.ConfirmResume();}
    public static void NativeResume(string exe,string directory){
        using(var f=new Fixture())using(var run=f.Open())using(var child=SodaDesktopSigninProcess.Start(SodaDesktopSigninHostChecks.Fixture(exe,directory,"--generated-stop-success"),()=>true,()=>run.Resume(),()=>run.ConfirmResume())){
            Check(child.TryGraceful(),"Confirmed native child did not exit cleanly");run.Complete(child,()=>true);Check(f.HasStop(),"Actual native Job0 did not publish receipt");
        }
        using(var f=new Fixture())using(var run=f.Open()){
            bool consumed=false,rejected=false;try{using(var child=SodaDesktopSigninProcess.Start(SodaDesktopSigninHostChecks.Fixture(exe,directory,"--generated-child"),()=>{if(consumed)f.Mono=10000;return true;},()=>{consumed=run.Resume();return consumed;},()=>run.ConfirmResume())){child.Stop();}}catch(InvalidOperationException){rejected=true;}
            Check(rejected&&consumed&&!File.Exists(System.IO.Path.Combine(directory,"ready")),"Post-admission inspection expired before native resume");Check(!f.HasStop(),"Expired native admission published receipt");
        }
    }
    static void Mode(){
        string directory=System.IO.Path.Combine(System.IO.Path.GetTempPath(),"soda-admin-mode-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(directory);
        try{
            var normal=Record("intent",RunId);Check(SodaDesktopSigninRunStorage.ModeCore(directory,Owner,normal,()=>true,bytes=>true),"Empty admin namespace rejected normal mode");
            byte[] plain=Encoding.UTF8.GetBytes("generated-private-metadata");byte[] envelopeBytes=null;
            try{using(var envelope=SodaDesktopSigninAdminEnvelope.Protect(plain,Owner,Other))envelopeBytes=envelope.Encode();File.WriteAllBytes(System.IO.Path.Combine(directory,"admin.pending"),envelopeBytes);
                Check(!SodaDesktopSigninRunStorage.ModeCore(directory,Owner,normal,()=>true,acl=>true),"Pending admin request fell back to normal mode");var fields=normal.Fields();fields["mode"]="admin";fields.Add("adminNonce",Other);using(var sha=SHA256.Create())fields.Add("adminSha256",BitConverter.ToString(sha.ComputeHash(envelopeBytes)).Replace("-","").ToLowerInvariant());var intent=SodaDesktopSigninRunRecord.Build(fields,Owner);
                Check(SodaDesktopSigninRunStorage.ModeCore(directory,Owner,intent,()=>true,acl=>true),"Matching actual pending admin envelope rejected");
                fields["adminNonce"]=RunId;Check(!SodaDesktopSigninRunStorage.ModeCore(directory,Owner,SodaDesktopSigninRunRecord.Build(fields,Owner),()=>true,acl=>true),"Wrong admin nonce admitted child branch");fields["adminNonce"]=Other;fields["adminSha256"]=new string('f',64);Check(!SodaDesktopSigninRunStorage.ModeCore(directory,Owner,SodaDesktopSigninRunRecord.Build(fields,Owner),()=>true,acl=>true),"Wrong actual admin digest admitted child branch");
                bool live=true;Check(!SodaDesktopSigninRunStorage.ModeCore(directory,Owner,intent,()=>live,acl=>{live=false;return true;}),"Admin mode inspection ignored revoked scope");
                File.WriteAllText(System.IO.Path.Combine(directory,"unknown"),"generated");Check(!SodaDesktopSigninRunStorage.ModeCore(directory,Owner,intent,()=>true,acl=>true),"Unknown admin artifact admitted child branch");
            }finally{Array.Clear(plain,0,plain.Length);if(envelopeBytes!=null)Array.Clear(envelopeBytes,0,envelopeBytes.Length);}
        }finally{Directory.Delete(directory,true);}
    }
    static void Fingerprint(){
        var info=new SodaDesktopSigninPackageNative.Info{Links=1,SizeLow=1,Volume=1,IndexLow=2,WriteLow=3,CreatedLow=4};var first=new SodaDesktopSigninPackageNative.Snapshot(info,1);string digest=first.Fingerprint();Check(digest.Length==64&&digest==new SodaDesktopSigninPackageNative.Snapshot(info,1).Fingerprint(),"Barrier digest was not stable");info.IndexLow++;Check(digest!=new SodaDesktopSigninPackageNative.Snapshot(info,1).Fingerprint(),"Barrier digest ignored file identity");info.IndexLow--;info.WriteLow++;Check(digest!=new SodaDesktopSigninPackageNative.Snapshot(info,1).Fingerprint(),"Barrier digest ignored modification facts");
    }
}
