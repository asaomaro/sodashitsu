using System;using System.IO;using System.Text;using System.Collections.Generic;using System.Security.Cryptography;using System.Web.Script.Serialization;
public static class SodaDesktopSigninRestartRecoveryChecks {
 static string Hash(byte[] b){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(b)).Replace("-","").ToLowerInvariant();}
 static void Refused(Action run){bool failed=false;try{run();}catch(InvalidOperationException){failed=true;}if(!failed)throw new Exception("Unknown key/history or same SCM instance was accepted");}
 public static void Run(){foreach(string step in new string[]{null,"runs-archived","admin-archived","new-directories","initial-written","receipt-written"})Fixture(step);Console.WriteLine("signin_restart_transactions_replay_and_5_interruptions_preserve_originals_passed");}
 static void Fixture(string failure){
  string owner="S-1-5-21-1-2-3-1001",manifest=new string('a',64),barrier=new string('b',64),id=Guid.NewGuid().ToString("N"),root=Path.Combine(Path.GetTempPath(),"soda-restart-"+Guid.NewGuid().ToString("N")),old="runs-old-"+Guid.NewGuid().ToString("N"),runs="runs-unclaimed-"+id,admins="admin-unclaimed-"+id;
  Directory.CreateDirectory(root);try{
   foreach(string name in new[]{"admin","runs","runtime",old,runs,admins})Directory.CreateDirectory(Path.Combine(root,name));File.WriteAllBytes(Path.Combine(root,"quiescence.lock"),new byte[]{83});
   using(var pinned=SodaDesktopSigninQuiescence.OpenCore(Path.Combine(root,"quiescence.lock"),new[]{root},(p,a)=>true))barrier=pinned.Fingerprint;
   string nonce=Guid.NewGuid().ToString("D");var request=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-admin"},{"ownerSid",owner},{"nonce",nonce},{"issuedAt",1000L},{"expiresAt",3000L},{"operation",new Dictionary<string,object>{{"kind","initialize"}}}};
   byte[] admin;using(var e=SodaDesktopSigninAdminEnvelope.Protect(Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(request)),owner,nonce))admin=e.Encode();
   var intent=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","intent"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"issuedAt",1500L},{"expiresAt",2500L},{"mode","admin"},{"adminNonce",nonce},{"adminSha256",Hash(admin)}},owner);byte[] raw=intent.Protect();
   var initial=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","initial"},{"ownerSid",owner},{"runId",Guid.NewGuid().ToString("D")},{"packageSha256",manifest},{"barrierSha256",barrier},{"createdAt",4000L}},owner);
   File.WriteAllBytes(Path.Combine(root,old,"initial"),initial.Protect());File.WriteAllBytes(Path.Combine(root,runs,"intent.pending"),raw);File.WriteAllBytes(Path.Combine(root,admins,"admin.pending"),admin);
   var receipt=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-unclaimed-initialize-cancel"},{"ownerSid",owner},{"cancelId",id},{"packageSha256",manifest},{"barrierSha256",barrier},{"runId",intent.RunId},{"runFileSha256",Hash(raw)},{"adminFileSha256",Hash(admin)},{"adminNonce",nonce},{"runsArchive",runs},{"adminArchive",admins},{"runsDirectoryId","generated"},{"adminDirectoryId","generated"},{"newRunId",initial.RunId},{"newBoundarySha256",initial.Digest()},{"canceledAt",4000L}};
   string receiptPath=Path.Combine(root,"unclaimed-"+id+".json");File.WriteAllText(receiptPath,new JavaScriptSerializer().Serialize(receipt),new UTF8Encoding(false));
   Action check=()=>SodaDesktopSigninRestartRecovery.Slot(root,owner,barrier,false,null,(p,a)=>true);check();
   foreach(string unknown in new[]{"identity.dpapi","enrollment.dpapi",old+"/unexpected-key",runs+"/started",admins+"/admin.claimed"}){string p=Path.Combine(root,unknown);File.WriteAllText(p,"generated unexpected state");try{Refused(check);}finally{File.Delete(p);}check();}
   string extra=Path.Combine(root,"unknown-archive");Directory.CreateDirectory(extra);try{Refused(check);}finally{Directory.Delete(extra);}check();
   byte[] original=File.ReadAllBytes(receiptPath);receipt["newBoundarySha256"]=new string('f',64);File.WriteAllText(receiptPath,new JavaScriptSerializer().Serialize(receipt),new UTF8Encoding(false));Refused(check);File.WriteAllBytes(receiptPath,original);check();
   Refused(()=>SodaDesktopSigninRestartRecovery.RequireNewInstance("100:200","100:200"));Refused(()=>SodaDesktopSigninRestartRecovery.RequireNewInstance("","100:300"));
   SodaDesktopSigninRestartRecovery.RequireNewInstance("100:200","100:300");Console.WriteLine("signin_restart_closed_history_keys_digest_and_same_instance_checks_passed");
   byte[] currentIntent=intent.Protect();string runHash=Hash(currentIntent),adminHash=Hash(admin);File.WriteAllBytes(Path.Combine(root,"runs/intent.claimed"),currentIntent);File.WriteAllBytes(Path.Combine(root,"admin/admin.pending"),admin);
   var started=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","started"},{"ownerSid",owner},{"runId",intent.RunId},{"packageSha256",manifest},{"barrierSha256",barrier},{"pid",123L},{"createdFiletime","123456789"},{"startedAt",1600L},{"intentSha256",intent.Digest()}},owner);File.WriteAllBytes(Path.Combine(root,"runs/started"),started.Protect());
   var ack=SodaDesktopSigninRunRecord.Build(new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-run"},{"kind","observation"},{"ownerSid",owner},{"runId",intent.RunId},{"packageSha256",manifest},{"barrierSha256",barrier},{"pid",123L},{"createdFiletime","123456789"},{"startedSha256",started.Digest()}},owner);File.WriteAllBytes(Path.Combine(root,"runs/observation"),ack.Protect());
   Func<SodaDesktopSigninQuiescence.Pin> barrierOpen=()=>SodaDesktopSigninQuiescence.OpenCore(Path.Combine(root,"quiescence.lock"),new[]{root},(p,a)=>true);
   Func<string,string,string,Action<string>,IDictionary<string,object>> execute=(action,instance,ticket,step)=>SodaDesktopSigninRestartRecovery.Core(action,owner,manifest,runHash,adminHash,ticket,root,instance,()=>true,()=>true,barrierOpen,(p,a)=>true,p=>Directory.CreateDirectory(p),p=>new FileStream(p,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.None),step);
   var bound=execute("bind","100:200",null,null);string ticketHash=(string)bound["ticketSha256"],marker=Path.Combine(root,"install.transition");
   var ticketFields=new JavaScriptSerializer().DeserializeObject(File.ReadAllText(marker)) as Dictionary<string,object>;string recoveryId=(string)ticketFields["recoveryId"];
   Refused(()=>execute("recover","100:200",ticketHash,null));Refused(()=>execute("recover","100:300",new string('f',64),null));if(Hash(File.ReadAllBytes(marker))!=ticketHash)throw new Exception("Refused recovery changed marker");
   if(failure==null){
    var result=execute("recover","100:300",ticketHash,null);if((string)result["state"]!="abnormal-restart-recovered"||File.Exists(marker)||(bool)result["cleanExitClaimed"])throw new Exception("Recovery completion is not an abnormal new boundary");
    Refused(()=>execute("recover","100:300",ticketHash,null));
   }else{
    Refused(()=>execute("recover","100:300",ticketHash,step=>{if(step==failure)throw new InvalidOperationException("generated interrupted recovery");}));
    if(!File.Exists(marker)||Hash(File.ReadAllBytes(marker))!=ticketHash)throw new Exception("Interrupted recovery lost startup barrier");Refused(()=>execute("recover","100:300",ticketHash,null));
   }
   bool originalRun=false,originalAdmin=false;foreach(string path in new[]{Path.Combine(root,"runs/intent.claimed"),Path.Combine(root,"runs-abnormal-"+recoveryId+"/intent.claimed")})if(File.Exists(path)&&Hash(File.ReadAllBytes(path))==runHash)originalRun=true;foreach(string path in new[]{Path.Combine(root,"admin/admin.pending"),Path.Combine(root,"admin-abnormal-"+recoveryId+"/admin.pending")})if(File.Exists(path)&&Hash(File.ReadAllBytes(path))==adminHash)originalAdmin=true;
   if(!originalRun||!originalAdmin)throw new Exception("Recovery lost original bytes");

  }finally{Directory.Delete(root,true);}
 }
}
