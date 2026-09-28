import { rm } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it } from "vitest";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { makeTempDir } from "../persist/atomicFile.js";

/**
 * 20260927-agent-graph の 05 T5（AC17）：規模（pane 16 個・線 32 本）と応答性（状態の変化から実行の開始まで 2 秒以内）を、実物のサーバ
 * （`composeServer`・実物の `GraphEngine`・本物の `agent.prompt`・実 PTY）で測る。
 *
 * - エージェントの状態は `session.updatePaneRuntime` で偽って出す（どの pane も前面は `cat` で、AgentMonitor はエージェントとして検出しないので
 *   偽の値を上書きしない。02 の結合試験と同じ前提）。
 *   判定の周期（AgentMonitor の見回り）は要件の「判定の周期を除いて」に当たるので測らない。
 * - 「実行の開始」は、先の pane の画面に送った文面が現れた時刻（`agent.prompt` が打ち込んだ文字を `cat` が端末に返した＝先に届き始めた）。
 *   あわせて `graph.fired` の sent（Enter まで送り終えた。`agent.prompt` は本文の 300ms 後に Enter を送る）までの時間も記録する。
 * - 測った値は `[graph-perf]` の行で標準出力へ出す（test-result に写す）。判定の閾値は要件の 2 秒そのもの——実測は単独で 20ms 以下、
 *   全体の試験を並列に走らせた負荷の下で数百 ms（2 回の全体の実行で最大 327ms・515ms）で、4 倍ほどの余裕がある。繰り返しの負荷はかけない（1 回の変化を 3 回と、全部の元が同時に完了する 1 回だけ）。
 */

const PANES = 16;
const LINKS = 32;
const RESPONSE_LIMIT_MS = 2000;

interface Ctx {
  server: ComposedServer;
  panes: string[];
}

const cleanups: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

async function waitFor(
  what: string,
  cond: () => boolean,
  timeoutMs: number,
  stepMs = 5,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

function agentInfo(instanceId: string, completionSeq: number, state: "idle" | "blocked" = "idle") {
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

const mark = (from: number, to: number) => `perf-mark-${from}-${to}`;
/**
 * 線 32 本: 各 pane i から i+1・i+2（16 で回る）へ。`done` は両方とも完了のトリガ。`blocked`（g05 点検）は i+1 へ承認待ちのトリガ（受け渡しなし）、
 * i+2 へ承認の代理（i が配下・i+2 が監督役。知らせるだけ）。
 */
function linkPairs(): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < PANES; i++) pairs.push([i, (i + 1) % PANES], [i, (i + 2) % PANES]);
  return pairs;
}

type Mode = "done" | "blocked";

function linkOp(mode: Mode, key: (i: number) => `local:${string}`, from: number, to: number) {
  const base = { op: "add_link" as const, from: key(from), to: key(to), limit: 100 };
  if (mode === "blocked" && to === (from + 2) % PANES) {
    return { ...base, kind: "approval" as const, approval: { mode: "notify" as const, lines: 20 } };
  }
  return {
    ...base,
    kind: "trigger" as const,
    trigger: {
      on: mode,
      prompt: mode === "done" ? `${mark(from, to)} {output}` : mark(from, to),
      output: mode === "done" ? { lines: 20 } : null,
      whenBusy: "wait" as const,
    },
  };
}

async function boot(mode: Mode = "done"): Promise<Ctx> {
  const dir = await makeTempDir("soda-graph-perf-");
  cleanups.push(() => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir: dir, origin: [] });
  cleanups.push(() => server.close());
  const panes = [server.session.snapshot().panes[0]!.id];
  // 同じ pane を割り続けると細くなるので、今ある pane を順に割る。
  for (let i = 0; panes.length < PANES; i++) {
    panes.push(
      (await server.session.splitPane(panes[i]!, i % 2 === 0 ? "right" : "down", undefined)).pane
        .id,
    );
  }
  // どの pane も送られる側になるので、全部で cat を動かす（送った文面をシェルが実行しない）。
  for (const p of panes) server.terminals.get(p)!.write("cat\r");
  await waitFor(
    "cat in every pane",
    () => panes.every((p) => server.session.getPane(p)?.busy === true),
    20_000,
    50,
  );
  const key = (i: number) => `local:${panes[i]}` as const;
  await server.graph.update(
    0,
    [
      ...panes.map((_, i) => ({
        op: "add_node" as const,
        key: key(i),
        x: (i % 4) * 240,
        y: Math.floor(i / 4) * 120,
      })),
      ...linkPairs().map(([from, to]) => linkOp(mode, key, from, to)),
    ],
    "perf",
  );
  expect(server.graph.get().nodes).toHaveLength(PANES);
  expect(server.graph.get().links).toHaveLength(LINKS);
  panes.forEach((p, i) =>
    server.session.updatePaneRuntime(p, { agent: agentInfo(`perf-${i}`, 0) as never }),
  );
  return { server, panes };
}

const screenHas = (ctx: Ctx, to: number, text: string) =>
  ctx.server.terminals.get(ctx.panes[to]!)!.mirror.plainText().includes(text);
const sentCount = (ctx: Ctx, from: number, to: number) => {
  const link = ctx.server.graph
    .get()
    .links.find((l) => l.from === `local:${ctx.panes[from]}` && l.to === `local:${ctx.panes[to]}`)!;
  return ctx.server.graphHistory(link.id).filter((r) => r.result === "sent").length;
};

function log(record: Record<string, unknown>): void {
  process.stdout.write(`[graph-perf] ${JSON.stringify(record)}\n`);
}

