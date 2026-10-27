// Read-only candidate facts, not a capture/input authorization or a lasting scope.
using System;

public static class SodaDesktopSigninCandidate {
    public interface Host {
        bool SystemWithTcb { get; }
        int WorkerSession { get; }
        uint ConsoleSession();
        bool SessionState(uint session, out int state);
        bool EmptyUserName(uint session);
        bool QueryToken(uint session, out IntPtr token, out int error);
        void CloseToken(IntPtr token);
        bool DesktopNames(out string station, out string input, out string thread);
    }
    public sealed class Candidate {
        public readonly uint Session;
        internal Candidate(uint session) { Session=session; }
    }
    // WTSConnected alone proves neither absence of a user nor a secure desktop.
    // Only ERROR_NO_TOKEN is a candidate; arbitrary token-query failure is not.
    public static bool Read(Host host, uint expectedSession, out Candidate candidate) {
        candidate=null;
        if(host==null || expectedSession==0 || expectedSession>Int32.MaxValue)return false;
        try {
            if(!host.SystemWithTcb || host.WorkerSession!=(int)expectedSession || host.ConsoleSession()!=expectedSession)return false;
            int state;
            if(!host.SessionState(expectedSession,out state) || state!=1 || !host.EmptyUserName(expectedSession))return false;
            IntPtr token=IntPtr.Zero;
            int error=0;
            bool absent=false;
            try {
                bool success=host.QueryToken(expectedSession,out token,out error);
                absent=!success && error==1008 && token==IntPtr.Zero;
            } finally {
                if(token!=IntPtr.Zero && token!=new IntPtr(-1))host.CloseToken(token);
            }
            if(!absent)return false;
            string station,input,thread;
            if(!host.DesktopNames(out station,out input,out thread) ||
               !String.Equals(station,"WinSta0",StringComparison.OrdinalIgnoreCase) ||
               !String.Equals(input,"Winlogon",StringComparison.OrdinalIgnoreCase) ||
               !String.Equals(thread,"Winlogon",StringComparison.OrdinalIgnoreCase))return false;
            if(host.ConsoleSession()!=expectedSession || host.WorkerSession!=(int)expectedSession || !host.SystemWithTcb)return false;
            candidate=new Candidate(expectedSession);
            return true;
        } catch {
            // Never publish native exception text, user names or token details.
            return false;
        }
    }
}
