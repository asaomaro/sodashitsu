using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninAdminControllerChecks {
    const string Owner="S-1-5-21-1-2-3-1001";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Refused(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}Check(failed,message);}
    static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=8};}
    static byte[] Bytes(object value){return Encoding.UTF8.GetBytes(Json().Serialize(value));}
    static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    static string Temporary(string root){string path=Path.Combine(root,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(path);return path;}
    static IDictionary<string,object> Prepare(string path,byte[] input,Func<bool> current=null,Action afterStage=null){return SodaDesktopSigninAdminController.PrepareCore(path,Owner,input,current??(()=>true),acl=>true,afterStage);}
    static byte[] Result(string path,IDictionary<string,object> binding,bool success){
        var journal=new SodaDesktopSigninAdminJournal(path,()=>true);var claim=journal.Claim();try{Check(claim.Sha256==(string)binding["cipherSha256"],"Prepared claim hash changed");}finally{Array.Clear(claim.CipherEnvelope,0,claim.CipherEnvelope.Length);}
        var data=new Dictionary<string,object>{{"version",1},{"purpose","desktop-signin-admin-result"},{"ownerSid",Owner},{"nonce",binding["nonce"]},{"cipherSha256",binding["cipherSha256"]},{"outcome",success?"success":"incomplete"}};if(success)data.Add("status",new{initialized=false});byte[] encoded=Bytes(data),canonical=null;
        try{canonical=SodaDesktopSigninAdminResult.Decode(encoded,Owner,(string)binding["nonce"],(string)binding["cipherSha256"]);journal.Result((string)binding["cipherSha256"],canonical);return (byte[])canonical.Clone();}finally{Array.Clear(encoded,0,encoded.Length);if(canonical!=null)Array.Clear(canonical,0,canonical.Length);}
    }
    public static void Run(string executable){
        string root=Path.Combine(Path.GetTempPath(),"soda-admin-controller-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        try{
            byte[] status=Bytes(new{kind="status"});string path=Temporary(root);var binding=Prepare(path,status);Check((string)binding["state"]=="pending"&&Directory.GetFileSystemEntries(path).Length==1,"Prepared request was not one pending file");byte[] cipher=File.ReadAllBytes(Path.Combine(path,"admin.pending"));
            try{using(var envelope=SodaDesktopSigninAdminEnvelope.Decode(cipher,Owner)){byte[] plain=envelope.Decrypt();try{var request=Json().DeserializeObject(Encoding.UTF8.GetString(plain)) as Dictionary<string,object>;Check(request!=null&&(string)request["nonce"]==(string)binding["nonce"]&&(string)request["ownerSid"]==Owner,"Prepared request binding changed");}finally{Array.Clear(plain,0,plain.Length);}}}finally{Array.Clear(cipher,0,cipher.Length);}
            Refused(()=>Prepare(path,status),"Pending admin request was overwritten");byte[] result=Result(path,binding,true);string resultHash=Hash(result);Array.Clear(result,0,result.Length);
            var view=SodaDesktopSigninAdminController.ResultCore(path,Owner,(string)binding["nonce"],(string)binding["cipherSha256"],null,false,()=>true,acl=>true);Check((string)view["resultSha256"]==resultHash&&Directory.GetFileSystemEntries(path).Length==2,"Result viewing changed journal");
            Refused(()=>SodaDesktopSigninAdminController.ResultCore(path,Owner,(string)binding["nonce"],new string('f',64),resultHash,true,()=>true,acl=>true),"Wrong claim hash acknowledged result");
            Refused(()=>SodaDesktopSigninAdminController.ResultCore(path,Owner,(string)binding["nonce"],(string)binding["cipherSha256"],new string('f',64),true,()=>true,acl=>true),"Wrong result hash acknowledged result");
            var ack=SodaDesktopSigninAdminController.ResultCore(path,Owner,(string)binding["nonce"],(string)binding["cipherSha256"],resultHash,true,()=>true,acl=>true);Check((string)ack["state"]=="acknowledged"&&Directory.GetFileSystemEntries(path).Length==0,"Explicit result acknowledgment did not settle");
            path=Temporary(root);binding=Prepare(path,status);result=Result(path,binding,false);resultHash=Hash(result);Array.Clear(result,0,result.Length);view=SodaDesktopSigninAdminController.ResultCore(path,Owner,(string)binding["nonce"],(string)binding["cipherSha256"],null,false,()=>true,acl=>true);Check(Json().Serialize(view).Contains("incomplete"),"Incomplete outcome became success");SodaDesktopSigninAdminController.ResultCore(path,Owner,(string)binding["nonce"],(string)binding["cipherSha256"],resultHash,true,()=>true,acl=>true);Check(Directory.GetFileSystemEntries(path).Length==0,"Incomplete result could not be explicitly acknowledged");
            path=Temporary(root);bool active=true;PrepareFailureScope(path,status,()=>active,()=>active=false);
            path=Temporary(root);string captured=path;Refused(()=>Prepare(path,status,()=>true,()=>{string stage=Path.Combine(captured,"admin.pending.writing");byte[] bytes=File.ReadAllBytes(stage);try{File.Delete(stage);File.WriteAllBytes(stage,bytes);}finally{Array.Clear(bytes,0,bytes.Length);}}),"Replaced pending stage was published");Check(!File.Exists(Path.Combine(path,"admin.pending")),"Replaced stage reached pending request");
            path=Temporary(root);File.WriteAllText(Path.Combine(path,"unknown"),"generated");Refused(()=>Prepare(path,status),"Unknown admin artifact admitted new request");
            Operations(root);Input(executable);Console.WriteLine("signin_admin_controller_generated_prepare_public_result_ack_scope_and_bounded_pipe_passed");
        }finally{Directory.Delete(root,true);}
    }
    static void PrepareFailureScope(string path,byte[] status,Func<bool> active,Action revoke){Refused(()=>Prepare(path,status,active,revoke),"Revoked preparation published request");Check(File.Exists(Path.Combine(path,"admin.pending.writing"))&&!File.Exists(Path.Combine(path,"admin.pending")),"Revoked preparation erased recovery evidence");}
    static void Operations(string root){
        var peer=new{fingerprint=new string('b',64),label="  generated viewer  "};var enroll=new{kind="enroll",origin="https://root.example",machineId=new string('c',32),token=new string('t',43),allowInput=false,peers=new[]{peer}};
        foreach(object operation in new object[]{new{kind="initialize"},new{kind="disable"},new{kind="trust",peer},new{kind="revoke",fingerprint=new string('b',64)},enroll}){
            string path=Temporary(root);byte[] input=Bytes(operation),before=(byte[])input.Clone();try{var binding=Prepare(path,input);Check(Convert.ToBase64String(input)==Convert.ToBase64String(before),"Caller operation bytes were modified");Check(!Json().Serialize(binding).Contains(new string('t',43)),"Preparation leaked enrollment token");}finally{Array.Clear(input,0,input.Length);Array.Clear(before,0,before.Length);}
        }
        foreach(object operation in new object[]{new{kind="exec",command="generated"},new{kind="initialize",reset=true},new{kind="trust",peer=new{fingerprint=new string('b',64),label="generated",role="agent"}},new{kind="revoke",fingerprint="invalid"},new{kind="enroll",origin="http://root.example",machineId=new string('c',32),token=new string('t',43),allowInput=false,peers=new[]{peer}},new{kind="enroll",origin="https://root.example",machineId=new string('c',32),token="invalid",allowInput=false,peers=new[]{peer}}}){
            string path=Temporary(root);byte[] input=Bytes(operation);try{Refused(()=>Prepare(path,input),"Invalid operation was prepared");Check(Directory.GetFileSystemEntries(path).Length==0,"Invalid operation created request artifacts");}finally{Array.Clear(input,0,input.Length);}
        }
    }
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll")]static extern IntPtr GetStdHandle(int kind);
    static void Input(string executable){
        Encoding previous=Console.InputEncoding;try{Console.InputEncoding=new UTF8Encoding(false);foreach(string mode in new[]{"valid","oversize","timeout","eof-deadline"}){
            var info=new ProcessStartInfo(executable,"--generated-input "+mode){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};using(var child=Process.Start(info)){
                try{if(mode!="timeout"){byte[] input=mode=="oversize"?new byte[16385]:Encoding.UTF8.GetBytes("{\"kind\":\"status\"}");try{try{child.StandardInput.BaseStream.Write(input,0,input.Length);child.StandardInput.BaseStream.Flush();}catch(IOException){if(mode!="oversize")throw;}child.StandardInput.BaseStream.Close();}finally{Array.Clear(input,0,input.Length);}}
                    Check(child.WaitForExit(5000),"Bounded input child did not settle");string output=child.StandardOutput.ReadToEnd()+child.StandardError.ReadToEnd();if(child.ExitCode!=0)Console.WriteLine(output);Check(child.ExitCode==0,"Generated bounded input case failed: "+mode);
                }finally{if(!child.HasExited){child.Kill();child.WaitForExit(5000);}}
            }
        }}finally{Console.InputEncoding=previous;}
    }
    public static void Main(string[] args){
        try{
            if(args.Length!=2||args[0]!="--generated-input")throw new InvalidOperationException("Generated input mode required");string mode=args[1];byte[] input=null;bool refused=false;long now=0;
            try{if(mode=="timeout"){input=SodaDesktopSigninAdminInput.ReadCore(GetStdHandle(-10),()=>now,ms=>now+=10000);}else if(mode=="eof-deadline"){input=SodaDesktopSigninAdminInput.ReadCore(GetStdHandle(-10),()=>now,ms=>{},()=>now=10000);}else input=SodaDesktopSigninAdminInput.Read();}catch(InvalidOperationException){refused=true;}
            try{if(mode=="valid")Check(!refused&&input!=null&&Encoding.UTF8.GetString(input)=="{\"kind\":\"status\"}","Valid bounded pipe input changed");else if(mode=="oversize")Check(refused,"Overlong operation pipe input accepted");else if(mode=="eof-deadline")Check(refused,"EOF operation input crossed deadline");else Check(refused&&now==10000,"Unclosed operation pipe ignored deadline");}finally{if(input!=null)Array.Clear(input,0,input.Length);}
        }catch(Exception error){Console.WriteLine(error.ToString());Environment.Exit(1);}
    }
}
