// Owned generated memory target only; no desktop, slot, input or OLE APIs execute.
using System;
using System.IO;
using System.Runtime.InteropServices;
using Sodashitsu.NativeDrag;
internal static class NativeHostFixture
{
    private sealed class Slot:IDisposable {public void Dispose(){}}
    private sealed class Backend:IDragBackend
    {
        public void Initialize(){}public void Finish(){}public bool Allowed(){return true;}public bool LeftHeld(){return true;}public void Pump(){}
        public int Drop(NativeDragDataObject data,DragLease lease,Action finalAdmission,out uint effect)
        {
            DragOutcome outcome=NativeDragAdmission.Invoke(Allowed,LeftHeld,finalAdmission,delegate
            {
                IntPtr memory=Marshal.AllocHGlobal(70000);
                try
                {
                    if(lease.Copy(0,0,70000,memory)!=70000)throw new Exception("generated assertion: native host read length");
                    byte[] value=new byte[70000];Marshal.Copy(memory,value,0,value.Length);
                    for(int i=0;i<value.Length;i++)if(value[i]!=(byte)(i%251))throw new Exception("generated assertion: native host payload");Array.Clear(value,0,value.Length);
                    return new DragOutcome(0x40100,1);
                }
                finally {Marshal.FreeHGlobal(memory);}
            });effect=outcome.Effect;return outcome.Result;
        }
    }
    [STAThread]private static int Main(string[] args){if(args.Length==1&&args[0]=="--preflight"){Console.WriteLine("soda-native-copy-preflight-v1");return 0;}if(args.Length!=0)return 3;return NativeDragWorker.Run(Console.OpenStandardInput(),Console.Out,new Backend(),delegate{return new Slot();},Environment.Exit);}
}
