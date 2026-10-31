// Generated data/ACL/facts only. Never opens a real package, key or desktop.
using System;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.IO;
using System.Collections.Generic;

public static class SodaDesktopSigninPackageChecks {
    const string Owner="S-1-5-21-1-2-3-1001",Other="S-1-5-21-1-2-3-1002",Revision="11111111-1111-4111-8111-111111111111";
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Reject(Action action){try{action();}catch(Exception error){Check(error.Message=="Signin package is unavailable"&&error.InnerException==null,"Private package diagnostic escaped");return;}throw new InvalidOperationException("Unsafe package data accepted");}
    static SodaDesktopSigninPackage.Entry[] Entries(){var paths=SodaDesktopSigninPackage.RequiredPaths();var entries=new SodaDesktopSigninPackage.Entry[paths.Length];for(int i=0;i<paths.Length;i++)entries[i]=new SodaDesktopSigninPackage.Entry(paths[i],new string('a',64),10);return entries;}
    static byte[] Acl(string sddl){var raw=new RawSecurityDescriptor(sddl);var bytes=new byte[raw.BinaryLength];raw.GetBinaryForm(bytes,0);return bytes;}
    static SodaDesktopSigninPackageNative.Info Info(){return new SodaDesktopSigninPackageNative.Info{Attributes=128,Volume=1,SizeLow=100,Links=1,IndexLow=42,WriteLow=12};}
    public static void Run(){
        Check(!SodaDesktopSigninVault.SystemPrimary(),"Generated native checks require an ordinary account");
        SodaDesktopSigninPackageNative.VerifyLayouts();
        var entries=Entries();var package=new SodaDesktopSigninPackage(Owner,Revision,entries);string wire=package.Encode();
        Check(SodaDesktopSigninPackage.Decode(wire,Owner).Encode()==wire,"Generated package round trip failed");
        entries[0]=null;var clone=package.Entries();clone[0]=null;var paths=SodaDesktopSigninPackage.RequiredPaths();paths[0]="../untrusted";
        Check(package.Encode()==wire&&SodaDesktopSigninPackage.RequiredPaths()[0]=="DesktopSigninNative.exe","Package metadata was mutable");
        Reject(()=>SodaDesktopSigninPackage.Decode(wire,Other));
        Reject(()=>SodaDesktopSigninPackage.Decode(wire+" ",Owner));
        Reject(()=>SodaDesktopSigninPackage.Decode(wire.Replace("\"version\":1","\"unknown\":true,\"version\":1"),Owner));
        Reject(()=>SodaDesktopSigninPackage.Decode(wire.Replace("\"version\":1","\"version\":1,\"version\":1"),Owner));
        Reject(()=>SodaDesktopSigninPackage.Decode(new string(' ',32769),Owner));
        foreach(string owner in new[]{"S-1-5-18","S-1-5-19","S-1-5-20","private-invalid-owner"})Reject(()=>new SodaDesktopSigninPackage(owner,Revision,Entries()));
        Reject(()=>new SodaDesktopSigninPackage(Owner,Guid.Empty.ToString("D"),Entries()));
        foreach(string path in new[]{"../node.exe","node.exe:alternate","plugin.js","NODE.EXE"}){var changed=Entries();changed[0]=new SodaDesktopSigninPackage.Entry(path,new string('a',64),10);Reject(()=>new SodaDesktopSigninPackage(Owner,Revision,changed));}
        foreach(long size in new long[]{0,65537}){var changed=Entries();changed[2]=new SodaDesktopSigninPackage.Entry("bootstrap.mjs",new string('a',64),size);Reject(()=>new SodaDesktopSigninPackage(Owner,Revision,changed));}
        var badHash=Entries();badHash[0]=new SodaDesktopSigninPackage.Entry(badHash[0].Path,new string('G',64),10);Reject(()=>new SodaDesktopSigninPackage(Owner,Revision,badHash));
        var tooLarge=Entries();for(int i=0;i<tooLarge.Length;i++)tooLarge[i]=new SodaDesktopSigninPackage.Entry(tooLarge[i].Path,new string('a',64),SodaDesktopSigninPackage.MaximumBytes(tooLarge[i].Path));Reject(()=>new SodaDesktopSigninPackage(Owner,Revision,tooLarge));
        var read=Acl("O:SYG:SYD:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;WD)");
        Check(SodaDesktopSigninPackage.CodeAcl(read,true)&&SodaDesktopSigninPackage.CodeAcl(read,false),"Read-only code ACL rejected");
        Check(SodaDesktopSigninPackage.CodeAcl(Acl("O:SYG:SYD:"),true),"Empty deny-all DACL rejected");
        Check(!SodaDesktopSigninPackage.CodeAcl(Acl("O:SYG:SY"),true),"Missing DACL accepted");
        Check(!SodaDesktopSigninPackage.CodeAcl(Acl("O:"+Owner+"G:SYD:P(A;;FA;;;SY)"),true),"Foreign code owner accepted");
        foreach(string mask in new[]{"0x2","0x4","0x10","0x40","0x100","0x10000","0x40000","0x80000","0x10000000","0x40000000","0x2000000"})Check(!SodaDesktopSigninPackage.CodeAcl(Acl("O:SYG:SYD:P(A;;FA;;;SY)(A;;"+mask+";;;WD)"),true),"Foreign code write accepted");
        foreach(string mask in new[]{"0x10","0x40","0x100","0x10000","0x40000","0x80000","0x10000000","0x40000000"})Check(!SodaDesktopSigninPackage.CodeAcl(Acl("O:SYG:SYD:P(A;;FA;;;SY)(A;;"+mask+";;;WD)"),false),"Ancestor replacement or attributes accepted");
        Check(SodaDesktopSigninPackage.CodeAcl(Acl("O:SYG:SYD:P(A;;FA;;;SY)(A;;0x6;;;WD)"),false),"Ancestor create-only rights rejected");
        var raw=new RawSecurityDescriptor("O:SYG:SYD:");raw.DiscretionaryAcl=new RawAcl(4,1);var callback=new CommonAce(AceFlags.None,AceQualifier.AccessAllowed,1,new SecurityIdentifier("S-1-1-0"),true,new byte[4]);raw.DiscretionaryAcl.InsertAce(0,callback);var binary=new byte[raw.BinaryLength];raw.GetBinaryForm(binary,0);Check(!SodaDesktopSigninPackage.CodeAcl(binary,true),"Callback ACL accepted");
        var info=Info();var good=new SodaDesktopSigninPackageNative.Snapshot(info,1);Check(good.Regular(false,100)&&good.Same(new SodaDesktopSigninPackageNative.Snapshot(info,1),false,100),"Normal package facts rejected");
        foreach(int variant in new[]{0,1,2,3,4}){var bad=info;if(variant==0)bad.Links=2;if(variant==1)bad.Attributes|=1024;if(variant==2)bad.SizeLow=101;if(variant==3)bad.SizeLow=0;if(variant==4)bad.Attributes|=16;Check(!new SodaDesktopSigninPackageNative.Snapshot(bad,1).Regular(false,100),"Unsafe package file facts accepted");}
        Check(!new SodaDesktopSigninPackageNative.Snapshot(info,3).Regular(false,100),"Non-disk package accepted");
        foreach(int variant in new[]{0,1,2,3}){var changed=info;if(variant==0)changed.Volume++;if(variant==1)changed.IndexLow++;if(variant==2)changed.WriteLow++;if(variant==3)changed.SizeLow--;Check(!good.Same(new SodaDesktopSigninPackageNative.Snapshot(changed,1),false,100),"Changed package file accepted");}
        info.Attributes=16;info.SizeLow=0;var directory=new SodaDesktopSigninPackageNative.Snapshot(info,1);var changedDir=info;changedDir.WriteLow++;Check(directory.Same(new SodaDesktopSigninPackageNative.Snapshot(changedDir,1),true,0),"Ancestor unrelated write-time change rejected");
        NativeFixtures();
        Console.WriteLine("signin_package_generated_manifest_acl_and_facts_passed");
    }
    static void Exclusive(string path){try{using(var file=File.Open(path,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){}}catch{throw new InvalidOperationException("Native failure leaked a handle");}}
    static void NativeFixtures(){
        string parent=Environment.GetEnvironmentVariable("SODA_SIGNIN_PACKAGE_TEST_ROOT");
        if(String.IsNullOrEmpty(parent)||!Path.IsPathRooted(parent))throw new InvalidOperationException("Generated fixture parent required");
        string root=Path.Combine(parent,"native-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);bool failed=true;
        try {
            string path=Path.Combine(root,"generated.txt"),other=Path.Combine(root,"other.txt");File.WriteAllBytes(path,Encoding.ASCII.GetBytes("generated"));File.WriteAllBytes(other,Encoding.ASCII.GetBytes("generated other"));
            string user;using(var identity=WindowsIdentity.GetCurrent())user=identity.User.Value;
            int reads=0;Func<byte[],bool> ordinary=descriptor=>{reads++;var raw=new RawSecurityDescriptor(descriptor,0);return raw.Owner!=null&&(raw.Owner.Value==user||raw.Owner.Value=="S-1-5-32-544")&&raw.DiscretionaryAcl!=null;};
            var held=SodaDesktopSigninPackageNative.OpenCore(path,false,true,1000,ordinary,null);bool renamed=false;
            try {
                Check(held.Before.Regular(false,1000)&&held.Stream.ReadByte()=='g'&&reads==1,"Native file/SD/stream transfer failed");
                bool write=false;try{using(var stream=File.Open(path,FileMode.Open,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete)){write=true;}}catch(IOException){}
                Check(!write,"Package write share unexpectedly allowed");
                try{File.Move(path,path+".moved");renamed=true;}catch(IOException){}
                Check(!renamed,"Package delete share unexpectedly allowed");
            } finally {held.Dispose();if(renamed)File.Move(path+".moved",path);}
            Check(held.Handle.IsClosed,"FileStream did not close its native handle");Exclusive(path);
            Reject(()=>SodaDesktopSigninPackageNative.OpenCore(path,false,true,1000,descriptor=>false,null));Exclusive(path);
            bool after=false;
            try {SodaDesktopSigninPackageNative.OpenCore(path,false,true,1000,ordinary,stream=>{after=true;throw new InvalidOperationException("generated stream failure");});throw new InvalidOperationException("Generated failure not injected");}
            catch(InvalidOperationException error){Check(error.Message=="generated stream failure"&&after,"Post-stream failure was not exercised");}
            Exclusive(path);
            using(var directory=SodaDesktopSigninPackageNative.OpenCore(root,true,true,0,ordinary,null))Check(directory.Before.Regular(true,0),"Native directory facts rejected");
            var group=new List<SodaDesktopSigninPackageNative.Held>();
            try {group.Add(SodaDesktopSigninPackageNative.OpenCore(path,false,true,1000,ordinary,null));group.Add(SodaDesktopSigninPackageNative.OpenCore(other,false,true,1000,ordinary,null));throw new InvalidOperationException("generated partial group");}
            catch(InvalidOperationException error){Check(error.Message=="generated partial group","Partial acquisition not exercised");}
            finally {SodaDesktopSigninPackageNative.Release(group);}
            Exclusive(path);Exclusive(other);Check(group.Count==0,"Native acquisition group not released");
            Check(File.ReadAllText(path)=="generated"&&File.ReadAllText(other)=="generated other","Generated fixture contents changed");
            failed=false;Console.WriteLine("signin_package_generated_native_handles_and_cleanup_passed");
        } finally {try{Directory.Delete(root,true);}catch{if(!failed)throw;}}
    }
    public static void CrossManifest(string text){Check(SodaDesktopSigninPackage.Decode(text,Owner).Encode()==text,"Node/CSharp package manifest mismatch");Console.WriteLine("signin_package_cross_runtime_manifest_passed");}
}
