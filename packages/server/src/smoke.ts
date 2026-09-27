#!/usr/bin/env node
/**
 * 起動確認（design「起動確認」・T22・T26）。空きポート・一時ディレクトリでサーバを起動し、
 * 正規のログイン → client.hello → workspace.create → pane.subscribe → 入力の往復（実物のシェルで echo）
 * を確かめ、続けてビルドした Web UI を Playwright の実物の Chromium で開いて一巡（token での自動ログイン →
 * 接続 → 既存 pane の表示 → キー入力）を確かめてから終了する（テスト方針「実地の確認」）。
 * 「ビルドした成果物が最初の使える状態に到達したか」を見るためのもので、ユニットテストの代わりにはしない。
 *
 * Web UI の確認には `playwright`（`packages/server/package.json` の devDependency）を使う。
 * ブラウザ本体は `playwright install chromium` で別途取得する必要がある（`node_modules` には同梱されない）。
 */
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@wtm/protocol";
import { chromium } from "playwright";
import WebSocket from "ws";
import { composeServer } from "./composeServer.js";

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as AddressInfo).port;
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
    probe.on("error", reject);
  });
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

/**
 * 生の WebSocket クライアント（`net/Connection.ts` と同じ形：**1 つの持続的な `message` ハンドラ**が
 * 応答を id で振り分け、pane の OUTPUT は pane ごとにずっと溜め続ける）。
 *
 * 前の実装は `ws.once("message", ...)` を都度張り直す方式だった（`request` を打つたび・`waitForOutput` の
 * ループの各周回ごとに）——**何も待っていない間に届いた message を取りこぼす**バグがあった。
 * Web UI の確認（T26）でブラウザの起動・操作に数秒かかるようになり、その間は誰も `message` を
 * listen していなかったため、ブラウザが打った入力の echo がまさにその隙間で届いて消えていた
 * （実機の Chromium を使う smoke で発見。「echo 済みのはずなのに `waitForOutput` が毎回タイムアウトする」
 * という形で症状が出た——`ws.on` で全メッセージを可視化して初めて、届いてはいるが誰も見ていないと分かった）。
 */
