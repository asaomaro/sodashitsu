import {
  AGENT_START_DEFAULT_TIMEOUT_MS,
  agentStartExecutable,
  INVALID_AGENT_NAME_MESSAGE,
  INVALID_AGENT_TIMEOUT_MESSAGE,
  isValidAgentName,
  isValidAgentStartTimeout,
  RpcError,
  type AgentStartParams,
  type AgentStartResult,
} from "@sodashitsu/protocol";
import type { ForegroundJob, ProcessInspector } from "../platform/ProcessInspector.js";
import type { SessionService } from "../session/SessionService.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import {
  buildStartLine,
  checkShell,
  hasControlChar,
  MAX_START_LINE_BYTES,
  START_INTERRUPT_DELAY_MS,
  startInput,
} from "./agentStart.js";

/**
 * `agent start`（20260926-agent-start design「サーバ `AgentStarter.start`」）。herdr の `start_agent`（`src/app/agents.rs`）に合わせ、
 * 検査を順に行い、最初の誤りで何も書かずに返す。打ち込んだ時点で返し、起動完了は呼び出し側が待つ。
 */

/** `AgentMonitor` の `PROCESS_INSPECTOR_TIMEOUT_MS` と同じ上限。 */
const DEFAULT_INSPECT_TIMEOUT_MS = 2000;

export interface AgentStarterOptions {
  session: Pick<
    SessionService,
    | "getPane"
    | "assertAgentNameAvailable"
    | "beginAgentLaunch"
    | "endAgentLaunch"
    | "hasAgentLaunch"
    | "hasPendingResume"
  >;
  terminals: Pick<TerminalManager, "get">;
  processInspector: Pick<ProcessInspector, "foregroundJob">;
  platform?: NodeJS.Platform;
  inspectTimeoutMs?: number;
}

function busy(paneId: string): RpcError {
  return new RpcError("agent_pane_busy", `agent target pane ${paneId} is not an available shell`);
}

export class AgentStarter {
  private readonly platform: NodeJS.Platform;
  private readonly inspectTimeoutMs: number;

  constructor(private readonly opts: AgentStarterOptions) {
    this.platform = opts.platform ?? process.platform;
    this.inspectTimeoutMs = opts.inspectTimeoutMs ?? DEFAULT_INSPECT_TIMEOUT_MS;
  }

  /** `onAccepted` は検査を全部通って予約した直後・書き込みの前に呼ぶ（拒否した要求は呼ばない。agent.prompt の記録の順に合わせる）。 */
  async start(params: AgentStartParams, onAccepted?: () => void): Promise<AgentStartResult> {
    const { name, kind, paneId, args } = params;
    if (!isValidAgentName(name))
      throw new RpcError("invalid_agent_name", INVALID_AGENT_NAME_MESSAGE);
    const executable = agentStartExecutable(kind);
    if (executable === null)
      throw new RpcError("unsupported_agent_kind", `unsupported interactive agent kind ${kind}`);
    if (args.some(hasControlChar)) {
      throw new RpcError(
        "invalid_agent_argument",
        "agent arguments must not contain control characters",
      );
    }
    const timeoutMs = params.timeoutMs ?? AGENT_START_DEFAULT_TIMEOUT_MS;
    if (!isValidAgentStartTimeout(timeoutMs))
      throw new RpcError("invalid_agent_timeout", INVALID_AGENT_TIMEOUT_MESSAGE);
    const line = buildStartLine(executable, args);
    if (Buffer.byteLength(line, "utf8") > MAX_START_LINE_BYTES) {
      throw new RpcError(
        "invalid_agent_argument",
        `agent command line exceeds ${MAX_START_LINE_BYTES} bytes`,
      );
    }
    this.opts.session.assertAgentNameAvailable(name, null);
    const host = this.requireIdlePane(paneId);
    if (this.platform === "win32") {
      throw new RpcError(
        "unsupported_agent_shell",
        "agent start is not supported on a Windows server yet",
      );
    }

    const shell = checkShell(await this.foregroundJob(host.pid), host.pid);
    if (shell.kind === "busy") throw busy(paneId);
    if (shell.kind === "unsupported") {
      throw new RpcError(
        "unsupported_agent_shell",
        `agent start does not support shell ${shell.shell} yet`,
      );
    }

    // 前面を待つ間に pane の close・他の起動・rename が割り込みうるので、同期のまま確かめ直してから予約する
    // （名前は beginAgentLaunch の中で assertAgentNameAvailable がもう一度検査する）。
    const current = this.requireIdlePane(paneId);
    if (current !== host) throw busy(paneId);
    const token = this.opts.session.beginAgentLaunch(paneId, name, kind);
    try {
      onAccepted?.();
      await host.writeModal({
        // 書く直前（他の入力を後回しにしている間）に前面をもう一度確かめる。最初の確認の後にブラウザ等から始まった
        // プログラム（vim 等）に Ctrl-C とコマンド行を打ち込まない（review ラウンド 1）。
        prepare: async () => {
          const again = checkShell(await this.foregroundJob(host.pid), host.pid);
          if (again.kind !== "available") throw busy(paneId);
        },
        build: (modes) => {
          // 他の入力の後ろで待つ間にエージェントが検出されていたら、その入力欄に打ち込まない（agent.prompt と同じ）。
          if (this.opts.session.getPane(paneId)?.agent !== null) throw busy(paneId);
          return startInput(line, modes.bracketedPaste);
        },
        delayMs: START_INTERRUPT_DELAY_MS,
      });
    } catch (err) {
      this.opts.session.endAgentLaunch(paneId, token);
      if (err instanceof RpcError) throw err;
      throw new RpcError(
        "agent_start_input_failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    const timer = setTimeout(() => this.opts.session.endAgentLaunch(paneId, token), timeoutMs);
    timer.unref?.();
    return { paneId, name, kind, argv: [executable, ...args] };
  }

  private requireIdlePane(paneId: string): TerminalHost {
    const pane = this.opts.session.getPane(paneId);
    const host = this.opts.terminals.get(paneId);
    if (!pane || !host)
      throw new RpcError("agent_pane_not_found", `agent target pane ${paneId} not found`);
    // 復元で打ち込んだ会話の再開がまだ検出されていない pane にも打ち込まない（Ctrl-C で再開を捨てる・再開したエージェントに打ち込むのを避ける）。
    const session = this.opts.session;
    if (pane.agent !== null || session.hasAgentLaunch(paneId) || session.hasPendingResume(paneId))
      throw busy(paneId);
    return host;
  }

  /** 上限つきで待つ。reject・時間切れは null（確かめられないものは空きとみなさない）。 */
  private foregroundJob(pid: number): Promise<ForegroundJob | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), this.inspectTimeoutMs);
      timer.unref?.();
      this.opts.processInspector.foregroundJob(pid).then(
        (job) => {
          clearTimeout(timer);
          resolve(job);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
      );
    });
  }
}
