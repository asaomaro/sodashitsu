// Bounded UTF8 operation input through a pipe, never a command-line parameter.
// No async reader survives the deadline. The borrowed stdin handle is not closed.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class SodaDesktopSigninAdminInput {
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr GetStdHandle(int kind);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern uint GetFileType(IntPtr handle);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool PeekNamedPipe(IntPtr pipe,IntPtr buffer,uint size,IntPtr read,out uint available,IntPtr remaining);
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadFile(IntPtr file,byte[] bytes,uint count,out uint read,IntPtr overlapped);
    static Exception Failure(){return new InvalidOperationException("Pipe at most 16384 UTF8 operation bytes and close input within ten seconds");}
    public static byte[] Read(){var timer=Stopwatch.StartNew();return ReadCore(GetStdHandle(-10),()=>timer.ElapsedMilliseconds,Thread.Sleep);}
    internal static byte[] ReadCore(IntPtr pipe,Func<long> monotonic,Action<int> wait,Action afterEndOfInput=null){
        byte[] bytes=new byte[16384],chunk=new byte[1024];int used=0;bool transferred=false;
        try{
            if(pipe==IntPtr.Zero||pipe==new IntPtr(-1)||GetFileType(pipe)!=3||monotonic==null||wait==null)throw Failure();long began=monotonic(),last=began;if(began<0||began>Int64.MaxValue-10000)throw Failure();
            for(;;){long at=monotonic();if(at<last||at-began>=10000)throw Failure();last=at;uint available;
                if(!PeekNamedPipe(pipe,IntPtr.Zero,0,IntPtr.Zero,out available,IntPtr.Zero)){if(Marshal.GetLastWin32Error()==109)break;throw Failure();}
                if(available==0){wait(10);continue;}if(available>(uint)(16384-used))throw Failure();uint count=Math.Min((uint)chunk.Length,available),read;
                if(!ReadFile(pipe,chunk,count,out read,IntPtr.Zero)){if(Marshal.GetLastWin32Error()==109)break;throw Failure();}if(read==0)break;if(read>count||read>(uint)(16384-used))throw Failure();Buffer.BlockCopy(chunk,0,bytes,used,(int)read);used+=(int)read;Array.Clear(chunk,0,chunk.Length);
            }
            if(used<1)throw Failure();if(afterEndOfInput!=null)afterEndOfInput();long end=monotonic();if(end<last||end-began>=10000)throw Failure();var result=new byte[used];Buffer.BlockCopy(bytes,0,result,0,used);transferred=true;return result;
        }finally{Array.Clear(bytes,0,bytes.Length);Array.Clear(chunk,0,chunk.Length);if(!transferred){/* all owned partial input was cleared */}}
    }
}
