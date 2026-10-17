import { writeFile } from "node:fs/promises";
import { DesktopMethods } from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { DesktopAgentSession } from "../desktopSession.js";
import { desktopLines, desktopWrite } from "../desktopIo.js";
import { desktopMcp } from "../desktopMcp.js";
import { runOpenAiComputer } from "../desktopModel.js";

export async function runDesktop(cmd: Extract<Command, { kind: "desktop" }>, store: SessionStore) {
  const url = new URL(cmd.opts.url);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  )
    throw Error("Desktop requires HTTPS or loopback origin");
  if (cmd.opts.machine && cmd.opts.machine !== "local")
    throw Error("Connect to A with --url; desktop grants cannot be forwarded through --machine");
  const ticket = process.env.SODA_DESKTOP_GRANT;
  DesktopMethods["desktop.agent.attach"].parse({ ticket });
  if (cmd.action === "model" && !process.env.OPENAI_API_KEY)
    throw Error(
      "Set OPENAI_API_KEY; screenshots will be sent to OpenAI only when this command runs",
    );
  await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    let session: DesktopAgentSession | undefined;
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      // Node's special stdout cannot reliably cancel an outstanding pipe write.
      // Release the desktop first; bound CLI shutdown if that write keeps Node alive.
      setTimeout(() => process.exit(1), 2500).unref();
      session?.close();
      client.close();
      process.stdin.destroy();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    process.stdout.on("error", stop);
    const attach = async () => {
      session = await DesktopAgentSession.attach(client, ticket!);
      session.abort.signal.addEventListener("abort", () => process.stdin.destroy(), { once: true });
      return session;
    };
    try {
      if (cmd.action === "mcp") {
        await desktopMcp(process.stdin, process.stdout, attach, stop);
        return;
      }
      session = await attach();
      const emit = async (v: unknown) => {
        try {
          await desktopWrite(process.stdout, v);
        } catch (error) {
          stop();
          throw error;
        }
      };
      const lines = desktopLines(process.stdin)[Symbol.asyncIterator]();
      await emit({ ready: true, expiresAt: session.expiresAt });
      if (cmd.action === "model") {
        await runOpenAiComputer(session, cmd.task!, {
          model: cmd.model,
          apiKey: process.env.OPENAI_API_KEY!,
          maxSteps: cmd.maxSteps,
          event: emit,
          approve: async (proposal) => {
            if (cmd.autoAct && !proposal.safetyChecks.length) return true;
            await emit({ type: "approval_required", ...proposal });
            const line = await lines.next();
            if (line.done) return false;
            const decision = JSON.parse(line.value);
            return decision?.decision === "approve";
          },
        });
        return;
      }
      for (;;) {
        const line = await lines.next();
        if (line.done) break;
        let id: unknown;
        try {
          const m = JSON.parse(line.value);
          id = m.id;
          if (m.method === "observe") {
            const p = DesktopMethods["desktop.agent.observe"].parse({
                leaseId: "x".repeat(43),
                ...(m.afterFrameSeq === undefined ? {} : { afterFrameSeq: m.afterFrameSeq }),
              }),
              result = await session.observe(p.afterFrameSeq);
            if (m.path !== undefined) {
              if (typeof m.path !== "string" || !m.path) throw Error("path must be a filename");
              await writeFile(m.path, Buffer.from(result.imageBase64, "base64"), {
                flag: "wx",
                mode: 0o600,
              });
              const { imageBase64, ...meta } = result;
              await emit({ id, result: { ...meta, path: m.path } });
            } else await emit({ id, result });
          } else if (m.method === "act") {
            await emit({ id, result: await session.act(m.observationId, m.inputs) });
          } else if (m.method === "release") {
            await emit({ id, result: await session.release() });
            break;
          } else throw Error("method must be observe, act, or release");
        } catch (e) {
          if (session.abort.signal.aborted) break;
          await emit({
            id,
            error: { message: e instanceof Error ? e.message : "Desktop command failed" },
          });
        }
      }
    } catch (e) {
      if (!session?.abort.signal.aborted) throw e;
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      process.stdout.off("error", stop);
      if (session && !session.abort.signal.aborted) await session.release().catch(() => {});
      session?.close();
      process.stdin.pause();
    }
  });
}
