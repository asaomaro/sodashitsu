import {
  AgentPromptParams,
  AgentRenameParams,
  AgentSendKeysParams,
  AgentStartParams,
  RpcError,
} from "@sodashitsu/protocol";
import type { AgentInfo } from "@sodashitsu/protocol";
import {
  AGENT_PROMPT_SUBMIT_DELAY_MS,
  encodeKey,
  parseKey,
  pastePayload,
  type KeySpec,
} from "../../agent/agentInput.js";
import type { TerminalHost } from "../../terminal/TerminalHost.js";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * エージェントへの入力（20260926-agent-prompt-send-keys design.md「`agent.prompt`（サーバ）」「`agent.send_keys`（サーバ）」）。
 * herdr の `agent.prompt` / `agent.send_keys`（`src/app/api/agents.rs`）に合わせる。対象は pane ID だけ。
 */

const NO_MODES = { bracketedPaste: false, applicationCursorKeys: false };

function requireAgent(
  deps: MethodDeps,
  paneId: string,
  expectedInstanceId: string | undefined,
): { agent: AgentInfo; host: TerminalHost } {
  const pane = deps.session.getPane(paneId);
  if (!pane) throw new RpcError("agent_not_found", `pane not found: ${paneId}`);
  if (!pane.agent) throw new RpcError("agent_not_found", `no agent detected in pane: ${paneId}`);
  // 呼び出し側（CLI の hello）が見たエージェントから入れ替わっていたら送らない（review ラウンド1。decisions.md D12）。
  if (expectedInstanceId !== undefined && pane.agent.instanceId !== expectedInstanceId) {
    throw new RpcError(
      "agent_not_found",
      `agent ${expectedInstanceId} is no longer running in pane: ${paneId}`,
    );
  }
  const host = deps.terminals.get(paneId);
  if (!host) throw new RpcError("agent_not_found", `pane not found: ${paneId}`);
  return { agent: pane.agent, host };
}

/** 書く直前にも同じエージェントが居ることを確かめる（decisions.md D7）。居なければ・入れ替わっていれば agent_not_found。 */
function requireSameAgent(deps: MethodDeps, paneId: string, expected: AgentInfo): AgentInfo {
  const now = deps.session.getPane(paneId)?.agent ?? null;
  if (now === null || now.instanceId !== expected.instanceId) {
    throw new RpcError("agent_not_found", `agent is no longer running in pane: ${paneId}`);
  }
  return now;
}

function blockedError(paneId: string): RpcError {
  return new RpcError(
    "agent_blocked",
    `agent in pane ${paneId} is blocked and requires interactive input`,
  );
}

export function registerAgentMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("agent.prompt", {
    schema: AgentPromptParams,
    handler: async (ctx, params) => {
      if (params.text === "")
        throw new RpcError("empty_agent_prompt", "agent prompt must not be empty");
      const { agent, host } = requireAgent(deps, params.paneId, params.instanceId);
      // blocked（承認・質問の入力待ち）には何も書かない。答えるなら agent.send_keys で意図して送る。
      if (agent.state === "blocked") throw blockedError(params.paneId);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      // 返すのは本文を書く直前（送信を始める時点）のエージェント。受け付けた時点の値だと、待ち行列の間に working から
      // 戻った場合に CLI の --wait が活動の確認を省いてしまう（cross 点検）。
      let sentTo = agent;
      try {
        await host.writeModal({
          build: (modes) => {
            // 別の入力の後ろで待っている間に状態が変わりうるので、書く直前にもう一度確かめる
            // （承認ダイアログへの誤答・終了したエージェントの後のシェルへの誤入力を防ぐ。decisions.md D7）。
            const now = requireSameAgent(deps, params.paneId, agent);
            if (now.state === "blocked") throw blockedError(params.paneId);
            sentTo = now;
            return [pastePayload(params.text, modes.bracketedPaste), "\r"];
          },
          delayMs: AGENT_PROMPT_SUBMIT_DELAY_MS,
        });
      } catch (err) {
        if (err instanceof RpcError) throw err;
        throw new RpcError("agent_prompt_failed", err instanceof Error ? err.message : String(err));
      }
      return { agent: sentTo };
    },
  });

  surface.register("agent.send_keys", {
    schema: AgentSendKeysParams,
    handler: async (ctx, params) => {
      // 1 つでも不明なら何も書かない（herdr と同じく全部を検証してから書く）。
      const specs: KeySpec[] = [];
      for (const name of params.keys) {
        const spec = parseKey(name);
        if (spec === null || encodeKey(spec, NO_MODES) === null) {
          throw new RpcError("invalid_key", `unsupported key ${name}`);
        }
        specs.push(spec);
      }
      const { agent, host } = requireAgent(deps, params.paneId, params.instanceId);
      deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId);
      try {
        await host.writeModal({
          build: (modes) => {
            requireSameAgent(deps, params.paneId, agent);
            return [specs.map((s) => encodeKey(s, modes) ?? "").join("")];
          },
          delayMs: 0,
        });
      } catch (err) {
        if (err instanceof RpcError) throw err;
        throw new RpcError("agent_not_found", `pane closed: ${params.paneId}`);
      }
      return {};
    },
  });

  // 名前を付ける／外す（20260926-agent-start-rename）。PTY には何も書かない。
  surface.register("agent.rename", {
    schema: AgentRenameParams,
    handler: (_ctx, params) => ({
      agent: deps.session.renameAgent(params.paneId, params.instanceId, params.name),
    }),
  });

  // 空いているシェル pane でエージェントを起動する（20260926-agent-start）。打ち込んだ時点で返す。
  const starter = deps.agentStarter;
  if (starter) {
    surface.register("agent.start", {
      schema: AgentStartParams,
      // 起動したエージェントが操作したクライアントの大きさで始まるよう、打ち込む前に記録する。agent.prompt と同じく、
      // 検査を通った要求だけを記録する（拒否した busy の再試行等は記録しない。review ラウンド 1）。
      handler: (ctx, params) =>
        starter.start(params, () => deps.sizeAuthority.noteInteraction(ctx.clientId, params.paneId)),
    });
  }
}
