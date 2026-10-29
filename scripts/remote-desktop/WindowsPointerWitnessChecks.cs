using System;
internal static class SodaPointerWitnessChecks
{
    internal static int Main(){try{SodaDesktopHost.VerifyNativePointerWitness();return 0;}catch(Exception error){Console.Error.WriteLine(error);return 1;}}
}
