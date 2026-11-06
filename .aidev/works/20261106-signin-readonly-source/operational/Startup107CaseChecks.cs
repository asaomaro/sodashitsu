using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using R=SodaDesktopSigninRestartRecovery;
using C=SodaStartup107Case;
public static class Startup107CaseChecks {
 static void Check(bool value){if(!value)throw new Exception("Generated startup107 case check failed");}
 static void Refused(Action action){bool refused=false;try{action();}catch(InvalidOperationException){refused=true;}catch(IOException){refused=true;}Check(refused);}
 public static void Run(){using(var self=System.Diagnostics.Process.GetCurrentProcess())Refused(()=>{using(var gone=new C.Gone((uint)self.Id,self.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(System.Globalization.CultureInfo.InvariantCulture)))Check(gone.Current());});foreach(string failure in new string[]{null,"marker-written","runs-archived","directory-created","initial-written","receipt-written","lost-107","live-host","replaced-intent"})Fixture(failure);Console.WriteLine("startup107_case_generated_host_scm_receipt_and_identity_guards_passed");}
 static void Fixture(string failure){
  string root=Path.Combine(Path.GetTempPath(),"soda-startup107-case-"+Guid.NewGuid().ToString("N")),owner="S-1-5-21-1-2-3-1001",manifest=new string('a',64),current="100:300000000";Directory.CreateDirectory(root);
  try{
   foreach(string name in new[]{"admin","runs","runtime/desktop-endpoint","history"})Directory.CreateDirectory(Path.Combine(root,name));
   string identity=Path.Combine(root,"runtime/desktop-endpoint/identity.json"),preserved=Path.Combine(root,"history/unknown-preserved"),enrollment=Path.Combine(root,"enrollment.dpapi");
   File.WriteAllText(identity,"generated encrypted identity");File.WriteAllText(preserved,"generated unknown old result");File.WriteAllText(enrollment,"generated encrypted enrollment");File.WriteAllBytes(Path.Combine(root,"quiescence.lock"),new byte[]{83});
   Func<SodaDesktopSigninQuiescence.Pin> open=()=>SodaDesktopSigninQuiescence.OpenCore(Path.Combine(root,"quiescence.lock"),new[]{root},(p,a)=>true);string barrier;using(var pin=open())barrier=pin.Fingerprint;
   var intent=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","intent"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"issuedAt",1500L},{"expiresAt",2500L},{"mode","normal"}},owner);byte[] runBytes=intent.Protect();File.WriteAllBytes(Path.Combine(root,"runs/intent.claimed"),runBytes);
   var started=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","started"},{"ownerSid",owner},{"runId",intent.RunId},{"packageSha256",manifest},{"barrierSha256",barrier},{"pid",123L},{"createdFiletime","123456789"},{"startedAt",1700L},{"intentSha256",intent.Digest()}},owner);File.WriteAllBytes(Path.Combine(root,"runs/started"),started.Protect());
   var observed=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","observation"},{"ownerSid",owner},{"runId",intent.RunId},{"packageSha256",manifest},{"barrierSha256",barrier},{"pid",123L},{"createdFiletime","123456789"},{"startedSha256",started.Digest()}},owner);File.WriteAllBytes(Path.Combine(root,"runs/observation"),observed.Protect());
   string runtime;using(var tree=new R.Tree(Path.Combine(root,"runtime"),(p,a)=>true,()=>true))runtime=tree.Digest();string historyName="owned-start-receipt.json";byte[] history=R.Encode(new Dictionary<string,object>{{"action","start"},{"ok",true},{"code",0},{"stderrLength",0},{"receipt",new Dictionary<string,object>{{"state","observation-acknowledged"},{"journal","observed"},{"runId",intent.RunId}}}});File.WriteAllBytes(Path.Combine(root,historyName),history);
   string inventory;using(var tree=new R.Tree(root,(p,a)=>true,()=>true))inventory=tree.Digest();long wall=4000;bool live=true,stopped107=true,hostGone=true;string expectedStarted=started.Digest(),expectedRunId=intent.RunId,expectedCreated="123456789";long expectedPid=123;
   Func<string,Action<string>,IDictionary<string,object>> run=(action,after)=>C.Core(action,root,owner,manifest,inventory,runtime,R.Hash(runBytes),expectedStarted,expectedRunId,expectedPid,expectedCreated,Path.Combine(root,historyName),R.Hash(history),current,()=>live,()=>stopped107,()=>hostGone,open,(p,a)=>true,(p,a)=>true,p=>Directory.CreateDirectory(p),p=>new FileStream(p,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None),()=>wall,after);
   string marker=Path.Combine(root,"install.transition");
   wall=2000;Refused(()=>run("recover",null));wall=4000;stopped107=false;Refused(()=>run("recover",null));stopped107=true;live=false;Refused(()=>run("recover",null));live=true;
   hostGone=false;Refused(()=>run("recover",null));hostGone=true;
   expectedStarted=new string('f',64);Refused(()=>run("recover",null));expectedStarted=started.Digest();
   expectedRunId=Guid.NewGuid().ToString("D");Refused(()=>run("recover",null));expectedRunId=intent.RunId;
   expectedPid=124;Refused(()=>run("recover",null));expectedPid=123;
   expectedCreated="123456790";Refused(()=>run("recover",null));expectedCreated="123456789";

   File.WriteAllText(preserved,"changed history");Refused(()=>run("recover",null));File.WriteAllText(preserved,"generated unknown old result");
   File.WriteAllText(Path.Combine(root,"admin/extra"),"pending request");Refused(()=>run("recover",null));File.Delete(Path.Combine(root,"admin/extra"));
   File.WriteAllText(Path.Combine(root,"extra"),"unknown");Refused(()=>run("recover",null));File.Delete(Path.Combine(root,"extra"));
   File.WriteAllText(Path.Combine(root,historyName),"changed bound receipt");Refused(()=>run("recover",null));File.WriteAllBytes(Path.Combine(root,historyName),history);
   Check(!File.Exists(marker));Check(!(bool)run("inspect",null)["mutates"]);Check(!File.Exists(marker));
   if(failure==null){var result=run("recover",null);Check((string)result["state"]=="recovered"&&(string)result["originalOutcome"]=="unknown"&&!(bool)result["cleanExitClaimed"]&&(bool)result["keysPreserved"]&&!File.Exists(marker));}
   else{Refused(()=>run("recover",step=>{if(failure=="replaced-intent"&&step=="marker-written"){string path=Path.Combine(root,"runs/intent.claimed");File.Move(path,root+"-original");File.WriteAllBytes(path,runBytes);return;}if(failure=="lost-107"&&step=="marker-written"){stopped107=false;return;}if(failure=="live-host"&&step=="marker-written"){hostGone=false;return;}if(step==failure)throw new InvalidOperationException("generated interruption");}));Check(File.Exists(marker));stopped107=true;hostGone=true;}
   Refused(()=>run("recover",null));using(var tree=new R.Tree(Path.Combine(root,"runtime"),(p,a)=>true,()=>true))Check(tree.Digest()==runtime);
   Check(Directory.GetFiles(root,"intent.claimed",SearchOption.AllDirectories).Any(p=>R.Hash(File.ReadAllBytes(p))==R.Hash(runBytes)));Check(File.ReadAllText(preserved)=="generated unknown old result");Check(File.ReadAllBytes(Path.Combine(root,historyName)).SequenceEqual(history));Check(File.ReadAllText(enrollment)=="generated encrypted enrollment");
  }finally{Directory.Delete(root,true);if(File.Exists(root+"-original"))File.Delete(root+"-original");}
 }
}
