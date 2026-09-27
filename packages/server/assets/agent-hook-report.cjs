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

async function main() {
  const paneId = process.env.SODA_PANE_ID;
  const sock = process.env.SODA_AGENT_REPORT_SOCKET;
  const kind = process.argv[2];
  if (!paneId || !sock || !kind) return; // 本製品の pane の外・未対応の呼び出し方 → 無害に終わる

  const raw = await readStdin();
  let sessionId;
  try {
    const payload = JSON.parse(raw);
    // `session_id`（snake_case。Claude Code・Codex・Cursor・Devin・Droid・Qwen Code）と
    // `sessionId`（camelCase。Grok CLI・GitHub Copilot CLI の一部）の両方を受ける
    // （20260923-other-agents-session-resume design「hook スクリプト」・research.md F4）。
    sessionId = payload && (payload.session_id || payload.sessionId);
  } catch {
    return; // stdin が JSON でない → 何もしない
  }
  if (!sessionId || typeof sessionId !== "string") return;

  await new Promise((resolve) => {
    const conn = net.connect(sock, () => {
      conn.end(`${JSON.stringify({ paneId, kind, sessionId })}\n`);
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
