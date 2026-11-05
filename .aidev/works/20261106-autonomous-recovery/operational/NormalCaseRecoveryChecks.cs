using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using R=SodaDesktopSigninRestartRecovery;
using C=SodaNormalCaseRecovery;
public static class NormalCaseRecoveryChecks {
 static void Check(bool x){if(!x)throw new Exception("Generated recovery check failed");}
 static void Refused(Action f){bool denied=false;try{f();}catch(InvalidOperationException){denied=true;}catch(IOException){denied=true;}Check(denied);}
 public static void Run(){foreach(string failure in new string[]{null,"runs-archived","admin-archived","directories-created","initial-written","receipt-written"})Fixture(failure);Console.WriteLine("normal_case_generated_snapshot_new_scm_archives_interruptions_passed");}
 static void Fixture(string failure){
  string root=Path.Combine(Path.GetTempPath(),"soda-normal-case-"+Guid.NewGuid().ToString("N")),owner="S-1-5-21-1-2-3-1001",manifest=new string('a',64);Directory.CreateDirectory(root);
  try{
   foreach(string n in new[]{"admin","runs","runtime/desktop-endpoint","history"})Directory.CreateDirectory(Path.Combine(root,n));File.WriteAllText(Path.Combine(root,"runtime/desktop-endpoint/identity.json"),"generated encrypted identity bytes");File.WriteAllText(Path.Combine(root,"runtime/desktop-endpoint-required.json"),"generated required marker");File.WriteAllText(Path.Combine(root,"history/unknown-preserved"),"generated prior history");File.WriteAllText(Path.Combine(root,"enrollment.dpapi"),"generated encrypted enrollment");File.WriteAllBytes(Path.Combine(root,"quiescence.lock"),new byte[]{83});
   Func<SodaDesktopSigninQuiescence.Pin> open=()=>SodaDesktopSigninQuiescence.OpenCore(Path.Combine(root,"quiescence.lock"),new[]{root},(p,a)=>true);string barrier;using(var pin=open())barrier=pin.Fingerprint;
   var intent=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","intent"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"issuedAt",1500L},{"expiresAt",2500L},{"mode","normal"}},owner);byte[] runBytes=intent.Protect();File.WriteAllBytes(Path.Combine(root,"runs/intent.claimed"),runBytes);
   var started=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","started"},{"ownerSid",owner},{"runId",intent.RunId},{"packageSha256",manifest},{"barrierSha256",barrier},{"pid",123L},{"createdFiletime","123456789"},{"startedAt",1700L},{"intentSha256",intent.Digest()}},owner);File.WriteAllBytes(Path.Combine(root,"runs/started"),started.Protect());
   var observed=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","observation"},{"ownerSid",owner},{"runId",intent.RunId},{"packageSha256",manifest},{"barrierSha256",barrier},{"pid",123L},{"createdFiletime","123456789"},{"startedSha256",started.Digest()}},owner);File.WriteAllBytes(Path.Combine(root,"runs/observation"),observed.Protect());
   string inventory,runtime;using(var t=new R.Tree(root,(p,a)=>true,()=>true))inventory=t.Digest();using(var t=new R.Tree(Path.Combine(root,"runtime"),(p,a)=>true,()=>true))runtime=t.Digest();long wall=4000;
   Func<string,string,string,Action<string>,IDictionary<string,object>> run=(action,scm,ticket,after)=>C.Core(action,ticket,root,owner,manifest,inventory,runtime,R.Hash(runBytes),"empty",scm,()=>true,()=>true,open,(p,a)=>true,p=>Directory.CreateDirectory(p),p=>new FileStream(p,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None),()=>wall,after);
   wall=2000;Refused(()=>run("bind","100:200",null,null));wall=4000;
   string changed=Path.Combine(root,"history/unknown-preserved");byte[] saved=File.ReadAllBytes(changed);File.WriteAllText(changed,"changed");Refused(()=>run("bind","100:200",null,null));File.WriteAllBytes(changed,saved);
   File.WriteAllText(Path.Combine(root,"unexpected"),"extra");Refused(()=>run("bind","100:200",null,null));File.Delete(Path.Combine(root,"unexpected"));
   var inspect=run("inspect","100:200",null,null);Check(!(bool)inspect["mutates"]);var bound=run("bind","100:200",null,null);string ticketHash=(string)bound["ticketSha256"],marker=Path.Combine(root,"install.transition");
   Check((string)run("inspect-bound","100:200",ticketHash,null)["state"]=="bound-inspected");Refused(()=>run("inspect-bound","100:300",ticketHash,null));
   Refused(()=>run("bind","100:200",null,null));Refused(()=>run("recover","100:200",ticketHash,null));Refused(()=>run("recover","100:300",new string('f',64),null));
   if(failure==null){var result=run("recover","100:300",ticketHash,null);Check((string)result["state"]=="recovered"&&(string)result["originalOutcome"]=="unknown"&&!(bool)result["cleanExitClaimed"]&&!File.Exists(marker));}
   else{Refused(()=>run("recover","100:300",ticketHash,step=>{if(step==failure)throw new InvalidOperationException("generated interruption");}));Check(File.Exists(marker)&&R.Hash(File.ReadAllBytes(marker))==ticketHash);}
   Refused(()=>run("recover","100:300",ticketHash,null));using(var t=new R.Tree(Path.Combine(root,"runtime"),(p,a)=>true,()=>true))Check(t.Digest()==runtime);
   Check(Directory.GetFiles(root,"intent.claimed",SearchOption.AllDirectories).Any(p=>R.Hash(File.ReadAllBytes(p))==R.Hash(runBytes)));Check(File.ReadAllBytes(changed).SequenceEqual(saved));Check(File.ReadAllText(Path.Combine(root,"enrollment.dpapi"))=="generated encrypted enrollment");
  }finally{Directory.Delete(root,true);}
 }
}
