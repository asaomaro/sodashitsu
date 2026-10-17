/** Reference persistent NDJSON agent API client. No model calls or automatic actions. */
import { createInterface } from "node:readline";
import { writeFile } from "node:fs/promises";
import { login } from "../../packages/cli/dist/httpAuth.js";
import { connect } from "../../packages/cli/dist/wsClient.js";

const origin = new URL(process.env.SODACTL_URL ?? "http://127.0.0.1:7780");
if (
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  (origin.protocol !== "https:" &&
    !(origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)))
)
  throw new Error("HTTPS or loopback origin is required");
const grant = process.env.SODA_DESKTOP_GRANT;
if (!grant || !/^[A-Za-z0-9_-]{43}$/.test(grant))
  throw new Error("Set SODA_DESKTOP_GRANT to the viewer-issued one-use code");
const cookie =
  process.env.SODACTL_COOKIE ??
  (process.env.SODACTL_TOKEN ? await login(origin.origin, process.env.SODACTL_TOKEN) : undefined);
if (!cookie)
  throw new Error("Set SODACTL_COOKIE or SODACTL_TOKEN for normal Sodashitsu authentication");
const client = await connect(origin.origin, cookie);
const cancellation = new AbortController();
function request(method, params) {
  if (cancellation.signal.aborted) return Promise.reject(new Error("Agent client stopped"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Agent client stopped"));
    cancellation.signal.addEventListener("abort", abort, { once: true });
    client
      .request(method, params, { timeoutMs: method === "desktop.agent.act" ? 60000 : 10000 })
      .then(resolve, reject)
      .finally(() => cancellation.signal.removeEventListener("abort", abort));
  });
}
let lease;
let input;
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
try {
  await client.hello();
  lease = await request("desktop.agent.attach", { ticket: grant });
  emit({ ready: true, expiresAt: lease.expiresAt });
  input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stop = () => {
    cancellation.abort();
    input.close();
    process.stdin.pause();
    client.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  client.onClose(stop);
  for await (const line of input) {
    let id;
    try {
      if (line.length > 16384) throw new Error("Command line exceeds 16KiB");
      const command = JSON.parse(line);
      id = command.id;
      if (command.method === "observe") {
        const result = await request("desktop.agent.observe", {
          leaseId: lease.leaseId,
          ...(command.afterFrameSeq !== undefined ? { afterFrameSeq: command.afterFrameSeq } : {}),
        });
        if (command.path !== undefined) {
          if (typeof command.path !== "string" || !command.path)
            throw new Error("path must be a nonempty filename");
          await writeFile(command.path, Buffer.from(result.imageBase64, "base64"), {
            flag: "wx",
            mode: 0o600,
          });
          const { imageBase64, ...metadata } = result;
          emit({ id, result: { ...metadata, path: command.path } });
        } else emit({ id, result });
      } else if (command.method === "act") {
        emit({
          id,
          result: await request("desktop.agent.act", {
            leaseId: lease.leaseId,
            observationId: command.observationId,
            inputs: command.inputs,
          }),
        });
      } else if (command.method === "release") {
        emit({
          id,
          result: await request("desktop.agent.release", { leaseId: lease.leaseId }),
        });
        lease = undefined;
        break;
      } else throw new Error("method must be observe, act, or release");
    } catch (e) {
      if (cancellation.signal.aborted) break;
      emit({ id, error: { code: e.code ?? "client_error", message: e.message } });
    }
  }
} finally {
  input?.close();
  process.stdin.pause();
  if (lease && !cancellation.signal.aborted)
    await request("desktop.agent.release", { leaseId: lease.leaseId }).catch(() => {});
  client.close();
}
