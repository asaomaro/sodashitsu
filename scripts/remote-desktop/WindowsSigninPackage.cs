// Fixed package data/policy only. This does not install, launch or trust a repo.
using System;
using System.Collections.Generic;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

public sealed class SodaDesktopSigninPackage {
    const string SystemSid="S-1-5-18",Admins="S-1-5-32-544",Installer="S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
    static readonly string[] Paths={
        "DesktopSigninService.exe","DesktopSigninWorker.exe","bootstrap.mjs","node.exe","packages/server/dist/signin/main.bundle.cjs",
        "scripts/remote-desktop/EndpointAclPolicy.ps1","scripts/remote-desktop/SigninAclPolicy.ps1","scripts/remote-desktop/WindowsSigninVault.cs",
        "scripts/remote-desktop/check-endpoint-acl.ps1","scripts/remote-desktop/protect-endpoint-key.ps1","scripts/remote-desktop/read-signin-enrollment.ps1",
        "scripts/remote-desktop/SigninAdminStorage.ps1",
        "scripts/remote-desktop/WindowsSigninAdminEnvelope.cs",
        "scripts/remote-desktop/WindowsSigninAdminJournal.cs",
        "scripts/remote-desktop/WindowsSigninAdminDeadline.cs",
        "scripts/remote-desktop/WindowsSigninAdminResult.cs",
        "scripts/remote-desktop/WindowsSigninAdminEnrollment.cs",
        "scripts/remote-desktop/WindowsSigninAdminPersistence.cs",
        "scripts/remote-desktop/read-signin-admin.ps1",
        "scripts/remote-desktop/write-signin-admin-result.ps1",
        "scripts/remote-desktop/commit-signin-vault.ps1",
        "scripts/remote-desktop/write-signin-enrollment.ps1"
    };
    public sealed class Entry {
        public readonly string Path,Sha256;public readonly long Bytes;
        public Entry(string path,string sha256,long bytes){Path=path;Sha256=sha256;Bytes=bytes;}
    }
    public sealed class EntryData {public string path;public string sha256;public long bytes;}
    public sealed class Data {public int version;public string purpose,ownerSid,revision;public EntryData[] entries;}
    readonly Entry[] entries;
    public readonly string Owner,Revision;
    static Exception Failure(){return new InvalidOperationException("Signin package is unavailable");}
    public static string[] RequiredPaths(){return (string[])Paths.Clone();}
    public static long MaximumBytes(string path){
        if(path=="node.exe")return 268435456;
        if(path=="DesktopSigninService.exe"||path=="DesktopSigninWorker.exe")return 33554432;
        if(path=="packages/server/dist/signin/main.bundle.cjs")return 16777216;
        if(path=="bootstrap.mjs")return 65536;
        return 1048576;
    }
    public static string OwnerSid(string owner){
        try {if(owner==null||owner.Length>184||owner==SystemSid||owner=="S-1-5-19"||owner=="S-1-5-20"||new SecurityIdentifier(owner).Value!=owner)throw Failure();return owner;}
        catch{throw Failure();}
    }
    public static string Slot(string owner){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(OwnerSid(owner)))).Replace("-","").ToLowerInvariant();}
    public SodaDesktopSigninPackage(string owner,string revision,Entry[] values){
        Owner=OwnerSid(owner);Guid parsed;
        if(!Guid.TryParseExact(revision,"D",out parsed)||parsed==Guid.Empty||parsed.ToString("D")!=revision||values==null||values.Length!=Paths.Length)throw Failure();
        Revision=revision;entries=(Entry[])values.Clone();long total=0;
        for(int i=0;i<entries.Length;i++){
            var entry=entries[i];
            if(entry==null||entry.Path!=Paths[i]||entry.Sha256==null||!Regex.IsMatch(entry.Sha256,"\\A[a-f0-9]{64}\\z")||entry.Bytes<1||entry.Bytes>MaximumBytes(entry.Path))throw Failure();
            total+=entry.Bytes;if(total>335544320)throw Failure();
        }
    }
    public Entry[] Entries(){return (Entry[])entries.Clone();}
    static JavaScriptSerializer Serializer(){return new JavaScriptSerializer{MaxJsonLength=32768,RecursionLimit=8};}
    public string Encode(){
        var list=new List<object>();
        foreach(var entry in entries)list.Add(new SortedDictionary<string,object>(StringComparer.Ordinal){{"bytes",entry.Bytes},{"path",entry.Path},{"sha256",entry.Sha256}});
        return Serializer().Serialize(new SortedDictionary<string,object>(StringComparer.Ordinal){{"entries",list},{"ownerSid",Owner},{"purpose","desktop-signin-package"},{"revision",Revision},{"version",1}});
    }
    public static SodaDesktopSigninPackage Decode(string text,string expectedOwner){
        try {
            if(text==null||Encoding.UTF8.GetByteCount(text)>32768||text.IndexOf("__type",StringComparison.Ordinal)>=0)throw Failure();
            var data=Serializer().Deserialize<Data>(text);
            if(data==null||data.version!=1||data.purpose!="desktop-signin-package"||data.ownerSid!=OwnerSid(expectedOwner)||data.entries==null||data.entries.Length!=Paths.Length)throw Failure();
            var values=new Entry[data.entries.Length];
            for(int i=0;i<values.Length;i++){var entry=data.entries[i];if(entry==null)throw Failure();values[i]=new Entry(entry.path,entry.sha256,entry.bytes);}
            var result=new SodaDesktopSigninPackage(data.ownerSid,data.revision,values);
            if(result.Encode()!=text)throw Failure();return result;
        }catch{throw Failure();}
    }
    // Ordinary users may read code. Only replacement/write is restricted. In
    // ancestors, create-only rights do not replace the already checked child.
    public static bool CodeAcl(byte[] descriptor,bool packageObject){
        try {
            if(descriptor==null||descriptor.Length>131072)return false;
            var raw=new RawSecurityDescriptor(descriptor,0);
            if(raw.Owner==null)return false;
            bool ownerTrusted=raw.Owner.Value==SystemSid||raw.Owner.Value==Admins||!packageObject&&raw.Owner.Value==Installer;
            if(!ownerTrusted||(raw.ControlFlags&ControlFlags.DiscretionaryAclPresent)==0||raw.DiscretionaryAcl==null)return false;
            foreach(GenericAce value in raw.DiscretionaryAcl){
                var ace=value as CommonAce;if(ace==null||ace.IsCallback)return false;
                if(ace.AceQualifier==AceQualifier.AccessDenied)continue;
                if(ace.AceQualifier!=AceQualifier.AccessAllowed)return false;
                string sid=ace.SecurityIdentifier.Value;bool inheritOnly=(ace.AceFlags&AceFlags.InheritOnly)!=0;
                if(sid==SystemSid||sid==Admins||sid=="S-1-3-0"&&inheritOnly||!packageObject&&sid==Installer)continue;
                if(!packageObject&&inheritOnly)continue;
                uint danger=packageObject?0x520D0156u:0x520D0150u;
                if((unchecked((uint)ace.AccessMask)&danger)!=0)return false;
            }
            return true;
        }catch{return false;}
    }
}
