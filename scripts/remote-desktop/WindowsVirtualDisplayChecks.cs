// Fake device/owner/clock only. No native API, screen, driver install, or display changes.
using System;
public static class SodaDesktopVirtualDisplayChecks {
    sealed class Device:SodaDesktopVirtualDisplay.IDevice {
        public string InstanceId {get{return "SWD\\SodaVirtualDisplay\\test";}}
        public bool Started {get;set;}
        public int Closed;
        public bool Active,BadAdapter,BadContainer;public Action OnProbe;
        public string Name="\\\\.\\DISPLAY2";
        public SodaDesktopVirtualDisplay.Target ActiveTarget(Guid container){if(OnProbe!=null)OnProbe();return !Active?null:new SodaDesktopVirtualDisplay.Target(InstanceId,BadAdapter?"other-device":InstanceId,Name,"owned-monitor",BadContainer?Guid.NewGuid():container);}
        public void Dispose(){Closed++;}
    }
    sealed class Backend:SodaDesktopVirtualDisplay.IBackend,IDisposable {
        public Action<SodaDesktopVirtualDisplay.IDevice> Complete;public Action<Exception> Failed;public int Closed;public Device Inline;
        public IDisposable Begin(Guid id,Action<SodaDesktopVirtualDisplay.IDevice> complete,Action<Exception> failed){Complete=complete;Failed=failed;if(Inline!=null)Complete(Inline);return this;}
        public void Dispose(){Closed++;}
    }
    static void Need(bool value,string reason){if(!value)throw new Exception(reason);}
    static void Reject(Action run,string reason){try{run();}catch(InvalidOperationException){return;}catch(TimeoutException){return;}throw new Exception(reason);}
    public static void Run(){
        long now=0;bool live=true;var b=new Backend();var d=new Device();var lease=new SodaDesktopVirtualDisplay(b,()=>live,()=>now);
        Need(lease.Poll()==null,"Creation pending");b.Complete(d);Need(lease.Poll()==null,"Callback is not device started");d.Started=true;Need(lease.Poll()==null,"Started is not active target");d.Active=true;Need(lease.Poll().DeviceName==d.Name,"Owned monitor target");
        live=false;Reject(()=>lease.Poll(),"Owner exit must revoke");Need(d.Closed==1&&b.Closed==1,"Owner exit releases exactly owned device");lease.Dispose();Need(d.Closed==1,"Dispose is idempotent");
        b=new Backend();lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);lease.Dispose();d=new Device();b.Complete(d);Need(d.Closed==1,"Late callback after cancellation reaped");
        b=new Backend();lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);now=10001;Reject(()=>lease.Poll(),"Creation timeout");d=new Device();b.Complete(d);Need(d.Closed==1,"Late callback after timeout reaped");
        now=0;d=new Device{Started=true,Active=true,BadAdapter=true};b=new Backend{Inline=d};lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);Reject(()=>lease.Poll(),"Other app adapter rejected");Need(d.Closed==1,"Wrong adapter rolls back own handle");
        d=new Device{Started=true,Active=true,BadContainer=true};b=new Backend{Inline=d};lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);Reject(()=>lease.Poll(),"Other lease container rejected");
        d=new Device{Started=true,Active=true};b=new Backend{Inline=d};lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);Need(lease.Poll()!=null,"Inline callback owned");d.Name="\\\\.\\DISPLAY3";Reject(()=>lease.Poll(),"Changed topology revokes old capture");Need(d.Closed==1&&b.Closed==1,"Changed topology cleanup");
        b=new Backend();lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);b.Failed(new Exception("Generated driver failure"));Reject(()=>lease.Poll(),"Failed create rejected");d=new Device();b.Complete(d);Need(d.Closed==1,"Post-failure callback reaped");
        now=0;d=new Device{Started=true,Active=true};b=new Backend{Inline=d};lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);now=10001;Reject(()=>lease.Poll(),"Late initial active target must expire");Need(d.Closed==1,"Late ready rolls back");
        now=0;d=new Device{Started=true,Active=true,OnProbe=()=>now=10001};b=new Backend{Inline=d};lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);Reject(()=>lease.Poll(),"Slow initial probe cannot bypass deadline");
        now=0;d=new Device{Started=true,Active=true};b=new Backend{Inline=d};lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);Need(lease.Poll()!=null,"Ready before deadline");now=10001;Need(lease.Poll()!=null,"Established lease survives creation deadline");lease.Dispose();
        now=0;d=new Device{Started=true,Active=true};b=new Backend{Inline=d};lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);Need(lease.Poll()!=null,"Ready before disappearance");d.Active=false;Reject(()=>lease.Poll(),"Ready monitor disappearance must revoke immediately");Need(d.Closed==1,"Disappeared monitor cleanup");
        d=new Device{Started=true,Active=true};b=new Backend{Inline=d};lease=new SodaDesktopVirtualDisplay(b,()=>true,()=>now);Need(lease.Poll()!=null,"Ready before device stop");d.Started=false;Reject(()=>lease.Poll(),"Ready device stop must revoke immediately");
        Console.WriteLine("virtual_display_lease_checks_passed: fake owner exit, cancel/late callback, timeouts, inline completion, started/active separation, exact adapter/container identity, topology change; no native API or OS changes");
    }
}
