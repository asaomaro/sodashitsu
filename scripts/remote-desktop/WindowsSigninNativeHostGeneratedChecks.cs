// Test-only partial; excluded from the installed executable.
using System;
public static partial class SodaDesktopSigninNativeHost {
    public static void VerifyGeneratedData() {
        if(Role(new string[0])!="service"||Role(new[]{"--context"})!="worker")throw new InvalidOperationException("Native role routing changed");
        foreach(string purpose in new[]{"input","view","presence"}) {
            if(Role(new[]{"--broker",purpose})!="worker"||Role(new[]{"--worker","00000000-0000-4000-8000-000000000001","1","1","1",purpose})!="worker")throw new InvalidOperationException("Native worker route changed");
        }
        foreach(var args in new[]{null,new[]{"--service"},new[]{"--console"},new[]{"--context","input"},new[]{"--broker","other"},new[]{"--worker"},new[]{"--worker","00000000-0000-0000-0000-000000000000","1","1","1","view"},new[]{"--worker","00000000-0000-4000-8000-000000000001","0","1","1","view"},new[]{"--worker","00000000-0000-4000-8000-000000000001","1","1","1","other"}}) {
            if(Role(args)!=null)throw new InvalidOperationException("Native role accepted unknown arguments");
        }
        Console.WriteLine("signin_native_closed_roles_generated_pass");
    }
}
