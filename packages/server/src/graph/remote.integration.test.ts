import { rm } from "node:fs/promises";
import { connect } from "node:net";
import { hostname } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { bridgeSocketPathFor } from "../machine/BridgeEndpoint.js";
import { saveCatalog } from "../machine/MachineCatalog.js";
import type { ChildLike, SpawnFn } from "../machine/MachineLink.js";

/**
 * 20260927-agent-graph の 04 T5：実物のサーバ 2 台（手元・リモート）で、別のマシンの pane のノードの線を確かめる。ssh と `soda bridge` の代わりに
 * リモートの `bridge.sock` へ直接繋ぐ偽の子を渡す（`machines.integration.test.ts` と同じ）。エージェントの状態は `session.updatePaneRuntime` で
 * 偽って出し（02 の結合試験と同じ）、送信は本物の `agent.prompt`。送られる側の pane では `cat` を動かす。待ちは条件で待つ。
 */
vi.setConfig({ testTimeout: 40_000 });

const MID = "e".repeat(32);

type Run = { linkId: string; result: string; reason?: string; text?: string };

/** ssh の代わり。`cut()` が真の間は繋がらない（ssh が失敗する）。 */
function fakeSshTo(bridgePath: string, cut: () => boolean, children: ChildLike[]): SpawnFn {
  return () => {
    const child = new EventEmitter() as EventEmitter & ChildLike;
    children.push(child);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const sock = connect(cut() ? join(bridgePath, "..", "nope.sock") : bridgePath);
    let exited = false;
    const exit = (code: number): void => {
      if (exited) return;
      exited = true;
      stdout.end();
      stderr.end();
      setImmediate(() => child.emit("close", code, null));
    };
    sock.on("error", () => {
      stderr.write("ssh: connect to host remote: Connection refused\n");
      exit(255);
    });
    sock.on("close", () => exit(0));
    stdin.pipe(sock);
    sock.pipe(stdout, { end: false });
    Object.assign(child, {
      stdin,
      stdout,
      stderr,
      kill: () => {
        sock.destroy();
        exit(143);
        return true;
      },
    });
    return child;
  };
}

function agentInfo(
  instanceId: string,
  completionSeq: number,
  state: "idle" | "working" | "blocked" = "idle",
) {
  return {
    instanceId,
    kind: "claude",
    label: "Claude",
    state,
    completionSeq,
    serverSeenSeq: 0,
    verified: true,
    since: Date.now(),
  };
}

