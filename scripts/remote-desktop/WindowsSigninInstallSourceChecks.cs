using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
public static class SodaDesktopSigninInstallSourceChecks {
 const string Owner="S-1-5-21-1-2-3-1001";
 static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 static void Refused(Action action,string message){bool failed=false;try{action();}catch(InvalidOperationException){failed=true;}catch(IOException){failed=true;}Check(failed,message);}
 static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 internal static string Make(string root){
  Directory.CreateDirectory(root);var entries=new List<object>();foreach(string name in SodaDesktopSigninPackage.RequiredPaths()){
   string path=Path.Combine(root,name.Replace('/',Path.DirectorySeparatorChar));Directory.CreateDirectory(Path.GetDirectoryName(path));byte[] bytes=Encoding.UTF8.GetBytes("generated release bytes "+name);File.WriteAllBytes(path,bytes);entries.Add(new SortedDictionary<string,object>(StringComparer.Ordinal){{"path",name},{"bytes",bytes.Length},{"sha256",Hash(bytes)}});
  }
  var manifest=new SortedDictionary<string,object>(StringComparer.Ordinal){{"version",1},{"purpose","desktop-signin-package"},{"ownerSid",Owner},{"revision",Guid.NewGuid().ToString("D")},{"entries",entries}};byte[] data=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(manifest));File.WriteAllBytes(Path.Combine(root,"signin-package.json"),data);return Hash(data);
 }
 public static void Run(){
  string root=Path.Combine(Path.GetTempPath(),"soda-install-source-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
  try{
   string source=Path.Combine(root,"source"),hash=Make(source),destination=Path.Combine(root,"destination");Directory.CreateDirectory(destination);
   Refused(()=>{using(var value=SodaDesktopSigninInstallSource.Open(source,Owner,new string('f',64))){}} ,"Unreviewed manifest accepted");
   using(var release=SodaDesktopSigninInstallSource.Open(source,Owner,hash)){
    Check(release.Current(),"Reviewed source unavailable");Refused(()=>File.WriteAllText(Path.Combine(source,"node.exe"),"changed"),"Pinned source allowed write");Refused(()=>File.Delete(Path.Combine(source,"node.exe")),"Pinned source allowed deletion");
    release.Copy(destination,path=>{Directory.CreateDirectory(path);},(path,acl)=>true,()=>true);Check(release.Current(),"Copy changed source lease");
    foreach(string name in SodaDesktopSigninPackage.RequiredPaths()){byte[] a=File.ReadAllBytes(Path.Combine(source,name.Replace('/',Path.DirectorySeparatorChar))),b=File.ReadAllBytes(Path.Combine(destination,name.Replace('/',Path.DirectorySeparatorChar)));Check(Hash(a)==Hash(b),"Copied release bytes changed");}
    using(var copied=SodaDesktopSigninInstallSource.Open(destination,Owner,hash))Check(copied.Current(),"Copied release manifest/hash invalid");
    Refused(()=>release.Copy(destination,path=>{Directory.CreateDirectory(path);},(path,acl)=>true,()=>true),"Existing target was overwritten");
   }
   File.WriteAllText(Path.Combine(source,"extra"),"generated");Refused(()=>{using(var value=SodaDesktopSigninInstallSource.Open(source,Owner,hash)){}} ,"Unknown source file accepted");File.Delete(Path.Combine(source,"extra"));
   byte[] changed=File.ReadAllBytes(Path.Combine(source,"node.exe"));changed[0]^=1;File.WriteAllBytes(Path.Combine(source,"node.exe"),changed);Refused(()=>{using(var value=SodaDesktopSigninInstallSource.Open(source,Owner,hash)){}} ,"Changed release bytes accepted");
   source=Path.Combine(root,"source2");hash=Make(source);destination=Path.Combine(root,"destination2");Directory.CreateDirectory(destination);bool active=true;
   using(var release=SodaDesktopSigninInstallSource.Open(source,Owner,hash))Refused(()=>release.Copy(destination,path=>{Directory.CreateDirectory(path);active=false;},(path,acl)=>true,()=>active),"Revoked copy continued publication");
   Check(!File.Exists(Path.Combine(destination,"signin-package.json")),"Revoked copy published manifest");
   source=Path.Combine(root,"source3");hash=Make(source);destination=Path.Combine(root,"destination3");Directory.CreateDirectory(destination);
   using(var release=SodaDesktopSigninInstallSource.Open(source,Owner,hash)){
    File.WriteAllText(Path.Combine(source,"extra"),"generated");Check(!release.Current(),"Source inventory change retained lease");File.Delete(Path.Combine(source,"extra"));Check(!release.Current(),"Invalid source lease revived");
   }
   Console.WriteLine("signin_install_source_generated_reviewed_inventory_pins_copy_and_refusal_passed");
  }finally{Directory.Delete(root,true);}
 }
}
