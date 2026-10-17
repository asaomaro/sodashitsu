import { StringDecoder } from "node:string_decoder";
import type { Readable, Writable } from "node:stream";
import { once } from "node:events";
/** Bound incomplete lines too. No grant or image is written to stderr. */
export async function* desktopLines(input: Readable) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  for await (const chunk of input) {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (Buffer.byteLength(line) > 65536) throw Error("Desktop command exceeds 64KiB");
      if (line.trim()) yield line;
    }
    if (Buffer.byteLength(buffer) > 65536) throw Error("Desktop command exceeds 64KiB");
  }
  buffer += decoder.end();
  if (buffer.trim()) {
    if (Buffer.byteLength(buffer) > 65536) throw Error("Desktop command exceeds 64KiB");
    yield buffer;
  }
}
export async function desktopWrite(output: Writable, value: unknown) {
  if (output.destroyed) throw Error("Desktop output is closed");
  const line = JSON.stringify(value) + "\n";
  if (Buffer.byteLength(line) > 4 * 1024 * 1024 || output.writableLength > 4 * 1024 * 1024)
    throw Error("Desktop output is congested");
  if (!output.write(line)) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2000);
    try {
      await once(output, "drain", { signal: abort.signal });
    } catch (error) {
      output.destroy();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
