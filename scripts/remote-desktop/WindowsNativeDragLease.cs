// Private native drag kernel. No desktop/input/clipboard/service calls here.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace Sodashitsu.NativeDrag
{
    internal sealed class DragScope
    {
        internal readonly string Owner, Origin, Gesture, Generation;
        internal DragScope(string owner, string origin, string gesture, string generation)
        {
            Guid parsed; Uri url;
            if (!Guid.TryParseExact(owner, "D", out parsed) || !Guid.TryParseExact(gesture, "D", out parsed) ||
                !Guid.TryParseExact(generation, "D", out parsed) || origin == null || origin.Length > 2048 ||
                !Uri.TryCreate(origin, UriKind.Absolute, out url) || (url.Scheme != "https" && url.Scheme != "http") ||
                url.UserInfo.Length != 0 || url.GetLeftPart(UriPartial.Authority) != origin)
                throw new ArgumentException("Invalid native drag scope");
            Owner = owner; Origin = origin; Gesture = gesture; Generation = generation;
        }
        internal bool Matches(DragScope other)
        {
            return other != null && Owner == other.Owner && Origin == other.Origin && Gesture == other.Gesture && Generation == other.Generation;
        }
    }

    internal sealed class DragEntry
    {
        internal const string EmptySha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        internal readonly string Name, Sha256;
        internal readonly long Bytes;
        internal readonly bool Directory;
        internal DragEntry(string name, bool directory, long bytes, string sha256)
        {
            if (name == null || name.Length == 0 || name.Length >= 260 || bytes < 0 || bytes > DragLease.MaxBytes)
                throw new ArgumentException("Invalid native drag entry");
            Name = name.Replace('/', '\\');
            string[] parts = Name.Split('\\');
            if (parts.Length > 32) throw new ArgumentException("Native drag path depth");
            foreach (string part in parts)
            {
                if (part.Length == 0 || part == "." || part == ".." || part.EndsWith(".", StringComparison.Ordinal) || part.EndsWith(" ", StringComparison.Ordinal) ||
                    Regex.IsMatch(part, @"[<>:""|?*]", RegexOptions.CultureInvariant) ||
                    Regex.IsMatch(part, @"^(CON|PRN|AUX|NUL|COM[1-9\u00b9\u00b2\u00b3]|LPT[1-9\u00b9\u00b2\u00b3])(\.|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
                    throw new ArgumentException("Invalid native drag path");
                for (int i = 0; i < part.Length; i++)
                {
                    char c = part[i];
                    if (Char.IsControl(c) || Char.IsLowSurrogate(c)) throw new ArgumentException("Invalid native drag name");
                    if (Char.IsHighSurrogate(c))
                    {
                        if (++i >= part.Length || !Char.IsLowSurrogate(part[i])) throw new ArgumentException("Invalid native drag name");
                    }
                }
            }
            if (directory && bytes != 0) throw new ArgumentException("Directory contents are not a stream");
            Sha256 = directory ? EmptySha : sha256;
            if (Sha256 == null || !Regex.IsMatch(Sha256, @"\A[a-f0-9]{64}\z", RegexOptions.CultureInvariant))
                throw new ArgumentException("Invalid native drag SHA");
            if (!directory && bytes == 0 && Sha256 != EmptySha) throw new ArgumentException("Invalid empty native file SHA");
            Directory = directory; Bytes = bytes;
        }
    }

    internal sealed class DragLease : IDisposable
    {
        internal const long MaxBytes = 104857600;
        internal const int MaxEntries = 1000, HeartbeatMs = 5000, AbsoluteMs = 900000;
        private readonly object gate = new object();
        private readonly object[] fetching;
        private readonly byte[][] cache;
        private readonly DragEntry[] entries;
        private readonly Func<int, byte[]> fetch;
        private readonly Func<bool> authority;
        private readonly Func<long> clock;
        private readonly DragScope scope;
        private readonly long born;
        private long lastBeat, observed;
        private bool active = true;
        private int pending, readers, streams, copies;
        internal void BeginCopyTo() { lock (gate) { Check(); if (copies >= 16) throw new COMException("Native copy limit", unchecked((int)0x80030021)); copies++; } }
        internal void EndCopyTo() { lock (gate) { copies--; Monitor.PulseAll(gate); } }
        internal void ReserveStream() { lock (gate) { Check(); if (streams >= 4096) throw new COMException("Native drag stream limit", unchecked((int)0x80030008)); streams++; } }
        // fetch must be a finite cancellable IPC adapter: 5s per chunk, absolute operation deadline.
        // WaitIdle(false) is NOT exit proof; the host retains its slot until native process exit.
        internal DragLease(DragScope scope, IList<DragEntry> manifest, Func<int, byte[]> fetch, Func<bool> authority, Func<long> clock)
        {
            if (scope == null || manifest == null || manifest.Count == 0 || manifest.Count > MaxEntries || fetch == null || authority == null || clock == null)
                throw new ArgumentException("Invalid native drag lease");
            this.scope = scope; this.fetch = fetch; this.authority = authority; this.clock = clock;
            born = clock(); lastBeat = born; observed = born;
            if (born < 0) throw new ArgumentException("Invalid monotonic clock");
            entries = new DragEntry[manifest.Count]; fetching = new object[manifest.Count]; cache = new byte[manifest.Count][];
            Dictionary<string, bool> names = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
            long total = 0;
            for (int i = 0; i < manifest.Count; i++)
            {
                DragEntry entry = manifest[i];
                if (entry == null) throw new ArgumentException("Missing native drag entry");
                string key = entry.Name.Normalize(NormalizationForm.FormC);
                if (names.ContainsKey(key)) throw new ArgumentException("Duplicate native drag entry");
                names.Add(key, entry.Directory); entries[i] = entry; fetching[i] = new object();
                total = checked(total + entry.Bytes);
                if (total > MaxBytes) throw new ArgumentException("Native drag total limit");
            }
            foreach (DragEntry entry in entries)
            {
                int at = entry.Name.LastIndexOf('\\');
                while (at >= 0)
                {
                    string parent = entry.Name.Substring(0, at).Normalize(NormalizationForm.FormC); bool directory;
                    if (!names.TryGetValue(parent, out directory) || !directory) throw new ArgumentException("Missing native drag directory");
                    at = parent.LastIndexOf('\\');
                }
            }
        }
        private long ReadTime()
        {
            long now;
            try { now = clock(); }
            catch { CancelCore(); throw new COMException("Native drag clock unavailable", unchecked((int)0x80030102)); }
            if (now < born || now < observed) { CancelCore(); throw new COMException("Native drag clock invalid", unchecked((int)0x80030102)); }
            observed = now; return now;
        }
        private long Check()
        {
            ReadTime(); bool allowed = false;
            try { allowed = authority(); } catch { }
            long now = ReadTime();
            if (!active || now < lastBeat || now - born >= AbsoluteMs || now - lastBeat >= HeartbeatMs || !allowed)
            {
                CancelCore();
                throw new COMException("Native drag authority ended", unchecked((int)0x80030102));
            }
            return now;
        }
        internal void Validate() { lock (gate) Check(); }
        internal bool Beat(DragScope expected)
        {
            lock (gate)
            {
                if (!scope.Matches(expected)) return false;
                try { lastBeat = Check(); return true; } catch (COMException) { return false; }
            }
        }
        internal int Count { get { lock (gate) { Check(); return entries.Length; } } }
        internal DragEntry Entry(int index)
        {
            lock (gate) { Check(); if (index < 0 || index >= entries.Length) throw new ArgumentOutOfRangeException("index"); return entries[index]; }
        }
        private byte[] Verified(int index)
        {
            DragEntry entry = Entry(index);
            if (entry.Directory) throw new COMException("Directory has no contents", unchecked((int)0x80040064));
            lock (fetching[index])
            {
                lock (gate) { Check(); if (cache[index] != null) return cache[index]; pending++; }
                byte[] data = null; bool adopted = false;
                try
                {
                    data = fetch(index);
                    if (data == null || data.LongLength != entry.Bytes) throw new InvalidOperationException("Native drag size mismatch");
                    string actual;
                    using (SHA256 hash = SHA256.Create()) actual = BitConverter.ToString(hash.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
                    if (!String.Equals(actual, entry.Sha256, StringComparison.Ordinal)) throw new InvalidOperationException("Native drag SHA mismatch");
                    lock (gate) { Check(); cache[index] = data; adopted = true; return data; }
                }
                catch { Cancel(); throw; }
                finally
                {
                    if (!adopted && data != null) Array.Clear(data, 0, data.Length);
                    lock (gate) { pending--; Monitor.PulseAll(gate); }
                }
            }
        }
        internal int Copy(int index, long offset, uint requested, IntPtr destination)
        {
            lock (gate) { Check(); if (readers >= 16) throw new COMException("Native drag read limit", unchecked((int)0x80030021)); readers++; }
            try { return CopyCore(index, offset, requested, destination); }
            finally { lock (gate) { readers--; Monitor.PulseAll(gate); } }
        }
        private int CopyCore(int index, long offset, uint requested, IntPtr destination)
        {
            DragEntry entry = Entry(index);
            if (entry.Directory) throw new COMException("Directory has no contents", unchecked((int)0x80040064));
            if (offset < 0 || offset > entry.Bytes || (requested != 0 && destination == IntPtr.Zero)) throw new ArgumentException("Invalid native read");
            int bytes = checked((int)Math.Min((long)requested, entry.Bytes - offset));
            if (bytes == 0) { Validate(); return 0; }
            byte[] data = Verified(index); int done = 0;
            while (done < bytes)
            {
                int length = Math.Min(65536, bytes - done);
                lock (gate) { Check(); Marshal.Copy(data, checked((int)offset + done), IntPtr.Add(destination, done), length); }
                done += length;
            }
            return done;
        }
        private void CancelCore()
        {
            active = false;
            for (int i = 0; i < cache.Length; i++) if (cache[i] != null) { Array.Clear(cache[i], 0, cache[i].Length); cache[i] = null; }
            Monitor.PulseAll(gate);
        }
        internal void Cancel() { lock (gate) CancelCore(); }
        internal bool WaitIdle(int milliseconds)
        {
            if (milliseconds < 0 || milliseconds > 5000) throw new ArgumentOutOfRangeException("milliseconds");
            Stopwatch elapsed = Stopwatch.StartNew();
            lock (gate)
            {
                while (pending != 0 || readers != 0 || copies != 0)
                {
                    int left = (int)Math.Max(0, milliseconds - elapsed.ElapsedMilliseconds);
                    if (left == 0 || !Monitor.Wait(gate, left)) return pending == 0 && readers == 0 && copies == 0;
                }
                return true;
            }
        }
        public void Dispose() { Cancel(); }
    }
}
