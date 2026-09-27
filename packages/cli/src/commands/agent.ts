import type { AgentInfo, ServerEvent, SessionSnapshot } from "@sodashitsu/protocol";
import { resolveAgentTarget, type AgentPane } from "../agentTarget.js";
import {
  currentScreen,
  judgeWait,
  lastLines,
  PROMPT_EFFECT_TIMEOUT_MS,
  PromptWait,
  resolveUntil,
  statusOf,
  toAgentView,
  type AgentStatus,
  type AgentView,
} from "../agentStatus.js";
import { stripAnsi } from "../ansiStrip.js";
import type { Command } from "../cliArgs.js";
import { printJson, printLine } from "../output.js";
import type { SessionStore } from "../session.js";
import { assertNotSelfPane } from "../selfGuard.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import { readPaneSnapshot } from "./pane.js";

/**
 * `agent list` / `get` / `wait` / `read`（20260926-agent-automation-api design.md「振る舞いの詳細」）、
 * `agent prompt` / `send-keys`（20260926-agent-prompt-send-keys design.md「`sodactl agent prompt`（CLI）」）。
 */

type AgentListCmd = Extract<Command, { kind: "agent-list" }>;
type AgentGetCmd = Extract<Command, { kind: "agent-get" }>;
type AgentWaitCmd = Extract<Command, { kind: "agent-wait" }>;
type AgentReadCmd = Extract<Command, { kind: "agent-read" }>;
type AgentPromptCmd = Extract<Command, { kind: "agent-prompt" }>;
type AgentSendKeysCmd = Extract<Command, { kind: "agent-send-keys" }>;
type AgentRenameCmd = Extract<Command, { kind: "agent-rename" }>;

export function workspacesByTab(snapshot: SessionSnapshot): Map<string, string> {
  return new Map(snapshot.tabs.map((t) => [t.id, t.workspaceId]));
}

export function viewOf(target: AgentPane, workspaces: Map<string, string>): AgentView {
  return toAgentView(
    {
      paneId: target.paneId,
      tabId: target.tabId,
      workspaceId: workspaces.get(target.tabId) ?? null,
    },
    target.agent,
  );
}

export async function runAgentList(cmd: AgentListCmd, store: SessionStore): Promise<void> {
  const hello = await withSession(cmd.opts, store, async (client) => client.hello());
  const workspaces = workspacesByTab(hello.snapshot);
  const agents = hello.snapshot.panes.flatMap((p) =>
    p.agent ? [viewOf({ paneId: p.id, tabId: p.tabId, agent: p.agent }, workspaces)] : [],
  );
  printJson({ agents });
}

export async function runAgentGet(cmd: AgentGetCmd, store: SessionStore): Promise<void> {
  const hello = await withSession(cmd.opts, store, async (client) => client.hello());
  const target = resolveAgentTarget(hello.snapshot, cmd.paneId);
  printJson({ agent: viewOf(target, workspacesByTab(hello.snapshot)) });
}

function notRunning(): RpcFailure {
  return new RpcFailure("agent_not_running", "agent is no longer running in the target pane");
}

/** hello の応答の直後から届いたイベントを溜めておき、待ちを始めたら溜めた分から順に渡す。 */
export class EventFeed {
  private readonly buffered: ServerEvent[] = [];
  private sink: ((evt: ServerEvent) => void) | null = null;

  readonly push = (evt: ServerEvent): void => {
    if (this.sink) this.sink(evt);
    else this.buffered.push(evt);
  };

  drain(sink: (evt: ServerEvent) => void): void {
    this.sink = sink;
    for (const evt of this.buffered.splice(0)) sink(evt);
  }
}

/**
 * hello の応答より後のイベント（snapshot より新しい）で状態を追い、一致・消失・時間切れ・切断のどれかで終わる。
 * 待ち始めのエージェント（`instanceId`）が入れ替わったら消失として扱う。
 */
