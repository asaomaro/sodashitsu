#!/usr/bin/env node
"use strict";

/**
 * Claude Code のステータスラインの包み（20261010-agent-usage の PR2）。`settings.json` の `statusLine.command` が
 * `node "<このファイル>" <元の statusLine の控え（base64url）>` を指す。
 *
 * 1. 元のコマンドを、**シェルを通して**（Claude Code と同じ）起動し、同じ stdin の JSON を渡して、その stdout・終了コードを**そのまま**返す。
 *    元が無ければ（控えが `null`）、何も出さずに 0 で終わる。元のコマンドが起動できなくても、何も出さずに終わる（元と同じ振る舞い）。
 * 2. `SODA_PANE_ID` と `SODA_AGENT_REPORT_SOCKET` があるときだけ、数字と id だけの 1 行（`type: "usage"`）を `agent-report.sock` へ、**待たずに**送る
 *    （接続・書き込みに 200ms の自前の上限。失敗は黙って捨てる）。**包みが原因で、表示が遅くならない・消えない**。
 *    送らないもの: `session_name`・`cwd`・`transcript_path`・リポジトリの情報・会話の中身・設定のフォルダの場所（フォルダの名前の末尾と、場所の一方向の印だけ）。
 * 3. 元は**新しいプロセスグループ**で起動する（stdio は inherit のまま）。Claude Code が実行中のこのスクリプトを取り消す（SIGTERM・SIGINT・SIGHUP）ときは、
 *    グループ全体へ伝え、1 秒で終わらなければグループへ SIGKILL する（`sh -c` の下の孫を残さない）。どの道で終わるときも、元がまだ動いていればグループごと止める。
 *    `COLUMNS`・`LINES` などの環境は、そのまま元へ渡る。
 *
 * 元の控えは、引数（base64url の JSON）を先に読み、読めなければ、横のファイル（`soda-statusline.orig.json`）を読む。
 * Windows（`sh` が無い）は対象外（導入しない）。
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
    const side = JSON.parse(fs.readFileSync(path.join(__dirname, "soda-statusline.orig.json"), "utf8"));
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
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    };
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    setTimeout(finish, STDIN_BUDGET_MS).unref();
  });
}

const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
const str = (v, max) => (typeof v === "string" && v !== "" && Array.from(v).length <= max ? v : undefined);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

function windowOf(w) {
  if (!w || typeof w !== "object") return undefined;
  const usedPct = num(w.used_percentage, 0, 100000);
  if (usedPct === undefined) return undefined;
  return clean({ usedPct, resetsAt: num(w.resets_at, 0, 1e11) });
}

/** ステータスラインの入力から、送る 1 つの報告（数字・id・短い文字列だけ）を作る。作れなければ undefined。 */
function buildReport(payload) {
  const paneId = process.env.SODA_PANE_ID;
  if (!paneId || !payload || typeof payload !== "object") return undefined;
  const sessionId = typeof payload.session_id === "string" && UUID_RE.test(payload.session_id) ? payload.session_id : undefined;
  if (sessionId === undefined) return undefined;
  const model = payload.model && typeof payload.model === "object" ? payload.model : {};
  const cost = payload.cost && typeof payload.cost === "object" ? payload.cost : {};
  const ctx = payload.context_window && typeof payload.context_window === "object" ? payload.context_window : {};
  const cur = ctx.current_usage && typeof ctx.current_usage === "object" ? ctx.current_usage : undefined;
  const sum = (o) => {
    const parts = [o.input_tokens, o.cache_creation_input_tokens, o.cache_read_input_tokens].map((x) => num(x, 0, 1e12));
    return parts.some((x) => x !== undefined) ? parts.reduce((a, x) => a + (x ?? 0), 0) : undefined;
  };
  const rl = payload.rate_limits && typeof payload.rate_limits === "object" ? payload.rate_limits : {};
  const spend = rl.spend_limit && typeof rl.spend_limit === "object" ? rl.spend_limit : undefined;
  const custom = process.env.CLAUDE_CONFIG_DIR;
  const root = custom ? path.resolve(custom) : path.join(os.homedir(), ".claude");
  return clean({
    type: "usage",
    paneId,
    kind: "claude",
    sessionId,
    agentPid: agentPid(),
    model: str(model.id, 128),
    modelName: str(model.display_name, 64),
    costUsd: num(cost.total_cost_usd, 0, 1e9),
    contextUsedPct: num(ctx.used_percentage, 0, 1000),
    contextWindowSize: num(ctx.context_window_size, 0, 1e12),
    contextTokens: cur ? sum(cur) : num(ctx.total_input_tokens, 0, 1e12),
    fiveHour: windowOf(rl.five_hour),
    sevenDay: windowOf(rl.seven_day),
    spendLimit: spend
      ? clean({
          usedPct: num(spend.used_percentage, 0, 100000),
          resetsAt: num(spend.resets_at, 0, 1e11),
          usedUsd: num(spend.used_usd, 0, 1e9),
          limitUsd: num(spend.limit_usd, 0, 1e9),
          period: str(spend.period, 32),
        })
      : undefined,
    // 設定のフォルダは、場所そのものを送らない: 一方向の印と、末尾の名前（別のフォルダを使う利用者の画面の名前）だけ。
    configKey: crypto.createHash("sha256").update(root).digest("hex").slice(0, 16),
    configDirName: custom ? str(path.basename(root), 64) : undefined,
  });
}

/** このステータスラインを動かした `claude` のプロセスの pid（フックのスクリプトと同じ決まり）。 */
function agentPid() {
  const fromEnv = Number(process.env.CLAUDE_PID);
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
    if ([comm, argv[0], argv[1]].some((n) => n !== undefined && nameOf(n) === "claude")) return pid;
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
  const sent = sendReport(report);

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
      // 元が取り消しに応じなくても、Claude Code を待たせない。グループへ SIGKILL してから終わる。
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
