import type { SessionSnapshot } from "@sodashitsu/protocol";
import { expect, vi } from "vitest";
import { TuiApp } from "../app/TuiApp.js";
import type { TuiTarget } from "../types.js";
import { fakeIo } from "./fakeIo.js";
import { FakeSocket } from "./fakeSocket.js";
import { snapshot as defaultSnapshot } from "./fixtures.js";
import { OuterTerminal } from "./outerTerminal.js";

export const testTarget: TuiTarget = {
  baseUrl: "http://127.0.0.1:9",
  origin: "http://127.0.0.1:9",
  login: async () => "sid=1",
  stateDir: "/nonexistent-state-dir",
  session: "work",
};

/**
 * 偽の接続（`FakeSocket`）で開いた `TuiApp`。`respond` は要求の方式ごとの応答（無ければ `{}`）。`screen()` は出力を headless に流した画面の文字。
 */
export async function startedApp(
  opts: {
    cols?: number;
    rows?: number;
    snapshot?: SessionSnapshot;
    /** 要求の方式ごとの応答（関数なら要求の params から作る）。 */
    respond?: Record<string, unknown>;
    openUrl?: (url: string) => void;
  } = {},
) {
  const cols = opts.cols ?? 100;
  const rows = opts.rows ?? 30;
  const io = fakeIo({ cols, rows });
  const sockets: FakeSocket[] = [];
  const app = new TuiApp(testTarget, io, {
    ...(opts.openUrl ? { openUrl: opts.openUrl } : {}),
    net: {
      createWebSocket: (ep) => (url) => {
        const s = new FakeSocket(url, ep.cookie());
        sockets.push(s);
        return s;
      },
      fetchImpl: () => async () => new Response(null, { status: 204 }),
    },
  });
  const running = app.run();
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
  const ws = sockets[0]!;
  ws.open();
  ws.reply({ clientId: "c1", snapshot: opts.snapshot ?? defaultSnapshot() });
  // 要求に自動で応える（hello の後の要求）。
  const answered = new Set<string>();
  const origSend = ws.send.bind(ws);
  ws.send = (data) => {
    origSend(data);
    if (typeof data !== "string") return;
    const msg = JSON.parse(data) as { id: string; method: string; params?: unknown };
    if (answered.has(msg.id)) return;
    answered.add(msg.id);
    const r = opts.respond?.[msg.method];
    const result =
      typeof r === "function" ? (r as (params: unknown) => unknown)(msg.params) : (r ?? {});
    queueMicrotask(() => ws.onmessage?.({ data: JSON.stringify({ id: msg.id, result }) }));
  };
  const outer = new OuterTerminal(cols, rows);
  let written = 0;
  const screen = async (): Promise<string> => {
    const out = io.output();
    await outer.write(out.slice(written));
    written = out.length;
    return outer.text();
  };
  const close = async (): Promise<void> => {
    app.finish(0);
    await running;
    outer.dispose();
  };
  return { io, app, ws, running, screen, outer, close };
}