function waitForAgent(
  client: SodaClient,
  events: EventFeed,
  target: AgentPane,
  workspaces: Map<string, string>,
  until: readonly AgentStatus[],
  timeoutMs: number | undefined,
): Promise<AgentView> {
  const expectedInstanceId = target.agent.instanceId;
  let tabId = target.tabId;
  return new Promise<AgentView>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      fn();
    };
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        finish(() => reject(new RpcFailure("timeout", "timed out waiting for agent status")));
      }, timeoutMs);
    }
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
      if (settled) return;
      switch (evt.event) {
        case "tab.created":
        case "tab.updated":
          workspaces.set(evt.data.tab.id, evt.data.tab.workspaceId);
          return;
        case "pane.updated":
          if (evt.data.pane.id === target.paneId) tabId = evt.data.pane.tabId;
          return;
        case "pane.closed":
          if (evt.data.paneId === target.paneId) finish(() => reject(notRunning()));
          return;
        case "pane.agent_status_changed": {
          if (evt.data.paneId !== target.paneId) return;
          const agent = evt.data.agent;
          const verdict = judgeWait(expectedInstanceId, agent, until);
          if (verdict === "gone" || agent === null) finish(() => reject(notRunning()));
          else if (verdict === "match") {
            finish(() => resolve(viewOf({ paneId: target.paneId, tabId, agent }, workspaces)));
          }
          return;
        }
        default:
          return;
      }
    });
  });
}

export async function runAgentWait(cmd: AgentWaitCmd, store: SessionStore): Promise<void> {
  const agent = await withSession(cmd.opts, store, async (client) => {
    const events = new EventFeed();
    const hello = await client.hello(events.push);
    const target = resolveAgentTarget(hello.snapshot, cmd.paneId);
    const workspaces = workspacesByTab(hello.snapshot);
    const until = resolveUntil(cmd.until);
    if (judgeWait(target.agent.instanceId, target.agent, until) === "match") {
      return viewOf(target, workspaces);
    }
    return waitForAgent(client, events, target, workspaces, until, cmd.timeoutMs);
  });
  printJson({ agent });
}

export async function runAgentRead(cmd: AgentReadCmd, store: SessionStore): Promise<void> {
  const text = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const { paneId } = resolveAgentTarget(hello.snapshot, cmd.paneId);
    const snapshot = await readPaneSnapshot(
      client,
      paneId,
      hello.snapshot.limits.scrollbackLines,
      cmd.timeoutMs,
    );
    await client.request("pane.unsubscribe", { paneId });
    return snapshot;
  });
  const screen = currentScreen(text);
  printLine(lastLines(cmd.raw ? screen : stripAnsi(screen), cmd.lines));
}

function stalledError(current: AgentInfo): RpcFailure {
  return new RpcFailure(
    "agent_prompt_stalled",
    `agent prompt produced no observed working or blocked state within ${PROMPT_EFFECT_TIMEOUT_MS} ms; current status is ${statusOf(current)}`,
  );
}

/**
 * prompt を送り、送った後に working/blocked を観測してから `until` を待つ（herdr の `prompt_agent`。`src/api/wait.rs:177-329`）。
 * 活動として数えるのは要求を送った後に届いた状態だけ（hello の応答から要求までの状態は数えない）。
 */
