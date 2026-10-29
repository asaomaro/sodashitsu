// Filesystem quiescence primitive only. Exclusive barrier does not prove clean
// service exit or Job-zero; controller must separately require exact receipts.
using System;
using System.IO;
using System.Collections.Generic;
using System.Security.AccessControl;
public static class SodaDesktopSigninQuiescence {
    static Exception Failure(){return new InvalidOperationException("Signin quiescence is unavailable");}
    internal static bool Private(byte[] bytes){
        if(!SodaDesktopSigninPackage.CodeAcl(bytes,true))return false;
        try{var descriptor=new RawSecurityDescriptor(bytes,0);foreach(GenericAce raw in descriptor.DiscretionaryAcl){var ace=raw as CommonAce;if(ace==null||ace.IsCallback)return false;if(ace.AceQualifier!=AceQualifier.AccessAllowed)continue;string sid=ace.SecurityIdentifier.Value;if(sid=="S-1-5-18"||sid=="S-1-5-32-544"||sid=="S-1-3-0"&&(ace.AceFlags&AceFlags.InheritOnly)!=0)continue;if(ace.AccessMask!=0)return false;}return true;}catch{return false;}
    }
    static void Marker(FileStream stream){if(stream.ReadByte()!=83||stream.ReadByte()!=-1)throw Failure();}
    public sealed class Lease:IDisposable {
        readonly object gate=new object();List<SodaDesktopSigninPackageNative.Held> held;readonly Func<string,byte[],bool> policy;
        internal Lease(List<SodaDesktopSigninPackageNative.Held> held,Func<string,byte[],bool> policy){this.held=held;this.policy=policy;}
        public bool Current(){lock(gate){if(held==null)return false;try{foreach(var item in held)SodaDesktopSigninPackageNative.CheckCore(item,bytes=>policy(item.Path,bytes));return held!=null;}catch{return false;}}}
        public string Fingerprint{get{lock(gate){if(!Current())throw Failure();return held[held.Count-1].Before.Fingerprint();}}}
        public void Dispose(){lock(gate){var items=held;held=null;if(items!=null)SodaDesktopSigninPackageNative.Release(items);}}
    }
    public sealed class Pin:IDisposable {
        readonly object gate=new object();List<SodaDesktopSigninPackageNative.Held> directories;SodaDesktopSigninPackageNative.Held file;readonly string path;readonly Func<string,byte[],bool> policy;bool used;
        internal Pin(string path,List<SodaDesktopSigninPackageNative.Held> directories,SodaDesktopSigninPackageNative.Held file,Func<string,byte[],bool> policy){this.path=path;this.directories=directories;this.file=file;this.policy=policy;}
        public bool Current(){lock(gate){try{if(used||directories==null||file==null)return false;foreach(var item in directories)SodaDesktopSigninPackageNative.CheckCore(item,bytes=>policy(item.Path,bytes));SodaDesktopSigninPackageNative.CheckCore(file,bytes=>policy(path,bytes));return !used&&directories!=null&&file!=null;}catch{return false;}}}
        public string Fingerprint{get{lock(gate){if(!Current())throw Failure();return file.Before.Fingerprint();}}}
        public Lease Exclusive(){return ExclusiveCore(null);}
        internal Lease ExclusiveCore(Action afterPinClosed){lock(gate){
            if(used||directories==null||file==null)throw Failure();used=true;SodaDesktopSigninPackageNative.Held exclusive=null;
            try{
                foreach(var item in directories)SodaDesktopSigninPackageNative.CheckCore(item,bytes=>policy(item.Path,bytes));SodaDesktopSigninPackageNative.CheckCore(file,bytes=>policy(path,bytes));var before=file.Before;file.Dispose();file=null;
                if(afterPinClosed!=null)afterPinClosed();if(directories==null)throw Failure();exclusive=SodaDesktopSigninPackageNative.OpenExclusiveCore(path,bytes=>policy(path,bytes),Marker);
                if(!before.Same(exclusive.Before,false,1))throw Failure();foreach(var item in directories)SodaDesktopSigninPackageNative.CheckCore(item,bytes=>policy(item.Path,bytes));
                directories.Add(exclusive);exclusive=null;var result=new Lease(directories,policy);directories=null;if(!result.Current()){result.Dispose();throw Failure();}return result;
            }catch{if(exclusive!=null)exclusive.Dispose();Dispose();throw;}
        }}
        public void Dispose(){lock(gate){if(file!=null){file.Dispose();file=null;}var items=directories;directories=null;if(items!=null)SodaDesktopSigninPackageNative.Release(items);}}
    }
    internal static Pin OpenCore(string path,IEnumerable<string> ancestors,Func<string,byte[],bool> policy){
        var held=new List<SodaDesktopSigninPackageNative.Held>();SodaDesktopSigninPackageNative.Held file=null;bool transferred=false;
        try{foreach(string directory in ancestors){if(held.Count>=64)throw Failure();held.Add(SodaDesktopSigninPackageNative.OpenCore(directory,true,true,0,bytes=>policy(directory,bytes),null));}file=SodaDesktopSigninPackageNative.OpenCore(path,false,true,1,bytes=>policy(path,bytes),Marker);var pin=new Pin(path,held,file,policy);transferred=true;return pin;}finally{if(!transferred){if(file!=null)file.Dispose();SodaDesktopSigninPackageNative.Release(held);}}
    }
    /** Pin before the controller stops a verified exact service instance. Never
     * deletes/replaces/creates the barrier or repairs an unsafe path or ACL. */
    public static Pin Open(string owner){
        string slot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),"sodashitsu","desktop-signin",SodaDesktopSigninPackage.Slot(owner)),path=Path.Combine(slot,"quiescence.lock");
        if(path.Length>512||path.Length<3||path[1]!=':'||path[2]!='\\')throw Failure();var drive=new DriveInfo(Path.GetPathRoot(path));if(drive.DriveType!=DriveType.Fixed||!String.Equals(drive.DriveFormat,"NTFS",StringComparison.OrdinalIgnoreCase))throw Failure();
        var directories=new List<string>();for(string current=slot;!String.IsNullOrEmpty(current);current=Path.GetDirectoryName(current)){if(directories.Count>=64)throw Failure();directories.Add(current);}directories.Reverse();
        return OpenCore(path,directories,(item,bytes)=>String.Equals(item,slot,StringComparison.OrdinalIgnoreCase)||String.Equals(item,path,StringComparison.OrdinalIgnoreCase)?Private(bytes):SodaDesktopSigninPackage.CodeAcl(bytes,false));
    }
}