describe("連携の性能（pane 16・線 32。AC17）", () => {
  it("1 つの元が完了してから、2 本の線の先へ送り始めるまで 2 秒以内（3 回、別々の元で測る）", async () => {
    const ctx = await boot();
    const results: { source: number; toStartMs: number[]; toSentMs: number[] }[] = [];
    // 先が重ならない元（送った先は数秒「作業中」とみなされるので、測る回ごとに先を変える）。
    for (const source of [0, 5, 10]) {
      const targets = [(source + 1) % PANES, (source + 2) % PANES];
      const t0 = performance.now();
      ctx.server.session.updatePaneRuntime(ctx.panes[source]!, {
        agent: agentInfo(`perf-${source}`, 1) as never,
      });
      const toStartMs: number[] = [];
      const toSentMs: number[] = [];
      await Promise.all(
        targets.map(async (to) => {
          await waitFor(
            `the prompt on pane ${to}`,
            () => screenHas(ctx, to, mark(source, to)),
            10_000,
          );
          toStartMs.push(Math.round(performance.now() - t0));
          await waitFor(
            `the sent run ${source}->${to}`,
            () => sentCount(ctx, source, to) === 1,
            10_000,
          );
          toSentMs.push(Math.round(performance.now() - t0));
        }),
      );
      results.push({ source, toStartMs, toSentMs });
    }
    log({ case: "single-change", panes: PANES, links: LINKS, limitMs: RESPONSE_LIMIT_MS, results });
    for (const r of results)
      for (const ms of r.toStartMs) expect(ms).toBeLessThan(RESPONSE_LIMIT_MS);
  }, 90_000);

  it("承認待ちのトリガと承認の代理は、1 秒続いて承認待ちとみなしてから 2 秒以内に先へ送り始める（1 秒より前には送らない。3 回。g05 点検）", async () => {
    const ctx = await boot("blocked");
    const results: { source: number; triggerStartMs: number; approvalStartMs: number }[] = [];
    for (const source of [0, 5, 10]) {
      const [t1, t2] = [(source + 1) % PANES, (source + 2) % PANES];
      // 承認の代理は元の画面の末尾を渡すので、元の画面に目印を出しておき、監督役の画面にそれが現れた時刻を測る。
      const srcMark = `perf-src-${source}`;
      ctx.server.terminals.get(ctx.panes[source]!)!.write(`${srcMark}\r`);
      await waitFor(`the mark on pane ${source}`, () => screenHas(ctx, source, srcMark), 10_000);
      const t0 = performance.now();
      ctx.server.session.updatePaneRuntime(ctx.panes[source]!, {
        agent: agentInfo(`perf-${source}`, 0, "blocked") as never,
      });
      const at: Record<string, number> = {};
      await Promise.all([
        waitFor(
          `the blocked trigger on pane ${t1}`,
          () => screenHas(ctx, t1, mark(source, t1)),
          10_000,
        ).then(() => void (at["trigger"] = Math.round(performance.now() - t0))),
        waitFor(
          `the approval notice on pane ${t2}`,
          () => screenHas(ctx, t2, srcMark),
          10_000,
        ).then(() => void (at["approval"] = Math.round(performance.now() - t0))),
      ]);
      results.push({ source, triggerStartMs: at["trigger"]!, approvalStartMs: at["approval"]! });
    }
    log({
      case: "blocked",
      panes: PANES,
      links: LINKS,
      holdMs: 1000,
      limitMs: RESPONSE_LIMIT_MS,
      results,
    });
    for (const r of results) {
      // 1 秒の継続（BLOCKED_HOLD_MS）より前には送らない。
      expect(r.triggerStartMs).toBeGreaterThanOrEqual(1000);
      expect(r.approvalStartMs).toBeGreaterThanOrEqual(1000);
      // 2 秒の判定は「承認待ちとみなした（1 秒続いた）時点」から数える。要件の「状態の変化」は承認待ちの確定で、1 秒の継続は判定の周期と同じく
      // 外す（単独では約 1007ms で、確定から約 7ms。全体の試験の並列の下では 1694ms になった回があり、入ってからの 2 秒では余裕が 300ms しか無い）。
      expect(r.triggerStartMs - 1000).toBeLessThan(RESPONSE_LIMIT_MS);
      expect(r.approvalStartMs - 1000).toBeLessThan(RESPONSE_LIMIT_MS);
    }
  }, 90_000);

  it("16 の元が同時に完了しても、16 の先のどれにも 2 秒以内に送り始める（線ごとの 2 本目は先の手が空くまで待つ）", async () => {
    const ctx = await boot();
    const t0 = performance.now();
    ctx.panes.forEach((p, i) =>
      ctx.server.session.updatePaneRuntime(p, { agent: agentInfo(`perf-${i}`, 1) as never }),
    );
    const firstStartMs: number[] = new Array<number>(PANES).fill(-1);
    await Promise.all(
      ctx.panes.map(async (_, to) => {
        const froms = [(to + PANES - 1) % PANES, (to + PANES - 2) % PANES];
        await waitFor(
          `a prompt on pane ${to}`,
          () => froms.some((from) => screenHas(ctx, to, mark(from, to))),
          20_000,
        );
        firstStartMs[to] = Math.round(performance.now() - t0);
      }),
    );
    const max = Math.max(...firstStartMs);
    log({
      case: "burst",
      panes: PANES,
      links: LINKS,
      limitMs: RESPONSE_LIMIT_MS,
      maxFirstStartMs: max,
      firstStartMs,
    });
    expect(max).toBeLessThan(RESPONSE_LIMIT_MS);
  }, 90_000);
});
