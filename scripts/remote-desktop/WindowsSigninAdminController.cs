// Explicit elevated local preparation/result acknowledgment. Never starts a
// service, performs an administrative operation, or accepts caller file paths.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninAdminController {
    static Exception Failure(){return new InvalidOperationException("Signin administrative request requires verified quiescence or explicit recovery");}
    static void Require(bool value){if(!value)throw Failure();}
    static long Wall(){return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}
    static JavaScriptSerializer Json(){return new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=8};}
    static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",CharSet=CharSet.Unicode,ExactSpelling=true,SetLastError=true)]static extern bool MoveFileExW(string from,string to,uint flags);
    public static IDictionary<string,object> ValidateOperation(byte[] input){byte[] normalized=null;try{normalized=SodaDesktopSigninAdminEnrollment.Operation(input);var value=Json().DeserializeObject(new UTF8Encoding(false,true).GetString(normalized)) as Dictionary<string,object>;Require(value!=null);return new Dictionary<string,object>{{"state","operation-validated"},{"operation",value["kind"]}};}catch{throw Failure();}finally{if(normalized!=null)Array.Clear(normalized,0,normalized.Length);}}
    public static IDictionary<string,object> Run(string action,string owner,string manifest,byte[] operation,string nonce,string cipherSha256,string resultSha256){
        if(nonce=="")nonce=null;if(cipherSha256=="")cipherSha256=null;if(resultSha256=="")resultSha256=null;
        if(action!="prepare"&&action!="result"&&action!="acknowledge")throw Failure();
        Require(SodaDesktopSigninPackageNative.Authority(true)&&Environment.Is64BitProcess&&SodaDesktopSigninVault.UserAccount(owner));
        var timer=Stopwatch.StartNew();using(var mutex=SodaDesktopSigninControllerMutex.Acquire(owner,10000))using(var package=SodaDesktopSigninPackageNative.VerifyController(owner,manifest)){
            Func<bool> current=()=>timer.ElapsedMilliseconds<90000&&mutex.Current()&&package.Current();using(var scm=SodaDesktopSigninScm.Open(owner,false,current))using(var pin=SodaDesktopSigninQuiescence.Open(owner))using(var exclusive=pin.Exclusive()){
                string barrier=exclusive.Fingerprint;Func<bool> stopped=()=>current()&&exclusive.Current()&&exclusive.Fingerprint==barrier&&scm.Query().State==1;
                using(var run=SodaDesktopSigninRunStorage.OpenController(owner,package.ManifestSha256,barrier,SodaDesktopSigninRunJournal.Role.Reader,stopped)){
                    Require(run.State()=="initial"||run.State()=="complete");string directory=Path.Combine(Path.GetDirectoryName(SodaDesktopSigninVault.StoragePath(owner)),"admin");
                    if(action=="prepare"){Require(operation!=null&&nonce==null&&cipherSha256==null&&resultSha256==null);return PrepareCore(directory,owner,operation,stopped,SodaDesktopSigninQuiescence.Private);}
                    Require(operation==null);return ResultCore(directory,owner,nonce,cipherSha256,resultSha256,action=="acknowledge",stopped,SodaDesktopSigninQuiescence.Private);
                }
            }
        }
    }
    internal static IDictionary<string,object> PrepareCore(string directory,string owner,byte[] operation,Func<bool> current,Func<byte[],bool> policy,Action afterStageClosed=null){
        byte[] normalized=null,plain=null,cipher=null;var clock=Stopwatch.StartNew();SodaDesktopSigninAdminDeadline deadline=null;
        try{
            Require(operation!=null&&current!=null&&current()&&policy!=null);owner=SodaDesktopSigninVault.Owner(owner);normalized=SodaDesktopSigninAdminEnrollment.Operation(operation);
            string nonce=Guid.NewGuid().ToString("D");long issued=Wall(),expires=checked(issued+120000);var op=Json().DeserializeObject(new UTF8Encoding(false,true).GetString(normalized)) as Dictionary<string,object>;Require(op!=null);
            var request=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-admin"},{"ownerSid",owner},{"nonce",nonce},{"issuedAt",issued},{"expiresAt",expires},{"operation",op}};
            plain=new UTF8Encoding(false,true).GetBytes(Json().Serialize(request));Require(plain.Length<=16384);deadline=new SodaDesktopSigninAdminDeadline(plain,owner,nonce,Wall,()=>clock.ElapsedMilliseconds,current);
            Func<bool> active=()=>deadline.Current();using(var parent=SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,policy,null)){
                Action check=()=>{SodaDesktopSigninPackageNative.CheckCore(parent,policy);Require(active());};check();Require(Directory.GetFileSystemEntries(directory).Length==0);check();
                using(var envelope=SodaDesktopSigninAdminEnvelope.Protect(plain,owner,nonce))cipher=envelope.Encode();string digest=Hash(cipher),stage=Path.Combine(directory,"admin.pending.writing"),target=Path.Combine(directory,"admin.pending");SodaDesktopSigninVault.FileFacts written;
                check();using(var file=new FileStream(stage,FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(cipher,0,cipher.Length);check();file.Flush(true);written=SodaDesktopSigninVault.Facts(file.SafeFileHandle);Require(written.Regular);}
                if(afterStageClosed!=null)afterStageClosed();using(var held=SodaDesktopSigninPackageNative.OpenRenamableCore(stage,65536,policy)){
                    Require(written.Same(SodaDesktopSigninVault.Facts(held.Handle)));SodaDesktopSigninPackageNative.CheckCore(held,policy);check();Require(MoveFileExW(stage,target,8));
                    using(var actual=SodaDesktopSigninPackageNative.OpenRenamableCore(target,65536,policy))Require(held.Before.Same(actual.Before,false,65536));check();
                }
                return new Dictionary<string,object>{{"state","pending"},{"nonce",nonce},{"cipherSha256",digest},{"expiresAt",expires},{"operation",(string)op["kind"]}};
            }
        }catch{throw Failure();}finally{if(deadline!=null)deadline.Close();foreach(var bytes in new[]{normalized,plain,cipher})if(bytes!=null)Array.Clear(bytes,0,bytes.Length);}
    }
    sealed class Value:IDisposable {
        internal readonly SodaDesktopSigninPackageNative.Held Held;internal readonly byte[] Bytes;
        internal Value(string path,int maximum,Func<bool> current,Func<byte[],bool> policy){Require(current());Held=SodaDesktopSigninPackageNative.OpenRenamableCore(path,maximum,policy);try{
            Bytes=new byte[checked((int)Held.Before.Value.SizeLow)];int at=0;while(at<Bytes.Length){Require(current());int n=Held.Stream.Read(Bytes,at,Bytes.Length-at);Require(n>0);at+=n;}Require(Held.Stream.ReadByte()==-1);SodaDesktopSigninPackageNative.CheckCore(Held,policy);Require(current());
        }catch{Dispose();throw;}}
        public void Dispose(){if(Bytes!=null)Array.Clear(Bytes,0,Bytes.Length);if(Held!=null)Held.Dispose();}
    }
    internal static IDictionary<string,object> ResultCore(string directory,string owner,string nonce,string expectedCipher,string expectedResult,bool acknowledge,Func<bool> current,Func<byte[],bool> policy){
        byte[] sanitized=null;try{
            Require(current!=null&&current()&&policy!=null&&nonce!=null&&expectedCipher!=null);using(var parent=SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,policy,null)){
                Func<bool> active=()=>{SodaDesktopSigninPackageNative.CheckCore(parent,policy);return current();};Require(active());Require(Directory.GetFileSystemEntries(directory).Length==2);
                using(var claimed=new Value(Path.Combine(directory,"admin.claimed"),65536,active,policy))using(var result=new Value(Path.Combine(directory,"admin.result"),16384,active,policy)){
                    using(var envelope=SodaDesktopSigninAdminEnvelope.Decode(claimed.Bytes,owner))Require(envelope.Nonce==nonce);string cipher=Hash(claimed.Bytes),digest=Hash(result.Bytes);Require(cipher==expectedCipher);if(acknowledge)Require(expectedResult!=null&&digest==expectedResult);else Require(expectedResult==null);
                    sanitized=SodaDesktopSigninAdminResult.Decode(result.Bytes,owner,nonce,cipher);var publicResult=Json().DeserializeObject(new UTF8Encoding(false,true).GetString(sanitized)) as Dictionary<string,object>;Require(publicResult!=null);
                    Func<bool> owned=()=>{SodaDesktopSigninPackageNative.CheckCore(claimed.Held,policy);SodaDesktopSigninPackageNative.CheckCore(result.Held,policy);return active();};Require(owned());
                    if(acknowledge){var journal=new SodaDesktopSigninAdminJournal(directory,active);journal.Acknowledge(cipher,digest);return new Dictionary<string,object>{{"state","acknowledged"},{"nonce",nonce},{"cipherSha256",cipher},{"resultSha256",digest}};}
                    return new Dictionary<string,object>{{"state","result"},{"nonce",nonce},{"cipherSha256",cipher},{"resultSha256",digest},{"result",publicResult}};
                }
            }
        }catch{throw Failure();}finally{if(sanitized!=null)Array.Clear(sanitized,0,sanitized.Length);}
    }
}
