// Generated-action checks only: no native input, capture, service or real lock transition.
using System;
using System.Threading;
public static class SodaLockCoverObservationChecks {
 public static int Main(string[] args){
  if(args.Length!=1||args[0]!="--check")return 64;
  using(var watchdog=new Timer(_=>Environment.Exit(1),null,15000,Timeout.Infinite)){
   try{SodaDesktopTests.LockCoverChecks.Run();Console.WriteLine("lock_cover_observation_generated_checks_passed");return 0;}
   catch{Console.WriteLine("lock_cover_observation_generated_checks_failed");return 1;}
  }
 }
}
