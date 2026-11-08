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
const fs = require("node:fs");
const path = require("node:path");

function readStdin(maxBytes) {
  return new Promise((resolve) => {
    let data = "", seenBytes = 0, overflow = false;
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      if(maxBytes!==undefined&&(seenBytes+=Buffer.byteLength(chunk,"utf8"))>maxBytes){overflow=true;data="";}
      if(!overflow)data += chunk;
    });
    process.stdin.on("end", () => resolve(overflow?"":data));
    // stdin が閉じられない・そもそも tty で待ち続ける事故を避ける（design「4.」：hook は
    // 起動を遅延させてはいけない。`async: true` 前提だが、二重の安全策として自前でも短く切る）。
    setTimeout(() => resolve(overflow?"":data), 2000).unref();
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

/**
 * 報告したエージェント自身のプロセスの pid（20261009-agent-session-attribution）。サーバは、これが、その pane の前面のエージェントの
 * プロセスかを確かめて、別のプログラム（pane の中で起動した子のエージェント・常駐のプロセスの中で動いたフック）の報告で、会話の参照が
 * すり替わらないようにする。取れなければ付けない（サーバは、今までどおり受ける）。
 * - Claude Code: フックの環境変数 `CLAUDE_PID`（その `claude` のプロセス。子が起動した `claude` は、自分の pid を入れる）。
 * - ほか・無いとき: Linux の `/proc` で、フックの親をたどり、最も近い、名前（comm・argv[0]・argv[1] の basename）が `kind` のプロセス。
 * これは、取り違えを防ぐ材料で、安全の境界ではない（pane の中のプログラムは、好きな値を送れる）。
 */
function agentPidOf(kind) {
  const fromEnv = Number(process.env.CLAUDE_PID);
  if (kind === "claude" && Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv <= 0x7fffffff) return fromEnv;
  if (process.platform !== "linux") return undefined;
  const want = String(kind).toLowerCase();
  const nameOf = (s) => path.basename(String(s)).replace(/\.(c|m)?js$/i, "").toLowerCase();
  let pid = process.ppid;
  for (let i = 0; i < 4 && pid > 1; i++) { // フックは、エージェントの直の子か、`sh -c` を挟んだ孫。遠い祖先まではたどらない（別のエージェントの中で動かしたとき、外側のエージェントを拾わない）
    let comm = "";
    let argv = [];
    let ppid = 0;
    try {
      comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
      argv = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter((x) => x.length > 0);
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[1]);
    } catch {
      return undefined;
    }
    if ([comm, argv[0], argv[1]].some((n) => n !== undefined && (nameOf(n) === want || kind === "cursor" && nameOf(n) === "cursor-agent" || kind === "muse" && /^muse-bin-\d[\w.-]*$/.test(nameOf(n))))) return pid;
    if (!Number.isFinite(ppid) || ppid <= 1) return undefined;
    pid = ppid;
  }
  return undefined;
}

/** Muse clears hook env. Recover only routing fields from its nearest Linux ancestor. */
function museRouting(pid) {
  if (process.platform !== "linux" || !pid) return {};
  let fd;
  try {
    if (fs.statSync(`/proc/${pid}`).uid !== process.getuid()) return {};
    const before = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    fd = fs.openSync(`/proc/${pid}/environ`, "r");
    const buffer = Buffer.alloc(65537), size = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (size > 65536) return {};
    const after = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const start = stat => stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
    if (start(before) !== start(after)) return {};
    const values = buffer.subarray(0,size).toString("utf8").split("\0");
    const value = key => values.find(v => v.startsWith(key+"="))?.slice(key.length+1);
    const paneId=value("SODA_PANE_ID"),sock=value("SODA_AGENT_REPORT_SOCKET");
    if (!paneId || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(paneId) || !sock || !path.isAbsolute(sock) || sock.length>1024) return {};
    return {paneId,sock};
  } catch { return {}; }
  finally { if(fd!==undefined)fs.closeSync(fd); }
}

