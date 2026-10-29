// Read-only COM stream. Every publication goes through the current verified lease.
using System;
using System.Runtime.InteropServices;
using STATSTG = System.Runtime.InteropServices.ComTypes.STATSTG;

namespace Sodashitsu.NativeDrag
{
    [ComVisible(true), Guid("0c733a30-2a1c-11ce-ade5-00aa0044773d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDragSequentialStream
    {
        [PreserveSig] int Read(IntPtr data, uint count, IntPtr read);
        [PreserveSig] int Write(IntPtr data, uint count, IntPtr written);
    }
    // Flat vtable includes ISequentialStream; the class also exports its separate IID.
    [ComVisible(true), Guid("0000000c-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDragStream
    {
        [PreserveSig] int Read(IntPtr data, uint count, IntPtr read);
        [PreserveSig] int Write(IntPtr data, uint count, IntPtr written);
        [PreserveSig] int Seek(long move, uint origin, IntPtr position);
        [PreserveSig] int SetSize(ulong size);
        [PreserveSig] int CopyTo([MarshalAs(UnmanagedType.Interface)] IDragStream target, ulong count, IntPtr read, IntPtr written);
        [PreserveSig] int Commit(uint flags);
        [PreserveSig] int Revert();
        [PreserveSig] int LockRegion(ulong offset, ulong count, uint type);
        [PreserveSig] int UnlockRegion(ulong offset, ulong count, uint type);
        [PreserveSig] int Stat(out STATSTG stat, uint flags);
        [PreserveSig] int Clone([MarshalAs(UnmanagedType.Interface)] out IDragStream stream);
    }
    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class NativeDragStream : IDragStream, IDragSequentialStream
    {
        private const int Invalid = unchecked((int)0x80030001), Denied = unchecked((int)0x80030005), Pointer = unchecked((int)0x80004003), ReadFault = unchecked((int)0x8003001e);
        private readonly DragLease lease;
        private readonly int index;
        private readonly object gate = new object();
        private long at;
        internal NativeDragStream(DragLease lease, int index, long offset)
        {
            DragEntry entry = lease.Entry(index);
            if (entry.Directory || offset < 0 || offset > entry.Bytes) throw new ArgumentException("Invalid native drag stream");
            lease.ReserveStream(); this.lease = lease; this.index = index; at = offset;
        }
        private static int Error(Exception error)
        {
            COMException com = error as COMException;
            if (com != null) return com.ErrorCode;
            if (error is ArgumentException || error is OverflowException) return Invalid;
            return ReadFault;
        }
        public int Read(IntPtr data, uint count, IntPtr read)
        {
            if (read != IntPtr.Zero) Marshal.WriteInt32(read, 0);
            try
            {
                lock (gate)
                {
                    int size = lease.Copy(index, at, count, data); at = checked(at + size);
                    if (read != IntPtr.Zero) Marshal.WriteInt32(read, size);
                    return (ulong)size < count ? 1 : 0;
                }
            }
            catch (Exception e) { return Error(e); }
        }
        public int Write(IntPtr data, uint count, IntPtr written)
        {
            if (written != IntPtr.Zero) Marshal.WriteInt32(written, 0);
            return Denied;
        }
        public int Seek(long move, uint origin, IntPtr position)
        {
            try
            {
                lock (gate)
                {
                    long basis;
                    if (origin == 0) basis = 0;
                    else if (origin == 1) basis = at;
                    else if (origin == 2) basis = lease.Entry(index).Bytes;
                    else return Invalid;
                    long next = checked(basis + move);
                    if (next < 0 || next > lease.Entry(index).Bytes) return Invalid;
                    at = next; if (position != IntPtr.Zero) Marshal.WriteInt64(position, at); return 0;
                }
            }
            catch (Exception e) { return Error(e); }
        }
        public int SetSize(ulong size) { return Denied; }
        public int CopyTo(IDragStream target, ulong count, IntPtr read, IntPtr written)
        {
            if (read != IntPtr.Zero) Marshal.WriteInt64(read, 0);
            if (written != IntPtr.Zero) Marshal.WriteInt64(written, 0);
            if (target == null) return Pointer;
            IntPtr buffer = IntPtr.Zero, got = IntPtr.Zero, sent = IntPtr.Zero; long totalRead = 0, totalWritten = 0; bool entered = false;
            try
            {
                lease.BeginCopyTo(); entered = true;
                lock (gate)
                {
                    ulong remaining = Math.Min(count, checked((ulong)(lease.Entry(index).Bytes - at)));
                    buffer = Marshal.AllocHGlobal(65536); got = Marshal.AllocHGlobal(4); sent = Marshal.AllocHGlobal(4);
                    while (remaining != 0)
                    {
                        uint chunk = (uint)Math.Min(65536UL, remaining);
                        int result = Read(buffer, chunk, got), bytes = Marshal.ReadInt32(got);
                        if (result < 0) return result;
                        totalRead += bytes; if (read != IntPtr.Zero) Marshal.WriteInt64(read, totalRead);
                        if (bytes == 0) return 1;
                        lease.Validate(); Marshal.WriteInt32(sent, 0);
                        result = target.Write(buffer, (uint)bytes, sent); int copied = Marshal.ReadInt32(sent);
                        if (copied < 0 || copied > bytes) return unchecked((int)0x8003001d);
                        totalWritten += copied; if (written != IntPtr.Zero) Marshal.WriteInt64(written, totalWritten);
                        if (result < 0) return result;
                        if (copied != bytes) return unchecked((int)0x80030070);
                        lease.Validate(); // Target Write can reenter and revoke even on the final chunk.
                        remaining -= (uint)bytes;
                    }
                    return (ulong)totalRead < count ? 1 : 0;
                }
            }
            catch (Exception e) { return Error(e); }
            finally
            {
                if (buffer != IntPtr.Zero) { Marshal.Copy(new byte[65536], 0, buffer, 65536); Marshal.FreeHGlobal(buffer); }
                if (got != IntPtr.Zero) Marshal.FreeHGlobal(got);
                if (sent != IntPtr.Zero) Marshal.FreeHGlobal(sent);
                if (entered) lease.EndCopyTo();
            }
        }
        public int Commit(uint flags) { return Denied; }
        public int Revert() { return Denied; }
        public int LockRegion(ulong offset, ulong count, uint type) { return Invalid; }
        public int UnlockRegion(ulong offset, ulong count, uint type) { return Invalid; }
        public int Stat(out STATSTG stat, uint flags)
        {
            stat = new STATSTG();
            try
            {
                if (flags > 1) return Invalid;
                DragEntry entry = lease.Entry(index); stat.type = 2; stat.cbSize = entry.Bytes; stat.grfMode = 0;
                if (flags == 0) stat.pwcsName = entry.Name; return 0;
            }
            catch (Exception e) { return Error(e); }
        }
        public int Clone(out IDragStream stream)
        {
            stream = null;
            try { lock (gate) { stream = new NativeDragStream(lease, index, at); return 0; } }
            catch (Exception e) { return Error(e); }
        }
    }
}
