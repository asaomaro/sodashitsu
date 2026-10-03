import { AGENT_START_DEFAULT_TIMEOUT_MS, type AgentInfo, type ServerEvent } from "@sodashitsu/protocol";
import { StartWait, type StartVerdict } from "../agentStartWait.js";
import type { AgentView } from "../agentStatus.js";
import type { Command } from "../cliArgs.js";
import { printJson } from "../output.js";
import type { SessionStore } from "../session.js";
import { assertNotSelfPane, callerPaneParam } from "../selfGuard.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import { EventFeed, viewOf, workspacesByTab } from "./agent.js";

/** `sodactl agent start`（20260926-agent-start design「CLI `runAgentStart`」）。 */

type AgentStartCmd = Extract<Command, { kind: "agent-start" }>;

/** `agent_pane_busy` の再試行（herdr の `PANE_SHELL_READINESS_RETRY_TIMEOUT`・`AGENT_START_POLL_INTERVAL`。decisions.md D6）。 */
export const START_BUSY_RETRY_MS = 2000;
export const START_BUSY_POLL_MS = 100;

export interface AgentStartDeps {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const REAL_DEPS: AgentStartDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function requestStart(
  client: SodaClient,
  cmd: AgentStartCmd,
  deps: AgentStartDeps,
): Promise<void> {
  let firstBusyAt: number | null = null;
  for (;;) {
    try {
      await client.request("agent.start", {
        name: cmd.name,
        kind: cmd.agentKind,
        paneId: cmd.paneId,
        args: cmd.args,
        ...(cmd.timeoutMs === undefined ? {} : { timeoutMs: cmd.timeoutMs }),
        ...callerPaneParam(cmd.opts),
      });
      return;
    } catch (err) {
      if (!(err instanceof RpcFailure) || err.code !== "agent_pane_busy") throw err;
      firstBusyAt ??= deps.now();
      const remaining = firstBusyAt + START_BUSY_RETRY_MS - deps.now();
      if (remaining <= 0) throw err;
      await deps.sleep(Math.min(START_BUSY_POLL_MS, remaining));
    }
  }
}

export async function runAgentStart(
  cmd: AgentStartCmd,
  store: SessionStore,
  deps: AgentStartDeps = REAL_DEPS,
): Promise<void> {
  assertNotSelfPane(cmd.opts, cmd.paneId, "start an agent in"); // 自分の pane に打ち込まない（20260926-agent-skill-file。接続する前に断る）
  const agent = await withSession(cmd.opts, store, async (client): Promise<AgentView> => {
    const events = new EventFeed();
    const hello = await client.hello(events.push);
    const deadline = deps.now() + (cmd.timeoutMs ?? AGENT_START_DEFAULT_TIMEOUT_MS);
    const workspaces = workspacesByTab(hello.snapshot);
    const pane = hello.snapshot.panes.find((p) => p.id === cmd.paneId);
    let tabId = pane?.tabId ?? "";
    let current: AgentInfo | null = pane?.agent ?? null;
    let closed = false;
    const wait = new StartWait(cmd.name, cmd.agentKind);

    return new Promise<AgentView>((resolve, reject) => {
      let started = false;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        fn();
      };
      const judge = (): void => {
        if (!started || settled) return;
        const verdict: StartVerdict = closed ? wait.paneClosed() : wait.observe(current);
        if (verdict.kind === "ready") {
          const ready = verdict.agent;
          finish(() => resolve(viewOf({ paneId: cmd.paneId, tabId, agent: ready }, workspaces)));
        } else if (verdict.kind === "failed") {
          finish(() => reject(new RpcFailure(verdict.code, verdict.message)));
        }
      };
      client.onClose((_code, reason) => {
        finish(() =>
          reject(
            new RpcFailure(
              "connection_closed",
              `server closed the connection: ${reason || "(no reason given)"}`,
            ),
          ),
        );
      });
      events.drain((evt: ServerEvent) => {
        switch (evt.event) {
          case "tab.created":
          case "tab.updated":
            workspaces.set(evt.data.tab.id, evt.data.tab.workspaceId);
            return;
          case "pane.updated":
            if (evt.data.pane.id === cmd.paneId) tabId = evt.data.pane.tabId;
            return;
          case "pane.closed":
            if (evt.data.paneId === cmd.paneId) {
              closed = true;
              judge();
            }
            return;
          case "pane.agent_status_changed":
            if (evt.data.paneId === cmd.paneId) {
              current = evt.data.agent;
              judge();
            }
            return;
          default:
            return;
        }
      });
      requestStart(client, cmd, deps).then(
        () => {
          if (settled) return;
          started = true;
          timer = setTimeout(
            () =>
              finish(() =>
                reject(new RpcFailure("timeout", "timed out waiting for agent startup")),
              ),
            Math.max(0, deadline - deps.now()),
          );
          judge();
        },
        (err: unknown) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))),
      );
    });
  });
  printJson({ agent });
}
