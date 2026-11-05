// Read-only SYSTEM proof for one incomplete initialization. Never initializes,
// grants trust, changes a key, starts a service or accepts an arbitrary path.
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using R=SodaDesktopSigninRestartRecovery;
public static class SodaDesktopSigninPartialIdentityProof {
    public static string LastPhase{get;private set;}
    static Exception Failure(){return new InvalidOperationException("Partial initialization identity proof is unavailable");}
    static void Require(bool value){if(!value)throw Failure();}
    internal static string ProofDirectory(string owner,string nonce){Guid id;Require(Guid.TryParseExact(nonce,"D",out id)&&id!=Guid.Empty&&id.ToString("D")==nonce);return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Sodashitsu",".signin-identity-proof-"+SodaDesktopSigninPackage.Slot(owner)+"-"+id.ToString("N"));}
    internal static Dictionary<string,object> Parse(byte[] bytes,int maximum){Require(bytes!=null&&bytes.Length>0&&bytes.Length<=maximum);string text=new UTF8Encoding(false,true).GetString(bytes);Require(!text.Contains("__type"));var value=new JavaScriptSerializer{MaxJsonLength=maximum,RecursionLimit=8}.DeserializeObject(text) as Dictionary<string,object>;Require(value!=null);return value;}
    internal static void Keys(Dictionary<string,object> value,params string[] keys){Require(value.Keys.OrderBy(x=>x,StringComparer.Ordinal).SequenceEqual(keys.OrderBy(x=>x,StringComparer.Ordinal)));}
    internal static void Layout(string runtime){R.Exact(runtime,"desktop-endpoint");R.Exact(Path.Combine(runtime,"desktop-endpoint"),"identity.json");}
    internal static string ValidateIdentity(byte[] envelope,Func<byte[],byte[]> decrypt){
        byte[] cipher=null,plain=null,secret=null,publicBlob=null,rawPublic=null;
        try{
            LastPhase="identity-envelope";var outer=Parse(envelope,131072);Keys(outer,"version","mode","data");Require(outer["version"] is int&&(int)outer["version"]==1&&(outer["mode"] as string)=="dpapi-user");
            string encoded=outer["data"] as string;Require(encoded!=null&&encoded.Length<=90000);cipher=Convert.FromBase64String(encoded);Require(cipher.Length>0&&cipher.Length<=65536&&Convert.ToBase64String(cipher)==encoded);
            LastPhase="identity-decrypt";plain=decrypt(cipher);var vault=Parse(plain,65536);Keys(vault,"version","required","publicKey","secret","peers");
            Require(vault["version"] is int&&(int)vault["version"]==1&&vault["required"] is bool&&!(bool)vault["required"]&&vault["peers"] is object[]&&((object[])vault["peers"]).Length==0);
            string pub=vault["publicKey"] as string,privateText=vault["secret"] as string;
            Require(pub!=null&&System.Text.RegularExpressions.Regex.IsMatch(pub,"\\A04[a-f0-9]{128}\\z")&&privateText!=null&&privateText.Length<=4096);
            secret=Convert.FromBase64String(privateText);Require(secret.Length>0&&Convert.ToBase64String(secret)==privateText);
            rawPublic=new byte[65];for(int i=0;i<65;i++)rawPublic[i]=Convert.ToByte(pub.Substring(i*2,2),16);
            LastPhase="identity-possession";VerifyPossession(secret,rawPublic);return R.Hash(rawPublic);
        }catch{throw Failure();}finally{foreach(var b in new[]{cipher,plain,secret,publicBlob,rawPublic})if(b!=null)Array.Clear(b,0,b.Length);}
    }
    // Read canonical P-256 PKCS8 without relying on CNG's generic EC usage
    // group. Convert the existing scalar to an ephemeral ECDSA key, then prove
    // its signature against the exact saved (X,Y), including Y's sign.
    sealed class Der {
        readonly byte[] bytes;int at;readonly int end;
        internal Der(byte[] bytes):this(bytes,0,bytes.Length){}
        Der(byte[] bytes,int at,int end){this.bytes=bytes;this.at=at;this.end=end;}
        internal bool Next(byte tag){return at<end&&bytes[at]==tag;}
        internal Der Node(byte tag){Require(at+2<=end&&bytes[at++]==tag);int length=bytes[at++];if(length>=128){int count=length&127;Require(count>0&&count<=2&&at+count<=end&&bytes[at]!=0);length=0;while(count-->0)length=(length<<8)|bytes[at++];Require(length>=128);}Require(length<=end-at);var child=new Der(bytes,at,at+length);at+=length;return child;}
        internal void End(){Require(at==end);}
        internal void Value(byte tag,byte[] expected){var value=Node(tag);Require(value.end-value.at==expected.Length);for(int i=0;i<expected.Length;i++)Require(value.bytes[value.at+i]==expected[i]);}
        internal void Copy(byte[] target,int offset,int length){Require(end-at==length);Array.Copy(bytes,at,target,offset,length);}
    }
    static void VerifyPossession(byte[] secret,byte[] rawPublic){
        byte[] privateBlob=null,publicBlob=null,challenge=null,signature=null;
        try{
            LastPhase="pkcs8-header";var encoded=new Der(secret);var pkcs=encoded.Node(0x30);encoded.End();pkcs.Value(2,new byte[]{0});
            LastPhase="pkcs8-algorithm";var algorithm=pkcs.Node(0x30);algorithm.Value(6,new byte[]{0x2a,0x86,0x48,0xce,0x3d,2,1});byte[] curve={0x2a,0x86,0x48,0xce,0x3d,3,1,7};algorithm.Value(6,curve);algorithm.End();
            LastPhase="pkcs8-payload";var octets=pkcs.Node(4);pkcs.End();var ec=octets.Node(0x30);octets.End();ec.Value(2,new byte[]{1});var scalar=ec.Node(4);
            LastPhase="pkcs8-scalar";privateBlob=new byte[104];privateBlob[0]=0x45;privateBlob[1]=0x43;privateBlob[2]=0x53;privateBlob[3]=0x32;privateBlob[4]=32;Array.Copy(rawPublic,1,privateBlob,8,64);scalar.Copy(privateBlob,72,32);
            LastPhase="pkcs8-public";if(ec.Next(0xa0)){var parameters=ec.Node(0xa0);parameters.Value(6,curve);parameters.End();}
            if(ec.Next(0xa1)){var supplied=ec.Node(0xa1);var bits=supplied.Node(3);supplied.End();var expected=new byte[66];Array.Copy(rawPublic,0,expected,1,65);bits.Copy(expected,0,66);Require(expected[0]==0);for(int i=0;i<65;i++)Require(expected[i+1]==rawPublic[i]);}
            ec.End();
            publicBlob=new byte[72];Array.Copy(privateBlob,0,publicBlob,0,72);publicBlob[3]=0x31;
            challenge=new byte[32];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(challenge);
            LastPhase="key-import";using(var key=CngKey.Import(privateBlob,CngKeyBlobFormat.EccPrivateBlob))using(var signer=new ECDsaCng(key))using(var publicKey=CngKey.Import(publicBlob,CngKeyBlobFormat.EccPublicBlob))using(var verifier=new ECDsaCng(publicKey)){
                Require(key.IsEphemeral&&key.AlgorithmGroup==CngAlgorithmGroup.ECDsa&&key.KeySize==256);signer.HashAlgorithm=CngAlgorithm.Sha256;verifier.HashAlgorithm=CngAlgorithm.Sha256;
                LastPhase="key-signature";signature=signer.SignData(challenge);LastPhase="key-verify";Require(verifier.VerifyData(challenge,signature));
            }
        }finally{foreach(var b in new[]{privateBlob,publicBlob,challenge,signature})if(b!=null)Array.Clear(b,0,b.Length);}
    }
    public static IDictionary<string,object> Run(string owner,string manifest,string nonce){
        LastPhase="authority";Require(Environment.Is64BitProcess&&SodaDesktopSigninVault.SystemPrimary()&&SodaDesktopSigninVault.UserAccount(owner));
        LastPhase="package";var timer=Stopwatch.StartNew();using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> scope=()=>timer.ElapsedMilliseconds<30000&&mutex.Current()&&package.Current()&&SodaDesktopSigninVault.SystemPrimary();
            LastPhase="scm-and-barrier";using(var scm=SodaDesktopSigninScm.Open(owner,false,scope))using(var critical=new R.ScmInstance(scope))using(var pin=SodaDesktopSigninQuiescence.Open(owner))using(var exclusive=pin.Exclusive()){
                string slot=SodaDesktopSigninVault.StateDirectory(owner),runtime=Path.Combine(slot,"runtime"),directory=ProofDirectory(owner,nonce);
                Func<string,byte[],bool> policy=(p,a)=>p==slot||p.StartsWith(slot+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||p==directory||p.StartsWith(directory+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)?SodaDesktopSigninQuiescence.Private(a):SodaDesktopSigninQuiescence.StateAncestor(p,a);
                Func<bool> current=()=>scope()&&critical.Current()&&exclusive.Current()&&scm.Query().State==1&&scm.Query().Pid==0;
                LastPhase="runtime-and-proof-root";using(var proofRoot=SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,SodaDesktopSigninQuiescence.Private,null))using(var tree=new R.Tree(runtime,policy,current)){
                    R.Exact(directory);Layout(runtime);Require(current());string digest=tree.Digest();byte[] bytes=R.Read(Path.Combine(runtime,"desktop-endpoint","identity.json"),policy);
                    try{
                        string fingerprint=ValidateIdentity(bytes,b=>ProtectedData.Unprotect(b,Encoding.UTF8.GetBytes("Sodashitsu desktop endpoint identity v1"),DataProtectionScope.CurrentUser));
                        Layout(runtime);using(var after=new R.Tree(runtime,policy,current))Require(after.Digest()==digest);Require(current());
                        var proof=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-partial-identity-proof"},{"ownerSid",owner},{"packageSha256",manifest},{"nonce",nonce},{"scmInstance",critical.Identity},{"barrierSha256",exclusive.Fingerprint},{"runtimeSha256",digest},{"cipherSha256",R.Hash(bytes)},{"provider",fingerprint},{"issuedAt",DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}};
                        LastPhase="proof-write";R.Write(Path.Combine(directory,"proof.json"),R.Encode(proof),policy,SodaDesktopSigninPackageNative.CreatePrivateFile);
                        tree.Check();using(var after=new R.Tree(runtime,policy,current))Require(after.Digest()==digest);Require(current());
                        return new Dictionary<string,object>{{"state","partial-identity-verified"},{"nonce",nonce},{"proofSha256",R.Hash(R.Read(Path.Combine(directory,"proof.json"),policy))},{"provider",fingerprint}};
                    }finally{Array.Clear(bytes,0,bytes.Length);}
                }
            }
        }
    }
}
