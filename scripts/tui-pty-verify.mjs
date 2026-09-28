#!/usr/bin/env node
// 端末版（引数なしの `soda`）を本物の疑似端末（node-pty）で動かして一巡させる確かめ（20260927-cli-mode の 06-docs-verify T5。
// AC1・AC2〔描画。大きさの追従は含まない〕・AC3・AC11〔構成の変更と入力の反映。設定と pane の大きさは含まない〕・AC12・H25b）。
//
//   pnpm build && node scripts/tui-pty-verify.mjs
//
// ビルドした `packages/server/dist/main.js` を使う（ここではビルドしない）。一時の状態ディレクトリ・名前付き session・空いているポートで:
//   1. 起動: 裏でサーバが立ち上がり、サイドバー（起動した場所の名前の workspace の行）・tab バー（`1:` の tab）・pane の枠（罫線）が描かれる（AC1・AC2）
//   1b. はじめの案内: 新しい状態ディレクトリで出て、Enter で閉じ、案内済みが prefs.json に残る（再接続では出ない）
//   2. 入力: pane に打ったコマンドの出力が画面に出る（80 行を流してスクロールバックを作る）
//   3. 切り離し: prefix+q で終了コード 0・代替画面に入って出た・サーバは同じ pid のまま動き続ける（AC3）
//   4. 再接続: もう一度 `soda` で同じ画面が戻り、ホイールで遡ると流した最初の行が見える（スクロールバック。AC3）
//   5. 同時接続: 2 つ目の端末版を同時に開き、片方の打鍵がもう片方にも出る（AC12）
//   6. ブラウザ相当: ローカルログインの cookie で `/ws` に `desktop` として繋ぎ、同じ workspace が見え、そこで作った workspace と
//      そこから送った入力が両方の端末版に出る（AC11）
// 失敗したら理由を出して終了コード 1。最後にサーバを止めて一時ディレクトリを消す（Ctrl+C・SIGTERM で止めても同じ後片付けをして 130・143）。Windows では何もせず成功（node-pty の ConPTY の扱いが別。docs/verification.md で手で確かめる）。
// SSH 越し（AC4）はこの確かめでは見ない（SSH で入った先で走らせれば同じ経路を通るが、SSH そのものは docs/verification.md で手で確かめる）。
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.platform === "win32") {
  console.log("tui-pty-verify: skipped on Windows");
  process.exit(0);
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MAIN = join(ROOT, "packages/server/dist/main.js");
const WS_CLIENT = join(ROOT, "packages/cli/dist/wsClient.js");
if (!existsSync(MAIN) || !existsSync(WS_CLIENT)) {
  console.error("tui-pty-verify: build first (pnpm build)");
  process.exit(1);
}
// node-pty と headless は server の依存から読む（ルートには入れていない）。
const requireFromServer = createRequire(join(ROOT, "packages/server/package.json"));
const nodePty = requireFromServer("node-pty");
const { Terminal } = requireFromServer("@xterm/headless");
const { connect } = await import(pathToFileURL(WS_CLIENT).href);

const COLS = 110;
const ROWS = 32;
const SESSION = "ptyverify";
const LEAVE_ALT_SCREEN = "\x1b[?1049l";
const ENTER_ALT_SCREEN = "\x1b[?1049h";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (msg) => console.log(`- ${msg}`);

async function waitFor(what, fn, timeoutMs = 20_000) {
  const start = Date.now();
  let last;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      last = err;
    }
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out: ${what}${last ? ` (${last.message})` : ""}`);
    await sleep(150);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const runs = [];

/** `soda --state-dir <base> --session <SESSION>` を疑似端末で起動し、出力を headless の外側の端末へ流して画面を読む。 */
function runSoda(base, env, cwd) {
  const term = new Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
  let out = "";
  let fed = 0;
  let exited = false;
  const pty = nodePty.spawn(process.execPath, [MAIN, "--state-dir", base, "--session", SESSION], {
    name: "xterm-256color",
    cols: COLS,
    rows: ROWS,
    cwd,
    env,
  });
  pty.onData((d) => {
    out += d;
  });
  const exit = new Promise((resolve) =>
    pty.onExit(({ exitCode }) => {
      exited = true;
      resolve(exitCode);
    }),
  );
  const run = {
    pty,
    exit,
    exited: () => exited,
    output: () => out,
    async screen() {
      const chunk = out.slice(fed);
      fed = out.length;
      await new Promise((resolve) => term.write(chunk, resolve));
      const lines = [];
      for (let y = 0; y < ROWS; y++)
        lines.push((term.buffer.active.getLine(y)?.translateToString(true) ?? "").trimEnd());
      return lines.join("\n");
    },
    /** 画面に `re` に合う行（入力の echo の行は除く）があるまで待つ。 */
    waitLine(what, re, timeoutMs) {
      return waitFor(
        what,
        async () =>
          (await run.screen()).split("\n").some((l) => re.test(l) && !l.includes("echo ")),
        timeoutMs,
      );
    },
    async detach() {
      pty.write("\x02q");
      const code = await Promise.race([exit, sleep(10_000).then(() => "timeout")]);
      if (code !== 0) throw new Error(`prefix+q: expected exit code 0, got ${code}`);
      if (!out.includes(ENTER_ALT_SCREEN))
        throw new Error("the TUI never entered the alternate screen");
      if (out.lastIndexOf(LEAVE_ALT_SCREEN) < out.lastIndexOf(ENTER_ALT_SCREEN))
        throw new Error("prefix+q: the alternate screen was not left");
    },
    dispose() {
      if (!exited) {
        try {
          pty.kill();
        } catch {
          // もう終わっている
        }
      }
      term.dispose();
    },
  };
  runs.push(run);
  return run;
}

const dir = await mkdtemp(join(tmpdir(), "soda-pty-verify-"));
const base = join(dir, "state");
const sessionDir = join(base, "sessions", SESSION);
let browser;
let failed = false;

let cleaned;
/** 後片付け（何度呼んでも 1 回だけ）：接続と疑似端末を閉じ、裏で起動したサーバを止め、一時ディレクトリを消す。 */
function cleanup() {
  cleaned ??= (async () => {
    browser?.close();
    for (const r of runs) r.dispose();
    // 裏で起動したサーバを止める（SIGTERM は通常の停止）。
    const record = JSON.parse(
      await readFile(join(sessionDir, "serve.json"), "utf8").catch(() => "{}"),
    );
    if (typeof record.pid === "number" && alive(record.pid)) {
      process.kill(record.pid, "SIGTERM");
      for (let i = 0; i < 150 && alive(record.pid); i++) await sleep(100);
      if (alive(record.pid)) process.kill(record.pid, "SIGKILL");
    }
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  })();
  return cleaned;
}
for (const [sig, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
]) {
  process.once(sig, () => {
    console.error(`tui-pty-verify: interrupted by ${sig}; cleaning up`);
    void cleanup().finally(() => process.exit(code));
  });
}

async function serverPid() {
  const record = JSON.parse(await readFile(join(sessionDir, "serve.json"), "utf8"));
  return record.pid;
}

try {
  await mkdir(sessionDir, { recursive: true });
  const home = join(dir, "home");
  await mkdir(home);
  // 起動した場所（最初の workspace の名前になる）。ほかと紛れない名前にする。
  const rootName = `pvroot${process.pid}`;
  const root = join(dir, rootName);
  await mkdir(root);
  // 開発者のシェル・rc に依らない最小の環境（SODA_* を渡さない＝入れ子の検出に掛からない）。
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    SHELL: "/bin/sh",
    PS1: "soda-pty$ ",
    ENV: "",
    LANG: "C.UTF-8",
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };
  // サイドバーの部分＝行の最初の縦の罫線（サイドバーの境界）より左。全角の文字があると文字の位置と桁がずれるので、桁では切らない。
  const sidebarHas = (screen, name) =>
    screen.split("\n").some((l) => l.split("│")[0].includes(name));

  // 1. 起動と描画。空いているポートを「前回使ったポート」として記録しておく（pid は動いていないもの。soda は裏でサーバを起動し直す）。
  // 既定の 7780 は、この機械で動いている別の soda とぶつかりうる。選んでから使うまでに他に取られたら（bind の失敗）ポートを替えて起動し直す。
  let first;
  for (let attempt = 1; ; attempt++) {
    const port = await freePort();
    await writeFile(
      join(sessionDir, "serve.json"),
      JSON.stringify({
        schema: 1,
        pid: 2 ** 22 + 12345,
        hostname: hostname(),
        port,
        https: false,
        host: "127.0.0.1",
        savedAt: "",
      }),
    );
    const run = runSoda(base, env, root);
    await waitFor(
      "sidebar (Spaces) or exit",
      async () => run.exited() || (await run.screen()).includes("Spaces"),
      30_000,
    );
    if (!run.exited()) {
      first = run;
      break;
    }
    if (attempt < 3 && /cannot listen|EADDRINUSE|address already in use/i.test(run.output())) {
      console.error(`tui-pty-verify: port ${port} was taken; retrying with another port`);
      continue;
    }
    throw new Error(`soda exited during startup:\n${run.output().slice(-2000)}`);
  }
  await waitFor(
    "pane shell prompt",
    async () => (await first.screen()).split("\n").slice(1).join("\n").includes("soda-pty$"),
    20_000,
  );
  const pid = await waitFor("server pid in serve.json", async () => {
    const p = await serverPid();
    return p !== 2 ** 22 + 12345 && alive(p) ? p : undefined;
  });
  step(`起動した（pane のプロンプト。サーバ pid ${pid}）`);

  // 1b. はじめの案内（H25b）：新しい状態ディレクトリでは出る。Enter で案内済みにして設定画面へ移り、Esc で閉じる。案内済みは共有の設定に残る。
  const ONBOARDING = "マウスで操作できる端末です";
  const SETTINGS = "エージェント連携"; // 設定画面の節の一覧（案内が消えた後だけ見る）
  await waitFor(
    "onboarding on a fresh state dir",
    async () => (await first.screen()).includes(ONBOARDING),
    15_000,
  );
  first.pty.write("\r");
  await waitFor(
    "onboarding dismissed by Enter",
    async () => !(await first.screen()).includes(ONBOARDING),
    10_000,
  );
  await waitFor(
    "settings screen after onboarding",
    async () => (await first.screen()).includes(SETTINGS),
    10_000,
  );
  // Esc で節の一覧へ戻り、もう一度で閉じる。1 回ごとに画面が変わるのを待つ。
  for (let i = 0; i < 3 && (await first.screen()).includes(SETTINGS); i++) {
    const before = await first.screen();
    first.pty.write("\x1b");
    await waitFor(
      "screen changes after Esc",
      async () => (await first.screen()) !== before,
      5_000,
    ).catch(() => undefined);
  }
  if ((await first.screen()).includes(SETTINGS))
    throw new Error("the settings screen did not close with Esc");
  await waitFor(
    "onboarding: false saved to prefs.json",
    async () =>
      JSON.parse(await readFile(join(sessionDir, "prefs.json"), "utf8")).prefs?.onboarding ===
      false,
    10_000,
  );
  step("新しい状態ディレクトリではじめの案内が出て、Enter で閉じ、案内済みが共有の設定に残った");

  // 描画（案内と設定画面を閉じた後。案内の枠の罫線と取り違えないよう）。
  const drawn = await first.screen();
  const rows = drawn.split("\n");
  if (!sidebarHas(drawn, rootName)) throw new Error(`the sidebar has no workspace row ${rootName}`);
  if (!rows.some((l) => /│\s*1:\S/.test(l))) throw new Error("the tab bar (1:<name>) is not drawn");
  if (!rows.some((l) => /│┌─/.test(l)) || !rows.some((l) => /│└─/.test(l)))
    throw new Error("the pane frame (box-drawing lines next to the sidebar) is not drawn");
  step(`サイドバーの ${rootName} の行・tab バー（1:）・pane の枠が描かれている`);

  // 2. 入力（80 行を流してスクロールバックを作る）
  const marker = `PTYV_${Date.now()}`;
  first.pty.write(`\x15i=1; while [ $i -le 80 ]; do echo L$i; i=$((i+1)); done; echo ${marker}\r`);
  await first.waitLine("typed command output", new RegExp(`${marker}`), 20_000);
  if (!(await first.screen()).includes("L80"))
    throw new Error("the loop output did not reach the screen");
  step("pane に打ったコマンドの出力が出た");

  // 3. 切り離し
  await first.detach();
  if (!alive(pid) || (await serverPid()) !== pid)
    throw new Error("the server did not keep running with the same pid after prefix+q");
  step(`prefix+q で 0・代替画面に入って出た・サーバ（pid ${pid}）は動き続けている`);

  // 4. 再接続（同じ画面とスクロールバック）
  const second = runSoda(base, env, root);
  await second.waitLine("same screen after reattach", new RegExp(marker), 30_000);
  if ((await serverPid()) !== pid) throw new Error("reattach started another server");
  const L3 = /(^|[^\w])L3([^\w]|$)/;
  if (L3.test(await second.screen()))
    throw new Error("L3 is visible before scrolling back (the check would prove nothing)");
  // pane の中身の上でホイールを上へ（SGR 1006。pane はマウスを求めていないのでスクロールバックが動く）。
  for (let i = 0; i < 30; i++) second.pty.write(`\x1b[<64;${COLS - 20};${Math.floor(ROWS / 2)}M`);
  await second.waitLine("scrollback (L3) after wheel up", L3, 10_000);
  if ((await second.screen()).includes(ONBOARDING))
    throw new Error("onboarding was shown again after it was dismissed");
  step("もう一度 soda で同じ画面が戻り（同じサーバ）、ホイールで最初の行（L3）まで遡れた");
  // 下へ戻す（末尾の行が見えるまで）。
  for (let i = 0; i < 40; i++) second.pty.write(`\x1b[<65;${COLS - 20};${Math.floor(ROWS / 2)}M`);
  await waitFor("scrolled back to the bottom", async () => !L3.test(await second.screen()), 10_000);

  // 5. 同時接続（端末版 2 つ）
  const third = runSoda(base, env, root);
  await third.waitLine("second concurrent TUI draws", new RegExp(marker), 30_000);
  const both = `BOTH_${Date.now()}`;
  second.pty.write(`\x15echo ${both}\r`);
  await third.waitLine("input from one TUI appears in the other", new RegExp(both), 15_000);
  await second.waitLine("input appears in the typing TUI", new RegExp(both), 15_000);
  step("端末版 2 つを同時に開き、片方の打鍵が両方に出た");

  // 6. ブラウザ相当のクライアント（ローカルログイン → /ws に desktop で）
  const now = JSON.parse(await readFile(join(sessionDir, "serve.json"), "utf8"));
  if (now.pid !== pid) throw new Error("the server pid changed before the browser step");
  const baseUrl = `http://127.0.0.1:${now.port}`;
  const { secret } = JSON.parse(await readFile(join(sessionDir, "local-auth.json"), "utf8"));
  const res = await fetch(`${baseUrl}/api/local-login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ secret }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (res.status !== 204 || !cookie) throw new Error(`local login failed: HTTP ${res.status}`);
  browser = await connect(baseUrl, cookie);
  const hello = await browser.request("client.hello", { protocol: 1, kind: "desktop" });
  const label = hello.snapshot.workspaces[0]?.label;
  if (label !== rootName)
    throw new Error(
      `browser-equivalent client saw workspace ${JSON.stringify(label)}, not ${rootName}`,
    );
  // 別の場所（紛れない名前のフォルダ）で workspace を作る。名前はフォルダ名になり、両方の端末版のサイドバーの行に出る。
  const wsName = `pvws${process.pid}`;
  const wsDir = join(dir, wsName);
  await mkdir(wsDir);
  await browser.request("workspace.create", { cwd: wsDir });
  for (const [n, run] of [
    [1, second],
    [2, third],
  ])
    await waitFor(
      `workspace created by the browser client in the sidebar (TUI ${n})`,
      async () => sidebarHas(await run.screen(), wsName),
      15_000,
    );
  // 入力: 最初の workspace の pane へ送る（端末版はまだ最初の workspace を見ている）。
  const paneId = hello.snapshot.panes[0].id;
  const fromBrowser = `WEB_${Date.now()}`;
  browser.sendInput(paneId, new TextEncoder().encode(`echo ${fromBrowser}\r`));
  await waitFor(
    "input from the browser client appears in a TUI",
    async () => {
      const lines = [...(await second.screen()).split("\n"), ...(await third.screen()).split("\n")];
      return lines.some((l) => l.includes(fromBrowser) && !l.includes("echo "));
    },
    15_000,
  );
  step(
    `ブラウザ相当のクライアントが同じ workspace（${label}）を見て、作った workspace（${wsName}）がサイドバーに、送った入力が端末版に出た`,
  );

  browser.close();
  browser = undefined;
  await third.detach();
  await second.detach();
  step("端末版を両方 prefix+q で抜けた（終了コード 0）");
  console.log("tui-pty-verify: OK");
} catch (err) {
  failed = true;
  console.error(`tui-pty-verify: FAILED: ${err instanceof Error ? err.message : String(err)}`);
  const last = runs.at(-1);
  if (last) console.error(`--- last screen ---\n${await last.screen().catch(() => "")}`);
} finally {
  await cleanup();
}
process.exit(failed ? 1 : 0);
