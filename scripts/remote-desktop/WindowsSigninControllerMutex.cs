// Owner-bound local controller serialization. Never grants service/quiescence
// authority; installer/controller must independently validate every other gate.
using System;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
public static class SodaDesktopSigninControllerMutex {
    static Exception Failure(){return new InvalidOperationException("Signin controller lock is unavailable");}
    internal static bool Policy(byte[] bytes){
        try{
            var descriptor=new RawSecurityDescriptor(bytes,0);if(descriptor.Owner==null||descriptor.Owner.Value!="S-1-5-18"&&descriptor.Owner.Value!="S-1-5-32-544"||descriptor.DiscretionaryAcl==null||(descriptor.ControlFlags&ControlFlags.DiscretionaryAclPresent)==0)return false;bool system=false,admins=false;
            foreach(GenericAce raw in descriptor.DiscretionaryAcl){var ace=raw as CommonAce;if(ace==null||ace.IsCallback||ace.AceQualifier!=AceQualifier.AccessAllowed||(ace.AceFlags&AceFlags.InheritOnly)!=0)return false;string sid=ace.SecurityIdentifier.Value;uint mask=unchecked((uint)ace.AccessMask);if(sid!="S-1-5-18"&&sid!="S-1-5-32-544"){if(mask!=0)return false;continue;}bool full=(mask&0x10000000)!=0||(mask&0x001f0001)==0x001f0001;if(sid=="S-1-5-18")system|=full;else admins|=full;}
            return system&&admins;
        }catch{return false;}
    }
    static MutexSecurity PrivateSecurity(){var security=new MutexSecurity();security.SetOwner(new SecurityIdentifier("S-1-5-32-544"));security.SetAccessRuleProtection(true,false);foreach(string sid in new[]{"S-1-5-18","S-1-5-32-544"})security.AddAccessRule(new MutexAccessRule(new SecurityIdentifier(sid),MutexRights.FullControl,AccessControlType.Allow));return security;}
    public sealed class Lease:IDisposable {
        Mutex mutex;readonly int thread;
        internal Lease(Mutex mutex){this.mutex=mutex;thread=Thread.CurrentThread.ManagedThreadId;}
        public bool Current(){if(mutex==null||thread!=Thread.CurrentThread.ManagedThreadId)return false;try{return Policy(mutex.GetAccessControl().GetSecurityDescriptorBinaryForm());}catch{return false;}}
        public void Dispose(){if(mutex==null)return;if(thread!=Thread.CurrentThread.ManagedThreadId)throw Failure();Mutex owned=mutex;mutex=null;try{owned.ReleaseMutex();}finally{owned.Dispose();}}
    }
    /** Explicit elevated installer/controller only. Existing namespace objects
     * are inspected and never repaired, adopted, or taken over after abandon. */
    public static Lease Acquire(string owner,int timeoutMilliseconds){return AcquireCore("Global\\SodaDesktopSigninAdmin-"+SodaDesktopSigninPackage.Slot(owner),timeoutMilliseconds);}
    internal static Lease AcquireJournal(string owner,int timeoutMilliseconds){return AcquireCore("Global\\SodaDesktopSigninJournal-"+SodaDesktopSigninPackage.Slot(owner),timeoutMilliseconds);}
    static Lease AcquireCore(string name,int timeoutMilliseconds){
        if(timeoutMilliseconds<1||timeoutMilliseconds>30000)throw Failure();Mutex mutex=null;bool owned=false,transferred=false;
        try{
            bool created;mutex=new Mutex(false,name,out created,PrivateSecurity());if(!Policy(mutex.GetAccessControl().GetSecurityDescriptorBinaryForm()))throw Failure();
            try{owned=mutex.WaitOne(timeoutMilliseconds);}catch(AbandonedMutexException){owned=true;throw Failure();}
            if(!owned||!Policy(mutex.GetAccessControl().GetSecurityDescriptorBinaryForm()))throw Failure();var lease=new Lease(mutex);transferred=true;return lease;
        }finally{if(!transferred&&mutex!=null){try{if(owned)mutex.ReleaseMutex();}finally{mutex.Dispose();}}}
    }
}
