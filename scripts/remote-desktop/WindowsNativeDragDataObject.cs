using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace Sodashitsu.NativeDrag
{
    [ComVisible(true), Guid("3d8b0590-f691-11d2-8ea9-006097df5bd4"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IDragAsyncCapability
    {
        [PreserveSig] int SetAsyncMode([MarshalAs(UnmanagedType.Bool)] bool enabled);
        [PreserveSig] int GetAsyncMode([MarshalAs(UnmanagedType.Bool)] out bool enabled);
        [PreserveSig] int StartOperation(IBindCtx reserved);
        [PreserveSig] int InOperation([MarshalAs(UnmanagedType.Bool)] out bool active);
        [PreserveSig] int EndOperation(int result, IBindCtx reserved, uint effects);
    }
    internal static class DragFormats
    {
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern uint RegisterClipboardFormat(string name);
        internal static readonly short Descriptor = Register("FileGroupDescriptorW"), Contents = Register("FileContents"), Preferred = Register("Preferred DropEffect");
        private static short Register(string name) { uint id = RegisterClipboardFormat(name); if (id == 0 || id > UInt16.MaxValue) throw new InvalidOperationException("Native drag format unavailable"); return unchecked((short)id); }
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern IntPtr GlobalAlloc(uint flags, UIntPtr bytes);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern IntPtr GlobalLock(IntPtr memory);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GlobalUnlock(IntPtr memory);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern IntPtr GlobalFree(IntPtr memory);
        [DllImport("ole32.dll")] internal static extern void ReleaseStgMedium(ref STGMEDIUM medium);
        internal static STGMEDIUM Memory(byte[] bytes, DragLease lease)
        {
            IntPtr memory = GlobalAlloc(0x42, (UIntPtr)(uint)bytes.Length);
            if (memory == IntPtr.Zero) throw new OutOfMemoryException();
            try
            {
                IntPtr pointer = GlobalLock(memory); if (pointer == IntPtr.Zero) throw new InvalidOperationException("Native drag buffer unavailable");
                try { lease.Validate(); Marshal.Copy(bytes, 0, pointer, bytes.Length); }
                finally { GlobalUnlock(memory); }
                lease.Validate(); STGMEDIUM result = new STGMEDIUM(); result.tymed = TYMED.TYMED_HGLOBAL; result.unionmember = memory; memory = IntPtr.Zero; return result;
            }
            finally { if (memory != IntPtr.Zero) GlobalFree(memory); }
        }
        internal static FORMATETC Format(short id, TYMED medium, int index)
        {
            FORMATETC format = new FORMATETC(); format.cfFormat = id; format.tymed = medium; format.dwAspect = DVASPECT.DVASPECT_CONTENT; format.lindex = index; return format;
        }
    }
    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class NativeDragDataObject : IDataObject, IDragAsyncCapability, IDisposable
    {
        private const int FormatError = unchecked((int)0x80040064), IndexError = unchecked((int)0x80040068), MediumError = unchecked((int)0x80040069), AspectError = unchecked((int)0x8004006b);
        private const int Unexpected = unchecked((int)0x8000ffff), Aborted = unchecked((int)0x80004004), NotImplemented = unchecked((int)0x80004001), Advisory = unchecked((int)0x80040003);
        private readonly DragLease lease;
        private readonly object gate = new object();
        private bool asyncMode, started, ended, returned, cancelled;
        private IntPtr asyncPin;
        private int metadataRequests;
        internal NativeDragDataObject(DragLease lease) { this.lease = lease; lease.Validate(); }
        private static int Error(Exception e) { COMException com = e as COMException; return com != null ? com.ErrorCode : Aborted; }
        private void Validate() { lease.Validate(); lock (gate) { if (cancelled) throw new COMException("Native drag ended", Aborted); } }
        private IntPtr DetachPin() { IntPtr pin = asyncPin; asyncPin = IntPtr.Zero; return pin; }
        private static void ReleasePin(IntPtr pin) { if (pin != IntPtr.Zero) Marshal.Release(pin); }
        public void Dispose()
        {
            IntPtr pin; lock (gate) { cancelled = true; pin = DetachPin(); }
            lease.Cancel(); ReleasePin(pin);
        }
        // The host must still wait for I/O drain AND native process exit before freeing its PC-wide slot.
        internal bool ExtractionTerminal
        {
            get
            {
                try { Validate(); } catch { Dispose(); return true; }
                lock (gate) return cancelled || (returned && (!started || ended));
            }
        }
        internal void DropReturned(int result, uint effects)
        {
            IntPtr pin = IntPtr.Zero;
            if ((result != 0 && result != 0x40100) || effects != 1) { Dispose(); return; }
            try
            {
                Validate(); lock (gate) { if (returned) throw new COMException("Duplicate drag result", Unexpected); returned = true; if (!started || ended) pin = DetachPin(); }
                ReleasePin(pin);
            }
            catch { Dispose(); }
        }
        public int SetAsyncMode(bool enabled)
        {
            IntPtr release = IntPtr.Zero;
            try
            {
                Validate(); lock (gate)
                {
                    if (started || returned || ended || cancelled) return Unexpected;
                    if (enabled && asyncPin == IntPtr.Zero) asyncPin = Marshal.GetComInterfaceForObject(this, typeof(IDragAsyncCapability));
                    if (!enabled) release = DetachPin(); asyncMode = enabled;
                }
                ReleasePin(release); return 0;
            }
            catch (Exception e) { Dispose(); return Error(e); }
        }
        public int GetAsyncMode(out bool enabled)
        {
            enabled = false;
            try { Validate(); lock (gate) enabled = asyncMode; return 0; }
            catch (Exception e) { Dispose(); return Error(e); }
        }
        public int StartOperation(IBindCtx reserved)
        {
            if (reserved != null) return Unexpected;
            try { Validate(); lock (gate) { if (!asyncMode || started || returned || ended || cancelled) return Unexpected; started = true; } return 0; }
            catch (Exception e) { Dispose(); return Error(e); }
        }
        public int InOperation(out bool active)
        {
            active = false;
            try { Validate(); lock (gate) active = started && !ended; return 0; }
            catch (Exception e) { Dispose(); return Error(e); }
        }
        public int EndOperation(int result, IBindCtx reserved, uint effects)
        {
            if (reserved != null) return Unexpected;
            if (result < 0 || effects != 1) { Dispose(); return Aborted; }
            IntPtr release;
            try
            {
                Validate(); lock (gate) { if (!started || ended || cancelled) return Unexpected; ended = true; release = DetachPin(); }
                ReleasePin(release); return 0;
            }
            catch (Exception e) { Dispose(); return Error(e); }
        }
        internal byte[] DescriptorBytes()
        {
            Validate(); int count = lease.Count; byte[] result = new byte[checked(4 + count * 592)];
            Buffer.BlockCopy(BitConverter.GetBytes((uint)count), 0, result, 0, 4);
            for (int i = 0; i < count; i++)
            {
                DragEntry entry = lease.Entry(i); int offset = checked(4 + i * 592);
                uint flags = 0x80000004U | (entry.Directory ? 0U : 0x40U);
                Buffer.BlockCopy(BitConverter.GetBytes(flags), 0, result, offset, 4);
                Buffer.BlockCopy(BitConverter.GetBytes(entry.Directory ? 0x10U : 0x80U), 0, result, offset + 36, 4);
                Buffer.BlockCopy(BitConverter.GetBytes((uint)((ulong)entry.Bytes >> 32)), 0, result, offset + 64, 4);
                Buffer.BlockCopy(BitConverter.GetBytes((uint)entry.Bytes), 0, result, offset + 68, 4);
                byte[] name = Encoding.Unicode.GetBytes(entry.Name); Buffer.BlockCopy(name, 0, result, offset + 72, name.Length);
            }
            Validate(); return result;
        }
        public int QueryGetData(ref FORMATETC format)
        {
            try
            {
                Validate(); if (format.dwAspect != DVASPECT.DVASPECT_CONTENT) return AspectError;
                if (format.ptd != IntPtr.Zero) return FormatError;
                if (format.cfFormat == DragFormats.Descriptor || format.cfFormat == DragFormats.Preferred)
                {
                    if (format.lindex != -1) return IndexError;
                    return (format.tymed & TYMED.TYMED_HGLOBAL) != 0 ? 0 : MediumError;
                }
                if (format.cfFormat == DragFormats.Contents)
                {
                    if (format.lindex < 0 || format.lindex >= lease.Count || lease.Entry(format.lindex).Directory) return IndexError;
                    return (format.tymed & TYMED.TYMED_ISTREAM) != 0 ? 0 : MediumError;
                }
                return FormatError;
            }
            catch (Exception e) { Dispose(); return Error(e); }
        }
        public void GetData(ref FORMATETC format, out STGMEDIUM medium)
        {
            medium = new STGMEDIUM(); int query = QueryGetData(ref format); if (query != 0) throw new COMException("Native drag format unavailable", query);
            if (format.cfFormat == DragFormats.Descriptor || format.cfFormat == DragFormats.Preferred)
            {
                lock(gate) { if(metadataRequests >= 32) throw new COMException("Native drag metadata limit", unchecked((int)0x80030008)); metadataRequests++; }
                medium = DragFormats.Memory(format.cfFormat == DragFormats.Descriptor ? DescriptorBytes() : BitConverter.GetBytes(1U), lease); return;
            }
            IntPtr pointer = Marshal.GetComInterfaceForObject(new NativeDragStream(lease, format.lindex, 0), typeof(IDragStream));
            try { Validate(); medium.tymed = TYMED.TYMED_ISTREAM; medium.unionmember = pointer; pointer = IntPtr.Zero; }
            finally { if (pointer != IntPtr.Zero) Marshal.Release(pointer); }
        }
        public void GetDataHere(ref FORMATETC format, ref STGMEDIUM medium) { throw new COMException("Read-only native drag", NotImplemented); }
        public int GetCanonicalFormatEtc(ref FORMATETC input, out FORMATETC output) { output = input; output.ptd = IntPtr.Zero; return 0x40130; }
        public void SetData(ref FORMATETC format, ref STGMEDIUM medium, bool release) { throw new COMException("Native drag is copy-only", NotImplemented); }
        public IEnumFORMATETC EnumFormatEtc(DATADIR direction)
        {
            Validate(); if (direction != DATADIR.DATADIR_GET) throw new COMException("Read-only native drag", NotImplemented);
            List<FORMATETC> formats = new List<FORMATETC>(); formats.Add(DragFormats.Format(DragFormats.Descriptor, TYMED.TYMED_HGLOBAL, -1));
            for (int i = 0; i < lease.Count; i++) if (!lease.Entry(i).Directory) { formats.Add(DragFormats.Format(DragFormats.Contents, TYMED.TYMED_ISTREAM, i)); break; }
            formats.Add(DragFormats.Format(DragFormats.Preferred, TYMED.TYMED_HGLOBAL, -1)); return new DragFormatEnumerator(formats.ToArray(), 0);
        }
        public int DAdvise(ref FORMATETC format, ADVF flags, IAdviseSink sink, out int connection) { connection = 0; return Advisory; }
        public void DUnadvise(int connection) { throw new COMException("No native drag advisory", Advisory); }
        public int EnumDAdvise(out IEnumSTATDATA data) { data = null; return Advisory; }
    }
    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    internal sealed class DragFormatEnumerator : IEnumFORMATETC
    {
        private readonly FORMATETC[] formats; private int at;
        internal DragFormatEnumerator(FORMATETC[] formats, int at) { this.formats = formats; this.at = at; }
        public int Next(int count, FORMATETC[] output, int[] fetched)
        {
            if (count < 0 || output == null || count > output.Length || (count != 1 && (fetched == null || fetched.Length == 0))) return unchecked((int)0x80070057);
            int done = 0; while (done < count && at < formats.Length) output[done++] = formats[at++];
            if (fetched != null && fetched.Length != 0) fetched[0] = done; return done == count ? 0 : 1;
        }
        public int Skip(int count) { if (count < 0) return unchecked((int)0x80070057); int take = Math.Min(count, formats.Length - at); at += take; return take == count ? 0 : 1; }
        public int Reset() { at = 0; return 0; }
        public void Clone(out IEnumFORMATETC copy) { copy = new DragFormatEnumerator(formats, at); }
    }
}
