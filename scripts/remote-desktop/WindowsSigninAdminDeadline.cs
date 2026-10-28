// Per-helper persistence deadline read from the actual encrypted claimed
// request. This policy is not administrator authentication or an operation API.
using System;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;
public sealed class SodaDesktopSigninAdminDeadline {
    readonly Func<long> wall,monotonic;readonly Func<bool> owned;readonly long expires,until;long lastWall,lastMono;bool ended,checking;
    static Exception Failure(){return new InvalidOperationException("Signin administration deadline is unavailable");}
    static long Integer(object raw){if(!(raw is int)&&!(raw is long))throw Failure();return Convert.ToInt64(raw);}
    public SodaDesktopSigninAdminDeadline(byte[] plain,string owner,string nonce,Func<long> wall,Func<long> monotonic,Func<bool> owned){
        if(plain==null||plain.Length<1||plain.Length>16384||wall==null||monotonic==null||owned==null)throw Failure();
        string text=new UTF8Encoding(false,true).GetString(plain);if(text.Contains("__type"))throw Failure();var json=new JavaScriptSerializer{MaxJsonLength=16384,RecursionLimit=8};var value=json.DeserializeObject(text) as Dictionary<string,object>;
        if(value==null||value.Count!=7)throw Failure();foreach(string key in new[]{"version","purpose","ownerSid","nonce","issuedAt","expiresAt","operation"})if(!value.ContainsKey(key))throw Failure();
        Guid id;if(Integer(value["version"])!=1||!(value["purpose"] is string)||(string)value["purpose"]!="desktop-signin-admin"||!(value["ownerSid"] is string)||(string)value["ownerSid"]!=SodaDesktopSigninVault.Owner(owner)||!Guid.TryParseExact(nonce,"D",out id)||id==Guid.Empty||id.ToString("D")!=nonce||!(value["nonce"] is string)||(string)value["nonce"]!=nonce||!(value["operation"] is Dictionary<string,object>))throw Failure();
        long issued=Integer(value["issuedAt"]);expires=Integer(value["expiresAt"]);if(issued<0||expires>9007199254740991||expires<=issued||expires-issued>300000)throw Failure();
        this.wall=wall;this.monotonic=monotonic;this.owned=owned;lastWall=wall();lastMono=monotonic();if(lastWall<issued||lastWall>=expires||lastMono<0||lastMono>Int64.MaxValue-300000)throw Failure();until=lastMono+Math.Min(5000,expires-lastWall);if(!Current())throw Failure();
    }
    public bool Current(){
        if(ended||checking){ended=true;return false;}checking=true;
        try{bool active=owned();long now=wall(),tick=monotonic();if(!active||ended||now<lastWall||now>=expires||tick<lastMono||tick>=until){ended=true;return false;}lastWall=now;lastMono=tick;return true;}
        catch{ended=true;return false;}finally{checking=false;}
    }
    public void Close(){ended=true;}
}
