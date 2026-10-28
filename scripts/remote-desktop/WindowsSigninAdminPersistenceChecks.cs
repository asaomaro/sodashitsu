using System;
using System.IO;
using System.Text;
public static class SodaDesktopSigninAdminPersistenceChecks {
 static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 static void Denied(Action run,string message){bool failed=false;try{run();}catch(InvalidOperationException){failed=true;}Check(failed,message);}
 static string DirectoryFor(string root){string path=Path.Combine(root,Guid.NewGuid().ToString("N"));Directory.CreateDirectory(path);return path;}
 static string Stage(string root,string name=".write-Ab12Cd",string file="identity.json"){string path=Path.Combine(root,"desktop-endpoint",name);Directory.CreateDirectory(path);string source=Path.Combine(path,file);File.WriteAllText(source,"generated opaque ciphertext only");return source;}
 static string Target(string root){return Path.Combine(root,"desktop-endpoint","identity.json");}
 static void Commit(string root,string source,string target,string kind,Func<bool> current){SodaDesktopSigninAdminPersistence.CommitVaultCore(root,source,target,kind,current,path=>true,file=>true);}
 public static void Run(){
  string root=Path.Combine(Path.GetTempPath(),"soda-admin-persist-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
  try{
   string runtime=DirectoryFor(root),source=Stage(runtime),target=Target(runtime);Commit(runtime,source,target,"initialize",()=>true);Check(File.ReadAllText(target)=="generated opaque ciphertext only"&&!File.Exists(source),"Explicit identity initialization did not commit");
   source=Stage(runtime);File.WriteAllText(source,"generated next ciphertext");Commit(runtime,source,target,"trust",()=>true);Check(File.ReadAllText(target)=="generated next ciphertext","Existing identity update did not commit");
   foreach(string kind in new[]{"status","enroll","disable","exec"}){source=Stage(runtime);string value=source;Denied(()=>Commit(runtime,value,target,kind,()=>true),"Native commit accepted unrelated request kind");File.Delete(source);}
   source=Stage(runtime,".policy-Ab12Cd","required.json");string marker=Path.Combine(runtime,"desktop-endpoint-required.json"),markerSource=source;File.WriteAllText(marker,"existing generated marker");Denied(()=>Commit(runtime,markerSource,marker,"trust",()=>true),"Trust request changed required marker");Commit(runtime,source,marker,"initialize",()=>true);Check(File.Exists(marker),"Initialization marker did not commit");
   string fresh=DirectoryFor(root),missingSource=Stage(fresh);Denied(()=>Commit(fresh,missingSource,Target(fresh),"trust",()=>true),"Trust request recreated missing identity");
   string denied=DirectoryFor(root),deniedSource=Stage(denied);Denied(()=>Commit(denied,deniedSource,Target(denied),"initialize",()=>false),"Expired request persisted identity");Check(File.Exists(deniedSource)&&!File.Exists(Target(denied)),"Denied commit changed source or target");
   string outside=Path.Combine(root,"outside.json"),pathSource=Stage(denied);Denied(()=>Commit(denied,pathSource,outside,"initialize",()=>true),"Native commit escaped fixed destinations");Check(!File.Exists(outside),"Unexpected external target created");
   string unsafeRoot=DirectoryFor(root),unsafeSource=Stage(unsafeRoot);Denied(()=>SodaDesktopSigninAdminPersistence.CommitVaultCore(unsafeRoot,unsafeSource,Target(unsafeRoot),"initialize",()=>true,path=>false,file=>true),"Unsafe directory policy accepted");
   string unsafeFileRoot=DirectoryFor(root),unsafeFileSource=Stage(unsafeFileRoot);Denied(()=>SodaDesktopSigninAdminPersistence.CommitVaultCore(unsafeFileRoot,unsafeFileSource,Target(unsafeFileRoot),"initialize",()=>true,path=>true,file=>false),"Unsafe file policy accepted");Check(!File.Exists(Target(unsafeFileRoot)),"Unsafe file policy changed target");
   string late=DirectoryFor(root),lateSource=Stage(late);bool live=true;Denied(()=>SodaDesktopSigninAdminPersistence.CommitVaultCore(late,lateSource,Target(late),"initialize",()=>live,path=>true,file=>{live=false;return true;}),"Late expiration was not rejected");Check(!File.Exists(Target(late)),"Expired request changed target");
   string inspected=DirectoryFor(root),inspectedSource=Stage(inspected);bool metadataActive=true;Denied(()=>SodaDesktopSigninAdminPersistence.CommitVaultCore(inspected,inspectedSource,Target(inspected),"initialize",()=>metadataActive,path=>true,file=>true,()=>{metadataActive=false;}),"Metadata completion did not recheck deadline");Check(!File.Exists(Target(inspected)),"Late metadata completion committed expired request");
   Console.WriteLine("signin_admin_generated_fixed_commit_scope_and_persistence_passed");
  }finally{Directory.Delete(root,true);}
 }
}
