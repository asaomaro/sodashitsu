import type {
  Graph,
  GraphLink,
  GraphOp,
  LinkRun,
  MachineStatus,
  NodeKey,
  SessionSnapshot,
} from "@sodashitsu/protocol";
import {
  addMissingNodeOps,
  checkGraphOps,
  defaultApprovalConfig,
  defaultTriggerConfig,
  LOCAL_MACHINE,
  nodeKey,
  parseNodeKey,
} from "@sodashitsu/client-core";
import {
  assertLinkConfigFits,
  CliUsageError,
  givenLinkConfigFlags,
  type Command,
  type GraphAction,
  type GraphLinkConfigArgs,
} from "../cliArgs.js";
import { formatTable, printJson, printLine } from "../output.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";

/**
 * `sodactl graph …`（20260927-agent-graph の 05。AC15）。接続した先のサーバのグラフを `graph.get|update|pause|resume|history` で読み書きする。
 * 操作の組み立てと送る前の検証は client-core の `graph/`（画面と同じ規則）。変更はサーバが `graph.changed` で画面へ配る。
 *
 * - 端（`<from>`・`<to>`・`<pane>`）は pane ID・エージェントの名前（手元だけ）・`<マシンの名前|id>:<pane ID>`。マシンの名前は `--machine` と同じ引き方
 *   （id の完全一致 → 名前の完全一致が 1 台）で `machine.list` から引き、ノードの鍵には id を使う（名前は変えられる）。
 * - `graph.update` が `rev_conflict`（取得から送信までの間に画面などが変えた）なら、取り直して操作を組み立て直し、1 回だけ送り直す。
 *   2 回目も衝突したら `rev_conflict` のまま終了コード 1。
 */

type GraphCmd = Extract<Command, { kind: "graph" }>;

const PANE_ID_RE = /^p[1-9][0-9]*$/;
const MACHINE_ID_RE = /^[0-9a-f]{32}$/;

/** 接続した後に引く材料（snapshot は hello のもの、マシンの一覧は要るときに 1 回だけ取る）。 */
export class GraphContext {
  private machines: MachineStatus[] | null = null;

  constructor(
    private readonly client: SodaClient,
    readonly snapshot: SessionSnapshot,
  ) {}

  async machineList(): Promise<MachineStatus[]> {
    if (this.machines === null)
      this.machines = (await this.client.request("machine.list", {})).machines;
    return this.machines;
  }

  /**
   * 端の指定をノードの鍵にする。`mustExist` なら手元の pane が今あることを確かめる（別のマシンの pane は確かめられない——グラフの実行が
   * 送る時点で `target_absent` にする）。外すノード・選び直す前のノードは閉じた pane を指しうるので確かめない。
   */
  async resolve(spec: string, mustExist: boolean): Promise<NodeKey> {
    const colon = spec.lastIndexOf(":");
    if (colon < 0) return nodeKey(LOCAL_MACHINE, this.localPane(spec, mustExist));
    const selector = spec.slice(0, colon);
    const pane = spec.slice(colon + 1);
    const machine = resolveMachineSelector(
      selector,
      selector === LOCAL_MACHINE ? [] : await this.machineList(),
    );
    if (machine === LOCAL_MACHINE) return nodeKey(LOCAL_MACHINE, this.localPane(pane, mustExist));
    if (!PANE_ID_RE.test(pane)) {
      throw new CliUsageError(
        `invalid pane in ${spec}`,
        "別のマシンの pane は <マシンの名前|id>:<pane ID>（例 box:p7）で指定してください（エージェントの名前は手元の pane だけ）。",
      );
    }
    return nodeKey(machine, pane);
  }

  private localPane(spec: string, mustExist: boolean): string {
    if (PANE_ID_RE.test(spec)) {
      if (mustExist && !this.snapshot.panes.some((p) => p.id === spec))
        throw new RpcFailure("not_found", `pane not found: ${spec}`);
      return spec;
    }
    // エージェントの名前（agent rename で付けたもの）。
    const named = this.snapshot.panes.filter((p) => p.agent?.name === spec);
    if (named.length > 1) {
      throw new RpcFailure(
        "agent_target_ambiguous",
        `agent target ${spec} is ambiguous; candidates: ${named.map((p) => p.id).join(", ")}`,
      );
    }
    const match = named[0];
    if (match === undefined) throw new RpcFailure("not_found", `pane or agent not found: ${spec}`);
    return match.id;
  }