async function main() {
  const kind = process.argv[2];
  const routing = kind === "muse" && (!process.env.SODA_PANE_ID || !process.env.SODA_AGENT_REPORT_SOCKET) ? museRouting(agentPidOf(kind)) : {};
  const paneId = routing.paneId || process.env.SODA_PANE_ID;
  const sock = routing.sock || process.env.SODA_AGENT_REPORT_SOCKET;
  if (!paneId || !sock || !kind) return; // 本製品の pane の外・未対応の呼び出し方 → 無害に終わる

  const raw = await readStdin(kind === "cursor" ? 2*1024*1024 : undefined);
  let sessionId;
  let extra;
  let childExtra;
  let executionSettings;
  let origin = {}; // 作業フォルダ・会話が始まった理由（サーバが、報告の持ち主を確かめる材料）・会話の記録の場所（利用状況の材料）
  try {
    const payload = JSON.parse(raw);
    // `session_id`（snake_case。Claude Code・Codex・Cursor・Devin・Droid・Qwen Code）と
    // `sessionId`（camelCase。Grok CLI・GitHub Copilot CLI の一部）の両方を受ける
    // （20260923-other-agents-session-resume design「hook スクリプト」・research.md F4）。
    sessionId = payload && (payload.session_id || payload.sessionId || (kind === "agy" && payload.conversationId));
    if (payload && typeof payload === "object") {
      origin = compact({
        cwd: typeof payload.cwd === "string" && payload.cwd !== "" && payload.cwd.length <= 1024 && !payload.cwd.includes("\0") ? payload.cwd : undefined,
        source: typeof payload.source === "string" && /^[a-z_]{1,16}$/.test(payload.source) ? payload.source : undefined,
        // 会話の記録の場所（中身ではない）。利用状況（20261010-agent-usage）が、サーバの側で場所を確かめて、記録を読む材料にする。
        transcriptPath: pathOf(payload.transcript_path),
      });
    }
    if (payload && typeof payload === "object" && kind === "cursor" &&
        (payload.hook_event_name === "subagentStop" || payload.hook_event_name === "afterAgentResponse" &&
         (payload.subagent_id || payload.agent_id || payload.parent_conversation_id && payload.parent_conversation_id !== payload.conversation_id))) {
      // A separate child channel preserves all of the parent-usage route's existing rejection rules.
      const uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
      const stop=payload.hook_event_name==="subagentStop",parent=payload.parent_conversation_id;
      const child=stop?payload.child_conversation_id:payload.conversation_id;
      const rawContext=payload.conversation_id,context=uuid(rawContext)&&
        (payload.session_id===undefined||payload.session_id===rawContext)&&(payload.sessionId===undefined||payload.sessionId===rawContext)?rawContext:undefined;
      if(!uuid(child)||stop&&(!uuid(parent)||parent===child)||parent!==undefined&&(!uuid(parent)||parent===child)||
        payload.child_conversation_id!==undefined&&payload.child_conversation_id!==child)return;
      if(!stop&&context!==child)return;
      const generation=payload.generation_id,validGeneration=typeof generation==="string"&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(generation);
      if(!stop&&!validGeneration||generation!==undefined&&!validGeneration)return;
      const logical=typeof payload.subagent_id==="string"&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(payload.subagent_id)?payload.subagent_id:undefined;
      const childType=typeof payload.subagent_type==="string"&&payload.subagent_type.length>0&&payload.subagent_type.length<=200&&!/[\x00-\x1f\x7f-\x9f]/.test(payload.subagent_type)?payload.subagent_type:undefined;
      if(stop&&(!logical||!childType||!["completed","aborted","error"].includes(payload.status)))return;
      const params=Array.isArray(payload.model_params)&&payload.model_params.length<=32?payload.model_params.filter(p=>p&&p.id==="effort"):[];
      const effort=params.length===1&&typeof params[0].value==="string"&&/^[a-zA-Z0-9_.-]{1,64}$/.test(params[0].value)?params[0].value:undefined;
      const selected=payload.model_id||payload.model;
      const model=typeof selected==="string"&&selected.length>0&&selected.length<=200&&!/[\x00-\x1f\x7f-\x9f]/.test(selected)?selected:undefined;
      sessionId=stop?parent:child;origin={};
      extra=compact({type:"cursor_child",phase:stop?"stop":"observation",parentId:parent,childId:child,contextSessionId:context,
        generationId:validGeneration?generation:undefined,logicalId:stop?logical:undefined,childType:stop?childType:undefined,status:stop?payload.status:undefined,
        model:context===child?model:undefined,reasoningEffort:context===child?effort:undefined});
    } else if (payload && typeof payload === "object" && kind === "cursor" && payload.hook_event_name === "afterAgentResponse") {
      // A child has its own conversation; never attribute it by the parent's pane env alone.
      const conversation=payload.conversation_id;
      if(typeof conversation!=="string"||!conversation||payload.subagent_id||payload.agent_id||
        payload.parent_conversation_id&&payload.parent_conversation_id!==conversation||
        payload.session_id&&payload.session_id!==conversation||payload.sessionId&&payload.sessionId!==conversation)return;
      const generation=payload.generation_id;
      if(typeof generation!=="string"||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(generation))return;
      sessionId=conversation;origin={};
      const params=Array.isArray(payload.model_params)&&payload.model_params.length<=32?payload.model_params.filter(p=>p&&p.id==="effort"):[];
      const effort=params.length===1&&typeof params[0].value==="string"&&/^[a-zA-Z0-9_.-]{1,64}$/.test(params[0].value)?params[0].value:undefined;
      const numeric=v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:undefined;
      extra=compact({type:"cursor_turn_usage",generationId:generation,
        model:cut(payload.model_id||payload.model,200),reasoningEffort:effort,
        inputTokens:numeric(payload.input_tokens),outputTokens:numeric(payload.output_tokens),
        cacheReadTokens:numeric(payload.cache_read_tokens),cacheWriteTokens:numeric(payload.cache_write_tokens)});
      const rawModel=payload.model_id||payload.model;
      const ownModel=typeof rawModel==="string"&&rawModel.length>0&&rawModel.length<=200&&!/[\x00-\x1f\x7f-\x9f]/.test(rawModel)?rawModel:undefined;
      // Independent metadata receipt: parent numeric validation stays unchanged,
      // and child identifiers are never taken from trimmed/truncated usage labels.
      childExtra=compact({type:"cursor_child",phase:"observation",generationId:generation,childId:conversation,contextSessionId:conversation,model:ownModel,reasoningEffort:effort});
    }
    if (payload && typeof payload === "object" && kind === "claude") {
      // Only the parent hook scope. Child-agent permission overrides must not be reported as the parent's.
      if (!payload.agent_id && !payload.agent_type && ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"].includes(payload.hook_event_name) && ["default", "plan", "acceptEdits", "auto", "dontAsk", "bypassPermissions"].includes(payload.permission_mode))
        executionSettings = { permissionMode: { value: payload.permission_mode, source: "hook", basis: "hook" } };
      extra = typedFields(payload);
      if (extra === null) return;
    }
  } catch {
    return; // stdin が JSON でない・解釈できない入力 → 何もしない
  }
  if (!sessionId || typeof sessionId !== "string") return;

  const deadline = childExtra ? performance.now() + 1000 : undefined;
  let agentPid, probed = false;
  // Preserve the primary parent receipt first, within the original one-second total budget.
  for (const fields of (childExtra ? [extra, childExtra] : [extra])) {
    if (deadline !== undefined && performance.now() >= deadline) break;
    await new Promise((resolve) => {
    const conn = net.connect(sock, () => {
      if (!probed) { agentPid = agentPidOf(kind); probed = true; }
      conn.end(`${JSON.stringify({ paneId, kind, sessionId, ...(agentPid !== undefined ? { agentPid } : {}), ...origin, ...fields, ...(executionSettings ? { executionSettings } : {}) })}\n`);
    });
    conn.on("error", () => resolve()); // サーバが落ちている等 → 黙って諦める（report は best-effort）
    conn.on("close", () => resolve());
    // 接続自体が詰まっても、hook 呼び出し元を長く待たせない。
    setTimeout(() => {
      conn.destroy();
      resolve();
    }, deadline === undefined ? 1000 : Math.max(1, deadline - performance.now())).unref();
    });
  }
}

main().catch(() => {
  // 何が起きても非ゼロ終了にしない（SessionStart を壊さない。research.md F4.4）。
});
