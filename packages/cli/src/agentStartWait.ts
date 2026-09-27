import type { AgentInfo } from "@sodashitsu/protocol";
import { statusOf } from "./agentStatus.js";

/**
 * `agent start` の起動完了の判定（20260926-agent-start design「`StartWait.observe`」）。herdr の `wait_for_named_agent`
 * （`src/cli/agent.rs`）に合わせる。時計は持たない（締め切りは呼び出し側）。
 */

export type StartVerdict =
  | { kind: "pending" }
  | { kind: "ready"; agent: AgentInfo }
  | { kind: "failed"; code: string; message: string };

const PENDING: StartVerdict = { kind: "pending" };

function failed(code: string, message: string): StartVerdict {
  return { kind: "failed", code, message };
}

export class StartWait {
  /** 種類と名前が合う検出を初めて見たときの instanceId。 */
  private named: string | null = null;

  constructor(
    private readonly name: string,
    private readonly kind: string,
  ) {}

  /** その pane の今のエージェント。上の条件から順に当てる。 */
  observe(agent: AgentInfo | null): StartVerdict {
    if (agent === null) {
      return this.named === null
        ? PENDING
        : failed("agent_start_failed", `agent ${this.name} exited before becoming ready`);
    }
    if (agent.kind !== this.kind) {
      return failed("agent_kind_mismatch", `expected ${this.kind}, detected ${agent.kind}`);
    }
    if (agent.name !== this.name) {
      return failed(
        "agent_start_failed",
        `the detected ${agent.kind} agent is not named ${this.name}`,
      );
    }
    if (this.named !== null && agent.instanceId !== this.named) {
      return failed("agent_start_failed", `agent ${this.name} was replaced before becoming ready`);
    }
    this.named = agent.instanceId;
    const status = statusOf(agent);
    if (status === "blocked") {
      return failed(
        "agent_not_ready",
        `agent ${this.name} is blocked during startup and is not ready for prompts`,
      );
    }
    if (status === "idle" || status === "done") return { kind: "ready", agent };
    return PENDING;
  }

  paneClosed(): StartVerdict {
    return failed("agent_start_failed", `the pane of agent ${this.name} was closed`);
  }
}