  /** 表に出すノードの呼び方（手元は `p3`、別のマシンは `<名前>:p7`。名前が引けない・重なるなら id）。 */
  displayOf(key: string): string {
    const parsed = parseNodeKey(key);
    if (parsed === null) return key;
    if (parsed.machine === LOCAL_MACHINE) return parsed.paneId;
    const list = this.machines ?? [];
    const label = list.find((m) => m.id === parsed.machine)?.label;
    const unique = label !== undefined && list.filter((m) => m.label === label).length === 1;
    return `${unique ? label : parsed.machine}:${parsed.paneId}`;
  }
}

/**
 * マシンの指定を id にする（`--machine` と同じ: id の完全一致 → 名前の完全一致が 1 台）。`local` は手元。一覧に無い 32 桁の 16 進は
 * そのまま id として通す（登録から外したマシンのノードを外す・選び直すため）。
 */
export function resolveMachineSelector(
  selector: string,
  machines: readonly MachineStatus[],
): string {
  if (selector === LOCAL_MACHINE) return LOCAL_MACHINE;
  const byId = machines.find((m) => m.id === selector);
  if (byId) return byId.id;
  const byLabel = machines.filter((m) => m.label === selector);
  if (byLabel.length === 1) return byLabel[0]!.id;
  if (byLabel.length > 1) {
    throw new RpcFailure(
      "machine_ambiguous",
      `${byLabel.length} saved machines are named ${JSON.stringify(selector)}; use the id (check: soda machine list)`,
    );
  }
  if (MACHINE_ID_RE.test(selector)) return selector;
  throw new RpcFailure(
    "machine_not_found",
    `no saved machine matches ${JSON.stringify(selector)} (check: soda machine list)`,
  );
}

function invalid(issues: readonly { code: string; message: string }[]): RpcFailure {
  return new RpcFailure(
    "invalid_params",
    `invalid graph: ${issues.map((i) => `${i.code}（${i.message}）`).join(" / ")}`,
  );
}

/**
 * 今のグラフを取り、`build` で操作を組み立て、同じ規則で確かめてから送る。`rev_conflict` なら 1 回だけ取り直して組み立て直す。
 * 操作が空なら送らない（例: 載っている pane を載せる）。
 */
export async function updateGraph(
  client: SodaClient,
  build: (graph: Graph) => GraphOp[] | Promise<GraphOp[]>,
): Promise<{ before: Graph; after: Graph }> {
  for (let attempt = 0; ; attempt++) {
    const before = await client.request("graph.get", {});
    const ops = await build(before);
    if (ops.length === 0) return { before, after: before };
    const issues = checkGraphOps(before, ops);
    if (issues.length > 0) throw invalid(issues);
    try {
      return { before, after: await client.request("graph.update", { baseRev: before.rev, ops }) };
    } catch (err) {
      if (attempt === 0 && err instanceof RpcFailure && err.code === "rev_conflict") continue;
      throw err;
    }
  }
}

function findLink(graph: Graph, linkId: string): GraphLink {
  const link = graph.links.find((l) => l.id === linkId);
  if (link === undefined) throw new RpcFailure("not_found", `link not found: ${linkId}`);
  return link;
}

/** `link add` の操作（種類ごとの既定値に、書いた項目を重ねる）。 */
export function addLinkOp(
  kind: GraphLink["kind"],
  from: NodeKey,
  to: NodeKey,
  c: GraphLinkConfigArgs,
): GraphOp {
  const op: Extract<GraphOp, { op: "add_link" }> = { op: "add_link", kind, from, to };
  if (kind === "trigger") {
    const t = defaultTriggerConfig();
    op.trigger = {
      on: c.on ?? t.on,
      prompt: c.prompt ?? t.prompt,
      output: c.output === undefined ? t.output : c.output === null ? null : { lines: c.output },
      whenBusy: c.whenBusy ?? t.whenBusy,
    };
  }
  if (kind === "approval") {
    const a = defaultApprovalConfig();
    op.approval = { mode: c.mode ?? a.mode, lines: c.lines ?? a.lines };
  }
  if (c.limit !== undefined) op.limit = c.limit;
  return op;
}

