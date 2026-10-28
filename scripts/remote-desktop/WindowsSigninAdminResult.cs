// A public result is rebuilt from a closed schema; never persist arbitrary
// original JSON, unknown fields, an enrollment token or a private key.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninAdminResult {
    static Exception Failure(){return new InvalidOperationException("Signin administration result is unavailable");}
    static Dictionary<string,object> Object(object raw){var value=raw as Dictionary<string,object>;if(value==null)throw Failure();return value;}
    static void Keys(Dictionary<string,object> value,params string[] keys){if(value.Count!=keys.Length)throw Failure();foreach(string key in keys)if(!value.ContainsKey(key))throw Failure();}
    static string Text(object raw,int maximum){string value=raw as string;if(value==null||value.Length<1||value.Length>maximum)throw Failure();return value;}
    static bool Boolean(object raw){if(!(raw is bool))throw Failure();return (bool)raw;}
    static string Fingerprint(object raw){string text=Text(raw,64);if(text.Length!=64)throw Failure();foreach(char c in text)if(!(c>='a'&&c<='f'||c>='0'&&c<='9'))throw Failure();return text;}
    static object Status(object raw){
        var value=Object(raw);bool initialized=Boolean(value["initialized"]);
        if(!initialized){if(value.Count==1){Keys(value,"initialized");return new{initialized=false};}Keys(value,"initialized","required");if(!Boolean(value["required"]))throw Failure();return new{initialized=false,required=true};}
        Keys(value,"initialized","required","fingerprint","peers");var peers=value["peers"] as object[];if(peers==null||peers.Length>8)throw Failure();var names=new HashSet<string>(StringComparer.Ordinal);var result=new List<object>();
        foreach(var item in peers){var peer=Object(item);Keys(peer,"fingerprint","label","role");string fingerprint=Fingerprint(peer["fingerprint"]),label=Text(peer["label"],80);if(!names.Add(fingerprint)||label.Trim()!=label||Text(peer["role"],8)!="viewer")throw Failure();result.Add(new{fingerprint,label,role="viewer"});}
        return new{initialized=true,required=Boolean(value["required"]),fingerprint=Fingerprint(value["fingerprint"]),peers=result};
    }
    public static byte[] Decode(byte[] input,string expectedOwner,string expectedNonce,string expectedClaim){
        try{
            if(input==null||input.Length<1||input.Length>16384)throw Failure();string text=new UTF8Encoding(false,true).GetString(input);if(text.Contains("__type"))throw Failure();var json=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=8};var value=Object(json.DeserializeObject(text));
            string outcome=Text(value["outcome"],16);if(outcome!="success"&&outcome!="incomplete")throw Failure();
            if(outcome=="success")Keys(value,"version","purpose","ownerSid","nonce","cipherSha256","outcome","status");else Keys(value,"version","purpose","ownerSid","nonce","cipherSha256","outcome");
            Guid nonce;string owner=SodaDesktopSigninVault.Owner(expectedOwner);if(!(value["version"] is int)||(int)value["version"]!=1||Text(value["purpose"],64)!="desktop-signin-admin-result"||Text(value["ownerSid"],184)!=owner||!Guid.TryParseExact(expectedNonce,"D",out nonce)||nonce==Guid.Empty||nonce.ToString("D")!=expectedNonce||Text(value["nonce"],36)!=expectedNonce||Fingerprint(value["cipherSha256"])!=Fingerprint(expectedClaim))throw Failure();
            var fields=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-admin-result"},{"ownerSid",owner},{"nonce",expectedNonce},{"cipherSha256",expectedClaim},{"outcome",outcome}};if(outcome=="success")fields.Add("status",Status(value["status"]));
            byte[] bytes=new UTF8Encoding(false,true).GetBytes(json.Serialize(fields));if(bytes.Length>16384){Array.Clear(bytes,0,bytes.Length);throw Failure();}return bytes;
        }catch{throw Failure();}
    }
}
