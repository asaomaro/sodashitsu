using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32.SafeHandles;

// One current-user CLR image. No role assembly is referenced or loaded before selection.
internal static class SodaNativeRoleHost {
    [StructLayout(LayoutKind.Sequential)] private struct FileInfo {
        internal uint Attributes, CreationLow, CreationHigh, AccessLow, AccessHigh, WriteLow, WriteHigh, Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll",SetLastError=true)] private static extern bool GetFileInformationByHandle(SafeFileHandle file,out FileInfo info);
    private static string Digest(byte[] bytes) { using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant(); }
    [MTAThread] private static int Main(string[] args) {
        if(args.Length<6||args[0]!="--role"||args[2]!="--module"||args[4]!="--sha256")return 2;
        string role=args[1],entry;
        switch(role){case "copy":entry="Sodashitsu.NativeDrag.NativeDragWorker";break;case "audio":entry="SodaDesktopAudioPipeBridge";break;case "selection":entry="Sodashitsu.NativeDrag.ExplorerSelectionWorker";break;default:return 2;}
        if(!Regex.IsMatch(args[3],"\\A[a-f0-9]{32}\\z")||!Regex.IsMatch(args[5],"\\A[a-f0-9]{64}\\z"))return 2;
        try {
            using(var identity=WindowsIdentity.GetCurrent()){if(identity.IsSystem||identity.User==null)return 2;}
            string root=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location),directory=Path.Combine(root,"role-"+args[3]);
            if((File.GetAttributes(root)&FileAttributes.ReparsePoint)!=0||(File.GetAttributes(directory)&FileAttributes.ReparsePoint)!=0)return 2;
            string path=Path.Combine(directory,role+".dll");
            if((File.GetAttributes(path)&(FileAttributes.ReparsePoint|FileAttributes.Directory))!=0)return 2;
            byte[] bytes;
            using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)) {
                FileInfo info;if(!GetFileInformationByHandle(file.SafeFileHandle,out info)||info.Links!=1||file.Length<1||file.Length>8*1024*1024)return 2;
                bytes=new byte[(int)file.Length];int offset=0;while(offset<bytes.Length){int read=file.Read(bytes,offset,bytes.Length-offset);if(read<=0)return 2;offset+=read;}
                if(Digest(bytes)!=args[5])return 2;
            }
            MethodInfo method;
            try{var assembly=Assembly.Load(bytes);var type=assembly.GetType(entry,true,false);method=type.GetMethod("Main",BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic,null,new Type[]{typeof(string[])},null);}
            finally{Array.Clear(bytes,0,bytes.Length);}
            if(method==null||method.ReturnType!=typeof(int))return 2;
            var forwarded=new string[args.Length-6];Array.Copy(args,6,forwarded,0,forwarded.Length);
            int result=2;Exception failure=null;
            ThreadStart run=delegate(){try{result=(int)method.Invoke(null,new object[]{forwarded});}catch(Exception error){failure=error;}};
            if(role=="audio")run();else{var thread=new Thread(run);thread.SetApartmentState(ApartmentState.STA);thread.Start();thread.Join();}
            if(failure!=null)return 2;return result;
        }catch{return 2;}
    }
}
