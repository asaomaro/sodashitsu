using System;
using System.Runtime.InteropServices;
public static class Phase3Endpoint {
 [StructLayout(LayoutKind.Sequential)]struct Key{public Guid format;public uint id;}
 [StructLayout(LayoutKind.Explicit,Size=24)]struct Value{[FieldOffset(0)]public ushort type;[FieldOffset(8)]public IntPtr pointer;}
 [DllImport("ole32.dll")]static extern int CoCreateInstance(ref Guid clsid,IntPtr outer,uint context,ref Guid iid,out IntPtr value);
 [DllImport("ole32.dll")]static extern int CoInitializeEx(IntPtr reserved,uint flags);
 [DllImport("ole32.dll")]static extern void CoUninitialize();
 [DllImport("ole32.dll")]static extern int PropVariantClear(ref Value value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int GetDevice(IntPtr self,[MarshalAs(UnmanagedType.LPWStr)]string id,out IntPtr value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int DefaultDevice(IntPtr self,int flow,int role,out IntPtr value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Id(IntPtr self,out IntPtr value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int State(IntPtr self,out uint state);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int OpenStore(IntPtr self,uint mode,out IntPtr value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Property(IntPtr self,ref Key key,out Value value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Activate(IntPtr self,ref Guid iid,uint context,IntPtr parameters,out IntPtr value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Flow(IntPtr self,out int flow);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Volume(IntPtr self,out float value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Mute(IntPtr self,out int value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Enumerator(IntPtr self,out IntPtr value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Count(IntPtr self,out int count);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int Session(IntPtr self,int index,out IntPtr value);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int SessionState(IntPtr self,out int state);
 static T M<T>(IntPtr p,int s)where T:class{return Phase3Capture.Method<T>(p,s);}
 static void Check(int result){Phase3Capture.Check(result);}static void Release(ref IntPtr p){Phase3Capture.Release(ref p);}
 static string DeviceId(IntPtr device){IntPtr value;Check(M<Id>(device,5)(device,out value));try{return Marshal.PtrToStringUni(value);}finally{Marshal.FreeCoTaskMem(value);}}
 public sealed class Facts{public bool active,notDefault,unmuted,virtualCable;public float volume;public int activeSessions;}
 public static Facts Read(string id,int expectedFlow){
  if(String.IsNullOrWhiteSpace(id)||id.Length>512||(expectedFlow!=0&&expectedFlow!=1))throw new InvalidOperationException("fixed-endpoint");
  IntPtr en=IntPtr.Zero,device=IntPtr.Zero,store=IntPtr.Zero,flow=IntPtr.Zero,volume=IntPtr.Zero,manager=IntPtr.Zero,sessions=IntPtr.Zero;bool initialized=false;
  try{Check(CoInitializeEx(IntPtr.Zero,0));initialized=true;Guid clsid=new Guid("bcde0395-e52f-467c-8e3d-c4579291692e"),iid=new Guid("a95664d2-9614-4f35-a746-de8db63617e6");Check(CoCreateInstance(ref clsid,IntPtr.Zero,23,ref iid,out en));Check(M<GetDevice>(en,5)(en,id,out device));if(DeviceId(device)!=id)throw new InvalidOperationException("endpoint-id");
   uint state;Check(M<State>(device,6)(device,out state));iid=new Guid("1be09788-6894-4089-8586-9a2a6c265ac5");Check(Marshal.QueryInterface(device,ref iid,out flow));int direction;Check(M<Flow>(flow,3)(flow,out direction));if(direction!=expectedFlow)throw new InvalidOperationException("endpoint-flow");
   Check(M<OpenStore>(device,4)(device,0,out store));var key=new Key{format=new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),id=14};Value value;Check(M<Property>(store,5)(store,ref key,out value));string name;try{if(value.type!=31)throw new InvalidOperationException("endpoint-name");name=Marshal.PtrToStringUni(value.pointer);}finally{PropVariantClear(ref value);}
   string prefix=expectedFlow==1?"CABLE Output (":"CABLE Input (";bool cable=name!=null&&name.StartsWith(prefix,StringComparison.Ordinal)&&name.IndexOf("VB-Audio Virtual Cable",StringComparison.Ordinal)>=0;
   bool notDefault=true;for(int role=0;role<3;role++){IntPtr fallback=IntPtr.Zero;int hr=M<DefaultDevice>(en,4)(en,expectedFlow,role,out fallback);try{if(hr<0)throw new InvalidOperationException("default-query-failed");if(DeviceId(fallback)==id)notDefault=false;}finally{Release(ref fallback);}}
   iid=new Guid("5cdf2c82-841e-4546-9722-0cf74078229a");Check(M<Activate>(device,3)(device,ref iid,23,IntPtr.Zero,out volume));float level;int muted;Check(M<Volume>(volume,9)(volume,out level));Check(M<Mute>(volume,15)(volume,out muted));
   iid=new Guid("77aa99a0-1bd6-484f-8bc7-2c654c9a9b6f");Check(M<Activate>(device,3)(device,ref iid,23,IntPtr.Zero,out manager));Check(M<Enumerator>(manager,5)(manager,out sessions));int count;Check(M<Count>(sessions,3)(sessions,out count));if(count<0||count>128)throw new InvalidOperationException("endpoint-sessions");int active=0;
   for(int n=0;n<count;n++){IntPtr session=IntPtr.Zero;try{Check(M<Session>(sessions,4)(sessions,n,out session));int sessionState;Check(M<SessionState>(session,3)(session,out sessionState));if(sessionState==1)active++;}finally{Release(ref session);}}
   return new Facts{active=state==1,notDefault=notDefault,unmuted=muted==0,virtualCable=cable,volume=level,activeSessions=active};
  }finally{Release(ref sessions);Release(ref manager);Release(ref volume);Release(ref flow);Release(ref store);Release(ref device);Release(ref en);if(initialized)CoUninitialize();}
 }
 public static bool Available(Facts f){return f.active&&f.notDefault&&f.unmuted&&f.virtualCable&&f.volume>0&&f.volume<=1&&f.activeSessions==0;}
}
