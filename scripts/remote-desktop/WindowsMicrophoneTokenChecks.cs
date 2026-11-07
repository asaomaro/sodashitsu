// Generated TOKEN_GROUPS buffers and read-only real-token checks. No audio/desktop activation.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Reflection;
using System.Security.Principal;
public static class SodaMicrophoneTokenChecks {
    [StructLayout(LayoutKind.Sequential)]struct Entry {public IntPtr sid;public uint flags;}
    [StructLayout(LayoutKind.Sequential)]struct Header {public uint count;public Entry first;}
    [DllImport("advapi32.dll",SetLastError=true)]static extern bool OpenProcessToken(IntPtr p,uint access,out IntPtr token);
    [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr p);
    sealed class Groups:IDisposable {
        public IntPtr Data;public int Length,Offset=Marshal.OffsetOf(typeof(Header),"first").ToInt32(),Stride=Marshal.SizeOf(typeof(Entry));
        public Groups(string[] sids,uint[] flags){
            var bytes=new byte[sids.Length][];int size=Offset+sids.Length*Stride;
            for(int n=0;n<sids.Length;n++){var sid=new SecurityIdentifier(sids[n]);bytes[n]=new byte[sid.BinaryLength];sid.GetBinaryForm(bytes[n],0);size+=bytes[n].Length;}
            Data=Marshal.AllocHGlobal(size);Length=size;for(int n=0;n<size;n++)Marshal.WriteByte(Data,n,0);Marshal.WriteInt32(Data,sids.Length);
            int at=Offset+sids.Length*Stride;
            for(int n=0;n<sids.Length;n++){Marshal.Copy(bytes[n],0,IntPtr.Add(Data,at),bytes[n].Length);Marshal.WriteIntPtr(Data,Offset+n*Stride,IntPtr.Add(Data,at));Marshal.WriteInt32(Data,Offset+n*Stride+IntPtr.Size,unchecked((int)flags[n]));at+=bytes[n].Length;}
        }
        public string Read(){return SodaDesktopUserMicrophoneRole.LogonGroups(Data,Length);}
        public void Dispose(){if(Data!=IntPtr.Zero){for(int n=0;n<Length;n++)Marshal.WriteByte(Data,n,0);Marshal.FreeHGlobal(Data);Data=IntPtr.Zero;}}
    }
    static int rejected,sessionRejected;
    static void SessionDenied(Action call){try{call();}catch(InvalidOperationException){sessionRejected++;return;}throw new Exception("Malformed microphone session admitted");}
    static void Denied(Action call){try{call();}catch(InvalidOperationException){rejected++;return;}throw new Exception("Malformed microphone token groups admitted");}
    public static void Generated(){
        if(SodaDesktopUserMicrophoneRole.CheckedSession(true,1)!=1||SodaDesktopUserMicrophoneRole.CheckedSession(true,Int32.MaxValue)!=Int32.MaxValue)throw new Exception("Native session rejected");
        foreach(uint session in new[]{0u,(uint)Int32.MaxValue+1u,UInt32.MaxValue})SessionDenied(()=>SodaDesktopUserMicrophoneRole.CheckedSession(true,session));
        foreach(uint session in new[]{0u,1u,UInt32.MaxValue})SessionDenied(()=>SodaDesktopUserMicrophoneRole.CheckedSession(false,session));
        foreach(int pid in new[]{-1,0})SessionDenied(()=>SodaDesktopUserMicrophoneRole.NativeSessionId(pid));
        Console.WriteLine("generated_native_session_boundary_rejections="+sessionRejected);
        const string logon="S-1-5-5-123-456",other="S-1-5-32-545";const uint flags=0xc0000007u;
        using(var g=new Groups(new[]{other,logon},new[]{7u,flags}))if(g.Read()!=logon)throw new Exception("Native logon rejected");
        using(var g=new Groups(new string[0],new uint[0]))Denied(()=>g.Read());
        using(var g=new Groups(new[]{other},new[]{7u}))Denied(()=>g.Read());
        using(var g=new Groups(new[]{logon,logon},new[]{flags,flags}))Denied(()=>g.Read());
        using(var g=new Groups(new[]{other},new[]{flags}))Denied(()=>g.Read());
        foreach(uint invalid in new[]{7u,0xc0000000u,0xc0000017u,0x40000007u,0x80000007u,0xc0000087u,0xe0000007u})using(var g=new Groups(new[]{logon},new[]{invalid}))Denied(()=>g.Read());
        foreach(int count in new[]{-1,4097,1000})using(var g=new Groups(new[]{logon},new[]{flags})){Marshal.WriteInt32(g.Data,count);Denied(()=>g.Read());}
        foreach(int offset in new[]{0,4,-4,100000})using(var g=new Groups(new[]{logon},new[]{flags})){Marshal.WriteIntPtr(g.Data,g.Offset,IntPtr.Add(g.Data,offset));Denied(()=>g.Read());}
        using(var g=new Groups(new[]{logon},new[]{flags})){Marshal.WriteIntPtr(g.Data,g.Offset,IntPtr.Zero);Denied(()=>g.Read());}
        using(var g=new Groups(new[]{logon},new[]{flags})){var sid=Marshal.ReadIntPtr(g.Data,g.Offset);Marshal.WriteIntPtr(g.Data,g.Offset,IntPtr.Add(sid,1));Denied(()=>g.Read());}
        foreach(int at in new[]{0,1})using(var g=new Groups(new[]{logon},new[]{flags})){var sid=Marshal.ReadIntPtr(g.Data,g.Offset);Marshal.WriteByte(sid,at,(byte)(at==0?2:16));Denied(()=>g.Read());}
        using(var g=new Groups(new[]{logon},new[]{flags}))Denied(()=>SodaDesktopUserMicrophoneRole.LogonGroups(g.Data,g.Length-1));
        using(var g=new Groups(new[]{logon},new[]{flags})){Denied(()=>SodaDesktopUserMicrophoneRole.LogonGroups(g.Data,1));Denied(()=>SodaDesktopUserMicrophoneRole.LogonGroups(g.Data,-1));Denied(()=>SodaDesktopUserMicrophoneRole.LogonGroups(g.Data,1024*1024+1));}
        Denied(()=>SodaDesktopUserMicrophoneRole.LogonGroups(IntPtr.Zero,32));Denied(()=>SodaDesktopUserMicrophoneRole.LogonSid(IntPtr.Zero));
        Console.WriteLine("generated_token_group_boundary_rejections="+rejected);
    }
    public static void Native(int peerPid){
        using(var identity=WindowsIdentity.GetCurrent()){
            if(identity.IsSystem)throw new Exception("User token required");
            string actual=SodaDesktopUserMicrophoneRole.LogonSid(identity.Token);int managed=0;
            using(var self=Process.GetCurrentProcess()){
                var method=typeof(SodaDesktopUserMicrophoneRole).GetMethod("Read",BindingFlags.Static|BindingFlags.NonPublic);
                var facts=(SodaDesktopUserMicrophonePolicy.Facts)method.Invoke(null,new object[]{self,identity});
                if(facts.Logon!=actual)throw new Exception("Role facts lost native logon");
                if(facts.Session!=self.SessionId||facts.Session!=SodaDesktopUserMicrophoneRole.NativeSessionId(self.Id))throw new Exception("Native session fact changed");
            }
            foreach(IdentityReference group in identity.Groups)if(group.Value.StartsWith("S-1-5-5-",StringComparison.Ordinal))managed++;
            if(peerPid>0)using(var peer=Process.GetProcessById(peerPid)){IntPtr token;if(!OpenProcessToken(peer.Handle,8,out token))throw new Exception("Peer token unavailable");try{if(SodaDesktopUserMicrophoneRole.LogonSid(token)!=actual)throw new Exception("Other peer logon");}finally{CloseHandle(token);}}
            Console.WriteLine("native_logon_proof=true;managed_logon_count="+managed+";peer_same_logon="+(peerPid>0?"true":"not_requested"));
        }
    }
    public static int Main(string[] args){try{Generated();SodaDesktopUserMicrophonePolicy.GeneratedChecks();Native(args.Length==1?int.Parse(args[0]):0);Console.WriteLine("microphone_token_checks_passed_no_audio_or_gui");return 0;}catch(Exception e){Console.WriteLine("microphone_token_checks_failed:"+e.GetType().Name+":"+e.Message);return 1;}}
}
