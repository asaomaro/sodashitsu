// Pure broker startup/retirement policy checks: no task/SCM/COM/desktop/input calls.
using System;
using System.Collections.Generic;
using System.Reflection;
public static class SodaRuntimeBrokerChecks {
    static object Call(string name,params object[] args){try{return typeof(SodaDesktopUnlock).GetMethod(name,BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,args);}catch(TargetInvocationException error){throw error.InnerException;}}
    static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    static void Reject(string name,params object[] args){bool failed=false;try{Call(name,args);}catch(InvalidOperationException){failed=true;}Check(failed,"Invalid "+name+" accepted");}
    public static int Main(){string stage="namespace";try{
        string sid=SodaDesktopUnlock.Owner;Check(SodaDesktopUnlock.RuntimeTaskName(sid).StartsWith("SodaDesktopRuntime-",StringComparison.Ordinal),"Unexpected runtime task namespace");
        stage="peer";const string image=@"C:\Program Files\Sodashitsu\runtime\DesktopUnlock.exe";
        Check((bool)Call("BrokerPeerAllowed",42u,0u,image,image,1L,259u),"Runtime peer still requires SCM registration");
        foreach(object[] args in new[]{new object[]{42u,1u,image,image,1L,259u},new object[]{42u,0u,"other.exe",image,1L,259u},new object[]{42u,0u,image,image,0L,259u},new object[]{42u,0u,image,image,1L,0u},new object[]{0u,0u,image,image,1L,259u}})Check(!(bool)Call("BrokerPeerAllowed",args),"Foreign/retired broker peer accepted");
        stage="virtual";string selected=null;var sentinel=new object();var open=new Func<string,object>(value=>{selected=value;return sentinel;});var virtualOpen=typeof(SodaDesktopHost).GetMethod("OpenVirtualBroker",BindingFlags.NonPublic|BindingFlags.Static);Check(Object.ReferenceEquals(virtualOpen.Invoke(null,new object[]{open}),sentinel)&&selected.IndexOf("SodaDesktopRuntime-",StringComparison.Ordinal)>=0,"Virtual opener did not use the prepared runtime task");
        stage="arguments";for(int purpose=1;purpose<=7;purpose++){var args=(string[])Call("RuntimeLeaseArguments",42,123L,purpose);Check(args.Length==3&&args[0]=="42"&&args[1]=="123"&&args[2].IndexOf(' ')<0,"Task parameters changed the fixed exec action");}
        Reject("RuntimeLeaseArguments",0,1L,1);Reject("RuntimeLeaseArguments",1,0L,1);Reject("RuntimeLeaseArguments",1,1L,0);Reject("RuntimeLeaseArguments",1,1L,8);
        stage="acl";string good="O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGX;;;"+sid+")";Call("CheckTaskAcl",good);
        Reject("CheckTaskAcl","O:BAG:BAD:P(A;;GA;;;SY)(A;;GA;;;BA)");Reject("CheckTaskAcl",good.Replace("GRGX","GA"));Reject("CheckTaskAcl",good.Replace("GRGX","GW"));Reject("CheckTaskAcl",good.Replace("O:BA","O:"+sid));Reject("CheckTaskAcl",good+"(A;;GRGX;;;S-1-5-32-545)");
        stage="retirement";var events=new List<string>();int remaining=2;Call("RunBrokerConsole",new Action(()=>events.Add("start")),new Func<bool>(()=>remaining--==0),new Action(()=>events.Add("pause")),new Action(()=>events.Add("stop-retired")));Check(String.Join(",",events.ToArray())=="start,pause,pause,stop-retired","Console returned before existing shutdown completed");
        events.Clear();bool failed=false;try{Call("RunBrokerConsole",new Action(()=>{throw new InvalidOperationException();}),new Func<bool>(()=>true),new Action(()=>{}),new Action(()=>events.Add("stop")));}catch(InvalidOperationException){failed=true;}Check(failed&&events.Count==1,"Failed startup lost shutdown");
        Console.WriteLine("{\"ok\":true,\"generatedOnly\":true,\"taskRegistered\":false,\"desktopOpened\":false,\"input\":false}");return 0;
    }catch{Console.WriteLine("{\"ok\":false,\"failureCase\":\""+stage+"\",\"generatedOnly\":true,\"taskRegistered\":false,\"desktopOpened\":false,\"input\":false}");return 1;}}
}