/** `link set` の操作（今の設定に、書いた項目だけを重ねる）。線の種類に使えない項目は使い方の誤り。 */
export function setLinkOp(link: GraphLink, c: GraphLinkConfigArgs): GraphOp {
  assertLinkConfigFits(link.kind, givenLinkConfigFlags(c));
  const op: Extract<GraphOp, { op: "update_link" }> = { op: "update_link", id: link.id };
  if (
    link.trigger !== undefined &&
    (c.on !== undefined ||
      c.prompt !== undefined ||
      c.output !== undefined ||
      c.whenBusy !== undefined)
  ) {
    op.trigger = {
      on: c.on ?? link.trigger.on,
      prompt: c.prompt ?? link.trigger.prompt,
      output:
        c.output === undefined
          ? link.trigger.output
          : c.output === null
            ? null
            : { lines: c.output },
      whenBusy: c.whenBusy ?? link.trigger.whenBusy,
    };
  }
  if (link.approval !== undefined && (c.mode !== undefined || c.lines !== undefined)) {
    op.approval = { mode: c.mode ?? link.approval.mode, lines: c.lines ?? link.approval.lines };
  }
  if (c.limit !== undefined) op.limit = c.limit;
  return op;
}

/** 実行の結果（表か JSON で出すもの）。 */
type Outcome =
  | { kind: "graph"; graph: Graph }
  | { kind: "link"; link: GraphLink; graph: Graph }
  | { kind: "history"; runs: LinkRun[] };

async function perform(
  client: SodaClient,
  ctx: GraphContext,
  action: GraphAction,
): Promise<Outcome> {
  switch (action.kind) {
    case "show":
      return { kind: "graph", graph: await client.request("graph.get", {}) };
    case "pause":
      return { kind: "graph", graph: await client.request("graph.pause", {}) };
    case "resume":
      return { kind: "graph", graph: await client.request("graph.resume", {}) };
    case "link-pause":
      return {
        kind: "graph",
        graph: await client.request("graph.pause", { linkId: action.linkId }),
      };
    case "link-resume":
      return {
        kind: "graph",
        graph: await client.request("graph.resume", { linkId: action.linkId }),
      };
    case "history":
      return {
        kind: "history",
        runs: (
          await client.request("graph.history", {
            ...(action.linkId === undefined ? {} : { linkId: action.linkId }),
            ...(action.limit === undefined ? {} : { limit: action.limit }),
          })
        ).runs,
      };
    case "link-add": {
      const from = await ctx.resolve(action.from, true);
      const to = await ctx.resolve(action.to, true);
      const { before, after } = await updateGraph(client, (g) => [
        // 端のノードが載っていなければ一緒に載せる（画面では先に載せてから結ぶ）。
        ...addMissingNodeOps(g, [from, to]),
        addLinkOp(action.linkKind, from, to, action.config),
      ]);
      const known = new Set(before.links.map((l) => l.id));
      const link = after.links.find(
        (l) => !known.has(l.id) && l.kind === action.linkKind && l.from === from && l.to === to,
      );
      if (link === undefined)
        throw new RpcFailure("internal", "the server did not return the new link");
      return { kind: "link", link, graph: after };
    }
    case "link-set": {
      const { after } = await updateGraph(client, (g) => [
        setLinkOp(findLink(g, action.linkId), action.config),
      ]);
      return { kind: "graph", graph: after };
    }
    case "link-rm": {
      const { after } = await updateGraph(client, (g) => [
        { op: "remove_link", id: findLink(g, action.linkId).id },
      ]);
      return { kind: "graph", graph: after };
    }
    case "node-add": {
      const keys: NodeKey[] = [];
      for (const p of action.panes) keys.push(await ctx.resolve(p, true));
      const { after } = await updateGraph(client, (g) => addMissingNodeOps(g, keys));
      return { kind: "graph", graph: after };
    }
    case "node-rm": {
      const key = await ctx.resolve(action.pane, false);
      const { after } = await updateGraph(client, () => [{ op: "remove_node", key }]);
      return { kind: "graph", graph: after };
    }
    case "node-rekey": {
      const key = await ctx.resolve(action.pane, false);
      const newKey = await ctx.resolve(action.newPane, true);
      // 画面と同じく同じマシンの pane にだけ選び直す（別のマシンの pane へ付け替えると、線の意味〔どこで動くか〕が変わる。decisions D7-10）。
      if (parseNodeKey(key)?.machine !== parseNodeKey(newKey)?.machine) {
        throw new RpcFailure(
          "invalid_params",
          `rekey must stay on the same machine: ${action.pane} -> ${action.newPane}`,
        );
      }
      const { after } = await updateGraph(client, () => [{ op: "rekey_node", key, newKey }]);
      return { kind: "graph", graph: after };
    }
    default:
      action satisfies never;
      throw new Error("unreachable");
  }
}