function createSmokeClient(ws: WebSocket) {
  const pending = new Map<string, PendingRequest>();
  const paneOutput = new Map<string, string>();

  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      const decoded = decodeFrame(new Uint8Array(data));
      if (decoded.type === FRAME_TYPE.OUTPUT) {
        paneOutput.set(decoded.paneId, (paneOutput.get(decoded.paneId) ?? "") + new TextDecoder().decode(decoded.chunk));
      }
      return;
    }
    const msg = JSON.parse(data.toString("utf8")) as { id?: string; result?: unknown; error?: unknown };
    if (!msg.id) return; // id の無いもの（イベント）は今のところ読み捨てる
    const req = pending.get(msg.id);
    if (!req) return;
    pending.delete(msg.id);
    if (msg.error) req.reject(new Error(`request ${msg.id} failed: ${JSON.stringify(msg.error)}`));
    else req.resolve(msg.result);
  });

  function requestResponse(id: string, method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for response to ${method} (id=${id})`));
      }, 10_000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** 既に溜まっている分を含めて、そのうち `needle` が現れるまで待つ（ポーリング。取りこぼしが起きない）。 */
  async function waitForOutput(paneId: string, needle: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if ((paneOutput.get(paneId) ?? "").includes(needle)) return;
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for "${needle}" in pane ${paneId} output; got: ${JSON.stringify((paneOutput.get(paneId) ?? "").slice(-500))}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return { requestResponse, waitForOutput };
}

/**
 * ビルドした Web UI を実物の Chromium で開いて一巡を確かめる（T26）。`#token=` での自動ログイン
 * （`LoginView.vue`）→ 接続 → 直前に作った pane（`paneId`）が表示されるまで待つ → その pane にキー入力する。
 * 実際に PTY まで届いたかどうかは、DOM から canvas 描画の文字を読み取るのではなく（xterm.js は既定で
 * DOM に文字を残さない——アクセシビリティツリーも `screenReaderMode` が既定 off なので存在しない。
 * 実機の Chromium で確認済み）、**呼び出し側が既に持っている生 WebSocket 接続の OUTPUT** で確かめる
 * （`waitForOutput` を呼ぶのは呼び出し側）。ここでは「ブラウザがログイン・接続・pane の表示・タブの
 * タイトル（H14）まで到達したか」だけを見る。
 */
async function checkWebUiRendersAndAcceptsInput(origin: string, token: string, paneId: string, marker: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${origin}/#token=${token}`);
    // ログイン画面が一瞬でも出ていたら、自動ログインより先に来てしまっている（#token 検出の失敗）。
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    if (await page.locator(".login-view").count()) throw new Error("still showing LoginView after #token auto-login");
    console.log("smoke(web): auto-login (#token) → connect → pane 表示 ok");

    // 端末の描画用 canvas が `.xterm-screen` の枠の中に重なっていること（xterm.css が効いていること）。
    // 効いていないと canvas が通常のフローで縦に積まれ、文字を描いた canvas が画面外へ押し出される——
    // バイト列の往復だけを見る確認では気づけなかった（D96）。
    const layout = await page.evaluate(() => {
      const screen = document.querySelector(".xterm-screen")?.getBoundingClientRect();
      const canvases = Array.from(document.querySelectorAll(".xterm-screen canvas")).map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      const helper = document.querySelector(".xterm-helper-textarea");
      return {
        screen: screen ? { top: screen.top, bottom: screen.bottom } : null,
        canvasTops: canvases.map((r) => r.top),
        canvasBottoms: canvases.map((r) => r.bottom),
        helperOpacity: helper ? getComputedStyle(helper).opacity : null,
      };
    });
    if (!layout.screen || layout.canvasTops.length === 0) throw new Error(`terminal has no visible canvas: ${JSON.stringify(layout)}`);
    const outside = layout.canvasTops.some((t, i) => t < layout.screen!.top - 1 || layout.canvasBottoms[i]! > layout.screen!.bottom + 1);
    if (outside) throw new Error(`terminal canvas is outside .xterm-screen (xterm.css missing?): ${JSON.stringify(layout)}`);
    if (layout.helperOpacity !== "0") throw new Error(`xterm helper textarea is visible (xterm.css missing?): ${JSON.stringify(layout)}`);
    console.log("smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）");

    const expectedTitle = `${hostname()}: smoke`;
    await page.waitForFunction((t) => document.title === t, expectedTitle, { timeout: 5000 });
    console.log(`smoke(web): tab title ok ("${expectedTitle}"。H14/AC4）`);

    await page.locator(".xterm-helper-textarea").click();
    // `keyboard.type()` の埋め込み `\n` は Enter キー押下として確実には届かない（実機の Chromium で確認済み
    // ——タイプはされてもコマンドが実行されず、シェルの出力が一切戻ってこなかった）。改行は別に明示的に送る。
    await page.keyboard.type(`echo ${marker}`);
    await page.keyboard.press("Enter");
    console.log(`smoke(web): typed into pane ${paneId}`);
  } finally {
    await browser.close();
  }
}

/**
 * はじめの案内（20260926-settings-onboarding）を実物の Chromium で確かめる。自動操作のブラウザ（`navigator.webdriver`）では
 * 案内を出さない（decisions D11）ので、**人が使うブラウザに見せたページ**で開く。新しい context＝localStorage が空＝初めての
 * ブラウザ。案内が開いて見出しにフォーカスがあること → Esc（スキップ）で閉じると**端末へフォーカスが戻る**こと（happy-dom では
 * 確かめられない。design D6）→ そのままキーを打てること（届いたかは呼び出し側が PTY の出力で確かめる）→ 案内済みが保存され、
 * 開き直しても出ないこと。
 */