function promptAndWait(
  client: SodaClient,
  events: EventFeed,
  target: AgentPane,
  workspaces: Map<string, string>,
  text: string,
  until: readonly AgentStatus[],
  deadline: number | undefined,
): Promise<AgentView> {
  let tabId = target.tabId;
  return new Promise<AgentView>((resolve, reject) => {
    let settled = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      if (stallTimer !== undefined) clearTimeout(stallTimer);
      fn();
    };
    const fail = (err: Error): void => finish(() => reject(err));

    if (deadline !== undefined) {
      deadlineTimer = setTimeout(
        () => fail(new RpcFailure("timeout", "timed out waiting for agent status")),
        Math.max(0, deadline - Date.now()),
      );
    }
    client.onClose((_code, reason) => {
      fail(
        new RpcFailure(
          "connection_closed",
          `server closed the connection: ${reason || "(no reason given)"}`,
        ),
      );
    });

    let submitted = false;
    let tracker: PromptWait | null = null;
    let latest: AgentInfo = target.agent;
    const beforeResponse: (AgentInfo | null)[] = [];
    const observe = (agent: AgentInfo | null): void => {
      if (settled || tracker === null) return;
      if (agent !== null) latest = agent;
      const verdict = tracker.observe(agent);
      if (verdict === "gone" || agent === null) fail(notRunning());
      else if (verdict === "match") {
        finish(() => resolve(viewOf({ paneId: target.paneId, tabId, agent }, workspaces)));
      } else if (tracker.activityObserved && stallTimer !== undefined) {
        clearTimeout(stallTimer);
        stallTimer = undefined;
      }
    };
    const onStatus = (agent: AgentInfo | null): void => {
      if (!submitted) return;
      if (tracker === null) beforeResponse.push(agent);
      else observe(agent);
    };
    events.drain((evt: ServerEvent) => {
      if (settled) return;
      switch (evt.event) {
        case "tab.created":
        case "tab.updated":
          workspaces.set(evt.data.tab.id, evt.data.tab.workspaceId);
          return;
        case "pane.updated":
          if (evt.data.pane.id === target.paneId) tabId = evt.data.pane.tabId;
          return;
        case "pane.closed":
          if (evt.data.paneId === target.paneId) onStatus(null);
          return;
        case "pane.agent_status_changed":
          if (evt.data.paneId === target.paneId) onStatus(evt.data.agent);
          return;
        default:
          return;
      }
    });

    // hello の間に締め切りを過ぎていたら送らない（締め切りの後に送ることになるため）。
    if (deadline !== undefined && deadline - Date.now() <= 0) {
      fail(new RpcFailure("timeout", "timed out waiting for agent status"));
      return;
    }
    submitted = true;
    client
      .request("agent.prompt", { paneId: target.paneId, instanceId: target.agent.instanceId, text })
      .then(
        (result) => {
          if (settled) return;
          const agent = result.agent;
          if (agent.instanceId !== target.agent.instanceId) {
            fail(notRunning());
            return;
          }
          latest = agent;
          const startedWorking = statusOf(agent) === "working";
          tracker = new PromptWait(agent.instanceId, until, startedWorking);
          if (startedWorking) observe(agent);
          for (const a of beforeResponse.splice(0)) observe(a);
          if (settled || tracker.activityObserved) return;
          // 締め切りまでの残りが 5 秒以下なら、stalled ではなく締め切りの timeout で終わる（herdr `wait.rs:254-265`）。
          const remaining = deadline === undefined ? Infinity : deadline - Date.now();
          if (remaining > PROMPT_EFFECT_TIMEOUT_MS) {
            stallTimer = setTimeout(() => fail(stalledError(latest)), PROMPT_EFFECT_TIMEOUT_MS);
          }
        },
        (err: unknown) => fail(err instanceof Error ? err : new Error(String(err))),
      );
  });
}

export async function runAgentPrompt(cmd: AgentPromptCmd, store: SessionStore): Promise<void> {
  const agent = await withSession(cmd.opts, store, async (client) => {
    // --timeout は送信の時間も含めて数える（herdr と同じ）。
    const deadline = cmd.timeoutMs === undefined ? undefined : Date.now() + cmd.timeoutMs;
    const events = new EventFeed();
    const hello = await client.hello(events.push);
    const target = resolveAgentTarget(hello.snapshot, cmd.paneId);
    assertNotSelfPane(cmd.opts, target.paneId, "send a prompt to the agent in"); // 名前で指しても自分の pane なら断る（20260926-agent-skill-file）
    const workspaces = workspacesByTab(hello.snapshot);
    if (!cmd.wait) {
      const result = await client.request("agent.prompt", {
        paneId: target.paneId,
        instanceId: target.agent.instanceId,
        text: cmd.text,
      });
      return viewOf({ ...target, agent: result.agent }, workspaces);
    }
    return promptAndWait(
      client,
      events,
      target,
      workspaces,
      cmd.text,
      resolveUntil(cmd.until),
      deadline,
    );
  });
  printJson({ agent });
}

export async function runAgentSendKeys(cmd: AgentSendKeysCmd, store: SessionStore): Promise<void> {
  const paneId = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const target = resolveAgentTarget(hello.snapshot, cmd.paneId);
    assertNotSelfPane(cmd.opts, target.paneId, "send keys to the agent in"); // 同上（20260926-agent-skill-file）
    await client.request("agent.send_keys", {
      paneId: target.paneId,
      instanceId: target.agent.instanceId,
      keys: cmd.keys,
    });
    return target.paneId;
  });
  printJson({ ok: true, paneId });
}

/** `agent rename`（20260926-agent-start-rename design「`sodactl agent rename`」）。解決した時点のエージェントにだけ付ける。 */
export async function runAgentRename(cmd: AgentRenameCmd, store: SessionStore): Promise<void> {
  const agent = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const target = resolveAgentTarget(hello.snapshot, cmd.paneId);
    const result = await client.request("agent.rename", {
      paneId: target.paneId,
      instanceId: target.agent.instanceId,
      name: cmd.name,
    });
    return viewOf({ ...target, agent: result.agent }, workspacesByTab(hello.snapshot));
  });
  printJson({ agent });
}
