import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, typeLine } from "../support/keys.js";

/**
 * AC6・AC7 の E2E（05-e2e-docs T5）。design「受け入れ基準との対応」の AC6・AC7：
 * 「前面プロセス（プラットフォーム層）と画面（ミラー）→ ManifestEngine → pane.agent_status_changed →
 * サイドバーのエージェントの行」「2 秒以内は、判定の周期（500ms）と E2E の計測で確かめる」
 * 「サイドバーの行のクリック / navigate モード / goto → pane.focus（workspace の行は workspace.focus）
 * → その pane の xterm.js にフォーカスする」。
 *
 * **偽のエージェント**（design には無い、この subtask の追加判断。tasks.md「実装方針」）：Claude Code・Codex
 * を実際に起動する検証は親の統合 test の担当（design「AC6」）。ここでは `02-agent-detection` の
 * `ManifestEngine.test.ts` が使っている実物のマニフェスト（`third_party/herdr/agent-detection/claude.toml`）
 * と全く同じ fixture（画面のテキスト・OSC タイトル）を、**実物の PTY 上で「claude」という名前のプロセスとして**
 * 再現する。`bash -c 'exec -a claude bash <script>'` で argv[0] を "claude" に差し替える——シバン
 * （`#!/bin/bash`）を経由すると、Linux カーネルが argv[0] をインタプリタ名へ書き換えてしまうため
 * （`ProcessMatcher` は `/proc/<pid>/cmdline` の argv[0] で判定する。実地に確認して判明）、
 * インタプリタを明示的に指定してシバンを経由しない形にする。
 */

test("エージェントの検出：idle→blocked の状態遷移がサイドバーへ2秒以内に反映され、行のクリックで focus する（AC6・AC7）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-agent-"));
  const scriptPath = join(dir, "fake-claude.sh");
  // `ManifestEngine.test.ts`「claude: Bash 承認プロンプト」と全く同じ画面（bash_permission_prompt に一致する）。
  const blockedScreen = [
    "────────────────────────────────────────────────────────────────",
    " Bash command",
    "",
    "   curl -sS -o /tmp/probe.html https://example.com",
    "   Download example.com to /tmp/probe.html",
    "",
    " This command requires approval",
    "",
    " Do you want to proceed?",
    " ❯ 1. Yes",
    "   2. Yes, and don't ask again for: curl *",
    "   3. No",
    "",
    " Esc to cancel · Tab to amend · ctrl+e to explain",
  ];
  // `AgentTracker`（`02-agent-detection`）は新しく見つけたエージェントの判定を 3 秒間止める
  // （`AGENT_STARTUP_GRACE_WINDOW`。herdr 由来の意図的な猶予。decisions.md D46）——design の
  // 「状態反映は2秒以内」はこの猶予**の後**、既に追跡中のエージェントの状態遷移（idle→blocked 等）に
  // ついての基準であって、プロセスを見つけた直後の初回判定には適用されない（実地の Playwright で
  // 最初その区別を知らずに計測し、この spec 自身が誤って 3 秒超のレイテンシを「不具合」と早合点しかけた）。
  // そのため、まず何でもない画面（`echo READY` の出力のみ。idle 相当）を出して猶予が明けるのを待ち、
  // そこから blocked の画面へ切り替えたタイミングを計測の起点にする。
  const readyMarker = `soda-e2e-agentready-${Date.now()}`;
  const script = [
    "clear",
    `echo ${readyMarker}`,
    "sleep 4", // 3 秒の起動猶予を確実に越える
    "clear",
    ...blockedScreen.map((line) => `printf '%s\\n' ${JSON.stringify(line)}`),
    "sleep 30", // 前面プロセスとして居座り続ける（検出のポーリングに掴まる猶予）
  ].join("\n");
  await writeFile(scriptPath, script);

  // 猶予明け後の最初の判定（idle 相当。`agent` が null → 何か、へ変わることで観測できる）を待つ。
  const firstJudged = client.waitForEvent("pane.agent_status_changed", (e) => e.data.paneId === p1);
  await typeLine(page, `exec -a claude bash ${scriptPath}`);
  await client.waitForOutput(p1, readyMarker);
  await firstJudged; // 猶予が明けて、以後は 500ms 周期で判定されている状態になった

  const agentUpdated = client.waitForEvent("pane.agent_status_changed", (e) => e.data.paneId === p1 && e.data.agent?.state === "blocked");
  // 「状態反映は2秒以内」の起点は、画面が実際に blocked の見た目になった瞬間——コマンドを打ち終えて
  // Enter が届くまでの時間（`page.keyboard.type` の1文字ずつのディレイを含む）は判定の対象ではない。
  await client.waitForOutput(p1, "Esc to cancel"); // fixture の最後の行（screen が実際に届いた証拠）
  const start = Date.now();
  await agentUpdated; // design「状態反映は2秒以内」（判定の周期 500ms に対する余裕を見た上限）
  const elapsedMs = Date.now() - start;
  expect(elapsedMs).toBeLessThan(2000);

  // サイドバーの行が blocked の色（data-state）で反映される（AC6）。エージェント自身の行に加え、
  // それを含む workspace の行も集約で blocked になる（`store/seen` の集約。D19 の優先順位）——
  // 両方見えるのが正しい挙動なので、エージェントの行の方だけを具体的に指定する。
  const agentRow = page.locator(".sidebar-agents .sidebar-row").first();
  await expect(agentRow.locator('.sidebar-state-icon[data-state="blocked"]')).toBeVisible({ timeout: 3000 });

  // サイドバーの行のクリックで、その pane へフォーカスが移る（AC7）。p1 は今 fake-claude（sleep 中）が
  // 前面にいて対話的なシェルではないため、入力のエコーではなくサーバの `session.focus_changed`
  // （`Sidebar.vue` の行クリック → `pane.focus` RPC の結果）で確かめる。
  const p2Created = client.waitForEvent("pane.created");
  await page.locator(".xterm-helper-textarea").first().focus();
  await page.keyboard.press("Control+b");
  await page.keyboard.press("v"); // 別 pane を作って、そちらへ焦点を移しておく（p1 から離す）
  const p2 = (await p2Created).data.pane.id;

  const focusChanged = client.waitForEvent("session.focus_changed", (e) => e.data.focus?.paneId === p1);
  await agentRow.click();
  const evt = await focusChanged;
  expect(evt.data.focus?.paneId).toBe(p1);
  expect(evt.data.focus?.paneId).not.toBe(p2);
});
