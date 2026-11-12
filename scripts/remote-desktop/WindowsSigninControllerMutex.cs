// Standard owner-bound Windows mutex for explicit local administrative tools.
using System;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
public static class SodaDesktopSigninControllerMutex {
    public sealed class Lease:IDisposable {
        Mutex mutex;
        internal Lease(Mutex mutex){this.mutex=mutex;}
        public bool Current(){return mutex!=null;}
        public void Dispose(){var owned=mutex;mutex=null;if(owned!=null)try{owned.ReleaseMutex();}finally{owned.Dispose();}}
    }
    public static Lease Acquire(string owner,int timeoutMilliseconds){
        var security=new MutexSecurity();security.SetOwner(new SecurityIdentifier("S-1-5-32-544"));security.SetAccessRuleProtection(true,false);
        foreach(string sid in new[]{"S-1-5-18","S-1-5-32-544"})security.AddAccessRule(new MutexAccessRule(new SecurityIdentifier(sid),MutexRights.FullControl,AccessControlType.Allow));
        bool created;var mutex=new Mutex(false,"Global\\SodaDesktopSigninAdmin-"+SodaDesktopSigninPackage.Slot(owner),out created,security);bool acquired=false;
        try{
            try{acquired=mutex.WaitOne(timeoutMilliseconds);}catch(AbandonedMutexException){acquired=true;}
            if(!acquired)throw new InvalidOperationException("Signin administration is busy");return new Lease(mutex);
        }finally{if(!acquired)mutex.Dispose();}
    }
}
