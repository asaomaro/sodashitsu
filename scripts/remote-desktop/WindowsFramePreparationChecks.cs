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
            int serial=Frames(false),overlap=Frames(true);Check(overlap>serial*1.3,"Preparation did not overlap ACK wait");
            Console.WriteLine("desktop_frame_preparation_checks_passed");
            Console.WriteLine("frame_preparation_model: duration=5000ms capture_encode=65ms ack=100ms fps_limit=30 serial_frames="+serial+" overlapped_frames="+overlap+"; deterministic model, not a desktop benchmark");
        }
    }
}
