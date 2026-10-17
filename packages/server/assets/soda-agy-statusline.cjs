#!/usr/bin/env node
"use strict";

/**
 * Antigravity CLI statusLine command wrapper. Same stdin, original stdout/exit/signal handling.
 * Sends only bounded session, model, context and quota metadata over the local report socket.
 * No conversation text, email, credential, transcript path or speculative cost is sent.
 * Metadata schema: https://antigravity.google/docs/cli/statusline/
 * current_usage is shown with context basis; total_* is not assumed to be billed lifetime usage.
 * A missing original command emits no text; stack_with_default retains the built-in line.
 * Installation is explicit, Unix only, with the original setting retained for restoration.
 */

const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const SEND_BUDGET_MS = 200;
const STDIN_BUDGET_MS = 3000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 元の `statusLine` のオブジェクトの `command`。読めなければ undefined。控えが `null`（元は無かった）なら null。 */
function originalCommand() {
  const arg = process.argv[2];
  const fromJson = (text) => {
    let v = JSON.parse(text);
    // 控えの形: 古い形は元のオブジェクトそのもの（または null）。新しい形は `{ soda: 1, original, valueText? }`（元の値の文字列そのものも運ぶ）。
    if (v && typeof v === "object" && v.soda === 1 && "original" in v) v = v.original;
    if (v === null) return null;
    if (v && typeof v === "object" && typeof v.command === "string") return v.command;
    return undefined;
  };
  if (typeof arg === "string" && arg !== "") {
    try {
      // 引数から command が取れたときだけ、それを使う（大きすぎて引数に載せなかった `{soda:1}` などは、横のファイルへ進む）。
      const r = fromJson(Buffer.from(arg, "base64url").toString("utf8"));
      if (r !== undefined) return r;
    } catch {
      /* 次へ */
    }
  }
  try {
    const side = JSON.parse(fs.readFileSync(path.join(__dirname, "soda-agy-statusline.orig.json"), "utf8"));
    if (side && typeof side === "object" && "original" in side) {
      const o = side.original;
      if (o === null) return null;
      if (o && typeof o === "object" && typeof o.command === "string") return o.command;
    }
  } catch {
    /* 控えが読めない */
  }
  return undefined;
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    let done = false;
    let bytes = 0;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    };
    process.stdin.on("data", (c) => { bytes += c.length; if (bytes > 1048576) { chunks.length = 0; finish(); process.stdin.destroy(); } else chunks.push(c); });
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    setTimeout(finish, STDIN_BUDGET_MS).unref();
  });
}

const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const str = (v, max) => (typeof v === "string" && v !== "" && Array.from(v).length <= max ? v : undefined);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Only public numeric/model metadata crosses the socket; never account email, cwd or transcript. */
function buildReport(payload) {
  const paneId = process.env.SODA_PANE_ID;
  if (!paneId || !payload || typeof payload !== "object") return undefined;
  const sid = payload.conversation_id ?? payload.session_id;
  if (typeof sid !== "string" || !UUID_RE.test(sid)) return undefined;
  const model = payload.model || {};
  const ctx = payload.context_window || {};
  const cur = ctx.current_usage || {};
  const counts = [cur.input_tokens, cur.cache_creation_input_tokens, cur.cache_read_input_tokens].map(x => num(x, 0, 1e12));
  const quota = [];
  for (const [label, value] of Object.entries(payload.quota || {}).slice(0, 16)) {
    if (!/^[a-zA-Z0-9_.() -]{1,64}$/.test(label) || !value || typeof value !== "object") continue;
    const remaining = num(value.remaining_fraction, 0, 1);
    if (remaining === undefined) continue;
    const reset = typeof value.reset_time === "string" ? Date.parse(value.reset_time) / 1000 : undefined;
    // Relative reset seconds are meaningful only at the time of this report.
    const seconds = num(value.reset_in_seconds, 0, 1e9);
    quota.push(clean({ label, usedPct: (1 - remaining) * 100,
      resetsAt: num(reset, 0, 1e11) ?? (seconds === undefined ? undefined : Date.now() / 1000 + seconds) }));
  }
  return clean({ type: "usage", paneId, kind: "agy", sessionId: sid, agentPid: agentPid(),
    model: str(model.id, 128), modelName: str(model.display_name, 64),
    contextUsedPct: num(ctx.used_percentage, 0, 1000), contextWindowSize: num(ctx.context_window_size, 0, 1e12),
    contextTokens: counts.every(x => x !== undefined) ? counts.reduce((a,x) => a + x, 0) : undefined,
    inputTokens: num(cur.input_tokens, 0, 1e12), outputTokens: num(cur.output_tokens, 0, 1e12),
    cacheReadTokens: num(cur.cache_read_input_tokens, 0, 1e12), cacheWriteTokens: num(cur.cache_creation_input_tokens, 0, 1e12),
    quota: quota.length ? quota : undefined,
    configKey: crypto.createHash("sha256").update(path.join(os.homedir(), ".gemini", "antigravity-cli")).digest("hex").slice(0,16),
    agentState: ["idle", "thinking", "working", "tool_use", "initializing"].includes(payload.agent_state) ? payload.agent_state : undefined,
    toolConfirmationPending: typeof payload.tool_confirmation_pending === "boolean" ? payload.tool_confirmation_pending : undefined,
  });
}

