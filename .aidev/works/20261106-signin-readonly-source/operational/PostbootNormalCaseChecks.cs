using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using R=SodaDesktopSigninRestartRecovery;
using C=SodaPostbootNormalCase;
public static class PostbootNormalCaseChecks {
 static void Check(bool value){if(!value)throw new Exception("Generated postboot case check failed");}
 static void Refused(Action action){bool refused=false;try{action();}catch(InvalidOperationException){refused=true;}catch(IOException){refused=true;}Check(refused);}
 public static void Run(){foreach(string failure in new string[]{null,"marker-written","runs-archived","directory-created","initial-written","receipt-written","lost-1077","replaced-intent"})Fixture(failure);Console.WriteLine("postboot_case_generated_guards_archives_interruptions_passed");}
 static void Fixture(string failure){
  string root=Path.Combine(Path.GetTempPath(),"soda-postboot-case-"+Guid.NewGuid().ToString("N")),owner="S-1-5-21-1-2-3-1001",manifest=new string('a',64),prior="100:100",current="100:300000000";Directory.CreateDirectory(root);
  try{
   foreach(string name in new[]{"admin","runs","runtime/desktop-endpoint","history"})Directory.CreateDirectory(Path.Combine(root,name));
   string identity=Path.Combine(root,"runtime/desktop-endpoint/identity.json"),preserved=Path.Combine(root,"history/unknown-preserved"),enrollment=Path.Combine(root,"enrollment.dpapi");
   File.WriteAllText(identity,"generated encrypted identity");File.WriteAllText(preserved,"generated unknown old result");File.WriteAllText(enrollment,"generated encrypted enrollment");File.WriteAllBytes(Path.Combine(root,"quiescence.lock"),new byte[]{83});
   Func<SodaDesktopSigninQuiescence.Pin> open=()=>SodaDesktopSigninQuiescence.OpenCore(Path.Combine(root,"quiescence.lock"),new[]{root},(p,a)=>true);string barrier;using(var pin=open())barrier=pin.Fingerprint;
   var intent=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","intent"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"issuedAt",1500L},{"expiresAt",2500L},{"mode","normal"}},owner);byte[] runBytes=intent.Protect();File.WriteAllBytes(Path.Combine(root,"runs/intent.claimed"),runBytes);
   var started=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","started"},{"ownerSid",owner},{"runId",intent.RunId},{"packageSha256",manifest},{"barrierSha256",barrier},{"pid",123L},{"createdFiletime","123456789"},{"startedAt",1700L},{"intentSha256",intent.Digest()}},owner);File.WriteAllBytes(Path.Combine(root,"runs/started"),started.Protect());
   var observed=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","observation"},{"ownerSid",owner},{"runId",intent.RunId},{"packageSha256",manifest},{"barrierSha256",barrier},{"pid",123L},{"createdFiletime","123456789"},{"startedSha256",started.Digest()}},owner);File.WriteAllBytes(Path.Combine(root,"runs/observation"),observed.Protect());
   string runtime;using(var tree=new R.Tree(Path.Combine(root,"runtime"),(p,a)=>true,()=>true))runtime=tree.Digest();string historyName="old-bound-history.json";byte[] history=R.Encode(new Dictionary<string,object>{{"ownerSid",owner},{"barrierSha256",barrier},{"newScmInstance",prior},{"runtimeSha256",runtime},{"keysPreserved",true},{"cleanExitClaimed",false},{"originalOutcome","unknown"},{"recoveredAt",1000L}});File.WriteAllBytes(Path.Combine(root,historyName),history);
   string inventory;using(var tree=new R.Tree(root,(p,a)=>true,()=>true))inventory=tree.Digest();long wall=4000;bool live=true,neverStarted=true;
   Func<string,string,string,Action<string>,IDictionary<string,object>> run=(action,oldScm,newScm,after)=>C.Core(action,root,owner,manifest,inventory,runtime,R.Hash(runBytes),historyName,R.Hash(history),oldScm,newScm,()=>live,()=>neverStarted,open,(p,a)=>true,p=>Directory.CreateDirectory(p),p=>new FileStream(p,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None),()=>wall,after);
   string marker=Path.Combine(root,"install.transition");
   wall=2000;Refused(()=>run("recover",prior,current,null));wall=4000;neverStarted=false;Refused(()=>run("recover",prior,current,null));neverStarted=true;live=false;Refused(()=>run("recover",prior,current,null));live=true;
   Refused(()=>run("recover",prior,prior,null));Refused(()=>run("recover","100:200000000",current,null));Refused(()=>run("recover",prior,"100:100000000",null));
   File.WriteAllText(preserved,"changed history");Refused(()=>run("recover",prior,current,null));File.WriteAllText(preserved,"generated unknown old result");
   File.WriteAllText(Path.Combine(root,"admin/extra"),"pending request");Refused(()=>run("recover",prior,current,null));File.Delete(Path.Combine(root,"admin/extra"));
   File.WriteAllText(Path.Combine(root,"extra"),"unknown");Refused(()=>run("recover",prior,current,null));File.Delete(Path.Combine(root,"extra"));
   File.WriteAllText(Path.Combine(root,historyName),"changed bound receipt");Refused(()=>run("recover",prior,current,null));File.WriteAllBytes(Path.Combine(root,historyName),history);
   Check(!File.Exists(marker));Check(!(bool)run("inspect",prior,current,null)["mutates"]);Check(!File.Exists(marker));
   if(failure==null){var result=run("recover",prior,current,null);Check((string)result["state"]=="recovered"&&(string)result["originalOutcome"]=="unknown"&&!(bool)result["cleanExitClaimed"]&&(bool)result["keysPreserved"]&&!File.Exists(marker));}
   else{Refused(()=>run("recover",prior,current,step=>{if(failure=="replaced-intent"&&step=="marker-written"){string path=Path.Combine(root,"runs/intent.claimed");File.Move(path,root+"-original");File.WriteAllBytes(path,runBytes);return;}if(failure=="lost-1077"&&step=="marker-written"){neverStarted=false;return;}if(step==failure)throw new InvalidOperationException("generated interruption");}));Check(File.Exists(marker));neverStarted=true;}
   Refused(()=>run("recover",prior,current,null));using(var tree=new R.Tree(Path.Combine(root,"runtime"),(p,a)=>true,()=>true))Check(tree.Digest()==runtime);
   Check(Directory.GetFiles(root,"intent.claimed",SearchOption.AllDirectories).Any(p=>R.Hash(File.ReadAllBytes(p))==R.Hash(runBytes)));Check(File.ReadAllText(preserved)=="generated unknown old result");Check(File.ReadAllBytes(Path.Combine(root,historyName)).SequenceEqual(history));Check(File.ReadAllText(enrollment)=="generated encrypted enrollment");
  }finally{Directory.Delete(root,true);if(File.Exists(root+"-original"))File.Delete(root+"-original");}
 }
}
