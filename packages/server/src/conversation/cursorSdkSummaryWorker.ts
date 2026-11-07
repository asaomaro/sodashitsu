import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CursorSummaryFailure, runCursorSdkSummary, type CursorSummaryInput } from "./cursorSdkSummaryRuntime.js";

async function main() {
  // Provider diagnostics are not part of our protocol and can contain private input.
  console.log = console.info = console.warn = console.error = console.debug = () => undefined;
  const abort = new AbortController();
  process.once("SIGTERM", () => abort.abort());
  process.on("message", message => { if (message === "cancel") abort.abort(); });
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    const part = Buffer.from(chunk);
    bytes += part.length;
    if (bytes > 512 * 1024) throw new CursorSummaryFailure("limit");
    chunks.push(part);
  }
  const input: CursorSummaryInput = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!input || typeof input.model !== "string" || !input.model || input.model.length > 512 ||
      typeof input.prompt !== "string" || !input.prompt || typeof input.authPath !== "string" ||
      typeof input.cwd !== "string" || typeof input.store !== "string" ||
      (input.apiKey !== undefined && typeof input.apiKey !== "string")) throw new CursorSummaryFailure("failed");
  let sdk: typeof import("@cursor/sdk");
  try { sdk = await import("@cursor/sdk"); } catch { throw new CursorSummaryFailure("unavailable"); }
  const text = await runCursorSdkSummary(input, sdk, abort.signal);
  process.stdout.write(JSON.stringify({ ok: true, text }));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main().catch(error => {
    const reason = error instanceof CursorSummaryFailure ? error.reason : "failed";
    process.stdout.write(JSON.stringify({ ok: false, reason }));
    process.exitCode = 1;
  }).finally(() => { if (process.connected) process.disconnect(); });
}
