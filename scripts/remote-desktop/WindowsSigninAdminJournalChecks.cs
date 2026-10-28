using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Runtime.InteropServices;
public static class SodaDesktopSigninAdminJournalChecks {
 static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 static void Denied(Action run,string message){bool failed=false;try{run();}catch(InvalidOperationException){failed=true;}Check(failed,message);}
 static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static string PathOf(string root,string name){return Path.Combine(root,name);}
 static byte[] Data=Encoding.UTF8.GetBytes("generated cipher envelope only"),Result=Encoding.UTF8.GetBytes("generated public result only");
 static string DirectoryFor(string root){string path=Path.Combine(root,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(path);return path;}
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true,ExactSpelling=true)]static extern bool CreateHardLinkW(string link,string target,IntPtr security);
 public static void Run(){
  string root=Path.Combine(Path.GetTempPath(),"soda-admin-journal-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
  try{
   string[] names={"admin.pending","admin.claimed","admin.result","admin.ack"};
   for(int mask=0;mask<16;mask++){
    string path=DirectoryFor(root);for(int i=0;i<4;i++)if((mask&(1<<i))!=0)File.WriteAllBytes(PathOf(path,names[i]),Data);
    var journal=new SodaDesktopSigninAdminJournal(path,()=>true);Check(journal.State()==(mask==0?"normal":mask==1?"claim":"recovery"),"Journal residue entered normal/claim path");
    if((mask&1)!=0&&mask!=1)Denied(()=>journal.Claim(),"Claim accepted journal residue");
   }
   string ordinary=DirectoryFor(root);File.WriteAllBytes(PathOf(ordinary,"admin.pending"),Data);bool cleanup=false,sawAck=false;
   var normal=new SodaDesktopSigninAdminJournal(ordinary,()=>{if(cleanup&&File.Exists(PathOf(ordinary,"admin.ack"))&&File.Exists(PathOf(ordinary,"admin.claimed"))&&File.Exists(PathOf(ordinary,"admin.result")))sawAck=true;return true;});
   var claim=normal.Claim();Check(claim.Sha256==Hash(Data)&&Convert.ToBase64String(claim.CipherEnvelope)==Convert.ToBase64String(Data)&&!File.Exists(PathOf(ordinary,"admin.pending"))&&normal.State()=="recovery","Claim was not durable before dispatch");Array.Clear(claim.CipherEnvelope,0,claim.CipherEnvelope.Length);
   var inspected=normal.Claimed();Check(inspected.Sha256==Hash(Data)&&Convert.ToBase64String(inspected.CipherEnvelope)==Convert.ToBase64String(Data),"Claim inspection changed request");Array.Clear(inspected.CipherEnvelope,0,inspected.CipherEnvelope.Length);
   Denied(()=>normal.Result(new string('0',64),Result),"Result accepted changed claim digest");Check(!File.Exists(PathOf(ordinary,"admin.result")),"Bad claim produced result");
   normal.Result(Hash(Data),Result);Denied(()=>normal.Claimed(),"Claim inspection accepted completed result residue");Denied(()=>normal.Acknowledge(Hash(Data),new string('0',64)),"Ack accepted changed result digest");
   cleanup=true;normal.Acknowledge(Hash(Data),Hash(Result));Check(sawAck,"Ack was not published before original removal");Check(normal.State()=="normal","Completed acknowledgment did not clear journal");
   string interrupted=DirectoryFor(root);File.WriteAllBytes(PathOf(interrupted,"admin.pending"),Data);bool cancelAtAck=false,active=true;
   var stopped=new SodaDesktopSigninAdminJournal(interrupted,()=>{if(cancelAtAck&&File.Exists(PathOf(interrupted,"admin.ack")))active=false;return active;});
   var pending=stopped.Claim();Array.Clear(pending.CipherEnvelope,0,pending.CipherEnvelope.Length);stopped.Result(Hash(Data),Result);cancelAtAck=true;
   Denied(()=>stopped.Acknowledge(Hash(Data),Hash(Result)),"Interrupted ack did not stop");Check(File.Exists(PathOf(interrupted,"admin.claimed"))&&File.Exists(PathOf(interrupted,"admin.result"))&&File.Exists(PathOf(interrupted,"admin.ack")),"Interrupted cleanup lost recovery evidence");
   active=true;Denied(()=>stopped.State(),"Journal owner loss revived");Check(new SodaDesktopSigninAdminJournal(interrupted,()=>true).State()=="recovery","Restart ignored interrupted journal");
   string replaced=DirectoryFor(root),source=PathOf(replaced,"admin.pending");File.WriteAllBytes(source,Data);bool switched=false;
   var changed=new SodaDesktopSigninAdminJournal(replaced,()=>{if(!switched){bool locked=false;try{using(var probe=new FileStream(source,FileMode.Open,FileAccess.Read,FileShare.None)){} }catch(IOException){locked=true;}if(locked){switched=true;File.Move(source,PathOf(replaced,"saved.generated"));File.WriteAllBytes(source,Result);}}return true;});
   Denied(()=>changed.Claim(),"Replaced pending identity was dispatched");Check(switched,"Pending replacement test did not observe held handle");
   string linked=DirectoryFor(root),target=PathOf(root,"generated-target");File.WriteAllBytes(target,Data);Check(CreateHardLinkW(PathOf(linked,"admin.pending"),target,IntPtr.Zero),"Generated hardlink creation failed");Denied(()=>new SodaDesktopSigninAdminJournal(linked,()=>true).Claim(),"Hardlinked pending was dispatched");
   string oversized=DirectoryFor(root);File.WriteAllBytes(PathOf(oversized,"admin.pending"),new byte[65537]);Denied(()=>new SodaDesktopSigninAdminJournal(oversized,()=>true).Claim(),"Oversized pending accepted");
   string unknown=DirectoryFor(root);File.WriteAllBytes(PathOf(unknown,"admin.result.pending"),Data);Check(new SodaDesktopSigninAdminJournal(unknown,()=>true).State()=="recovery","Partial stage entered normal sharing");
   string expired=DirectoryFor(root);bool live=true;var lease=new SodaDesktopSigninAdminJournal(expired,()=>live);live=false;Denied(()=>lease.State(),"Owner loss accepted");live=true;Denied(()=>lease.State(),"Journal owner loss revived");
   SodaDesktopSigninAdminJournal recursive=null;bool reenter=false;recursive=new SodaDesktopSigninAdminJournal(DirectoryFor(root),()=>{if(reenter){try{recursive.State();}catch(InvalidOperationException){}}return true;});reenter=true;Denied(()=>recursive.State(),"Journal reentrant owner accepted");reenter=false;Denied(()=>recursive.State(),"Journal reentrant owner revived");
   Console.WriteLine("signin_admin_generated_journal_claim_result_ack_and_recovery_passed");
  }finally{Directory.Delete(root,true);}
 }
}
