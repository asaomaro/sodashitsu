// Canonical outer metadata only. Private ACLs and local journal ownership are
// required separately; this data object does not authenticate its caller.
using System;
using System.Collections.Generic;
using System.Text;
using System.Web.Script.Serialization;
public sealed class SodaDesktopSigninAdminEnvelope:IDisposable {
    public sealed class Data {public int version;public string purpose,ownerSid,nonce,cipher;}
    readonly byte[] cipher;bool disposed;public readonly string Owner,Nonce;
    static Exception Failure(){return new InvalidOperationException("Signin administration request is unavailable");}
    static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=4};}
    SodaDesktopSigninAdminEnvelope(string owner,string nonce,byte[] cipher){Owner=SodaDesktopSigninVault.Owner(owner);Guid id;if(nonce==null||!Guid.TryParseExact(nonce,"D",out id)||id==Guid.Empty||id.ToString("D")!=nonce||cipher==null||cipher.Length<1||cipher.Length>65536)throw Failure();Nonce=nonce;this.cipher=(byte[])cipher.Clone();}
    public static SodaDesktopSigninAdminEnvelope Protect(byte[] plain,string owner,string nonce){byte[] cipher=null;try{cipher=SodaDesktopSigninVault.ProtectAdmin(plain,owner,nonce);return new SodaDesktopSigninAdminEnvelope(owner,nonce,cipher);}finally{if(cipher!=null)Array.Clear(cipher,0,cipher.Length);}}
    public byte[] Encode(){
        if(disposed)throw Failure();var fields=new SortedDictionary<string,object>(StringComparer.Ordinal){{"cipher",Convert.ToBase64String(cipher)},{"nonce",Nonce},{"ownerSid",Owner},{"purpose","desktop-signin-admin-cipher"},{"version",1}};
        byte[] bytes=Encoding.UTF8.GetBytes(Json().Serialize(fields));if(bytes.Length<1||bytes.Length>65536){Array.Clear(bytes,0,bytes.Length);throw Failure();}return bytes;
    }
    public static SodaDesktopSigninAdminEnvelope Decode(byte[] bytes,string owner){
        SodaDesktopSigninAdminEnvelope value=null;byte[] cipher=null,canonical=null;bool transferred=false;
        try{
            if(bytes==null||bytes.Length<1||bytes.Length>65536)throw Failure();string text=new UTF8Encoding(false,true).GetString(bytes);if(text.Contains("__type"))throw Failure();var data=Json().Deserialize<Data>(text);
            if(data==null||data.version!=1||data.purpose!="desktop-signin-admin-cipher"||data.ownerSid!=SodaDesktopSigninVault.Owner(owner)||data.cipher==null||data.cipher.Length>65536)throw Failure();
            cipher=Convert.FromBase64String(data.cipher);if(Convert.ToBase64String(cipher)!=data.cipher)throw Failure();value=new SodaDesktopSigninAdminEnvelope(data.ownerSid,data.nonce,cipher);canonical=value.Encode();if(new UTF8Encoding(false,true).GetString(canonical)!=text)throw Failure();transferred=true;return value;
        }catch{throw Failure();}finally{if(cipher!=null)Array.Clear(cipher,0,cipher.Length);if(canonical!=null)Array.Clear(canonical,0,canonical.Length);if(!transferred&&value!=null)value.Dispose();}
    }
    public byte[] Decrypt(){if(disposed)throw Failure();return SodaDesktopSigninVault.UnprotectAdmin(cipher,Owner,Nonce);}
    public void Dispose(){if(disposed)return;disposed=true;Array.Clear(cipher,0,cipher.Length);}
}
