// Serialize the active OLE copy operation with the existing per-user OS mutex.
// The parent independently retains its child process until actual close.
using System;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;

namespace Sodashitsu.NativeDrag {
    internal sealed class NativeDragSlot:IDisposable {
        Mutex mutex;
        NativeDragSlot(Mutex mutex){this.mutex=mutex;}
        internal static NativeDragSlot Acquire(){
            using(var identity=WindowsIdentity.GetCurrent()){
                if(identity.User==null)throw new InvalidOperationException("Native drag user unavailable");
                var policy=new MutexSecurity();policy.SetOwner(identity.User);policy.SetAccessRuleProtection(true,false);
                policy.AddAccessRule(new MutexAccessRule(identity.User,MutexRights.FullControl,AccessControlType.Allow));
                bool created;var mutex=new Mutex(false,"Global\\Sodashitsu.NativeDrag."+identity.User.Value,out created,policy);
                try{
                    bool owned;try{owned=mutex.WaitOne(0);}catch(AbandonedMutexException){owned=true;}
                    if(!owned)throw new InvalidOperationException("Another native drag is active");
                    return new NativeDragSlot(mutex);
                }catch{mutex.Dispose();throw;}
            }
        }
        public void Dispose(){var owned=mutex;mutex=null;if(owned==null)return;try{owned.ReleaseMutex();}finally{owned.Dispose();}}
    }
}
