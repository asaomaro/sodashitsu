// Hardware registration metadata only. A candidate is not proof of usable encoding.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class SodaDesktopCodecProbe {
 [StructLayout(LayoutKind.Sequential)]struct TypeInfo {public Guid major,subtype;}
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("mfplat.dll")]static extern int MFStartup(uint version,uint flags);
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("mfplat.dll")]static extern int MFShutdown();
 [DefaultDllImportSearchPaths(DllImportSearchPath.System32)][DllImport("mfplat.dll")]static extern int MFTEnumEx(Guid category,uint flags,ref TypeInfo input,ref TypeInfo output,out IntPtr activates,out uint count);
 public sealed class Candidate {public string codec;public string input;public uint count;public bool encodeVerified=false;}
 static uint Count(uint inputFormat,uint outputFormat){
  var major=new Guid("73646976-0000-0010-8000-00aa00389b71");
  TypeInfo input=new TypeInfo{major=major,subtype=new Guid(inputFormat,0,0x10,0x80,0,0,0xaa,0,0x38,0x9b,0x71)},output=new TypeInfo{major=major,subtype=new Guid(outputFormat,0,0x10,0x80,0,0,0xaa,0,0x38,0x9b,0x71)};
  IntPtr array=IntPtr.Zero;uint count=0;
  try{Marshal.ThrowExceptionForHR(MFTEnumEx(new Guid("f79eac7d-e545-4387-bdee-d647d7bde42a"),0x44,ref input,ref output,out array,out count));if(count>128)throw new NotSupportedException("Codec candidate limit");return count;}
  finally{if(array!=IntPtr.Zero){for(uint i=0;i<Math.Min(128,count);i++){var activation=Marshal.ReadIntPtr(array,checked((int)i*IntPtr.Size));if(activation!=IntPtr.Zero)Marshal.Release(activation);}Marshal.FreeCoTaskMem(array);}}
 }
 public static Candidate[] Read(){
  if(IntPtr.Size!=8)throw new NotSupportedException("64-bit helper required");Marshal.ThrowExceptionForHR(MFStartup(0x20070,0));
  try{return new[]{new Candidate{codec="h264",input="NV12",count=Count(0x3231564e,0x34363248)},new Candidate{codec="h264-444",input="AYUV",count=Count(0x56555941,0x34363248)},new Candidate{codec="hevc",input="NV12",count=Count(0x3231564e,0x43564548)},new Candidate{codec="av1",input="NV12",count=Count(0x3231564e,0x31305641)}};}
  finally{MFShutdown();}
 }
}
