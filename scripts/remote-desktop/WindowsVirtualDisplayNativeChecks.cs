// Repository generated checks only; excluded from runtime-assets.
using System;
using System.Runtime.InteropServices;
public sealed partial class SodaDesktopVirtualDisplayNative {
    public static void VerifyLayouts(){if(!StartedState(0,8,0)||StartedState(1,8,0)||StartedState(0,0,0))throw new InvalidOperationException("Virtual driver status flags");bool rejected=false;try{StartedState(0,0,22);}catch(SodaDesktopVirtualFailure e){rejected=e.Code=="driver_unavailable";}if(!rejected)throw new InvalidOperationException("Disabled virtual driver accepted");if(IntPtr.Size!=8||Marshal.SizeOf(typeof(CreateInfo))!=72||Marshal.SizeOf(typeof(PropertyKey))!=20)throw new InvalidOperationException("Virtual display native ABI");}
}