async function waitFor(
  what: string,
  cond: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe.skipIf(process.platform === "win32")(
  "連携の別のマシンのノード（2 つの composeServer。04 T5）",
  () => {
    const cleanups: (() => Promise<unknown> | unknown)[] = [];
    afterEach(async () => {
      for (const fn of cleanups.splice(0).reverse()) await fn();
    });

    async function startPair() {
      const remoteDir = await makeTempDir("soda-graph-remote-");
      const localDir = await makeTempDir("soda-graph-local-");
      cleanups.push(() =>
        rm(remoteDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      cleanups.push(() =>
        rm(localDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      const remote = await composeServerOnFreePort({
        host: "127.0.0.1",
        stateDir: remoteDir,
        origin: [],
      });
      cleanups.push(() => remote.close());
      await saveCatalog(localDir, {
        version: 1,
        machines: [{ id: MID, label: "Remote", target: "you@remote", enabled: true }],
      });
      let cut = false;
      const children: ChildLike[] = [];
      const local = await composeServerOnFreePort(
        { host: "127.0.0.1", stateDir: localDir, origin: [] },
        {
          internal: {
            machineSpawn: fakeSshTo(bridgeSocketPathFor(remoteDir), () => cut, children),
          },
        },
      );
      cleanups.push(() => local.close());
      const client = await openClient(local);
      return {
        local,
        remote,
        client,
        children,
        setCut: (v: boolean) => {
          cut = v;
        },
      };
    }

    async function openClient(server: ComposedServer) {
      const port = server.options.port;
      const origin = `http://127.0.0.1:${port}`;
      const res = await fetch(`${origin}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
        body: JSON.stringify({ token: server.freshToken }),
      });
      const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { cookie, origin, host: `127.0.0.1:${port}` },
      });
      await new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });
      cleanups.push(() => ws.close());
      const runs: Run[] = [];
      const pending = new Map<
        string,
        (v: { result?: unknown; error?: { code: string } }) => void
      >();
      ws.on("message", (raw, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(raw.toString()) as {
          id?: string;
          result?: unknown;
          error?: { code: string };
          event?: string;
          data?: { run?: Run };
        };
        if (msg.id !== undefined) {
          pending.get(msg.id)?.(
            msg.error !== undefined ? { error: msg.error } : { result: msg.result },
          );
          pending.delete(msg.id);
        } else if (msg.event === "graph.fired") runs.push(msg.data!.run!);
      });
      let seq = 0;
      const request = (method: string, params: unknown) =>
        new Promise<{ result?: unknown; error?: { code: string } }>((resolve) => {
          const id = `r${++seq}`;
          pending.set(id, resolve);
          ws.send(JSON.stringify({ id, method, params }));
        });
      await request("client.hello", { protocol: 1, kind: "desktop" });
      return { request, runs };
    }

    type Pair = Awaited<ReturnType<typeof startPair>>;

    /** 各サーバに pane を n 個用意し、送られる側（2 つ目以降）では cat を動かす。 */
    async function panes(server: ComposedServer, n: number, catFrom = 1): Promise<string[]> {
      const ids = [server.session.snapshot().panes[0]!.id];
      while (ids.length < n)
        ids.push((await server.session.splitPane(ids[0]!, "right", undefined)).pane.id);
      for (const p of ids.slice(catFrom)) server.terminals.get(p)!.write("cat\r");
      await waitFor("cat", () =>
        ids.slice(catFrom).every((p) => server.session.getPane(p)?.busy === true),
      );
      return ids;
    }

    const setAgent = (s: ComposedServer, paneId: string, a: ReturnType<typeof agentInfo> | null) =>
      s.session.updatePaneRuntime(paneId, { agent: a as never });
    const screen = (s: ComposedServer, paneId: string) =>
      s.terminals.get(paneId)!.mirror.plainText();
    const trigger = (prompt: string, output: { lines: number } | null = null) => ({
      on: "done",
      prompt,
      output,
      whenBusy: "wait",
    });

    /** 操作を当て、できた線の id（UUID。作った順）を返す。 */
    async function update(t: Pair, ops: unknown[]): Promise<string[]> {
      // 手元の pane のノードは維持（GraphMaintainer。20261008-graph-first）が足す。足す操作は外し、そろうのを待つ。
      const isLocalAdd = (o: unknown): o is { op: "add_node"; key: string } =>
        (o as { op?: string; key?: string }).op === "add_node" &&
        (o as { key: string }).key.startsWith("local:");
      const localKeys = ops.filter(isLocalAdd).map((o) => o.key);
      ops = ops.filter((o) => !isLocalAdd(o));
      await waitFor("the nodes of local panes", () =>
        localKeys.every((k) => t.local.graph.get().nodes.some((n) => n.key === k)),
      );
      const g = (await t.client.request("graph.get", {})).result as { rev: number };
      const r = await t.client.request("graph.update", { baseRev: g.rev, ops });
      expect(r.error).toBeUndefined();
      return (r.result as { links: { id: string }[] }).links.map((l) => l.id);
    }
    // 別のマシンのノードは、手元の囲いに重ならない遠くへ置く（囲いは重ならない。20261008-graph-first）。
    const node = (key: string, i: number) => ({ op: "add_node", key, x: 4000 + i * 240, y: 0 });
    const sentOf = (t: Pair, linkId: string) =>
      t.local.graphHistory(linkId).filter((r) => r.result === "sent").length;

    it("手元 → 別のマシン: 元の完了で別のマシンの先へ 1 回だけ送る。別のマシン → 手元: 別のマシンの画面の末尾を手元へ受け渡す", async () => {
      const t = await startPair();
      const [l1, l2] = await panes(t.local, 2);
      const [r1, r2] = await panes(t.remote, 2);
      setAgent(t.local, l1!, agentInfo("la", 0));
      setAgent(t.local, l2!, agentInfo("lb", 0));
      setAgent(t.remote, r1!, agentInfo("ra", 0));
      setAgent(t.remote, r2!, agentInfo("rb", 0));
      t.remote.terminals.get(r1!)!.write("printf 'REMOTE_%s\\n' RESULT_OK\r");
      await waitFor("remote result", () => /^REMOTE_RESULT_OK$/m.test(screen(t.remote, r1!)));
      const [k1, k2] = await update(t, [
        node(`local:${l1}`, 0),
        node(`local:${l2}`, 1),
        node(`${MID}:${r1}`, 2),
        node(`${MID}:${r2}`, 3),
        {
          op: "add_link",
          kind: "trigger",
          from: `local:${l1}`,
          to: `${MID}:${r2}`,
          trigger: trigger("LOCAL_TO_REMOTE_GO"),
        },
        {
          op: "add_link",
          kind: "trigger",
          from: `${MID}:${r1}`,
          to: `local:${l2}`,
          trigger: trigger("from remote: {output}", { lines: 20 }),
        },
      ]);
      await waitFor("remote link up", () => t.local.graphRemoteAvailable(MID));

      setAgent(t.local, l1!, agentInfo("la", 1));
      await waitFor("sent to remote", () => sentOf(t, k1!) === 1);
      await waitFor("text on the remote pane", () =>
        screen(t.remote, r2!).includes("LOCAL_TO_REMOTE_GO"),
      );

      setAgent(t.remote, r1!, agentInfo("ra", 1));
      await waitFor("sent from remote", () => sentOf(t, k2!) === 1);
      await waitFor("remote output on the local pane", () =>
        screen(t.local, l2!).includes("REMOTE_RESULT_OK"),
      );
      // 同じ完了の知らせ（既読だけの変化）では動かない
      setAgent(t.remote, r1!, { ...agentInfo("ra", 1), serverSeenSeq: 1 });
      setAgent(t.local, l1!, { ...agentInfo("la", 1), serverSeenSeq: 1 });
      await new Promise((r) => setTimeout(r, 300));
      expect(sentOf(t, k1!)).toBe(1);
      expect(sentOf(t, k2!)).toBe(1);
      expect(t.client.runs.filter((r) => r.result === "sent")).toHaveLength(2);
    });

    it("切れている間の発火は machine_unavailable で見送り、繋ぎ直した後は切れている間の完了で動かない（次の完了で 1 回だけ）", async () => {
      const t = await startPair();
      const [l1, l2] = await panes(t.local, 2);
      const [r1, r2] = await panes(t.remote, 2);
      setAgent(t.local, l1!, agentInfo("la", 0));
      setAgent(t.local, l2!, agentInfo("lb", 0));
      setAgent(t.remote, r1!, agentInfo("ra", 0));
      setAgent(t.remote, r2!, agentInfo("rb", 0));
      const [k1, k2] = await update(t, [
        node(`local:${l1}`, 0),
        node(`local:${l2}`, 1),
        node(`${MID}:${r1}`, 2),
        node(`${MID}:${r2}`, 3),
        {
          op: "add_link",
          kind: "trigger",
          from: `local:${l1}`,
          to: `${MID}:${r2}`,
          trigger: trigger("GO_REMOTE"),
        },
        {
          op: "add_link",
          kind: "trigger",
          from: `${MID}:${r1}`,
          to: `local:${l2}`,
          trigger: trigger("GO_LOCAL"),
        },
      ]);
      await waitFor("remote link up", () => t.local.graphRemoteAvailable(MID));

      // ssh が切れ、繋ぎ直しも失敗し続ける
      t.setCut(true);
      t.children.at(-1)!.kill("SIGTERM");
      await waitFor("remote link down", () => !t.local.graphRemoteAvailable(MID));
      setAgent(t.local, l1!, agentInfo("la", 1));
      await waitFor("skipped while down", () =>
        t.local
          .graphHistory(k1!)
          .some((r) => r.result === "skipped" && r.reason === "machine_unavailable"),
      );
      // 切れている間にリモートの元が完了した（手元へは届かない）
      setAgent(t.remote, r1!, agentInfo("ra", 1));
      setAgent(t.remote, r1!, agentInfo("ra", 2));

      t.setCut(false);
      await waitFor("remote link up again", () => t.local.graphRemoteAvailable(MID), 30_000);
      await new Promise((r) => setTimeout(r, 500));
      expect(t.local.graphHistory(k2!)).toEqual([]); // 切れている間の完了では動かない（後から送らない）
      expect(sentOf(t, k1!)).toBe(0);
      expect(screen(t.remote, r2!)).not.toContain("GO_REMOTE");

      setAgent(t.remote, r1!, agentInfo("ra", 3));
      await waitFor("sent after reconnect", () => sentOf(t, k2!) === 1);
      await waitFor("text on the local pane", () => screen(t.local, l2!).includes("GO_LOCAL"));
      await new Promise((r) => setTimeout(r, 300));
      expect(sentOf(t, k2!)).toBe(1);
    });

    it("監督役が別のマシン: 手の空いた監督役へ配下（手元の pane はこのマシンの呼び名）と使い方を送る", async () => {
      const t = await startPair();
      const [l1] = await panes(t.local, 1, 1);
      const [, r2] = await panes(t.remote, 2);
      setAgent(t.local, l1!, agentInfo("la", 0));
      setAgent(t.remote, r2!, agentInfo("sup", 0));
      const [k1] = await update(t, [
        node(`local:${l1}`, 0),
        node(`${MID}:${r2}`, 1),
        { op: "add_link", kind: "supervise", from: `local:${l1}`, to: `${MID}:${r2}` },
      ]);
      await waitFor("notice on the remote supervisor", () =>
        screen(t.remote, r2!).includes("監督役です"),
      );
      await waitFor("recorded", () => sentOf(t, k1!) === 1);
      expect(t.local.graphHistory(k1!)[0]!.text).toContain(`マシン ${hostname()}`);
    });
  },
);
