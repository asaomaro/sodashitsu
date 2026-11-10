// Pure routing/policy checks for the real capture path. No native calls or input.
using System;
using System.Reflection;
using System.IO;
namespace SodaDesktopTests {
    public static class LockCoverChecks {
        static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
        static object Call(Type type,string name,params object[] values){return type.GetMethod(name,BindingFlags.Static|BindingFlags.NonPublic).Invoke(null,values);}
        public static void Run(){
            var source=typeof(SodaDesktopUnlock).GetMethod("SelectSource",BindingFlags.NonPublic|BindingFlags.Static,null,new[]{typeof(Func<int>),typeof(Func<bool>),typeof(Func<bool>),typeof(Action)},null);
            foreach(int state in new[]{-1,0,1})foreach(bool inputDefault in new[]{false,true}) {
                string actual=(string)source.Invoke(null,new object[]{new Func<int>(()=>state),new Func<bool>(()=>inputDefault),new Func<bool>(()=>!inputDefault),new Action(()=>{})});
                string expected=state<0?"transition":state==1||inputDefault?"normal":"secure";
                Check(actual==expected,"Locked Default did not use normal capture");
            }
            foreach(bool allowed in new[]{false,true}){
                int state=0;bool inputDefault=true;object[] args={new Func<int>(()=>state),new Func<bool>(()=>inputDefault),allowed,true};
                Check((bool)Call(typeof(SodaDesktopHost),"ConfigureLockedDefault",args),"Locked Default not selected");
                Check((bool)args[3]==allowed,"Unlock permission bypassed");
                var flags=BindingFlags.Static|BindingFlags.NonPublic;
                Check((bool)typeof(SodaDesktopHost).GetField("Secure",flags).GetValue(null),"Locked capabilities widened");
                Check(!(bool)typeof(SodaDesktopHost).GetField("SecureAttentionAllowed",flags).GetValue(null),"Normal user gained SYSTEM SAS");
                var guard=(Func<bool>)typeof(SodaDesktopHost).GetField("SecureGuard",flags).GetValue(null);
                Check(guard(),"Current locked Default rejected");inputDefault=false;Check(!guard(),"Winlogon retained old capture");inputDefault=true;state=1;Check(!guard(),"Unlock retained old capture");
                Call(typeof(SodaDesktopHost),"ClearProtectedGuards");
            }
            object[] normal={new Func<int>(()=>1),new Func<bool>(()=>true),false,true};Check(!(bool)Call(typeof(SodaDesktopHost),"ConfigureLockedDefault",normal)&&(bool)normal[3],"Normal permission changed");
            Check(!(bool)Call(typeof(SodaDesktopUnlock),"VirtualShareAllowed",new Func<int>(()=>0),new Func<bool>(()=>true)),"Locked desktop gained virtual display");
            using(var output=new StringWriter()){bool closed=false;Call(typeof(SodaDesktopUnlock),"StopInput",output,new Action(()=>closed=true),false);Check(!closed&&output.ToString().Trim()=="{\"type\":\"stop\"}","EOF closed the proxy before broker retirement");}
            Console.WriteLine("desktop_capture_routing_checks_passed");
        }
        public static void Main(){Run();}
    }
}