async function checkOnboardingInRealBrowser(origin: string, token: string, marker: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    });
    const page = await context.newPage();
    await page.goto(`${origin}/#token=${token}`);
    await page.waitForSelector("dialog.onboarding-dialog[open]", { timeout: 15_000 });
    const opened = await page.evaluate(() => ({
      focused: document.activeElement?.id ?? null,
      terminalShown: document.querySelector(".xterm-helper-textarea") !== null,
    }));
    if (opened.focused !== "onboarding-title") throw new Error(`onboarding opened but focus is not on its title: ${JSON.stringify(opened)}`);
    if (!opened.terminalShown) throw new Error("onboarding opened before the terminal was shown (D6)");
    console.log("smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある");

    await page.keyboard.press("Escape");
    await page.waitForSelector("dialog.onboarding-dialog[open]", { state: "detached", timeout: 5000 });
    const closed = await page.evaluate(() => ({
      focusedClass: document.activeElement?.className ?? null,
      prefs: localStorage.getItem("wtm.prefs.v1"),
    }));
    if (!String(closed.focusedClass).includes("xterm-helper-textarea")) {
      throw new Error(`focus did not return to the terminal after closing onboarding: ${JSON.stringify(closed)}`);
    }
    if (closed.prefs !== JSON.stringify({ onboarding: false })) throw new Error(`onboarding was not marked done: ${JSON.stringify(closed)}`);
    console.log("smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される");

    // クリックせずにそのまま打つ（フォーカスが端末に戻っていなければ PTY に届かない）。
    await page.keyboard.type(`echo ${marker}`);
    await page.keyboard.press("Enter");

    await page.reload();
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    // 端末にフォーカスが入った（接続の hello のあと `restoreView` が pane を選び、端末が描かれた）のを待ってから数える。
    // 案内は同じ流れの次の tick で開くので、この印のあとに少し余裕を置けば、出るなら出ている。
    // 案内が（誤って）開けばフォーカスは案内へ移るので、どちらかの印を待つ。
    await page.waitForFunction(
      () =>
        document.activeElement?.classList.contains("xterm-helper-textarea") === true ||
        document.querySelector("dialog.onboarding-dialog[open]") !== null,
      undefined,
      { timeout: 15_000 },
    );
    await page.waitForTimeout(300);
    if (await page.locator("dialog.onboarding-dialog[open]").count()) throw new Error("onboarding opened again after it was marked done");
    console.log("smoke(web): 開き直しても、はじめの案内は出ない");
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "wtm-smoke-"));
  const port = await getFreePort();
  console.log(`smoke: starting server on 127.0.0.1:${port} (state dir ${stateDir})`);
  // 独自コマンド（20260927-custom-command-keys）：状態ディレクトリの commands.json を起動時に読み、popup の端末へ購読・入力が届くかを後で確かめる。
  const commandsFile = join(stateDir, "commands.json");
  await writeFile(commandsFile, JSON.stringify({ commands: [{ id: "smoke-cat", type: "popup", command: "cat" }] }), { mode: 0o600 });
  await chmod(commandsFile, 0o600);

  const server = await composeServer({ host: "127.0.0.1", port: String(port), stateDir, origin: [] });
  await server.listen();

  let ws: WebSocket | undefined;
  try {
    const manifestSummaries = server.manifestStore.summaries();
    const failed = manifestSummaries.filter((s) => !s.ok);
    if (manifestSummaries.length === 0) throw new Error("agent manifests: no entries loaded (index.toml missing or empty?)");
    if (failed.length > 0) throw new Error(`agent manifests: ${failed.length}/${manifestSummaries.length} failed to load: ${JSON.stringify(failed)}`);
    console.log(`smoke: agent manifests ok (${manifestSummaries.length}/${manifestSummaries.length})`);

    // token は `listen()` が待ち受けに成功してから作られる（それまでは undefined。D102）。
    const token = server.freshToken;
    if (!token) throw new Error("expected a freshly generated token");

    const origin = `http://127.0.0.1:${port}`;
    const loginRes = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
      body: JSON.stringify({ token }),
    });
    if (loginRes.status !== 204) throw new Error(`login failed: HTTP ${loginRes.status}`);
    const setCookie = loginRes.headers.get("set-cookie");
    if (!setCookie) throw new Error("login did not set a cookie");
    const cookie = setCookie.split(";")[0]!;
    console.log("smoke: login ok");

    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie, origin, host: `127.0.0.1:${port}` } });
    await new Promise<void>((resolve, reject) => {
      ws!.once("open", () => resolve());
      ws!.once("error", reject);
    });
    console.log("smoke: websocket connected");

    const client = createSmokeClient(ws);

    await client.requestResponse("1", "client.hello", { protocol: 1, kind: "desktop" });
    console.log("smoke: client.hello ok");

    const created = (await client.requestResponse("2", "workspace.create", { cwd: process.cwd(), label: "smoke" })) as {
      pane: { id: string };
    };
    console.log(`smoke: workspace.create ok (pane ${created.pane.id})`);

    await client.requestResponse("3", "pane.subscribe", { paneId: created.pane.id, scrollbackLines: 200 });
    console.log("smoke: pane.subscribe ok");

    const marker = `wtm-smoke-${Date.now()}`;
    ws.send(encodeInputFrame(created.pane.id, new TextEncoder().encode(`echo ${marker}\n`)));
    await client.waitForOutput(created.pane.id, marker, 8000);
    console.log("smoke: echo round trip ok");

    // 独自コマンドの popup（20260927-custom-command-keys）：一覧に載り（文字列は載らない）、popup の端末へ入力が届いて出力が返る。
    const list = (await client.requestResponse("c1", "command.list", {})) as { commands: { id: string }[]; problem: string | null };
    if (list.problem !== null || list.commands.map((c) => c.id).join(",") !== "smoke-cat" || JSON.stringify(list).includes('"command"')) {
      throw new Error(`command.list: unexpected ${JSON.stringify(list)}`);
    }
    const popup = (await client.requestResponse("c2", "command.run", { commandId: "smoke-cat", paneId: created.pane.id, cols: 40, rows: 5 })) as { popupId: string };
    await client.requestResponse("c3", "pane.subscribe", { paneId: popup.popupId, scrollbackLines: 50 });
    const popupMarker = `wtm-smoke-popup-${Date.now()}`;
    ws.send(encodeInputFrame(popup.popupId, new TextEncoder().encode(`${popupMarker}\n`)));
    await client.waitForOutput(popup.popupId, popupMarker, 8000);
    await client.requestResponse("c4", "command.popup_close", { popupId: popup.popupId });
    console.log("smoke: custom command popup round trip ok");

    // ここまでは生の WebSocket 接続だけの確認（プロトコル層）。ここから先は、ビルドした Web UI を
    // 実物のブラウザで開いて確かめる（T26。design「起動確認」に「配信の確認」を追加）。
    // 対象は同じ pane（`created.pane.id`）——`client.hello` の snapshot の focus が最後に作った workspace
    // （この smoke 自身が作った「smoke」workspace）を指すので、ブラウザは自動でこの pane を表示する。
    const webMarker = `wtm-smoke-web-${Date.now()}`;
    await checkWebUiRendersAndAcceptsInput(origin, token, created.pane.id, webMarker);
    await client.waitForOutput(created.pane.id, webMarker, 8000);
    console.log("smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）");

    const onboardingMarker = `wtm-smoke-onboarding-${Date.now()}`;
    await checkOnboardingInRealBrowser(origin, token, onboardingMarker);
    await client.waitForOutput(created.pane.id, onboardingMarker, 8000);
    console.log("smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた");

    console.log("smoke: PASS");
    process.exitCode = 0;
  } finally {
    ws?.close();
    await server.close();
  }
}

main().catch((err: unknown) => {
  console.error("smoke: FAIL", err);
  process.exitCode = 1;
});
