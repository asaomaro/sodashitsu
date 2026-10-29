using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using Sodashitsu.NativeDrag;

internal static class WindowsNativeDragLeaseChecks
{
    private static void Assert(bool ok, string message) { if (!ok) throw new Exception("generated assertion: " + message); }
    private static void Reject(Action action, string message)
    {
        bool rejected = false; try { action(); } catch { rejected = true; }
        Assert(rejected, message);
    }
    private static string Sha(byte[] data)
    {
        using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
    }
    private static DragScope Scope(string gesture)
    {
        return new DragScope("11111111-1111-4111-8111-111111111111", "https://soda.example", gesture,
            "33333333-3333-4333-8333-333333333333");
    }
    private static readonly string Gesture = "22222222-2222-4222-8222-222222222222";
    private static DragEntry Entry(byte[] data) { return new DragEntry("generated.bin", false, data.Length, Sha(data)); }
    private static void Basic()
    {
        byte[] data = Encoding.UTF8.GetBytes("generated native drag bytes"); long now = 0; int fetched = 0;
        using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { Entry(data) },
            delegate(int i) { fetched++; return (byte[])data.Clone(); }, delegate { return true; }, delegate { return now; }))
        {
            IntPtr memory = Marshal.AllocHGlobal(data.Length + 1);
            try
            {
                Marshal.WriteByte(memory, data.Length, 77);
                Assert(lease.Count == 1 && lease.Entry(0).Name == "generated.bin", "manifest");
                Assert(fetched == 0, "metadata must not fetch bytes");
                Assert(lease.Copy(0, 0, UInt32.MaxValue, memory) == data.Length, "large requested length is clamped safely");
                byte[] actual = new byte[data.Length]; Marshal.Copy(memory, actual, 0, actual.Length);
                Assert(Sha(actual) == Sha(data) && Marshal.ReadByte(memory, data.Length) == 77, "exact verified bytes and buffer boundary");
                Assert(lease.Copy(0, 2, 4, memory) == 4 && fetched == 1, "positional cache read without refetch");
                Assert(lease.Copy(0, data.Length, 2, memory) == 0, "EOF");
                Reject(delegate { lease.Copy(0, -1, 1, memory); }, "negative offset");
                Reject(delegate { lease.Copy(0, data.Length + 1, 1, memory); }, "beyond EOF");
                Reject(delegate { lease.Copy(0, 0, 1, IntPtr.Zero); }, "null output");
                lease.Cancel(); Reject(delegate { lease.Copy(0, 0, 1, memory); }, "cancelled stream cannot read");
                Assert(!lease.Beat(Scope(Gesture)), "heartbeat cannot reactivate cancellation");
            }
            finally { Marshal.FreeHGlobal(memory); }
        }
    }
    private static void Names()
    {
        foreach (string name in new string[] { "", "../a", "C:\\a", "a/../b", "/a", "a\\", "a.", "a ", "NUL.txt", "COM1", "a\0b", "\uD800", "COM\u00B9", "COM\u00B2.txt", "COM\u00B3", "LPT\u00B9.txt", "LPT\u00B2", "LPT\u00B3.txt" })
            Reject(delegate { new DragEntry(name, false, 0, DragEntry.EmptySha); }, "unsafe name accepted");
        Reject(delegate { new DragEntry("a", true, 1, null); }, "directory payload");
        Reject(delegate { new DragEntry("a", false, 1, "bad"); }, "invalid SHA");
        Reject(delegate { new DragEntry("a", false, 0, new String('a',64)); }, "invalid empty SHA");
        Func<int, byte[]> fetch = delegate { throw new Exception("must not fetch"); };
        Func<bool> live = delegate { return true; }; Func<long> clock = delegate { return 0; };
        Reject(delegate { new DragLease(Scope(Gesture), new DragEntry[] { new DragEntry("A", false, 0, DragEntry.EmptySha), new DragEntry("a", false, 0, DragEntry.EmptySha) }, fetch, live, clock); }, "duplicate names");
        Reject(delegate { new DragLease(Scope(Gesture), new DragEntry[] { new DragEntry("a/b", false, 0, DragEntry.EmptySha) }, fetch, live, clock); }, "missing parent");
        Reject(delegate { new DragLease(Scope(Gesture), new DragEntry[] { new DragEntry("a", false, 60000000, DragEntry.EmptySha), new DragEntry("b", false, 60000000, DragEntry.EmptySha) }, fetch, live, clock); }, "total byte bound");
        Reject(delegate { new DragLease(Scope(Gesture), new DragEntry[1001], fetch, live, clock); }, "entry count bound");
        using (DragLease valid = new DragLease(Scope(Gesture), new DragEntry[] { new DragEntry("a", true, 0, null), new DragEntry("a/b", false, 0, DragEntry.EmptySha) }, fetch, live, clock))
            Assert(valid.Count == 2, "declared parent accepted");
    }
    private static void Authority()
    {
        byte[] data = new byte[] { 1 }; long now = 0; bool live = true;
        Func<DragLease> create = delegate { return new DragLease(Scope(Gesture), new DragEntry[] { Entry(data) }, delegate { return new byte[] { 1 }; }, delegate { return live; }, delegate { return now; }); };
        using (DragLease stale = create()) { now = 5000; Reject(delegate { stale.Validate(); }, "heartbeat deadline"); now = 0; Assert(!stale.Beat(Scope(Gesture)), "clock rollback cannot revive"); }
        now = 0;
        using (DragLease absolute = create())
        {
            for (now = 3000; now < DragLease.AbsoluteMs; now += 3000) Assert(absolute.Beat(Scope(Gesture)), "live heartbeat");
            Assert(!absolute.Beat(Scope(Gesture)), "heartbeat cannot extend absolute lifetime");
        }
        now = 0;
        using (DragLease changed = create()) { live = false; Reject(delegate { changed.Validate(); }, "authority revoke"); live = true; Assert(!changed.Beat(Scope(Gesture)), "authority cannot revive"); }
        now = 0;
        using (DragLease scoped = create()) { now = 4000; Assert(!scoped.Beat(Scope("44444444-4444-4444-8444-444444444444")), "wrong gesture heartbeat"); now = 5000; Reject(delegate { scoped.Validate(); }, "wrong gesture must not refresh"); }
    }
    private static void AuthorityBoundary()
    {
        foreach (long deadline in new long[] { 5000, 900000 })
        {
            long now = 0; int calls = 0; byte[] data = new byte[] { 1 };
            using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { Entry(data) }, delegate { return new byte[] { 1 }; },
                delegate { if (++calls == 6) now = deadline; return true; }, delegate { return now; }))
            {
                IntPtr memory = Marshal.AllocHGlobal(1);
                try { Marshal.WriteByte(memory, 0, 77); Reject(delegate { lease.Copy(0, 0, 1, memory); }, "callback crossed deadline"); Assert(Marshal.ReadByte(memory) == 77, "expired callback published bytes"); now = 0; Assert(!lease.Beat(Scope(Gesture)), "clock rewind revived expired callback"); }
                finally { Marshal.FreeHGlobal(memory); }
            }
        }
        bool clockFails = false;
        using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { new DragEntry("a", false, 0, DragEntry.EmptySha) }, delegate { return new byte[0]; }, delegate { return true; }, delegate { if (clockFails) throw new Exception("generated clock failure"); return 0; }))
        {
            clockFails = true; Reject(delegate { lease.Validate(); }, "clock exception accepted"); clockFails = false; Assert(!lease.Beat(Scope(Gesture)), "clock exception did not revoke irreversibly");
        }
    }
    private static void Integrity()
    {
        byte[] wanted = new byte[] { 1, 2, 3 }, wrong = new byte[] { 4, 5, 6 };
        using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { Entry(wanted) }, delegate { return wrong; }, delegate { return true; }, delegate { return 0; }))
        {
            IntPtr memory = Marshal.AllocHGlobal(4);
            try { Marshal.WriteByte(memory, 0, 77); Reject(delegate { lease.Copy(0, 0, 3, memory); }, "unverified SHA bytes published"); Assert(Marshal.ReadByte(memory) == 77, "invalid contents touched output"); Assert(wrong[0] == 0 && wrong[1] == 0 && wrong[2] == 0, "rejected buffer not wiped"); }
            finally { Marshal.FreeHGlobal(memory); }
        }
    }
    private static void PendingCancellation()
    {
        byte[] data = new byte[] { 1, 2, 3 }; ManualResetEvent entered = new ManualResetEvent(false), release = new ManualResetEvent(false); bool rejected = false;
        using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { Entry(data) }, delegate { entered.Set(); release.WaitOne(3000); return data; }, delegate { return true; }, delegate { return 0; }))
        {
            IntPtr memory = Marshal.AllocHGlobal(4);
            try
            {
                Marshal.WriteByte(memory, 0, 77);
                Thread thread = new Thread(delegate() { try { lease.Copy(0, 0, 3, memory); } catch { rejected = true; } }); thread.Start();
                Assert(entered.WaitOne(3000), "pending fetch not entered");
                lease.Cancel(); Assert(!lease.WaitIdle(10), "pending fetch reported drained"); release.Set(); Assert(thread.Join(3000), "pending fetch did not terminate");
                Assert(rejected && lease.WaitIdle(1000), "cancelled fetch not drained"); Assert(Marshal.ReadByte(memory) == 77 && data[0] == 0, "late fetch published or retained bytes");
            }
            finally { release.Set(); Marshal.FreeHGlobal(memory); entered.Dispose(); release.Dispose(); }
        }
    }
    private static void Streams()
    {
        byte[] data = Encoding.UTF8.GetBytes("generated stream bytes");
        using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { Entry(data) }, delegate { return (byte[])data.Clone(); }, delegate { return true; }, delegate { return 0; }))
        {
            NativeDragStream stream = new NativeDragStream(lease, 0, 0); IntPtr memory = Marshal.AllocHGlobal(64), count = Marshal.AllocHGlobal(8);
            try
            {
                Assert(stream.Read(memory, 4, count) == 0 && Marshal.ReadInt32(count) == 4, "COM stream read");
                IDragStream clone; Assert(stream.Clone(out clone) == 0, "COM stream clone");
                Assert(stream.Seek(0, 0, count) == 0 && Marshal.ReadInt64(count) == 0, "COM stream seek begin");
                Assert(clone.Read(memory, 2, count) == 0 && Marshal.ReadByte(memory) == data[4], "clone independent position");
                Assert(stream.Seek(Int64.MaxValue, 1, count) < 0, "overflow seek");
                Assert(stream.Write(memory, 1, count) < 0 && Marshal.ReadInt32(count) == 0, "read-only COM stream");
                System.Runtime.InteropServices.ComTypes.STATSTG stat; Assert(stream.Stat(out stat, 1) == 0 && stat.cbSize == data.Length && stat.pwcsName == null, "stat metadata");
                IntPtr iface = Marshal.GetComInterfaceForObject(stream, typeof(IDragStream));
                try { Guid sequential = new Guid("0c733a30-2a1c-11ce-ade5-00aa0044773d"); IntPtr result; Assert(Marshal.QueryInterface(iface, ref sequential, out result) == 0, "ISequentialStream export"); Marshal.Release(result); }
                finally { Marshal.Release(iface); }
                lease.Cancel(); Assert(stream.Read(memory, 1, count) < 0 && Marshal.ReadInt32(count) == 0, "revoked COM stream read");
            }
            finally { Marshal.FreeHGlobal(memory); Marshal.FreeHGlobal(count); }
        }
    }
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int NativeGetData(IntPtr self, ref System.Runtime.InteropServices.ComTypes.FORMATETC format, out System.Runtime.InteropServices.ComTypes.STGMEDIUM medium);
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    private delegate int NativeStreamRead(IntPtr self, IntPtr data, uint count, IntPtr read);
    private static void DataObjects()
    {
        byte[] data = Encoding.UTF8.GetBytes("generated native object bytes"); long now = 0; int fetched = 0;
        using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { new DragEntry("root", true, 0, null), new DragEntry("root/generated.bin", false, data.Length, Sha(data)) }, delegate { fetched++; return (byte[])data.Clone(); }, delegate { return true; }, delegate { return now; }))
        using (NativeDragDataObject source = new NativeDragDataObject(lease))
        {
            byte[] descriptor = source.DescriptorBytes();
            Assert(descriptor.Length == 4 + 2 * 592 && BitConverter.ToUInt32(descriptor, 0) == 2, "FILEGROUPDESCRIPTORW layout");
            Assert(BitConverter.ToUInt32(descriptor, 4 + 36) == 0x10 && BitConverter.ToUInt32(descriptor, 4 + 592 + 68) == data.Length, "directory attributes and file size");
            Assert(Encoding.Unicode.GetString(descriptor, 4 + 592 + 72, "root\\generated.bin".Length * 2) == "root\\generated.bin", "descriptor Unicode name");
            Assert(fetched == 0, "descriptor must not fetch content");
            System.Runtime.InteropServices.ComTypes.FORMATETC format = DragFormats.Format(DragFormats.Descriptor, System.Runtime.InteropServices.ComTypes.TYMED.TYMED_HGLOBAL, -1);
            IntPtr objectInterface = Marshal.GetComInterfaceForObject(source, typeof(System.Runtime.InteropServices.ComTypes.IDataObject));
            System.Runtime.InteropServices.ComTypes.STGMEDIUM medium = new System.Runtime.InteropServices.ComTypes.STGMEDIUM();
            try
            {
                IntPtr function = Marshal.ReadIntPtr(Marshal.ReadIntPtr(objectInterface), 3 * IntPtr.Size);
                NativeGetData get = (NativeGetData)Marshal.GetDelegateForFunctionPointer(function, typeof(NativeGetData));
                Assert(get(objectInterface, ref format, out medium) == 0, "native IDataObject vtable");
                IntPtr memory = DragFormats.GlobalLock(medium.unionmember);
                try { Assert(Marshal.ReadInt32(memory) == 2, "native HGLOBAL descriptor"); }
                finally { DragFormats.GlobalUnlock(medium.unionmember); }
            }
            finally { if (medium.unionmember != IntPtr.Zero) DragFormats.ReleaseStgMedium(ref medium); Marshal.Release(objectInterface); }
            format = DragFormats.Format(DragFormats.Contents, System.Runtime.InteropServices.ComTypes.TYMED.TYMED_ISTREAM, 0);
            Assert(source.QueryGetData(ref format) < 0, "directory is not a file stream");
            format.lindex = 1; source.GetData(ref format, out medium);
            IntPtr output = Marshal.AllocHGlobal(data.Length), count = Marshal.AllocHGlobal(4);
            try
            {
                IntPtr function = Marshal.ReadIntPtr(Marshal.ReadIntPtr(medium.unionmember), 3 * IntPtr.Size);
                NativeStreamRead read = (NativeStreamRead)Marshal.GetDelegateForFunctionPointer(function, typeof(NativeStreamRead));
                Assert(read(medium.unionmember, output, (uint)data.Length, count) == 0 && Marshal.ReadInt32(count) == data.Length, "native IStream vtable");
                byte[] actual = new byte[data.Length]; Marshal.Copy(output, actual, 0, actual.Length); Assert(Sha(actual) == Sha(data) && fetched == 1, "native verified contents");
            }
            finally { Marshal.FreeHGlobal(output); Marshal.FreeHGlobal(count); DragFormats.ReleaseStgMedium(ref medium); }
            System.Runtime.InteropServices.ComTypes.IEnumFORMATETC formats = source.EnumFormatEtc(System.Runtime.InteropServices.ComTypes.DATADIR.DATADIR_GET);
            System.Runtime.InteropServices.ComTypes.FORMATETC[] page = new System.Runtime.InteropServices.ComTypes.FORMATETC[2]; int[] got = new int[1];
            Assert(formats.Next(2, page, got) == 0 && got[0] == 2, "format enumeration first page");
            Assert(formats.Next(2, page, got) == 1 && got[0] == 1, "format enumeration EOF");
            bool asyncMode; Assert(source.GetAsyncMode(out asyncMode) == 0 && !asyncMode, "default synchronous mode");
            Assert(source.SetAsyncMode(true) == 0 && source.StartOperation(null) == 0, "async start");
            source.DropReturned(0x40100, 1); Assert(!source.ExtractionTerminal, "drop return is not async completion");
            Assert(source.EndOperation(0, null, 1) == 0 && source.ExtractionTerminal, "async COPY completion");
            Assert(source.EndOperation(0, null, 1) < 0, "duplicate async completion");
        }
        now = 0;
        using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { Entry(data) }, delegate { return (byte[])data.Clone(); }, delegate { return true; }, delegate { return now; }))
        using (NativeDragDataObject neverEnds = new NativeDragDataObject(lease))
        {
            Assert(neverEnds.SetAsyncMode(true) == 0 && neverEnds.StartOperation(null) == 0, "never-ending target start"); neverEnds.DropReturned(0x40100, 1);
            for (now = 3000; now < DragLease.AbsoluteMs; now += 3000) Assert(lease.Beat(Scope(Gesture)), "active extraction heartbeat");
            Assert(neverEnds.ExtractionTerminal, "target cannot hold absolute deadline indefinitely"); now = 0;
            Assert(neverEnds.EndOperation(0, null, 1) < 0, "late completion cannot reactivate");
        }
        now = 0;
        using (DragLease lease = new DragLease(Scope(Gesture), new DragEntry[] { Entry(data) }, delegate { return (byte[])data.Clone(); }, delegate { return true; }, delegate { return now; }))
        using (NativeDragDataObject move = new NativeDragDataObject(lease))
        {
            Assert(move.SetAsyncMode(true) == 0 && move.StartOperation(null) == 0, "invalid effect start");
            Assert(move.EndOperation(0, null, 2) < 0 && move.ExtractionTerminal, "MOVE is refused");
        }
    }
    private static void Packets()
    {
        string nonce = new String('a',64);
        string begin = "{\"type\":\"begin\",\"nonce\":\"" + nonce + "\",\"seq\":0,\"owner\":\"11111111-1111-4111-8111-111111111111\",\"origin\":\"https://soda.example\",\"gesture\":\"" + Gesture + "\",\"generation\":\"33333333-3333-4333-8333-333333333333\",\"count\":1,\"bytes\":1}\n";
        string entry = "{\"type\":\"entry\",\"nonce\":\"" + nonce + "\",\"seq\":1,\"index\":0,\"name\":\"a\",\"directory\":false,\"bytes\":1,\"sha256\":\"" + Sha(new byte[]{1}) + "\"}\n";
        string seal = "{\"type\":\"seal\",\"nonce\":\"" + nonce + "\",\"seq\":2}\n";
        using (System.IO.MemoryStream input = new System.IO.MemoryStream(Encoding.UTF8.GetBytes(begin + entry + seal)))
        {
            DragPacketReader reader = new DragPacketReader(input,nonce); Assert(reader.Read().Type == "begin" && reader.Read().Type == "entry" && reader.Read().Type == "seal", "private packet states"); Assert(reader.Manifest.Count == 1 && reader.Scope.Origin == "https://soda.example", "private packet scope"); Assert(reader.Read() == null, "clean private EOF"); Reject(delegate{reader.Read();}, "EOF cannot reactivate");
        }
        foreach(string bad in new string[]{begin.Replace("\"seq\":0","\"seq\":1"),begin.Replace(nonce,new String('b',64)),begin.Replace("\"bytes\":1","\"bytes\":1.5"),begin.Replace("\"count\":1","\"count\":1001"),begin.TrimEnd('\n'),new String(' ',98304)+begin})
        {
            using(System.IO.MemoryStream input=new System.IO.MemoryStream(Encoding.UTF8.GetBytes(bad))){DragPacketReader reader=new DragPacketReader(input,nonce);Reject(delegate{reader.Read();},"bad native frame accepted");Reject(delegate{reader.Read();},"bad frame did not revoke channel");}
        }
        string bytes="{\"type\":\"bytes\",\"nonce\":\""+nonce+"\",\"seq\":3,\"request\":\"55555555-5555-4555-8555-555555555555\",\"index\":0,\"offset\":0,\"data\":\"AQ==\"}\n";
        string end="{\"type\":\"end\",\"nonce\":\""+nonce+"\",\"seq\":4,\"request\":\"55555555-5555-4555-8555-555555555555\",\"index\":0}\n";
        using(System.IO.MemoryStream input=new System.IO.MemoryStream(Encoding.UTF8.GetBytes(begin+entry+seal+bytes+end))){DragPacketReader reader=new DragPacketReader(input,nonce);reader.Read();reader.Read();reader.Read();DragPacket packet=reader.Read();Assert(packet.Type=="bytes"&&packet.Data.Length==1&&packet.Data[0]==1,"native data packet");Assert(reader.Read().Type=="end","native end packet");}
        foreach(string bad in new string[]{bytes.Replace("AQ==","AR=="),bytes.Replace("AQ==","AQ== "),bytes.Replace("AQ==","?"),bytes.Replace("\"index\":0","\"index\":1"),bytes.Replace("\"offset\":0","\"offset\":1"),bytes.Replace("\"seq\":3","\"seq\":2"),bytes.Replace("55555555-5555-4555-8555-555555555555","bad")})
        using(System.IO.MemoryStream input=new System.IO.MemoryStream(Encoding.UTF8.GetBytes(begin+entry+seal+bad))){DragPacketReader reader=new DragPacketReader(input,nonce);reader.Read();reader.Read();reader.Read();Reject(delegate{reader.Read();},"invalid phase2 native packet");Reject(delegate{reader.Read();},"phase2 failure not terminal");}
        using(System.IO.MemoryStream input=new System.IO.MemoryStream(new byte[]{0xc3,0x28,10})){DragPacketReader reader=new DragPacketReader(input,nonce);Reject(delegate{reader.Read();},"invalid UTF8 accepted");}
        using(System.IO.MemoryStream input=new System.IO.MemoryStream(Encoding.UTF8.GetBytes(begin+seal.Replace("\"seq\":2","\"seq\":1")))){DragPacketReader reader=new DragPacketReader(input,nonce);reader.Read();Reject(delegate{reader.Read();},"incomplete native manifest");}
    }
    private sealed class WriteTarget : IDragStream
    {
        internal readonly System.IO.MemoryStream Bytes = new System.IO.MemoryStream();
        internal Action AfterWrite;
        private readonly int mode; private readonly DragLease lease;
        internal WriteTarget(int mode, DragLease lease) { this.mode = mode; this.lease = lease; }
        public int Write(IntPtr data, uint count, IntPtr written)
        {
            if(count>65536)return unchecked((int)0x80070057);
            int size=mode==1?(int)count-1:mode==2?0:(int)count;
            byte[] chunk=new byte[size];Marshal.Copy(data,chunk,0,size);Bytes.Write(chunk,0,size);Marshal.WriteInt32(written,size);
            if(AfterWrite!=null)AfterWrite();
            if(mode==3)lease.Cancel();return mode==2?unchecked((int)0x8003001d):0;
        }
        public int Read(IntPtr d,uint c,IntPtr r){return -1;}
        public int Seek(long m,uint o,IntPtr p){return -1;}
        public int SetSize(ulong s){return -1;}
        public int CopyTo(IDragStream t,ulong c,IntPtr r,IntPtr w){return -1;}
        public int Commit(uint f){return -1;}
        public int Revert(){return -1;}
        public int LockRegion(ulong o,ulong c,uint t){return -1;}
        public int UnlockRegion(ulong o,ulong c,uint t){return -1;}
        public int Stat(out System.Runtime.InteropServices.ComTypes.STATSTG s,uint f){s=new System.Runtime.InteropServices.ComTypes.STATSTG();return -1;}
        public int Clone(out IDragStream s){s=null;return -1;}
    }
    private static void CopyTargets()
    {
        byte[] data=new byte[70000];for(int i=0;i<data.Length;i++)data[i]=(byte)(i%251);
        foreach(int mode in new int[]{0,1,2,3})
        using(DragLease lease=new DragLease(Scope(Gesture),new DragEntry[]{Entry(data)},delegate{return (byte[])data.Clone();},delegate{return true;},delegate{return 0;}))
        {
            NativeDragStream source=new NativeDragStream(lease,0,0);WriteTarget target=new WriteTarget(mode,lease);IntPtr read=Marshal.AllocHGlobal(8),written=Marshal.AllocHGlobal(8);
            try
            {
                int result=source.CopyTo(target,UInt64.MaxValue,read,written);long got=Marshal.ReadInt64(read),sent=Marshal.ReadInt64(written);
                if(mode==0)Assert(result==1&&got==data.Length&&sent==data.Length&&Sha(target.Bytes.ToArray())==Sha(data),"CopyTo exact bytes and 64bit counts");
                if(mode==1)Assert(result<0&&got==65536&&sent==65535,"CopyTo partial write");
                if(mode==2)Assert(result<0&&got==65536&&sent==0,"CopyTo write failure");
                if(mode==3)Assert(result<0&&got==65536&&sent==65536&&target.Bytes.Length==65536,"CopyTo cancellation in target Write");
                Assert(lease.WaitIdle(0),"CopyTo retained an active call");
            }
            finally{Marshal.FreeHGlobal(read);Marshal.FreeHGlobal(written);target.Bytes.Dispose();}
        }
    }
    private static void FinalCopyAuthority()
    {
        foreach(int size in new int[]{1,65536,70000})
        foreach(int revoke in new int[]{0,1,2})
        {
            byte[] data=new byte[size];long now=0;bool authorized=true;
            using(DragLease lease=new DragLease(Scope(Gesture),new DragEntry[]{Entry(data)},delegate{return (byte[])data.Clone();},delegate{return authorized;},delegate{return now;}))
            {
                WriteTarget target=new WriteTarget(0,lease);
                target.AfterWrite=delegate { if(target.Bytes.Length==size) { if(revoke==0)lease.Cancel();else if(revoke==1)authorized=false;else now=900000; } };
                IntPtr read=Marshal.AllocHGlobal(8),written=Marshal.AllocHGlobal(8);
                try
                {
                    int result=new NativeDragStream(lease,0,0).CopyTo(target,(ulong)size,read,written);
                    Assert(result<0&&Marshal.ReadInt64(read)==size&&Marshal.ReadInt64(written)==size&&target.Bytes.Length==size,"CopyTo final Write revocation must fail");
                    Assert(lease.WaitIdle(0),"final CopyTo revocation retained a call");
                    long before=target.Bytes.Length;
                    Assert(new NativeDragStream(lease,0,0).CopyTo(target,1,read,written)<0&&target.Bytes.Length==before,"revoked final CopyTo published again");
                }
                catch(COMException) { Assert(lease.WaitIdle(0),"revoked stream retained copy"); }
                finally {Marshal.FreeHGlobal(read);Marshal.FreeHGlobal(written);target.Bytes.Dispose();}
            }
        }
    }
    private static void ObjectBounds()
    {
        byte[] data=new byte[]{1};
        using(DragLease lease=new DragLease(Scope(Gesture),new DragEntry[]{Entry(data)},delegate{return new byte[]{1};},delegate{return true;},delegate{return 0;}))
        {
            for(int i=0;i<4096;i++)new NativeDragStream(lease,0,0);
            Reject(delegate{new NativeDragStream(lease,0,0);},"native stream creation budget");
        }
        using(DragLease lease=new DragLease(Scope(Gesture),new DragEntry[]{Entry(data)},delegate{return new byte[]{1};},delegate{return true;},delegate{return 0;}))
        using(NativeDragDataObject source=new NativeDragDataObject(lease))
        {
            System.Runtime.InteropServices.ComTypes.FORMATETC format=DragFormats.Format(DragFormats.Preferred,System.Runtime.InteropServices.ComTypes.TYMED.TYMED_HGLOBAL,-1);
            for(int i=0;i<32;i++){System.Runtime.InteropServices.ComTypes.STGMEDIUM medium;source.GetData(ref format,out medium);DragFormats.ReleaseStgMedium(ref medium);}
            Reject(delegate{System.Runtime.InteropServices.ComTypes.STGMEDIUM medium;source.GetData(ref format,out medium);},"native metadata allocation budget");
        }
    }
    internal static int Main()
    {
        try { Basic(); Names(); Authority(); AuthorityBoundary(); Integrity(); PendingCancellation(); Streams(); DataObjects(); Packets(); CopyTargets(); FinalCopyAuthority(); ObjectBounds(); Console.WriteLine("native_drag_lease_generated_bounds_scope_sha_cancel_and_deadline_passed"); return 0; }
        catch (Exception e) { Console.Error.WriteLine(e); return 1; }
    }
}
