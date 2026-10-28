// Rebuild only enrollment data that matches the actual private claimed request.
// Provider identity/trust are verified by the dedicated Node store and again by
// the readonly runtime; this codec grants neither identity nor peer permission.
using System;
using System.Collections.Generic;
using System.Text;
using System.Security.Cryptography.X509Certificates;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninAdminEnrollment {
    static Exception Failure(){return new InvalidOperationException("Signin enrollment data is unavailable");}
    static Dictionary<string,object> Object(object raw){var value=raw as Dictionary<string,object>;if(value==null)throw Failure();return value;}
    static void Keys(Dictionary<string,object> value,params string[] keys){if(value.Count!=keys.Length)throw Failure();foreach(string key in keys)if(!value.ContainsKey(key))throw Failure();}
    static string Text(object raw,int maximum){string text=raw as string;if(text==null||text.Length<1||text.Length>maximum)throw Failure();return text;}
    static bool Boolean(object raw){if(!(raw is bool))throw Failure();return (bool)raw;}
    static string Pattern(object raw,string expression,int maximum){string text=Text(raw,maximum);if(!Regex.IsMatch(text,expression))throw Failure();return text;}
    static string Fingerprint(object raw){return Pattern(raw,"\\A[a-f0-9]{64}\\z",64);}
    static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=8};}
    static Dictionary<string,object> Parse(byte[] bytes){if(bytes==null||bytes.Length<1||bytes.Length>16384)throw Failure();string text=new UTF8Encoding(false,true).GetString(bytes);if(text.Contains("__type"))throw Failure();return Object(Json().DeserializeObject(text));}
    static string Label(object raw){
        // Match ECMAScript trim used by the Node request schema (not .NET's
        // broader Unicode Trim set); labels are display data, never authority.
        string text=Text(raw,16384).Trim(new[]{'\u0009','\u000a','\u000b','\u000c','\u000d','\u0020','\u00a0','\u1680','\u2000','\u2001','\u2002','\u2003','\u2004','\u2005','\u2006','\u2007','\u2008','\u2009','\u200a','\u2028','\u2029','\u202f','\u205f','\u3000','\ufeff'});if(text.Length<1||text.Length>80)throw Failure();return text;
    }
    public static byte[] Canonical(byte[] record,byte[] claimed,string owner){
        try{
            owner=SodaDesktopSigninVault.Owner(owner);Dictionary<string,object> request=Parse(claimed),operation=Object(request["operation"]),data=Parse(record);
            if(Text(request["ownerSid"],184)!=owner)throw Failure();bool hasCa=operation.ContainsKey("caPem");if(hasCa)Keys(operation,"kind","origin","machineId","token","allowInput","peers","caPem");else Keys(operation,"kind","origin","machineId","token","allowInput","peers");if(Text(operation["kind"],16)!="enroll")throw Failure();
            if(hasCa)Keys(data,"version","purpose","revision","ownerSid","provider","allowSignin","origin","machineId","token","allowInput","peers","caPem");else Keys(data,"version","purpose","revision","ownerSid","provider","allowSignin","origin","machineId","token","allowInput","peers");
            string ca=null;if(hasCa){ca=Text(data["caPem"],8192);if(ca!=Text(operation["caPem"],8192)||!Regex.IsMatch(ca,@"\A-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE-----\r?\n?\z"))throw Failure();byte[] der=Convert.FromBase64String(ca.Replace("-----BEGIN CERTIFICATE-----","").Replace("-----END CERTIFICATE-----",""));try{if(X509Certificate2.GetCertContentType(der)!=X509ContentType.Cert)throw Failure();using(var certificate=new X509Certificate2(der)){byte[] raw=certificate.RawData;if(certificate.HasPrivateKey||Convert.ToBase64String(raw)!=Convert.ToBase64String(der))throw Failure();bool isCa=false;foreach(X509Extension extension in certificate.Extensions)if(extension.Oid.Value=="2.5.29.19")isCa=new X509BasicConstraintsExtension(extension,extension.Critical).CertificateAuthority;if(!isCa)throw Failure();}}finally{Array.Clear(der,0,der.Length);}}
            if(!(data["version"] is int)||(int)data["version"]!=1||Text(data["purpose"],64)!="desktop-signin"||Text(data["ownerSid"],184)!=owner||!Boolean(data["allowSignin"]))throw Failure();
            string revision=Pattern(data["revision"],"\\A[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\\z",36),provider=Fingerprint(data["provider"]),origin=Text(data["origin"],2048),machineId=Pattern(data["machineId"],"\\A[a-f0-9]{32}\\z",32),token=Pattern(data["token"],"\\A[A-Za-z0-9_-]{43}\\z",43);bool input=Boolean(data["allowInput"]);
            Uri uri;if(!Uri.TryCreate(origin,UriKind.Absolute,out uri)||uri.UserInfo!=""||uri.Query!=""||uri.Fragment!=""||uri.AbsolutePath!="/"||uri.GetLeftPart(UriPartial.Authority)!=origin||uri.Scheme!="https"&&(uri.Scheme!="http"||uri.Host!="localhost"&&uri.Host!="127.0.0.1"&&uri.Host!="[::1]"&&uri.Host!="::1"))throw Failure();
            if(origin!=Text(operation["origin"],2048)||machineId!=Text(operation["machineId"],32)||token!=Text(operation["token"],43)||input!=Boolean(operation["allowInput"]))throw Failure();
            var peers=data["peers"] as object[];var expected=operation["peers"] as object[];if(peers==null||expected==null||peers.Length<1||peers.Length>8||peers.Length!=expected.Length)throw Failure();var names=new HashSet<string>(StringComparer.Ordinal);var list=new List<object>();
            for(int i=0;i<peers.Length;i++){
                Dictionary<string,object> peer=Object(peers[i]),actual=Object(expected[i]);Keys(peer,"fingerprint","label");Keys(actual,"fingerprint","label");string fingerprint=Fingerprint(peer["fingerprint"]),label=Label(peer["label"]);
                if(!names.Add(fingerprint)||fingerprint!=Fingerprint(actual["fingerprint"])||label!=Text(peer["label"],80)||label!=Label(actual["label"]))throw Failure();list.Add(new{fingerprint,label});
            }
            var result=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin"},{"revision",revision},{"ownerSid",owner},{"provider",provider},{"allowSignin",true},{"origin",origin},{"machineId",machineId},{"token",token},{"allowInput",input},{"peers",list}};
            if(hasCa)result.Add("caPem",ca);
            byte[] bytes=new UTF8Encoding(false,true).GetBytes(Json().Serialize(result));if(bytes.Length>16384){Array.Clear(bytes,0,bytes.Length);throw Failure();}return bytes;
        }catch{throw Failure();}
    }
}
