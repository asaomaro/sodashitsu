using System;using System.IO;using System.Diagnostics;using System.Collections.Generic;
public static class Phase3BCProbe {
 public static int Main(string[] args){try{if(args.Length!=1)return 2;var m=Phase3BC.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));int controller=Convert.ToInt32(m["controllerPid"]);var self=Phase3Native.Facts(Process.GetCurrentProcess().Id);var owner=Phase3Native.Facts(controller);string scenario=(string)m["scenario"];if(!Phase3BC.SameToken(self,owner,scenario))throw new InvalidOperationException("scope");string operation=(string)m["operation"];object output;
  if(operation=="receiver"){using(var receiver=Process.GetProcessById(Convert.ToInt32(m["receiverPid"]))){var facts=Phase3Native.Facts(receiver.Id);output=new{ok=Phase3BC.SameToken(facts,owner,scenario)&&receiver.StartTime.ToUniversalTime().Ticks==Int64.Parse((string)m["receiverStartedTicks"])&&Phase3Native.Hash(Phase3Native.Executable(receiver.Id))==(string)m["receiverExeSha256"],normal=!facts.Elevated&&!facts.System,sameOwnerLogonSession=Phase3BC.SameToken(facts,owner,scenario)};}}
  else if(operation=="retired"){bool retired=false;try{using(var target=Process.GetProcessById(Convert.ToInt32(m["ownedPid"]))){retired=target.HasExited||target.StartTime.ToUniversalTime().Ticks!=Int64.Parse((string)m["ownedStartedTicks"]);}}catch(ArgumentException){retired=true;}output=new{ok=true,retired};}
  else if(operation=="scope")output=new{ok=true,normal=true,lockState=self.LockState,unlocked=self.LockState==1,defaultDesktop=Phase3Native.DefaultDesktop()};
  else throw new InvalidOperationException("operation");Console.WriteLine(Phase3BC.Json.Serialize(output));return 0;
 }catch{Console.WriteLine("{\"ok\":false,\"reason\":\"bc-native-probe-failed-closed\"}");return 2;}}
}
