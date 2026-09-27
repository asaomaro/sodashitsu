import { openWs } from "./localHttp.js";
import type { TuiEntry } from "./tuiTarget.js";

/**
 * 端末版（`@sodashitsu/tui`）が出来るまでの仮の入口（20260927-cli-mode の 02-server。03-tui-core で `import("@sodashitsu/tui").runTui` に差し替える）。
 * 端末版と同じ手順（ローカルログイン → `/ws` → `client.hello`〔`kind: "desktop"`〕）で繋がることだけを確かめ、繋ぎ先を 1 行表示して終わる。
 */
export function placeholderEntry(io: {
  out(line: string): void;
  err(line: string): void;
}): TuiEntry {
  return async (target) => {
    if (target.startupNotice !== undefined)
      for (const line of target.startupNotice.split("\n")) io.err(line);
    if (target.stopHint !== undefined) io.err(target.stopHint);
    const cookie = await target.login();
    const probe = await openWs(target, cookie);
    if (probe.kind !== "open") {
      io.err(
        `soda: cannot connect to ${target.baseUrl} (${probe.kind === "status" ? `HTTP ${probe.status}` : probe.error.message})`,
      );
      return 1;
    }
    const ws = probe.ws;
    try {
      const reply = await new Promise<{ result?: { clientId?: string }; error?: { code: string } }>(
        (resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("client.hello timed out")), 5000);
          ws.on("message", (raw, isBinary) => {
            if (isBinary) return;
            const msg = JSON.parse(raw.toString()) as {
              id?: string;
              result?: { clientId?: string };
              error?: { code: string };
            };
            if (msg.id !== "hello") return;
            clearTimeout(timer);
            resolve(msg);
          });
          ws.once("close", () => reject(new Error("the connection closed before client.hello")));
          ws.send(
            JSON.stringify({
              id: "hello",
              method: "client.hello",
              params: { protocol: 1, kind: "desktop" },
            }),
          );
        },
      );
      if (reply.error !== undefined || reply.result?.clientId === undefined) {
        io.err(
          `soda: client.hello was refused by ${target.baseUrl} (${reply.error?.code ?? "no clientId"})`,
        );
        return 1;
      }
      io.out(
        `soda: connected to ${target.baseUrl}${target.session !== undefined ? ` (session ${target.session})` : ""} (tui not yet available)`,
      );
      return 0;
    } finally {
      ws.close();
    }
  };
}
