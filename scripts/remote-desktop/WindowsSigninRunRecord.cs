// Closed lifecycle metadata only. Parsing/DPAPI does NOT authenticate a local
// administrator, actual process exit, file ownership, or exclusive quiescence.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
public sealed class SodaDesktopSigninRunRecord {
    readonly SortedDictionary<string,object> data;
    static readonly string[] Kinds={"intent","started","observation","stopped","observed-stop","initial"};
    static Exception Failure(){return new InvalidOperationException("Signin run metadata is unavailable");}
    SodaDesktopSigninRunRecord(SortedDictionary<string,object> data){this.data=data;}
    static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=4};}
    static string Text(object raw,int maximum){var text=raw as string;if(text==null||text.Length<1||text.Length>maximum)throw Failure();return text;}
    static string Hash(object raw){string text=Text(raw,64);if(!Regex.IsMatch(text,"\\A[a-f0-9]{64}\\z"))throw Failure();return text;}
    static string Uuid(object raw){string text=Text(raw,36);if(!Regex.IsMatch(text,"\\A[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\\z"))throw Failure();return text;}
    static long Number(object raw,long minimum,long maximum){if(!(raw is int)&&!(raw is long))throw Failure();long value=Convert.ToInt64(raw,CultureInfo.InvariantCulture);if(value<minimum||value>maximum)throw Failure();return value;}
    static string Creation(object raw){string text=Text(raw,20);ulong value;if(!UInt64.TryParse(text,NumberStyles.None,CultureInfo.InvariantCulture,out value)||value==0||value.ToString(CultureInfo.InvariantCulture)!=text)throw Failure();return text;}
    static void Keys(IDictionary<string,object> value,ICollection<string> keys){if(value.Count!=keys.Count)throw Failure();foreach(string key in keys)if(!value.ContainsKey(key))throw Failure();}
    internal static bool Known(string kind){return Array.IndexOf(Kinds,kind)>=0;}
    public string Kind{get{return (string)data["kind"];}}
    public string Owner{get{return (string)data["ownerSid"];}}
    public string RunId{get{return (string)data["runId"];}}
    public object Field(string key){object result;if(!data.TryGetValue(key,out result))throw Failure();return result;}
    public IDictionary<string,object> Fields(){return new SortedDictionary<string,object>(data,StringComparer.Ordinal);}
    public override string ToString(){return "Signin run metadata ("+Kind+")";}
    public byte[] Encode(){byte[] bytes=new UTF8Encoding(false,true).GetBytes(Json().Serialize(data));if(bytes.Length>4096){Array.Clear(bytes,0,bytes.Length);throw Failure();}return bytes;}
    public string Digest(){byte[] bytes=Encode();try{using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}finally{Array.Clear(bytes,0,bytes.Length);}}
    public bool SameRun(SodaDesktopSigninRunRecord other){return other!=null&&Owner==other.Owner&&RunId==other.RunId&&(string)data["packageSha256"]==(string)other.data["packageSha256"]&&(string)data["barrierSha256"]==(string)other.data["barrierSha256"];}
    public bool SameProcess(SodaDesktopSigninRunRecord other){return SameRun(other)&&data.ContainsKey("pid")&&other.data.ContainsKey("pid")&&(long)data["pid"]==(long)other.data["pid"]&&(string)data["createdFiletime"]==(string)other.data["createdFiletime"];}
    public static SodaDesktopSigninRunRecord Build(IDictionary<string,object> raw,string owner){
        try{
            if(raw==null)throw Failure();owner=SodaDesktopSigninVault.Owner(owner);string kind=Text(raw["kind"],32);if(!Known(kind))throw Failure();
            if(Number(raw["version"],1,1)!=1||Text(raw["purpose"],64)!="desktop-signin-run"||Text(raw["ownerSid"],184)!=owner)throw Failure();
            var result=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-run"},{"kind",kind},{"ownerSid",owner},{"runId",Uuid(raw["runId"])},{"packageSha256",Hash(raw["packageSha256"])},{"barrierSha256",Hash(raw["barrierSha256"])}};
            var keys=new List<string>(result.Keys);string[] extra;
            if(kind=="intent"){
                string mode=Text(raw["mode"],16);if(mode!="normal"&&mode!="admin")throw Failure();
                extra=mode=="admin"?new[]{"issuedAt","expiresAt","mode","adminNonce","adminSha256"}:new[]{"issuedAt","expiresAt","mode"};
                long issued=Number(raw["issuedAt"],0,9007199254740991),expires=Number(raw["expiresAt"],0,9007199254740991);if(expires<=issued||expires-issued>300000)throw Failure();
                result.Add("issuedAt",issued);result.Add("expiresAt",expires);result.Add("mode",mode);if(mode=="admin"){result.Add("adminNonce",Uuid(raw["adminNonce"]));result.Add("adminSha256",Hash(raw["adminSha256"]));}
            }else if(kind=="initial"){
                extra=new[]{"createdAt"};result.Add("createdAt",Number(raw["createdAt"],0,9007199254740991));
            }else{
                result.Add("pid",Number(raw["pid"],1,UInt32.MaxValue));result.Add("createdFiletime",Creation(raw["createdFiletime"]));
                if(kind=="started"){extra=new[]{"pid","createdFiletime","startedAt","intentSha256"};result.Add("startedAt",Number(raw["startedAt"],0,9007199254740991));result.Add("intentSha256",Hash(raw["intentSha256"]));}
                else if(kind=="observation"){extra=new[]{"pid","createdFiletime","startedSha256"};result.Add("startedSha256",Hash(raw["startedSha256"]));}
                else if(kind=="stopped"){
                    extra=new[]{"pid","createdFiletime","stoppedAt","startedSha256","nodeExitCode","jobEmpty"};if(Number(raw["nodeExitCode"],0,0)!=0||!(raw["jobEmpty"] is bool)||!(bool)raw["jobEmpty"])throw Failure();
                    result.Add("stoppedAt",Number(raw["stoppedAt"],0,9007199254740991));result.Add("startedSha256",Hash(raw["startedSha256"]));result.Add("nodeExitCode",0);result.Add("jobEmpty",true);
                }else{
                    extra=new[]{"pid","createdFiletime","observedAt","stoppedSha256","processExitCode","scmExitCode","scmSpecificCode","scmState","barrierExclusive"};
                    if(Number(raw["processExitCode"],0,0)!=0||Number(raw["scmExitCode"],0,0)!=0||Number(raw["scmSpecificCode"],0,0)!=0||Text(raw["scmState"],16)!="stopped"||!(raw["barrierExclusive"] is bool)||!(bool)raw["barrierExclusive"])throw Failure();
                    result.Add("observedAt",Number(raw["observedAt"],0,9007199254740991));result.Add("stoppedSha256",Hash(raw["stoppedSha256"]));result.Add("processExitCode",0);result.Add("scmExitCode",0);result.Add("scmSpecificCode",0);result.Add("scmState","stopped");result.Add("barrierExclusive",true);
                }
            }
            keys.AddRange(extra);Keys(raw,keys);return new SodaDesktopSigninRunRecord(result);
        }catch{throw Failure();}
    }
    public static SodaDesktopSigninRunRecord Decode(byte[] bytes,string owner){
        try{if(bytes==null||bytes.Length<1||bytes.Length>4096)throw Failure();string text=new UTF8Encoding(false,true).GetString(bytes);if(text.Contains("__type"))throw Failure();var fields=Json().DeserializeObject(text) as Dictionary<string,object>;var result=Build(fields,owner);byte[] canonical=result.Encode();try{if(Convert.ToBase64String(bytes)!=Convert.ToBase64String(canonical))throw Failure();}finally{Array.Clear(canonical,0,canonical.Length);}return result;}catch{throw Failure();}
    }
    internal static byte[] Crypt(byte[] input,string owner,string runId,string kind,bool encrypt){
        byte[] copy=null,entropy=null,result=null;
        try{owner=SodaDesktopSigninVault.Owner(owner);runId=Uuid(runId);if(!Known(kind)||input==null||input.Length<1||input.Length>(encrypt?4096:8192))throw Failure();copy=(byte[])input.Clone();entropy=Encoding.UTF8.GetBytes("Sodashitsu signin run v1\0"+kind+"\0"+owner+"\0"+runId);result=encrypt?ProtectedData.Protect(copy,entropy,DataProtectionScope.LocalMachine):ProtectedData.Unprotect(copy,entropy,DataProtectionScope.LocalMachine);if(result.Length<1||result.Length>(encrypt?8192:4096)){Array.Clear(result,0,result.Length);throw Failure();}return result;}catch{throw Failure();}finally{if(copy!=null)Array.Clear(copy,0,copy.Length);if(entropy!=null)Array.Clear(entropy,0,entropy.Length);}
    }
    static SortedDictionary<string,object> Envelope(string owner,string runId,string kind,byte[] cipher){return new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-run-envelope"},{"kind",kind},{"ownerSid",owner},{"runId",runId},{"ciphertext",Convert.ToBase64String(cipher)}};}
    public byte[] Protect(){byte[] plain=Encode(),cipher=null;try{cipher=Crypt(plain,Owner,RunId,Kind,true);byte[] result=new UTF8Encoding(false,true).GetBytes(Json().Serialize(Envelope(Owner,RunId,Kind,cipher)));if(result.Length>16384){Array.Clear(result,0,result.Length);throw Failure();}return result;}finally{Array.Clear(plain,0,plain.Length);if(cipher!=null)Array.Clear(cipher,0,cipher.Length);}}
    public static SodaDesktopSigninRunRecord Unprotect(byte[] bytes,string owner,string expectedKind,string expectedRunId=null){
        byte[] cipher=null,plain=null,canonical=null;
        try{
            owner=SodaDesktopSigninVault.Owner(owner);if(bytes==null||bytes.Length<1||bytes.Length>16384||!Known(expectedKind))throw Failure();string text=new UTF8Encoding(false,true).GetString(bytes);if(text.Contains("__type"))throw Failure();var fields=Json().DeserializeObject(text) as Dictionary<string,object>;if(fields==null)throw Failure();Keys(fields,new[]{"version","purpose","kind","ownerSid","runId","ciphertext"});
            string run=Uuid(fields["runId"]);if(Number(fields["version"],1,1)!=1||Text(fields["purpose"],64)!="desktop-signin-run-envelope"||Text(fields["kind"],32)!=expectedKind||Text(fields["ownerSid"],184)!=owner||expectedRunId!=null&&run!=Uuid(expectedRunId))throw Failure();
            string encoded=Text(fields["ciphertext"],10924);cipher=Convert.FromBase64String(encoded);if(cipher.Length<1||cipher.Length>8192||Convert.ToBase64String(cipher)!=encoded)throw Failure();canonical=new UTF8Encoding(false,true).GetBytes(Json().Serialize(Envelope(owner,run,expectedKind,cipher)));if(Convert.ToBase64String(canonical)!=Convert.ToBase64String(bytes))throw Failure();
            plain=Crypt(cipher,owner,run,expectedKind,false);var record=Decode(plain,owner);if(record.Kind!=expectedKind||record.RunId!=run)throw Failure();return record;
        }catch{throw Failure();}finally{if(cipher!=null)Array.Clear(cipher,0,cipher.Length);if(plain!=null)Array.Clear(plain,0,plain.Length);if(canonical!=null)Array.Clear(canonical,0,canonical.Length);}
    }
}
