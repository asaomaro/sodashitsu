using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninAdminEnrollmentChecks {
 const string Owner="S-1-5-21-1-2-3-1001",Nonce="11111111-1111-4111-8111-111111111111";
 static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 static void Denied(Action run,string message){bool failed=false;try{run();}catch(InvalidOperationException){failed=true;}Check(failed,message);}
 static byte[] Encode(object value){return Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(value));}
 static Dictionary<string,object> Operation(){return new Dictionary<string,object>{{"kind","enroll"},{"origin","https://root.example"},{"machineId",new string('a',32)},{"token",new string('t',43)},{"allowInput",false},{"peers",new[]{new{fingerprint=new string('b',64),label="generated"}}}};}
 static Dictionary<string,object> Record(){return new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin"},{"revision","22222222-2222-4222-8222-222222222222"},{"ownerSid",Owner},{"provider",new string('c',64)},{"allowSignin",true},{"origin","https://root.example"},{"machineId",new string('a',32)},{"token",new string('t',43)},{"allowInput",false},{"peers",new[]{new{fingerprint=new string('b',64),label="generated"}}}};}
 static byte[] Canonical(Dictionary<string,object> data,Dictionary<string,object> operation){byte[] record=Encode(data),request=Encode(new{version=1,purpose="desktop-signin-admin",ownerSid=Owner,nonce=Nonce,issuedAt=10000,expiresAt=11000,operation});try{return SodaDesktopSigninAdminEnrollment.Canonical(record,request,Owner);}finally{Array.Clear(record,0,record.Length);Array.Clear(request,0,request.Length);}}
 public static void Run(){
  byte[] replyPlain=Encoding.UTF8.GetBytes("generated private request bytes"),reply=null;
  try{using(var envelope=SodaDesktopSigninAdminEnvelope.Protect(replyPlain,Owner,Nonce)){reply=envelope.ClaimReply(new string('a',64),replyPlain);var parsed=new JavaScriptSerializer().DeserializeObject(new UTF8Encoding(false,true).GetString(reply)) as Dictionary<string,object>;Check(parsed!=null&&parsed.Count==4&&(string)parsed["state"]=="claimed"&&(string)parsed["nonce"]==Nonce&&(string)parsed["requestBase64"]==Convert.ToBase64String(replyPlain),"Private claim reply changed");}}finally{Array.Clear(replyPlain,0,replyPlain.Length);if(reply!=null)Array.Clear(reply,0,reply.Length);}
  var data=Record();var op=Operation();byte[] canonical=Canonical(data,op),cipher=null,restored=null;
  try{cipher=SodaDesktopSigninVault.Protect(canonical,Owner);restored=SodaDesktopSigninVault.Unprotect(cipher,Owner);Check(Convert.ToBase64String(canonical)==Convert.ToBase64String(restored),"Enrollment crypto changed canonical bytes");}finally{Array.Clear(canonical,0,canonical.Length);if(cipher!=null)Array.Clear(cipher,0,cipher.Length);if(restored!=null)Array.Clear(restored,0,restored.Length);}
  foreach(string field in new[]{"token","machineId","origin"}){data=Record();op=Operation();data[field]=field=="token"?new string('x',43):field=="machineId"?new string('d',32):"https://other.example";var changedData=data;var changedOp=op;Denied(()=>Canonical(changedData,changedOp),"Enrollment claim field mismatch accepted: "+field);}
  data=Record();data["allowInput"]=true;Denied(()=>Canonical(data,Operation()),"Enrollment input scope extended");
  data=Record();data["ownerSid"]="S-1-5-21-1-2-3-1002";Denied(()=>Canonical(data,Operation()),"Enrollment owner mismatch accepted");
  data=Record();data["peers"]=new[]{new{fingerprint=new string('e',64),label="generated"}};Denied(()=>Canonical(data,Operation()),"Enrollment peer scope extended");
  data=Record();data["peers"]=new[]{new{fingerprint=new string('b',64),label="generated",role="agent"}};Denied(()=>Canonical(data,Operation()),"Enrollment peer agent role accepted");
  data=Record();data["extra"]=true;Denied(()=>Canonical(data,Operation()),"Enrollment unknown fields accepted");
  data=Record();op=Operation();data["origin"]="http://public.example";op["origin"]="http://public.example";Denied(()=>Canonical(data,op),"Enrollment public plaintext origin accepted");
  data=Record();op=Operation();data["origin"]="http://127.0.0.1:1234";op["origin"]="http://127.0.0.1:1234";canonical=Canonical(data,op);Array.Clear(canonical,0,canonical.Length);
  data=Record();op=Operation();op["peers"]=new[]{new{fingerprint=new string('b',64),label="\ufeff generated \ufeff"}};canonical=Canonical(data,op);Array.Clear(canonical,0,canonical.Length);
  string root=Path.Combine(Path.GetTempPath(),"soda-enrollment-file-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
  try{
   string path=Path.Combine(root,"enrollment.dpapi");byte[] generated=Encoding.UTF8.GetBytes("generated opaque DPAPI bytes only");
   SodaDesktopSigninAdminPersistence.EnrollmentCore(path,Nonce,generated,()=>true,value=>true,file=>true);Check(Convert.ToBase64String(File.ReadAllBytes(path))==Convert.ToBase64String(generated),"Fixed enrollment file did not commit");
   SodaDesktopSigninAdminPersistence.DisableEnrollmentCore(path,()=>true,value=>true,file=>true);Check(!File.Exists(path),"Explicit disable retained enrollment");
   Denied(()=>SodaDesktopSigninAdminPersistence.EnrollmentCore(path,Nonce,generated,()=>false,value=>true,file=>true),"Expired enrollment committed");Check(!File.Exists(path),"Expired enrollment changed fixed file");
   SodaDesktopSigninAdminPersistence.EnrollmentCore(path,Nonce,generated,()=>true,value=>true,file=>true);Denied(()=>SodaDesktopSigninAdminPersistence.DisableEnrollmentCore(path,()=>false,value=>true,file=>true),"Expired disable accepted");Check(File.Exists(path),"Expired disable removed enrollment");
   SodaDesktopSigninAdminPersistence.DisableEnrollmentCore(path,()=>true,value=>true,file=>true);SodaDesktopSigninAdminPersistence.DisableEnrollmentCore(path,()=>true,value=>true,file=>true);Array.Clear(generated,0,generated.Length);
  }finally{Directory.Delete(root,true);}
  Console.WriteLine("signin_admin_generated_claim_bound_enrollment_and_fixed_files_passed");
 }
}
