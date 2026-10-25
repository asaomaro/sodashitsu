// Pure scheduler checks. No desktop capture, service, input or OS display changes.
using System;
namespace SodaDesktopTests {
    public static class FramePreparationChecks {
        static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        static int Frames(bool overlap) {
            var queue=new SodaDesktopFramePreparation<string>(overlap);long now=0,pending=0,ack=0;int count=0;
            while(now<5000) {
                if(pending!=0&&now>=ack)pending=0;
                if(queue.CanPrepare(now,pending)){long started=now;now+=65;queue.Set("frame",started,now,30);}
                if(queue.Take(pending,now,30)!=null){pending=++count;ack=now+100;}
                now++;
            }
            return count;
        }
        public static void Run() {
            Check(SodaDesktopVideoDelay.FrameDelay(33,33,true)==0,"Ready video delayed after work");
            Check(SodaDesktopVideoDelay.FrameDelay(35,33,true)==0,"Slow video delayed again");
            Check(SodaDesktopVideoDelay.FrameDelay(30,33,true)==3,"Video FPS ceiling bypassed");
            Check(SodaDesktopVideoDelay.FrameDelay(0,1000,true)==10,"Video input polling unbounded");
            Check(SodaDesktopVideoDelay.FrameDelay(35,33,false)==2,"Full video window must wait");
            using(var delay=new SodaDesktopVideoDelay(false)){Check(!delay.HighResolution,"Fallback timer unexpectedly enabled");delay.Pause(1);delay.Dispose();bool disposed=false;try{delay.Pause(1);}catch(ObjectDisposedException){disposed=true;}Check(disposed,"Disposed timer reused");}
            var window=new SodaDesktopVideoWindow(3);
            window.Sent(1,10);window.Sent(2,20);window.Sent(3,30);Check(!window.CanSend&&window.OldestAt==10,"Video window unbounded");
            bool outOfOrder=false;try{window.Ack(2);}catch(InvalidOperationException){outOfOrder=true;}Check(outOfOrder&&window.Count==3,"Out-of-order video ACK accepted");
            window.Ack(1);Check(window.CanSend&&window.OldestAt==20,"Video ACK failed to open slot");window.Sent(4,40);window.Ack(1);Check(window.Count==3,"Duplicate ACK freed a second slot");
            var legacy=new SodaDesktopVideoWindow(1);legacy.Sent(1,0);Check(!legacy.CanSend,"Legacy video window changed");
            var q=new SodaDesktopFramePreparation<string>();Check(q.CanPrepare(0),"Initial preparation denied");
            q.Set("first",0,300,30);Check(!q.CanPrepare(301),"Prepared frame overwritten");
            Check(q.Take(1,301,30)==null,"Sent before prior ACK");
            Check(q.Take(0,301,30)=="first","Slow capture must make progress");
            q.Set("old",302,350,30);Check(q.Take(0,551,30)==null,"Stale prepared frame sent");
            Check(q.CanPrepare(551),"Stale frame blocked fresh capture");
            q.Set("delta",552,560,30);q.Invalidate(false);Check(q.Take(0,561,30)==null,"Input did not invalidate stale pixels");
            Check(!q.CanPrepare(561),"Input bypassed FPS limit");q.Invalidate(true);Check(q.CanPrepare(561),"Keyframe not immediate");
            q.Set("full",561,570,30);Check(q.Take(0,571,30)=="full","Full retry not delivered");
            q.Set("low-rate-old",600,700,1);Check(q.Take(0,901,1)==null,"Low FPS weakened freshness limit");
            var active=new SodaDesktopFramePreparation<string>();
            Check(!active.CanPrepare(1000,0,true,false,1000),"Native drag allowed background image work");
            Check(!active.CanPrepare(1149,0,true,false,1000),"Native activity quiet period was too short");
            Check(active.CanPrepare(1150,0,true,false,1000),"Image snapshot did not resume after input quieted");
            Check(active.CanPrepare(1000,0,true,true,1000),"Explicit agent/keyframe snapshot was deferred");
            Check(active.CanPrepare(1000,0,false,false,1000),"Legacy/image/secure path inherited native deferral");
            int serial=Frames(false),overlap=Frames(true);Check(overlap>serial*1.3,"Preparation did not overlap ACK wait");
            Console.WriteLine("desktop_frame_preparation_checks_passed");
            Console.WriteLine("frame_preparation_model: duration=5000ms capture_encode=65ms ack=100ms fps_limit=30 serial_frames="+serial+" overlapped_frames="+overlap+"; deterministic model, not a desktop benchmark");
        }
    }
}
