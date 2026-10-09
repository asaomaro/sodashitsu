#!/usr/bin/env node
"use strict";

/**
 * 公式フック連携（20260923-agent-session-resume）の hook スクリプト本体。
 * Claude Code の `SessionStart` hook・Codex の `hooks.SessionStart` から
 * `node <このファイル> <claude|codex>` の形で起動される想定（AgentIntegrationInstaller が登録する）。
 *
 * 本製品の pane の**外**で（利用者が自分の端末で直接 `claude`/`codex` を使ったときに）呼ばれても、
 * 環境変数（`SODA_PANE_ID`/`SODA_AGENT_REPORT_SOCKET`）が無いので何もせず終わる——この hook は
 * 常にグローバルな設定に登録されるため、無害であることが最優先（design「5. hook スクリプト」）。
 *
 * Claude Code では、サブエージェントの表示（20261004-subagent-display）のために `PreToolUse`（Agent）・`SubagentStart`・
 * `SubagentStop`・`Stop`・`SessionEnd` からも呼ばれる。フックの入力の `hook_event_name` で報告の種類（`type`）を分け、
 * 同じ 1 行の電文に項目を足して送る（`type` の無い電文は今までどおりセッション ID の報告）。`prompt`・`last_assistant_message`
 * は読まない・送らない（`transcript_path`〔親の記録の場所。ファイルの中身ではない〕と、入れ子の親の id〔`agent_id`〕は送る。20261008-graph-first PR6）。上限（説明 200・種類 64・ID 128・`running` 64 件）はここでも掛ける（受け口でも掛ける）。
 *
 * **stdout には何も書かない**——`SessionStart` の stdout は Claude Code の会話コンテキストへ
 * そのまま追加されうる（research.md F4.4）。診断が要るときは stderr にだけ書く。
 */

const net = require("node:net");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    // stdin が閉じられない・そもそも tty で待ち続ける事故を避ける（design「4.」：hook は
    // 起動を遅延させてはいけない。`async: true` 前提だが、二重の安全策として自前でも短く切る）。
    setTimeout(() => resolve(data), 2000).unref();
  });
}

const MAX_DESCRIPTION = 200;
const MAX_AGENT_TYPE = 64;
const MAX_ID = 128;
const MAX_RUNNING = 64;
const MAX_PATH = 1024;

/** 文字（コードポイント）単位で切る。空・文字列でないものは undefined。 */
function cut(value, max) {
  if (typeof value !== "string" || value === "") return undefined;
  const chars = Array.from(value);
  return chars.length > max ? chars.slice(0, max).join("") : value;
}

/**
 * ファイルの場所は、切らない（切った別の場所にならない）。空・文字列でない・`MAX_PATH` 文字を超える・NUL を含むものは undefined。
 * 親の記録の場所（`transcript_path`）を、サーバが記録の場所を組み立てる材料として送る。中身は読まない。
 */
function pathOf(value) {
  if (typeof value !== "string" || value === "" || value.includes("\0")) return undefined;
  return Array.from(value).length > MAX_PATH ? undefined : value;
}

/** 値が undefined の項目を除く（電文に載せない）。 */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * `kind === "claude"` のサブエージェント関連のフックを、`type` つきの項目に直す。
 * `null` は「何も送らない」（Agent 以外の `PreToolUse`・ID が無い等）、`undefined` は「今までどおりセッション ID の報告」。
 */
function typedFields(payload) {
  // agent_id は 1 文字多く（MAX_ID + 1 文字まで）残す。128 文字を超える ID は、切らずに受け口が捨てる（切った別の ID にならない）。
  const input = payload.tool_input && typeof payload.tool_input === "object" ? payload.tool_input : {};
  switch (payload.hook_event_name) {
    case "PreToolUse":
      if (payload.tool_name !== "Agent" && payload.tool_name !== "Task") return null;
      return compact({
        type: "subagent_pending",
        description: cut(input.description, MAX_DESCRIPTION),
        agentType: cut(input.subagent_type, MAX_AGENT_TYPE),
        background: typeof input.run_in_background === "boolean" ? input.run_in_background : undefined,
        // 親のサブエージェントの id（サブエージェントの中から呼ぶときだけ入力にある。メインが呼ぶときは無い）。入れ子の親子を結ぶ。
        parentAgentId: cut(payload.agent_id, MAX_ID + 1),
        transcriptPath: pathOf(payload.transcript_path),
      });
    case "SubagentStart": {
      const agentId = cut(payload.agent_id, MAX_ID + 1);
      if (!agentId) return null;
      return compact({
        type: "subagent_start",
        agentId,
        agentType: cut(payload.agent_type, MAX_AGENT_TYPE),
        transcriptPath: pathOf(payload.transcript_path),
      });
    }
    case "SubagentStop": {
      const agentId = cut(payload.agent_id, MAX_ID + 1);
      if (!agentId) return null;
      return { type: "subagent_stop", agentId };
    }
    case "Stop": {
      const tasks = payload.background_tasks;
      // 一覧が無い（古い Claude Code）ときは「足すだけ・外さない」にして、動いているものを誤って外さない。
      if (!Array.isArray(tasks)) return { type: "agent_stop", running: [], truncated: true };
      const running = [];
      let truncated = false;
      for (const t of tasks) {
        if (!t || t.type !== "subagent" || t.status !== "running") continue;
        if (typeof t.id !== "string" || t.id === "" || Array.from(t.id).length > MAX_ID) continue;
        if (running.length >= MAX_RUNNING) {
          truncated = true;
          break;
        }
        running.push(compact({ id: t.id, agentType: cut(t.agent_type, MAX_AGENT_TYPE), description: cut(t.description, MAX_DESCRIPTION) }));
      }
      return truncated ? { type: "agent_stop", running, truncated: true } : { type: "agent_stop", running };
    }
    case "SessionEnd":
      return { type: "session_end" };
    default:
      return undefined;
  }
}

async function main() {
  const paneId = process.env.SODA_PANE_ID;
  const sock = process.env.SODA_AGENT_REPORT_SOCKET;
  const kind = process.argv[2];
  if (!paneId || !sock || !kind) return; // 本製品の pane の外・未対応の呼び出し方 → 無害に終わる

  const raw = await readStdin();
  let sessionId;
  let extra;
  try {
    const payload = JSON.parse(raw);
    // `session_id`（snake_case。Claude Code・Codex・Cursor・Devin・Droid・Qwen Code）と
    // `sessionId`（camelCase。Grok CLI・GitHub Copilot CLI の一部）の両方を受ける
    // （20260923-other-agents-session-resume design「hook スクリプト」・research.md F4）。
    sessionId = payload && (payload.session_id || payload.sessionId);
    if (payload && typeof payload === "object" && kind === "claude") {
      extra = typedFields(payload);
      if (extra === null) return;
    }
  } catch {
    return; // stdin が JSON でない・解釈できない入力 → 何もしない
  }
  if (!sessionId || typeof sessionId !== "string") return;

  await new Promise((resolve) => {
    const conn = net.connect(sock, () => {
      conn.end(`${JSON.stringify({ paneId, kind, sessionId, ...extra })}\n`);
    });
    conn.on("error", () => resolve()); // サーバが落ちている等 → 黙って諦める（report は best-effort）
    conn.on("close", () => resolve());
    // 接続自体が詰まっても、hook 呼び出し元を長く待たせない。
    setTimeout(() => {
      conn.destroy();
      resolve();
    }, 1000).unref();
  });
}

main().catch(() => {
  // 何が起きても非ゼロ終了にしない（SessionStart を壊さない。research.md F4.4）。
});
