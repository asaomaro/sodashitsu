import type { AgentInfo, PaneId, ServerEvent } from "@sodashitsu/protocol";
import { outputText, paneNameOf } from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import type { SessionService } from "../session/SessionService.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import type { InvokeResult } from "../surface/ControlSurface.js";
import { AgentPortError, type AgentPort, type AgentStatusEvent } from "./AgentPort.js";

/**
 * 手元の pane への口（20260927-agent-graph の design D-1・D-2）。状態は bus の `pane.agent_status_changed`（`SessionService.updatePaneRuntime` の 1 か所から出る）と
 * `pane.closed`、送信は方式の `agent.prompt` をサーバの中から呼ぶ（新しい送信の経路を作らない）、画面の末尾はミラーの `bottomLines`。
 */
export interface LocalAgentPortDeps {
  bus: { subscribe(fn: (e: ServerEvent) => void): Disposable };
  session: Pick<SessionService, "getPane">;
  terminals: Pick<TerminalManager, "get">;
  /** `ControlSurface.invoke` を内部の clientId で呼ぶもの。 */
  invoke(method: "agent.prompt", params: { paneId: PaneId; text: string }): Promise<InvokeResult>;
}

export class LocalAgentPort implements AgentPort {
  readonly machine = "local";

  constructor(private readonly deps: LocalAgentPortDeps) {}

  available(): boolean {
    return true;
  }

  onStatus(cb: (e: AgentStatusEvent) => void): Disposable {
    return this.deps.bus.subscribe((e) => {
      if (e.event === "pane.agent_status_changed")
        cb({ paneId: e.data.paneId, agent: e.data.agent });
      else if (e.event === "pane.closed") cb({ paneId: e.data.paneId, agent: null });
    });
  }

  onAvailability(): Disposable {
    return { dispose: () => undefined }; // 手元は切れない
  }

  status(paneId: PaneId): AgentInfo | null {
    return this.deps.session.getPane(paneId)?.agent ?? null;
  }

  machineLabel(): null {
    return null;
  }

  paneName(paneId: PaneId): string | null {
    const pane = this.deps.session.getPane(paneId);
    return pane === undefined ? null : paneNameOf(pane);
  }

  async tail(paneId: PaneId, lines: number): Promise<string> {
    const host = this.deps.terminals.get(paneId);
    if (host === undefined) return "";
    await host.mirror.flush(); // 書き込まれた出力を反映してから読む
    // 論理行（折り返しをつないだ行。長いパス・URL を途中で切らない）で数え、末尾の空行は除く。
    return outputText(host.mirror.lastLogicalLines(lines));
  }

  async prompt(paneId: PaneId, text: string): Promise<void> {
    const r = await this.deps.invoke("agent.prompt", { paneId, text });
    if (!r.ok) throw new AgentPortError(r.error.code, r.error.message);
  }
}
