// Shared bounded pipe completion and owner ACL; no WASAPI endpoint or audio engine.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

// APM owns its wait handle until completion. End* runs exactly once in the
// completion callback, including after cancellation, with no borrowed handle
// disposed by an early-returning caller.
public static class SodaDesktopPipeOperation {
    public static T Wait<T>(Func<AsyncCallback,IAsyncResult> begin,Func<IAsyncResult,T> end,int timeout,Func<bool> allowed,Action cleanup=null){
        if(begin==null||end==null||allowed==null||timeout<1||timeout>2000)throw new ArgumentException("Pipe operation");
        var clock=Stopwatch.StartNew();var result=new TaskCompletionSource<T>();int completed=0,cleaned=0;Action retire=()=>{if(Interlocked.Exchange(ref cleaned,1)==0&&cleanup!=null)cleanup();};
        var task=result.Task;task.ContinueWith(failed=>{failed.Exception.Handle(error=>true);},TaskContinuationOptions.OnlyOnFaulted|TaskContinuationOptions.ExecuteSynchronously);
        try{if(!allowed())throw new OperationCanceledException();begin(value=>{if(Interlocked.Exchange(ref completed,1)!=0)return;try{T item;try{item=end(value);}finally{retire();}result.TrySetResult(item);}catch(Exception error){result.TrySetException(error);}});}catch{retire();throw;}
        while(!task.IsCompleted){if(!allowed())throw new OperationCanceledException();if(clock.ElapsedMilliseconds>=timeout)throw new System.TimeoutException("Pipe operation timeout");task.Wait(10);}
        if(!allowed())throw new OperationCanceledException();if(clock.ElapsedMilliseconds>=timeout)throw new System.TimeoutException("Pipe operation timeout");return task.GetAwaiter().GetResult();
    }
}

public static class SodaDesktopPipeSecurity {
    public static PipeSecurity OwnerSecurity() {
        var security=new PipeSecurity();security.SetAccessRuleProtection(true,false);
        using(var identity=WindowsIdentity.GetCurrent()) {
            security.SetOwner(identity.User);
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid,null),PipeAccessRights.FullControl,AccessControlType.Deny));
            security.AddAccessRule(new PipeAccessRule(identity.User,PipeAccessRights.FullControl,AccessControlType.Allow));
        }
        return security;
    }
}
