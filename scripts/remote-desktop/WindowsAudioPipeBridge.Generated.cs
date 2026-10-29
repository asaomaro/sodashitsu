using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
// Generated memory only: no audio endpoint/device/driver APIs.
public static class SodaAudioPipeGenerated {
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetNamedPipeClientProcessId(IntPtr pipe,out uint pid);
 public static int Main(string[] args) {
  if(args.Length!=1 || (args[0]!="audio" && args[0]!="microphone" && args[0]!="audio-close"))return 2;
  bool mic=args[0]=="microphone";string name="SodaDesktop"+(mic?"Microphone":"Audio")+"-"+Guid.NewGuid().ToString("N");
  using(var pipe=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous)){
   Console.WriteLine(name);Console.Out.Flush();int expected;if(!Int32.TryParse(Console.ReadLine(),out expected)||expected<=0)return 2;
   Task connection=Task.Factory.FromAsync(pipe.BeginWaitForConnection,pipe.EndWaitForConnection,null);if(!connection.Wait(5000))return 2;
   uint pid;if(!GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(),out pid)||pid!=(uint)expected)return 3;
   byte[] bytes=new byte[mic?16:16384];for(int i=0;i<bytes.Length;i++)bytes[i]=(byte)(i%256);
   for(int at=0;at<bytes.Length;at+=7){int n=Math.Min(7,bytes.Length-at);pipe.Write(bytes,at,n);}pipe.Flush();
   if(mic){bytes=new byte[1932];int at=0;while(at<bytes.Length){var read=pipe.ReadAsync(bytes,at,bytes.Length-at);if(!read.Wait(3000)||read.Result<=0)return 4;at+=read.Result;}for(int i=0;i<bytes.Length;i++)if(bytes[i]!=(byte)(i%256))return 5;}
   Console.WriteLine("authenticated-binary-ok");Console.Out.Flush();
   if(args[0]=="audio-close") {byte[] end=new byte[1];var read=pipe.ReadAsync(end,0,1);if(!read.Wait(5000)||read.Result!=0)return 7;Console.WriteLine("owner-close-ok");Console.Out.Flush();}
   else if(Console.ReadLine()!="finish")return 6;
  }return 0;
 }
}
