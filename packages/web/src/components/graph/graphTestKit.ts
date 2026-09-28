/**
 * グラフ画面の試験の部品（20260927-agent-graph の 03-web-graph）。試験のファイルだけが読む（本体からは読まない）。
 */
import type { AgentInfo, AgentState, Graph, GraphLink, NodeKey, Pane } from "@sodashitsu/protocol";
import type { GraphPort } from "../../store/graph.js";

export function agentOf(state: AgentState, extra: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "i1",
    kind: "claude",
    label: "Claude Code",
    state,
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
    ...extra,
  };
}

export function paneOf(id: string, tabId = "t1", extra: Partial<Pane> = {}): Pane {
  return {
    id,
    tabId,
    label: null,
    cwd: "/",
    shell: "bash",
    cols: 80,
    rows: 24,
    status: "running",
    failure: null,
    busy: false,
    title: "",
    rightClick: "herdr",
    agent: null,
    agentSession: null,
    ...extra,
  } as Pane;
}

export function triggerLink(
  id: string,
  from: string,
  to: string,
  extra: Partial<GraphLink> = {},
): GraphLink {
  return {
    id,
    kind: "trigger",
    from: from as NodeKey,
    to: to as NodeKey,
    trigger: { on: "done", prompt: "続けて", output: { lines: 80 }, whenBusy: "wait" },
    limit: 10,
    count: 0,
    paused: null,
    ...extra,
  };
}

export function graphOf(extra: Partial<Graph> = {}): Graph {
  return {
    rev: 1,
    paused: false,
    nodes: [
      { key: "local:p1", x: 0, y: 0 },
      { key: "local:p2", x: 300, y: 0 },
    ],
    links: [],
    ...extra,
  };
}

type Handler = (params: unknown) => unknown;

/** 方式ごとの応答を差し替えられる偽の口。`calls` に送ったものを残す。 */
export function fakeGraphPort(handlers: Partial<Record<string, Handler>> = {}) {
  const calls: { method: string; params: unknown }[] = [];
  const port: GraphPort = {
    request: (async (method: string, params: unknown) => {
      calls.push({ method, params });
      const h = handlers[method];
      if (!h)
        throw Object.assign(new Error(`internal: no handler ${method}`), { code: "internal" });
      return await h(params);
    }) as GraphPort["request"],
  };
  return { port, calls, handlers };
}

export function rpcError(code: string): Error {
  return Object.assign(new Error(`${code}: x`), { code });
}
