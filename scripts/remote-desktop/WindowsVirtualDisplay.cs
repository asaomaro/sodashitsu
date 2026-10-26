// Temporary, owner-bound virtual display leases. No driver installation or elevation.
using System;
using System.Threading;

public sealed class SodaDesktopVirtualDisplay : IDisposable {
    public sealed class Target {
        public readonly string InstanceId, AdapterInstanceId, DeviceName, MonitorPath;
        public readonly Guid ContainerId;
        public Target(string instance,string adapter,string device,string monitor,Guid container){InstanceId=instance;AdapterInstanceId=adapter;DeviceName=device;MonitorPath=monitor;ContainerId=container;}
    }
    public interface IDevice : IDisposable {
        string InstanceId {get;}
        bool Started {get;}
        Target ActiveTarget(Guid container);
    }
    public interface IBackend {
        // The implementation fixes hardware ID/parent/driver. A remote request supplies no device path.
        IDisposable Begin(Guid container,Action<IDevice> complete,Action<Exception> failed);
    }
    readonly object gate=new object();
    readonly Func<bool> ownerLive;
    readonly Func<long> clock;
    readonly long deadline;
    readonly Guid container=Guid.NewGuid();
    IDisposable operation;
    IDevice device;
    Target target;
    bool ended;
    Exception failure;
    public Guid ContainerId {get{return container;}}
    public SodaDesktopVirtualDisplay(IBackend backend,Func<bool> authenticatedOwnerLive,Func<long> monotonicClock,int timeoutMs=10000){
        if(backend==null||authenticatedOwnerLive==null||monotonicClock==null||timeoutMs<1||timeoutMs>15000)throw new ArgumentException();
        ownerLive=authenticatedOwnerLive;clock=monotonicClock;deadline=clock()+timeoutMs;
        try {
            if(!ownerLive())throw new InvalidOperationException("Virtual display owner unavailable");
            var pending=backend.Begin(container,Complete,Failed);
            bool close;lock(gate){close=ended;if(!close)operation=pending;}
            if(close&&pending!=null)pending.Dispose();
        }catch{Dispose();throw;}
    }
    void Complete(IDevice created){
        bool close=false;
        lock(gate){
            if(created==null){failure=new InvalidOperationException("Virtual display device missing");return;}
            if(ReferenceEquals(device,created))return;
            if(ended||device!=null||failure!=null||clock()>=deadline||!ownerLive())close=true;
            else device=created;
        }
        // Native callbacks can arrive after cancellation. They never resurrect a lease.
        if(close)created.Dispose();
    }
    void Failed(Exception error){lock(gate){if(!ended)failure=error??new InvalidOperationException("Virtual display creation failed");}}
    public Target Poll(){
        IDevice current;bool established;lock(gate){if(ended)throw new ObjectDisposedException("VirtualDisplay");current=device;established=target!=null;}
        try {
            if(!ownerLive())throw new InvalidOperationException("Virtual display owner expired");
            lock(gate){if(target==null&&clock()>=deadline)throw new TimeoutException("Virtual display creation deadline");}
            lock(gate){if(failure!=null)throw new InvalidOperationException("Virtual display creation failed",failure);}
            if(current==null||!current.Started){if(established)throw new InvalidOperationException("Virtual display device stopped");if(clock()>=deadline)throw new TimeoutException("Virtual display did not start");return null;}
            var found=current.ActiveTarget(container);
            if(found==null){if(established)throw new InvalidOperationException("Virtual monitor disappeared");if(clock()>=deadline)throw new TimeoutException("Virtual monitor not active");return null;}
            if(String.IsNullOrEmpty(current.InstanceId)||!String.Equals(found.InstanceId,current.InstanceId,StringComparison.OrdinalIgnoreCase)||
               !String.Equals(found.AdapterInstanceId,current.InstanceId,StringComparison.OrdinalIgnoreCase)||found.ContainerId!=container||
               String.IsNullOrEmpty(found.MonitorPath)||String.IsNullOrEmpty(found.DeviceName))throw new InvalidOperationException("Virtual display target identity mismatch");
            lock(gate){if(ended||!ReferenceEquals(device,current)||!ownerLive())throw new InvalidOperationException("Virtual display lease expired");
                if(target!=null&&(!String.Equals(target.MonitorPath,found.MonitorPath,StringComparison.OrdinalIgnoreCase)||!String.Equals(target.DeviceName,found.DeviceName,StringComparison.OrdinalIgnoreCase)))throw new InvalidOperationException("Virtual display target changed");
                if(target==null&&clock()>=deadline)throw new TimeoutException("Virtual display creation deadline");
                target=found;return found;}
        }catch{Dispose();throw;}
    }
    public void Dispose(){
        IDisposable pending;IDevice owned;
        lock(gate){if(ended)return;ended=true;pending=operation;operation=null;owned=device;device=null;target=null;}
        try{if(pending!=null)pending.Dispose();}finally{if(owned!=null)owned.Dispose();}
    }
}