/** このステータスラインを動かした `agy` のプロセスの pid（フックのスクリプトと同じ決まり）。 */
function agentPid() {
  const fromEnv = Number(process.env.ANTIGRAVITY_PID);
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv <= 0x7fffffff) return fromEnv;
  if (process.platform !== "linux") return undefined;
  const nameOf = (s) => path.basename(String(s)).replace(/\.(c|m)?js$/i, "").toLowerCase();
  let pid = process.ppid;
  for (let i = 0; i < 4 && pid > 1; i++) {
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
    if ([comm, argv[0], argv[1]].some((n) => n !== undefined && nameOf(n) === "agy")) return pid;
    if (!Number.isFinite(ppid) || ppid <= 1) return undefined;
    pid = ppid;
  }
  return undefined;
}

/** 1 行を、待たずに（上限つきで）送る。解決は成功・失敗のどちらでも（黙って捨てる）。 */
function sendReport(report) {
  return new Promise((resolve) => {
    const sock = process.env.SODA_AGENT_REPORT_SOCKET;
    if (!sock || report === undefined) return resolve();
    let line;
    try {
      line = JSON.stringify(report) + "\n";
    } catch {
      return resolve();
    }
    const c = net.connect(sock);
    const timer = setTimeout(() => {
      c.destroy();
      resolve();
    }, SEND_BUDGET_MS);
    timer.unref();
    const end = () => {
      clearTimeout(timer);
      resolve();
    };
    c.on("connect", () => c.end(line, end));
    c.on("error", end);
    c.on("close", end);
  });
}

async function main() {
  const command = originalCommand();
  const input = await readStdin();
  let payload;
  try {
    payload = JSON.parse(input.toString("utf8"));
  } catch {
    payload = undefined;
  }
  let report;
  try {
    report = buildReport(payload);
  } catch {
    report = undefined;
  }
  const sent = report ? sendReport({ paneId: report.paneId, kind: "agy", sessionId: report.sessionId, agentPid: report.agentPid }).then(() => sendReport(report)) : Promise.resolve();

  if (typeof command !== "string") {
    // 元が無い（`statusLine` が無かった）・読めない: 何も出さずに 0。報告だけ送る。
    await sent;
    return 0;
  }

  const code = await new Promise((resolve) => {
    let child;
    try {
      // `detached: true`（setsid）で、元とその子孫を 1 つのプロセスグループにまとめる。stdio は今までどおり（stdin だけ pipe）。
      child = spawn("sh", ["-c", command], { stdio: ["pipe", "inherit", "inherit"], env: process.env, detached: true });
    } catch {
      return resolve(0);
    }
    const gid = child.pid;
    const killGroup = (sig) => {
      if (typeof gid !== "number") return;
      try {
        process.kill(-gid, sig);
      } catch {
        try {
          child.kill(sig);
        } catch {
          /* 既に終わっている */
        }
      }
    };
    let running = true;
    // どの道で終わるときも（例外・exit）、元が残っていればグループごと止める。
    process.on("exit", () => {
      if (running) killGroup("SIGKILL");
    });
    const forward = (sig) => () => {
      killGroup(sig);
      // 元が取り消しに応じなくても、Antigravity CLI を待たせない。グループへ SIGKILL してから終わる。
      const t = setTimeout(() => {
        killGroup("SIGKILL");
        process.exit(128 + (os.constants.signals[sig] || 15));
      }, 1000);
      t.unref();
    };
    for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, forward(sig));
    child.on("error", () => resolve(0));
    child.stdin.on("error", () => undefined);
    child.on("close", (c, signal) => {
      running = false;
      if (typeof c === "number") return resolve(c);
      const n = signal && os.constants.signals[signal];
      resolve(typeof n === "number" ? 128 + n : 1);
    });
    child.stdin.end(input);
  });
  await sent;
  return code;
}

main().then(
  (code) => process.exit(code),
  () => process.exit(0),
);