export async function runGraph(cmd: GraphCmd, store: SessionStore): Promise<void> {
  const { outcome, ctx } = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const ctx = new GraphContext(client, hello.snapshot);
    const outcome = await perform(client, ctx, cmd.action);
    // 表で別のマシンのノードを名前で出すため（JSON は鍵のまま）。
    if (!cmd.json && outcome.kind !== "history" && hasRemote(outcome.graph))
      await ctx.machineList().catch(() => []);
    return { outcome, ctx };
  });
  if (cmd.json) {
    if (outcome.kind === "history") printJson({ runs: outcome.runs });
    else if (outcome.kind === "link") printJson({ link: outcome.link, graph: outcome.graph });
    else printJson({ graph: outcome.graph });
    return;
  }
  if (outcome.kind === "history") printLine(formatHistory(outcome.runs));
  else if (outcome.kind === "link") printLine(formatLinks([outcome.link], ctx));
  else printLine(formatGraph(outcome.graph, ctx));
}

function hasRemote(graph: Graph): boolean {
  return graph.nodes.some((n) => parseNodeKey(n.key)?.machine !== LOCAL_MACHINE);
}

// --- 表 -----------------------------------------------------------------

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

function linkState(link: GraphLink): string {
  if (link.paused === "user") return "paused";
  if (link.paused === "limit") return "paused(limit)";
  return "active";
}

function linkSettings(link: GraphLink): string {
  if (link.trigger !== undefined) {
    const t = link.trigger;
    return `on=${t.on} output=${t.output === null ? "none" : t.output.lines} busy=${t.whenBusy} prompt=${JSON.stringify(clip(t.prompt, 40))}`;
  }
  if (link.approval !== undefined) return `mode=${link.approval.mode} lines=${link.approval.lines}`;
  return "";
}

type Display = Pick<GraphContext, "displayOf"> & { snapshot: Pick<SessionSnapshot, "panes"> };

export function formatLinks(links: readonly GraphLink[], ctx: Display): string {
  if (links.length === 0) return "(no links)";
  return formatTable(
    ["link", "kind", "from", "to", "count", "state", "settings"],
    links.map((l) => [
      l.id,
      l.kind,
      ctx.displayOf(l.from),
      ctx.displayOf(l.to),
      `${l.count}/${l.limit}`,
      linkState(l),
      linkSettings(l),
    ]),
  );
}

/** ノードの状態: 無効（stale）・閉じた（手元の pane が無い）・ok。別のマシンの pane はここからは確かめられないので `-`。 */
function nodeStatus(node: Graph["nodes"][number], ctx: Display): string {
  if (node.stale) return "stale";
  const parsed = parseNodeKey(node.key);
  if (parsed?.machine !== LOCAL_MACHINE) return "-";
  return ctx.snapshot.panes.some((p) => p.id === parsed.paneId) ? "ok" : "closed";
}

export function formatGraph(graph: Graph, ctx: Display): string {
  const head = `graph: ${graph.paused ? "paused" : "running"} (rev ${graph.rev})`;
  const nodes =
    graph.nodes.length === 0
      ? "(no nodes)"
      : formatTable(
          ["node", "key", "status"],
          graph.nodes.map((n) => [ctx.displayOf(n.key), n.key, nodeStatus(n, ctx)]),
        );
  return [head, "", nodes, "", formatLinks(graph.links, ctx)].join("\n");
}

export function formatHistory(runs: readonly LinkRun[]): string {
  if (runs.length === 0) return "(no runs)";
  return formatTable(
    ["time", "link", "result", "reason", "text"],
    runs.map((r) => [
      new Date(r.at).toISOString(),
      r.linkId,
      r.result,
      r.reason ?? "-",
      r.text === undefined ? "" : JSON.stringify(clip(r.text, 80)),
    ]),
  );
}
