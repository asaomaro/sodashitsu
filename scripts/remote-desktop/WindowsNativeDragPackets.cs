// Strict private-pipe framing only. This does not replace the host's gesture/permission checks.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Sodashitsu.NativeDrag
{
    internal sealed class DragPacket
    {
        internal readonly string Type;
        internal readonly int Index;
        internal readonly long Offset;
        internal readonly string Request;
        internal readonly byte[] Data;
        internal DragPacket(string type, int index, long offset, string request, byte[] data) { Type = type; Index = index; Offset = offset; Request = request; Data = data; }
    }
    // Caller owns registered-request correlation, 5s per-chunk I/O, live scope checks and process-exit proof.
    internal sealed class DragPacketReader
    {
        internal const int MaxFrame = 98304;
        private readonly Stream input;
        private readonly string nonce;
        private readonly List<DragEntry> entries = new List<DragEntry>();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = MaxFrame, RecursionLimit = 8 };
        private long sequence, total, declaredBytes;
        private int phase, declaredCount;
        private bool failed;
        private DragScope scope;
        internal DragPacketReader(Stream input, string nonce)
        {
            if (input == null || nonce == null || !Regex.IsMatch(nonce, @"\A[a-f0-9]{64}\z")) throw new ArgumentException("Invalid private drag channel");
            this.input = input; this.nonce = nonce;
        }
        internal DragScope Scope { get { if (scope == null || failed) throw new InvalidOperationException("Drag scope unavailable"); return scope; } }
        internal IList<DragEntry> Manifest { get { if (phase != 2 || failed) throw new InvalidOperationException("Drag manifest unavailable"); return Array.AsReadOnly(entries.ToArray()); } }
        private static void Keys(Dictionary<string, object> value, params string[] names)
        {
            if (value.Count != names.Length) throw new IOException("Invalid drag packet fields");
            foreach (string name in names) if (!value.ContainsKey(name)) throw new IOException("Missing drag packet field");
        }
        private static string Text(Dictionary<string, object> value, string name, int limit)
        {
            object raw; if (!value.TryGetValue(name, out raw) || !(raw is string) || ((string)raw).Length > limit) throw new IOException("Invalid drag text");
            return (string)raw;
        }
        private static long Number(Dictionary<string, object> value, string name, long max)
        {
            object raw; if (!value.TryGetValue(name, out raw) || (!(raw is int) && !(raw is long))) throw new IOException("Invalid drag integer");
            long result = Convert.ToInt64(raw); if (result < 0 || result > max) throw new IOException("Drag integer outside bounds"); return result;
        }
        private static bool Boolean(Dictionary<string, object> value, string name)
        {
            object raw; if (!value.TryGetValue(name, out raw) || !(raw is bool)) throw new IOException("Invalid drag boolean"); return (bool)raw;
        }
        private static bool SameNonce(string actual, string expected)
        {
            if (actual.Length != expected.Length) return false; int difference = 0; for (int i = 0; i < actual.Length; i++) difference |= actual[i] ^ expected[i]; return difference == 0;
        }
        private string Line()
        {
            byte[] bytes = new byte[MaxFrame]; int length = 0;
            try
            {
                for (;;)
                {
                    int next = input.ReadByte();
                    if (next < 0) { if (length == 0) return null; throw new EndOfStreamException("Truncated native drag frame"); }
                    if (next == 10) break;
                    if (length == MaxFrame) throw new IOException("Native drag frame limit"); bytes[length++] = (byte)next;
                }
                if (length > 0 && bytes[length - 1] == 13) length--;
                return new UTF8Encoding(false, true).GetString(bytes, 0, length);
            }
            finally { Array.Clear(bytes, 0, bytes.Length); }
        }
        internal DragPacket Read()
        {
            if (failed || phase == 3) throw new IOException("Native drag channel ended");
            byte[] data = null; bool adopted = false;
            try
            {
                string line = Line(); if (line == null) { failed = true; return null; }
                Dictionary<string, object> value = json.DeserializeObject(line) as Dictionary<string, object>;
                if (value == null || sequence >= 1000000000 || Number(value, "seq", 1000000000) != sequence || !SameNonce(Text(value, "nonce", 64), nonce)) throw new IOException("Invalid drag channel sequence or nonce");
                string type = Text(value, "type", 16), request = null; int index = -1; long offset = 0;
                if (type == "cancel") { Keys(value, "type", "nonce", "seq"); phase = 3; }
                else if (phase == 0 && type == "begin")
                {
                    Keys(value, "type", "nonce", "seq", "owner", "origin", "gesture", "generation", "count", "bytes");
                    DragScope candidate = new DragScope(Text(value, "owner", 36), Text(value, "origin", 2048), Text(value, "gesture", 36), Text(value, "generation", 36));
                    int count = (int)Number(value, "count", DragLease.MaxEntries); if (count == 0) throw new IOException("Empty native drag manifest");
                    declaredBytes = Number(value, "bytes", DragLease.MaxBytes); declaredCount = count; scope = candidate; phase = 1;
                }
                else if (phase == 1 && type == "entry")
                {
                    Keys(value, "type", "nonce", "seq", "index", "name", "directory", "bytes", "sha256");
                    index = (int)Number(value, "index", DragLease.MaxEntries - 1); if (index != entries.Count || entries.Count >= declaredCount) throw new IOException("Invalid native entry order");
                    DragEntry entry = new DragEntry(Text(value, "name", 259), Boolean(value, "directory"), Number(value, "bytes", DragLease.MaxBytes), Text(value, "sha256", 64));
                    total = checked(total + entry.Bytes); if (total > declaredBytes) throw new IOException("Native drag total mismatch"); entries.Add(entry);
                }
                else if (phase == 1 && type == "seal")
                {
                    Keys(value, "type", "nonce", "seq"); if (entries.Count != declaredCount || total != declaredBytes) throw new IOException("Incomplete native drag manifest");
                    using (DragLease validate = new DragLease(scope, entries, delegate { throw new IOException("No payload in metadata validation"); }, delegate { return true; }, delegate { return 0; })) { }
                    phase = 2;
                }
                else if (phase == 2 && type == "beat") { Keys(value, "type", "nonce", "seq"); }
                else if (phase == 2 && (type == "bytes" || type == "end"))
                {
                    if (type == "bytes") Keys(value, "type", "nonce", "seq", "request", "index", "offset", "data");
                    else Keys(value, "type", "nonce", "seq", "request", "index");
                    request = Text(value, "request", 36); Guid parsed; if (!Guid.TryParseExact(request, "D", out parsed)) throw new IOException("Invalid native request ID");
                    index = (int)Number(value, "index", entries.Count - 1); if (entries[index].Directory) throw new IOException("Directory payload refused");
                    if (type == "bytes")
                    {
                        offset = Number(value, "offset", entries[index].Bytes); string encoded = Text(value, "data", 87384); data = Convert.FromBase64String(encoded);
                        if (data.Length == 0 || data.Length > 65536 || data.LongLength > entries[index].Bytes - offset || Convert.ToBase64String(data) != encoded) throw new IOException("Invalid native data chunk");
                    }
                }
                else throw new IOException("Invalid native drag state transition");
                sequence++; adopted = true; return new DragPacket(type, index, offset, request, data);
            }
            catch { failed = true; throw; }
            finally { if (!adopted && data != null) Array.Clear(data, 0, data.Length); }
        }
    }
}
