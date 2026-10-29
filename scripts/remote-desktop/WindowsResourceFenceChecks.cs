using System;
using System.Collections.Generic;
public static class SodaDesktopResourceFenceChecks {
 static void Check(bool value,string message){if(!value)throw new InvalidOperationException(message);}
 public static void Run(){
  string id=Guid.NewGuid().ToString("D");bool live=true,first=true;int keys=0,clipboard=0,microphone=0,acks=0;
  var fence=new SodaDesktopResourceFence(()=>live,()=>keys++,()=>clipboard++,()=>microphone++);Check(fence.Fence(id,value=>{Check(value==id,"Cleanup changed correlation");acks++;}),"Clean resources were not acknowledged");Check(keys==1&&clipboard==1&&microphone==1&&acks==1,"Cleanup order or count changed");
  foreach(string failure in new[]{"input","clipboard","microphone","scope"}){acks=clipboard=microphone=0;live=true;first=true;fence=new SodaDesktopResourceFence(()=>live,()=>{if(failure=="input")throw new InvalidOperationException();if(failure=="scope"&&first){first=false;live=false;}},()=>{clipboard++;if(failure=="clipboard")throw new InvalidOperationException();},()=>{microphone++;if(failure=="microphone")throw new InvalidOperationException();});Check(!fence.Fence(id,_=>acks++),"Incomplete cleanup acknowledged");Check(acks==0&&clipboard==1&&microphone==1,"Failure skipped resource shutdown");live=true;Check(!fence.Fence(id,_=>acks++),"Failed cleanup revived");}
  var held=new HashSet<ushort>{65,66};var buttons=new HashSet<int>{0,4};bool failed=false;try{SodaDesktopResourceFence.ReleaseHeld(held,buttons,key=>{if(key==65)throw new InvalidOperationException();},button=>{},()=>true);}catch(InvalidOperationException){failed=true;}Check(failed&&held.SetEquals(new ushort[]{65})&&buttons.Count==0,"Failed key was silently forgotten");SodaDesktopResourceFence.ReleaseHeld(held,buttons,key=>{},button=>{},()=>true);Check(held.Count==0,"Successful retry did not release held key");
  fence=new SodaDesktopResourceFence(()=>true,()=>{},()=>{},()=>{});fence.Close();Check(!fence.Fence(id,_=>acks++),"Closed fence acknowledged");
  SodaDesktopResourceFence reentrant=null;int reentryAcks=0;reentrant=new SodaDesktopResourceFence(()=>true,()=>{reentrant.Fence(id,_=>reentryAcks++);},()=>{},()=>{});Check(!reentrant.Fence(id,_=>reentryAcks++)&&reentryAcks==0,"Reentrant cleanup acknowledged");
  Console.WriteLine("desktop_resource_fence_generated_strict_release_worker_cleanup_terminal_failure_passed");
 }
}
