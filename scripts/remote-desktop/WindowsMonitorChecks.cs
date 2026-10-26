// Fake topology only. No capture, input, clipboard, mode/DPI changes, or OS query.
using System;
using System.Drawing;

namespace SodaDesktopTests {
public static class MonitorChecks {
    sealed class Driver:SodaDesktopMonitorLayout.IDriver {public SodaDesktopMonitorLayout.Item[] Items;public SodaDesktopMonitorLayout.Item[] Read(){return Items;}}
    static void Need(bool condition,string reason){if(!condition)throw new Exception(reason);}
    static void Reject(Action run,string reason){bool rejected=false;try{run();}catch(InvalidOperationException){rejected=true;}Need(rejected,reason);}
    public static void Run(){
        var left=new SodaDesktopMonitorLayout.Item("left",new Rectangle(-640,-200,640,480),false,125);var right=new SodaDesktopMonitorLayout.Item("right",new Rectangle(0,0,800,600),true,150);
        var driver=new Driver{Items=new[]{left,right}};var layout=new SodaDesktopMonitorLayout(driver,"all");
        Need(layout.Bounds==new Rectangle(-640,-200,1440,800),"Combined negative-coordinate bounds");
        Need(layout.Contains(40.0/1439,100.0/799)&&layout.Contains(1340.0/1439,700.0/799),"Physical monitors map independently of scale");
        Need(!layout.Contains(1140.0/1439,100.0/799)&&!layout.Contains(540.0/1439,700.0/799),"Gaps never receive pointer actions");
        Need(!layout.Contains(Double.NaN,0)&&!layout.Contains(-0.1,0)&&layout.Contains(1,1),"Pointer bounds and edges");
        driver.Items=new[]{right,left};Need(layout.Matches(driver),"Enumeration order is not topology identity");
        driver.Items=new[]{left,new SodaDesktopMonitorLayout.Item("right",right.Bounds,true,200)};Need(!layout.Matches(driver),"Scale change revokes the old topology");
        driver.Items=new[]{left};Need(!layout.Matches(driver),"Removed monitor revokes old topology");
        Reject(()=>new SodaDesktopMonitorLayout(driver,"missing"),"Unknown monitor must not fall back silently");
        driver.Items=new[]{left,left};Reject(()=>new SodaDesktopMonitorLayout(driver,"all"),"Duplicate IDs rejected");
        driver.Items=new[]{new SodaDesktopMonitorLayout.Item("a",new Rectangle(-60000,0,1920,1080),true),new SodaDesktopMonitorLayout.Item("b",new Rectangle(60000,0,1920,1080),false)};
        Need(!new SodaDesktopMonitorLayout(driver,"a").AllSupported,"Large union stays available as individual screens");Reject(()=>new SodaDesktopMonitorLayout(driver,"all"),"Oversized union rejected");
        driver.Items=new[]{new SodaDesktopMonitorLayout.Item("left",new Rectangle(0,0,2,1),true),new SodaDesktopMonitorLayout.Item("right",new Rectangle(3,0,3,1),false)};Need(!new SodaDesktopMonitorLayout(driver,"all").Contains(0.5,0),"Bankers rounding at gap boundary");
        SodaDesktopHost.VerifyQueuedMonitorInput();
        Console.WriteLine("desktop_monitor_checks_passed: fake mixed-scale/negative topology, gaps, selection, reorder, hotplug/scale revoke, limits; no real screen/input/clipboard/OS configuration");
    }
}
}
