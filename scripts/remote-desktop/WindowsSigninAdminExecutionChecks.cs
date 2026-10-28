using System;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninAdminExecutionChecks {
 const string Owner="S-1-5-21-1-2-3-1001",Nonce="11111111-1111-4111-8111-111111111111",Other="22222222-2222-4222-8222-222222222222";
 static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException(message);}
 static void Denied(Action run,string message){bool failed=false;try{run();}catch{failed=true;}Check(failed,message);}
 static byte[] Encode(object value){return Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(value));}
 static byte[] Request(){return Encode(new{version=1,purpose="desktop-signin-admin",ownerSid=Owner,nonce=Nonce,issuedAt=10000,expiresAt=11000,operation=new{kind="status"}});}
 static Dictionary<string,object> Result(){return new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-admin-result"},{"ownerSid",Owner},{"nonce",Nonce},{"cipherSha256",new string('a',64)},{"outcome","success"},{"status",new{initialized=true,required=true,fingerprint=new string('b',64),peers=new[]{new{fingerprint=new string('c',64),label="Generated viewer",role="viewer"}}}}};}
 static void RejectedResult(Dictionary<string,object> value,string message){byte[] bytes=Encode(value);try{Denied(()=>SodaDesktopSigninAdminResult.Decode(bytes,Owner,Nonce,new string('a',64)),message);}finally{Array.Clear(bytes,0,bytes.Length);}}
 public static void Run(){
  byte[] plain=Request();try{
   long wall=10000,tick=0;bool active=true;var deadline=new SodaDesktopSigninAdminDeadline(plain,Owner,Nonce,()=>wall,()=>tick,()=>active);Check(deadline.Current(),"Valid native deadline rejected");wall=11000;Check(!deadline.Current(),"Native wall expiry accepted");wall=10000;Check(!deadline.Current(),"Native wall expiry revived");
   wall=10000;tick=0;deadline=new SodaDesktopSigninAdminDeadline(plain,Owner,Nonce,()=>wall,()=>tick,()=>active);tick=1000;Check(!deadline.Current(),"Native monotonic expiry accepted");
   tick=0;deadline=new SodaDesktopSigninAdminDeadline(plain,Owner,Nonce,()=>wall,()=>tick,()=>active);active=false;Check(!deadline.Current(),"Native owner loss accepted");active=true;Check(!deadline.Current(),"Native owner loss revived");
   wall=10000;tick=0;deadline=new SodaDesktopSigninAdminDeadline(plain,Owner,Nonce,()=>wall,()=>tick,()=>true);wall=10001;tick=1;Check(deadline.Current(),"Native fresh lease rejected");wall=10000;Check(!deadline.Current(),"Native backward clock accepted");
   wall=10000;tick=0;bool reenter=false,invoked=false;SodaDesktopSigninAdminDeadline recursive=null;recursive=new SodaDesktopSigninAdminDeadline(plain,Owner,Nonce,()=>wall,()=>tick,()=>{if(reenter&&!invoked){invoked=true;recursive.Current();}return true;});reenter=true;Check(!recursive.Current(),"Native reentrant deadline accepted");reenter=false;Check(!recursive.Current(),"Native reentrant deadline revived");
   Denied(()=>new SodaDesktopSigninAdminDeadline(plain,Owner,Other,()=>10000,()=>0,()=>true),"Native request nonce mismatch accepted");
   Denied(()=>new SodaDesktopSigninAdminDeadline(plain,"S-1-5-21-1-2-3-1002",Nonce,()=>10000,()=>0,()=>true),"Native request owner mismatch accepted");
  }finally{Array.Clear(plain,0,plain.Length);}
  var value=Result();byte[] input=Encode(value),output=null;try{output=SodaDesktopSigninAdminResult.Decode(input,Owner,Nonce,new string('a',64));string text=Encoding.UTF8.GetString(output);Check(text.Contains("Generated viewer")&&!text.Contains("token"),"Native public result changed");}finally{Array.Clear(input,0,input.Length);if(output!=null)Array.Clear(output,0,output.Length);}
  value=Result();value["token"]="generated-secret-not-public";RejectedResult(value,"Native result accepted secret field");
  value=Result();value["nonce"]=Other;RejectedResult(value,"Native result accepted other nonce");
  value=Result();value["cipherSha256"]=new string('d',64);RejectedResult(value,"Native result accepted changed claim");
  value=Result();value["status"]=new{initialized=true,required=true,fingerprint=new string('b',64),peers=new[]{new{fingerprint=new string('c',64),label="Generated agent",role="agent"}}};RejectedResult(value,"Native result promoted agent role");
  var peers=new List<object>();for(int i=0;i<9;i++)peers.Add(new{fingerprint=new string("0123456789"[i],64),label="Generated viewer",role="viewer"});value=Result();value["status"]=new{initialized=true,required=true,fingerprint=new string('b',64),peers};RejectedResult(value,"Native result accepted ninth peer");
  value=Result();value["outcome"]="incomplete";value.Remove("status");input=Encode(value);try{output=SodaDesktopSigninAdminResult.Decode(input,Owner,Nonce,new string('a',64));Check(Encoding.UTF8.GetString(output).Contains("incomplete"),"Native incomplete outcome rejected");}finally{Array.Clear(input,0,input.Length);if(output!=null)Array.Clear(output,0,output.Length);}
  Console.WriteLine("signin_admin_generated_public_results_and_native_deadlines_passed");
 }
}
