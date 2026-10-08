import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";
import { markFocusedPane, shownPanes, watchShownPanes } from "../support/panes.js";

/**
 * AC1〜AC3 の E2E（05-e2e-docs T2）。design「受け入れ基準との対応」の AC1〜AC3 の記述どおりに、
 * prefix のキー操作でサイドバー・tab バー・pane のレイアウトが変わることを確かめる。
 * サーバは起動直後に workspace を 1 つ自動で作る（design「main の起動」）ので、どのテストも
 * 「サイドバーに 1 行・tab バーに 1 個・pane が 1 つ」から始まる。
 */

test("workspace: 作成・名前変更・切替・閉じる（確認あり）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const shown = await watchShownPanes(page); // ブラウザが表示している pane（`client.view`。support/panes.ts）
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // 作成：prefix+shift+n（`N`）→ workspace.create → 新しい pane へフォーカスが移る（AC1, AC-I4）。
  const createdEvent = client.waitForEvent("workspace.created");
  await prefixKey(page, "N");
  const { workspace: newWs } = (await createdEvent).data;
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(2);

  const paneCreated = await client.waitForEvent("pane.created");
  await client.request("pane.subscribe", { paneId: paneCreated.data.pane.id, scrollbackLines: 200 });
  // テスト自身のクライアントに `pane.created` が届いても、ブラウザが新しい workspace へ切り替えたとは限らない（D104）。
  // 切り替わる前にクリックすると元の p1 の端末を押してしまうので、ブラウザが新しい pane を描いた（`client.view` に
  // 含まれる）ことを待ってから触る。
  await expect.poll(shown).toContain(paneCreated.data.pane.id);
  const marker = `soda-e2e-newws-${Date.now()}`;
  await focusTerminal(page);
  await typeLine(page, `echo ${marker}`);
  await client.waitForOutput(paneCreated.data.pane.id, marker); // 新しい workspace の pane へフォーカスが移っている証拠

  // 名前変更：prefix+shift+w（`W`）→ NameDialog（AC-I1）。
  await prefixKey(page, "W");
  const dialog = page.locator(".name-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator(".name-dialog-input").fill("renamed-ws");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".sidebar-spaces .sidebar-row").filter({ hasText: "renamed-ws" })).toHaveCount(1);
  expect(newWs.id).toBeTruthy();

  // 切替：navigate モード（prefix+w）→ ↑ → Enter で最初の workspace へ戻る（AC7 の一部）。
  await prefixKey(page, "w");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.locator(".sidebar-spaces .sidebar-row-selected")).toHaveCount(0);

  // 閉じる：prefix+shift+d（`D`）→ 常に確認（D56 の訂正 2）。キャンセルでは何も変わらない。
  await prefixKey(page, "w");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); // renamed-ws へ切替
  await prefixKey(page, "D");
  const confirm = page.locator(".confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "キャンセル" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(2);

  await prefixKey(page, "D");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "閉じる" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(1);

  // 表示中の workspace を閉じたら、残りの workspace の端末が表示され、クリックせずにそのまま入力が届く
  // （D97。以前は tab バーごと消えていた。親の統合 test で追加）。
  await expect(page.locator(".terminal-pane")).toHaveCount(1);
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  const afterClose = `soda-e2e-afterwsclose-${Date.now()}`;
  await typeLine(page, `echo ${afterClose}`);
  await client.waitForOutput(p1, afterClose);
});

test("tab: 作成・名前変更・番号での切替・閉じる", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // 作成：prefix+c → NameDialog（design「作成時に名前を尋ねる」既定 true）。
  await prefixKey(page, "c");
  const dialog = page.locator(".name-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator(".name-dialog-input").fill("second-tab");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);
  await expect(page.locator(".tab-bar-item-active .tab-bar-label")).toHaveText("second-tab");

  // 番号での切替：prefix+1 で最初の tab へ。
  await focusTerminal(page);
  await prefixKey(page, "1");
  await expect(page.locator(".tab-bar-item-active")).not.toHaveText("second-tab");

  // 名前変更：prefix+shift+t（`T`）。
  await prefixKey(page, "T");
  await expect(dialog).toBeVisible();
  await dialog.locator(".name-dialog-input").fill("renamed-tab");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(page.locator(".tab-bar-item-active .tab-bar-label")).toHaveText("renamed-tab");

  // 前後の切替：prefix+n（次）。
  await focusTerminal(page);
  await prefixKey(page, "n");
  await expect(page.locator(".tab-bar-item-active .tab-bar-label")).toHaveText("second-tab");

  // 閉じる：busy でなければ確認なしですぐ閉じる（D23）。
  await focusTerminal(page);
  await prefixKey(page, "X");
  // tab が1個に戻ると tab バー自体が消える（20260922-appearance-settings-rest の自動非表示・AC4。
  // この work 以前は tab が1個でも常に表示され、`.tab-bar-item` の count は 1 だった）。
  await expect(page.locator(".tab-bar")).toHaveCount(0);

  // 表示中の tab を閉じたら、残りの tab の端末が表示され、クリックせずにそのまま入力が届く
  // （D97。以前は端末が 1 つも表示されなかった。親の統合 test で追加）。`.tab-bar-item-active` も
  // tab バーごと消えている（上と同じ理由）ので、代わりに端末が表示されていることだけを見る。
  await expect(page.locator(".terminal-pane")).toHaveCount(1);
  const afterClose = `soda-e2e-aftertabclose-${Date.now()}`;
  await typeLine(page, `echo ${afterClose}`);
  await client.waitForOutput(p1, afterClose);
});

/** `LayoutNode`（`@sodashitsu/protocol`）の葉を深さ優先（a→b）で並べる。`LayoutTree.leaves`（サーバ）と同じ順序——
 *  `cyclePane`（巡回）の順の検証に使う。テスト側は protocol の型を持たないので構造だけ最小限に定義する。 */
interface TestLayoutNode {
  type: "pane" | "split";
  paneId?: string;
  id?: string;
  ratio?: number;
  a?: TestLayoutNode;
  b?: TestLayoutNode;
}
function leaves(node: TestLayoutNode): string[] {
  if (node.type === "pane") return [node.paneId!];
  return [...leaves(node.a!), ...leaves(node.b!)];
}
/** 木の中から split ノードを 1 つ探す（境界のリサイズの検証用。この spec は常に 1 つしか split を作らない時点で呼ぶ）。 */
function findSplit(node: TestLayoutNode): TestLayoutNode | null {
  if (node.type === "pane") return null;
  if (node.id) return node;
  return findSplit(node.a!) ?? findSplit(node.b!);
}

test("pane: 分割・境界のリサイズ・フォーカス移動・入れ替え・巡回・拡大表示・名前変更", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // 分割：prefix+v（右）。p1（左。起動直後からある唯一の pane なので `pane.created` は broadcast されない
  // ——`openClient()` 自身の `client.hello` の snapshot から拾う）｜p2（右、新しくフォーカスされる。AC-I4）。
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const p2Created = client.waitForEvent("pane.created");
  await prefixKey(page, "v");
  const p2 = (await p2Created).data.pane.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await client.request("pane.subscribe", { paneId: p2, scrollbackLines: 200 });
  await expect(page.locator(".terminal-pane")).toHaveCount(2);

  // 境界のリサイズ（M2。design「Splitter」）：`.splitter` をキーボードでフォーカスし矢印で動かす
  // （ドラッグは Pointer Events だが、キーボードの矢印も同じ `layout.set_split_ratio` を送る。Splitter.vue）。
  const splitter = page.locator(".splitter");
  await expect(splitter).toHaveCount(1);
  const ratioChanged = client.waitForEvent("layout.updated", (e) => (findSplit(e.data.tab.layout as TestLayoutNode)?.ratio ?? 0.5) > 0.5);
  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const afterResize = await ratioChanged;
  expect(findSplit(afterResize.data.tab.layout as TestLayoutNode)?.ratio).toBeGreaterThan(0.5); // 右へ動いた（Splitter.vue の STEP）
  await expect(splitter).toHaveAttribute("aria-valuenow", /^(5[1-9]|[6-9]\d|100)$/);

  // 方向でのフォーカス移動：h/l（左右分割なので、この2方向だけが一意に定まる）。
  // ここから先、明示的な `focusTerminal`（`.first()` 固定）は呼ばない——3 pane 以上では常に p1 を
  // クリックしてしまい、直前のキー操作で移した焦点を踏み潰す（実地の確認で発見した不具合。この spec 自身の
  // 不具合であって製品側の不具合ではない）。`view.focusedPaneId` が変わるたびに、その pane の
  // `TerminalPane.vue` が自分で `term.focus()` を呼ぶ（`watch`。design「フォーカスと表示」）ので、
  // prefix 操作の直後は常に正しい pane へ実際のブラウザのフォーカスが移っている。
  await prefixKey(page, "h"); // p2 → p1（境界のリサイズで splitter へ移った焦点からでも、prefix は
  // window 側のグローバルな keydown ハンドラ経由で届く。design「keys/KeyInputController」）
  const marker1 = `soda-e2e-focusdir-${Date.now()}`;
  await typeLine(page, `echo ${marker1}`);
  await client.waitForOutput(p1, marker1); // p1 に届く＝フォーカスが実際に移った証拠
  await markFocusedPane(page, p1); // 画面の pane の並びを読むための印（下の入れ替え。support/panes.ts）
  await prefixKey(page, "l"); // p1 → p2
  const marker2 = `soda-e2e-focusdir-${Date.now()}`;
  await typeLine(page, `echo ${marker2}`);
  await client.waitForOutput(p2, marker2);
  await markFocusedPane(page, p2);

  // さらに p2 を下分割：p1｜（p2 上／p3 下）。`waitForEvent` は述語を付けないと**既に溜まった**直近の
  // `pane.created`（p2 自身のもの）へ即座に解決してしまう（p1/p2 の id で除外する。この spec 自身の
  // 不具合として実地の確認で発見——「新しい pane の id」を待つときは必ず既知の id を除外する）。
  const p3Created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p1 && e.data.pane.id !== p2);
  await prefixKey(page, "-");
  const p3 = (await p3Created).data.pane.id;
  await client.request("pane.subscribe", { paneId: p3, scrollbackLines: 200 });
  await expect(page.locator(".terminal-pane")).toHaveCount(3);

  // 分割直後は新しい pane（p3）へ実際にフォーカスが移っていることを、`pane.created`/`layout.updated` の
  // 到着だけでなく実際の入力で確かめる（AC-I4。`ActionDispatcher.splitPane` の `.then()` は
  // `pane.split` 自体の RPC 応答を待ってから `view.focusPane` するため、events の到着より遅れうる——
  // 確かめずに次のキー操作へ進むと、まだ p2 にフォーカスが残ったまま操作してしまう）。
  const markerNewPane = `soda-e2e-split-${Date.now()}`;
  await typeLine(page, `echo ${markerNewPane}`);
  await client.waitForOutput(p3, markerNewPane);
  await markFocusedPane(page, p3);

  // 巡回の前提を作る：k（上）で p3 → p2 に戻る。
  await prefixKey(page, "k");
  const marker3 = `soda-e2e-focusdir-${Date.now()}`;
  await typeLine(page, `echo ${marker3}`);
  await client.waitForOutput(p2, marker3);

  // 入れ替え：J（下方向）で p2 と p3 を入れ替える。巡回順（深さ優先）が [p1,p2,p3] → [p1,p3,p2] に変わることで確認する。
  await expect.poll(() => shownPanes(page)).toEqual([p1, p2, p3]); // 画面の並び（DOM の順）＝深さ優先の順
  const swapped = client.waitForEvent("layout.updated", (e) => leaves(e.data.tab.layout as TestLayoutNode).join(",") !== [p1, p2, p3].join(","));
  await prefixKey(page, "J");
  const afterSwap = await swapped;
  expect(leaves(afterSwap.data.tab.layout as TestLayoutNode)).toEqual([p1, p3, p2]);
  // テスト自身のクライアントに `layout.updated` が届いても、ブラウザが入れ替えを反映したとは限らない（別の接続。D104）。
  // 巡回（prefix+Tab）は、ブラウザが持つレイアウトの並びで次の pane を決めて先に焦点を移す（`ActionDispatcher.cyclePane`。
  // D97）ので、反映の前に押すと古い並び [p1,p2,p3] の p2 の次＝p3 へ移り、打った文字が p3 に入る（01 の T28 の test で
  // 1 回落ちた）。画面の pane の並びが入れ替わったことを待ってから巡回する。
  await expect.poll(() => shownPanes(page)).toEqual([p1, p3, p2]);

  // 巡回：prefix+Tab で次の pane、prefix+shift+Tab で前の pane。
  await prefixKey(page, "Tab"); // 深さ優先 [p1,p3,p2] の p2（idx2）の次 → p1（idx0）
  const marker4 = `soda-e2e-cycle-${Date.now()}`;
  await typeLine(page, `echo ${marker4}`);
  await client.waitForOutput(p1, marker4);
  await prefixKey(page, "Shift+Tab"); // [p1,p3,p2] の p1（idx0）の前 → p2（idx2）
  const marker5 = `soda-e2e-cycle-${Date.now()}`;
  await typeLine(page, `echo ${marker5}`);
  await client.waitForOutput(p2, marker5);

  // 拡大表示：prefix+z でトグル。
  await prefixKey(page, "z");
  await expect(page.locator(".pane-layout-zoomed")).toHaveCount(1);
  await prefixKey(page, "z");
  await expect(page.locator(".pane-layout-zoomed")).toHaveCount(0);
  await expect(page.locator(".terminal-pane")).toHaveCount(3);

  // resize モード：prefix+r → 矢印で境界を動かす → Escape で抜ける（クラッシュしないことを確認）。
  await prefixKey(page, "r");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(page.locator(".terminal-pane")).toHaveCount(3);

  // 名前変更：prefix+shift+p（`P`）。閉じたら開く前の pane（p2）へ焦点が戻る（AC-I4。native `<dialog>.close()`
  // の「開く前にフォーカスしていた要素へ戻す」既定動作＋`view.closeDialog()` の `preDialogFocusPaneId`）。
  await prefixKey(page, "P");
  const dialog = page.locator(".name-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator(".name-dialog-input").fill("named-pane");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toBeHidden();

  // 閉じる（busy でない）：prefix+x ですぐ閉じる。焦点の pane（p2）を閉じたら、残りの先頭（p1。サーバの選び方と
  // 同じ）へ焦点が移り、クリックせずにそのまま入力が届く（D97。以前は焦点が BODY へ落ちていた。親の統合 test で追加）。
  await prefixKey(page, "x");
  await expect(page.locator(".terminal-pane")).toHaveCount(2);
  const afterClose = `soda-e2e-afterpaneclose-${Date.now()}`;
  await typeLine(page, `echo ${afterClose}`);
  await client.waitForOutput(p1, afterClose);
});

test("pane: busy なら閉じる前に確認する（D23）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  await typeLine(page, "sleep 30"); // 前面プロセスがシェル以外になる → busy（AgentMonitor の判定周期を待つ）。
  await expect
    .poll(
      async () => {
        const snapshot = await client.request("client.hello", { protocol: 1, kind: "desktop" });
        return snapshot.snapshot.panes.find((p) => p.tabId === snapshot.snapshot.tabs[0]?.id)?.busy;
      },
      { timeout: 5000 },
    )
    .toBe(true);

  await prefixKey(page, "x");
  const confirm = page.locator(".confirm-dialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "キャンセル" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator(".terminal-pane")).toHaveCount(1); // 閉じずに残っている
});

test("新しい pane を作る操作の直後に打った文字は、応答を待たずに打っても新しい pane に届く（D99。親の統合 test で追加）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // 分割：prefix+v の直後、新しい pane ができる（シェルの起動確認の猶予 約 0.3 秒）のを待たずに打つ。
  const splitCreated = client.waitForEvent("pane.created");
  await prefixKey(page, "v");
  const afterSplit = `soda-e2e-aftersplit-${Date.now()}`;
  await typeLine(page, `echo ${afterSplit}`);
  const p2 = (await splitCreated).data.pane.id;
  await client.request("pane.subscribe", { paneId: p2, scrollbackLines: 200 });
  // 新しい pane のシェルが、打った行を先頭から丸ごと受け取って実行した（先頭の数文字が元の pane に取られていない）。
  // 行のエコー（`echo <印>`）は、プロンプトが長いと readline が折り返して途中に `\r` を入れる（作業フォルダ名・ホスト名の長さで変わる）ので、見ない。
  // 実行の結果の行（行頭の `\r` の後に印だけが出る）を見る。先頭が欠けた行は `bash: cho: command not found` などになり、この形にならない。
  await client.waitForOutput(p2, `\r${afterSplit}\r\n`);
  expect(client.rawOutput(p1)).not.toContain("echo soda-e2e-aftersplit");

  // 新しい workspace：prefix+N の直後に打つ。
  const wsPaneCreated = client.waitForEvent("pane.created", (e) => e.data.pane.id !== p2);
  await prefixKey(page, "N");
  const afterNewWs = `soda-e2e-afternewws-${Date.now()}`;
  await typeLine(page, `echo ${afterNewWs}`);
  const p3 = (await wsPaneCreated).data.pane.id;
  await client.request("pane.subscribe", { paneId: p3, scrollbackLines: 200 });
  await client.waitForOutput(p3, `\r${afterNewWs}\r\n`); // 上と同じ。実行の結果の行を見る
  expect(client.rawOutput(p2)).not.toContain("echo soda-e2e-afternewws");
});

test("分割の応答待ちの間に元の pane の上でホイールを回しても、その入力は新しい pane へ流れない（D99・独立点検の指摘。親の統合 test で追加）", async ({ page, appServer }) => {
  // alt screen（less）でマウスの報告が無効なとき、xterm.js はホイールを矢印キーに変えて送る。これを新しい pane へ流すと、
  // 新しいシェルで履歴が呼び出されてしまう。ページが送った INPUT フレームを CDP で直接見る。
  const sent: { paneId: string; text: string }[] = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 2) return;
    const b = Buffer.from(e.response.payloadData, "base64");
    if (b[0] !== 0x03) return; // INPUT
    sent.push({ paneId: b.subarray(2, 2 + b[1]!).toString(), text: b.subarray(2 + b[1]!).toString("latin1") });
  });
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  await typeLine(page, "seq 1 500 | less");
  await page.waitForTimeout(800);
  const box = (await page.locator(".terminal-pane").first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2); // 分割後も p1（左半分）の上になる位置
  const mark = sent.length;
  const created = client.waitForEvent("pane.created");
  await prefixKey(page, "v");
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -200);
  const p2 = (await created).data.pane.id;
  await page.waitForTimeout(800);
  const isArrow = (t: string): boolean => ["\x1bOA", "\x1bOB", "\x1b[A", "\x1b[B"].includes(t);
  const arrows = sent.slice(mark).filter((s) => isArrow(s.text));
  expect(arrows.length).toBeGreaterThan(0); // ホイールが矢印キーとして送られたこと自体は確かめる
  expect(arrows.every((s) => s.paneId === p1)).toBe(true);
  expect(sent.slice(mark).some((s) => s.paneId === p2 && isArrow(s.text))).toBe(false);
  await page.keyboard.press("q"); // less を終える（焦点は p2 なので p2 に q が入るが無害）
});

/**
 * AC3（20260920-ui-selection-visuals）：サイドバーに横スクロールバーが出ない。
 * 横に溢れる原因は 2 つある——2 行目（ブランチ名・エージェント名）が縮まないことと、
 * 幅変更のつまみが右へ 3px はみ出していたこと（decisions.md D3）。
 * 2 行目は `ahead > 0 || behind > 0` のときだけ描かれる（`Sidebar.vue` の `showGit`）ので、
 * **上流を持ち 1 コミット進んだ**作業ツリーを用意して実際に描かせる。
 */
async function makeAheadRepo(branch: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-git-"));
  const origin = join(dir, "origin.git");
  const work = join(dir, "work");
  // 利用者の ~/.gitconfig（署名・既定ブランチ名など）に左右されないようにする。
  // `/dev/null` は POSIX 前提。この E2E 一式は Linux・chromium で走らせる想定（docs/verification.md）。
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  const git = (cwd: string, args: string[]): Promise<unknown> => promisify(execFile)("git", args, { cwd, env });
  await git(dir, ["init", "--bare", "-q", origin]);
  await git(dir, ["clone", "-q", origin, work]);
  await git(work, ["config", "user.email", "e2e@example.com"]);
  await git(work, ["config", "user.name", "soda e2e"]);
  await git(work, ["commit", "-q", "--allow-empty", "-m", "init"]); // push の前に 1 つ要る（空のままでは push できない）
  await git(work, ["checkout", "-q", "-b", branch]);
  await git(work, ["push", "-q", "-u", "origin", branch]); // 上流が無いと ahead は 0 のまま
  await git(work, ["commit", "-q", "--allow-empty", "-m", "ahead"]); // ahead=1
  return work;
}

/**
 * スクロール領域と表示領域。横に溢れるのは前者が後者より広いとき。開いているサイドバーは `.sidebar` が `overflow: visible`（幅の境目が外へ 4px
 * はみ出すため。20261004-ui-interaction-polish）で、はみ出した境目が `scrollWidth` に入る。中身が溢れるかは区画の入れ物 `.sidebar-sections` で見る。
 * 畳んだサイドバーは今までどおり `.sidebar`。
 */
function sidebarWidths(page: Page): Promise<{ scroll: number; client: number }> {
  return page.evaluate(() => {
    const nav = document.querySelector(".sidebar") as HTMLElement;
    const el = (nav.classList.contains("sidebar-collapsed") ? nav : document.querySelector(".sidebar-sections")) as HTMLElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
}

test("サイドバー：区切りの無い長いブランチ名でも横に溢れない（AC3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // 区切り文字（`-` `/` `_`）を含まない長い名前にする。区切りがあると折り返せてしまい、横へは溢れない。
  const branch = "verylongbranchnamewithnoseparatorswhatsoeversothatitcannotwrap";
  await client.request("workspace.create", { cwd: await makeAheadRepo(branch) });

  // `GitInfoPoller` は 5s 周期なので、2 行目が出るのは次の周回。既定の 5s では足りない。
  const row = page.locator(".sidebar-spaces .sidebar-row").filter({ hasText: branch });
  await expect(row).toHaveCount(1, { timeout: 15_000 });

  const wide = await sidebarWidths(page);
  expect(wide.scroll, `既定幅（実測 ${JSON.stringify(wide)}）`).toBeLessThanOrEqual(wide.client);

  // 折りたたんでも溢れない（2 行目は描かれなくなるが、つまみのはみ出しはここでも効く）。
  await focusTerminal(page);
  await prefixKey(page, "b");
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
  const narrow = await sidebarWidths(page);
  expect(narrow.scroll, `折りたたみ時（実測 ${JSON.stringify(narrow)}）`).toBeLessThanOrEqual(narrow.client);
});

/**
 * AC1・AC3・AC6・AC12（20260920-sidebar-tabbar-controls）：足したボタンが実際に効くこと。
 * キー操作（prefix+b / prefix+shift+N / prefix+c）は変えていないので、同じ結果になるのが正しい。
 */
test("サイドバーとタブバーのボタンが、キー操作と同じ結果になる（AC1・AC3・AC6・AC12）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // 折りたたみ：ボタンで畳んで、畳んだ状態のボタンで戻す（戻せないと行き止まりになる）。
  const collapse = page.locator(".sidebar-footer .sidebar-collapse-btn");
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.click();
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
  await expect(collapse).toHaveAttribute("aria-expanded", "false");
  await collapse.click();
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(0);

  // 「新規」：workspace が 1 つ増える（prefix+shift+N と同じ）。
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(1);
  const created = client.waitForEvent("workspace.created");
  await page.locator(".sidebar-section-footer .sidebar-btn").first().click();
  await created;
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(2);

  // tab バー自体が無いと ＋ をクリックできない（20260922-appearance-settings-rest の自動非表示・AC4。
  // この work 以前は tab が1個でも常に表示されていた）ので、先にキー操作でもう1つ tab を作って表示させる。
  await focusTerminal(page);
  await prefixKey(page, "c");
  await page.keyboard.press("Enter"); // 名前は既定のまま
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);

  // ＋：新しいタブの名前入力が開く（prefix+c と同じ）。
  await page.locator(".tab-bar-new").click();
  await expect(page.locator(".name-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".name-dialog")).toBeHidden();
});

/**
 * この spec が作った使い捨てリポジトリ。**worktree の作成先は開発機の `~/.sodashitsu/worktrees` 配下**
 * （サーバの既定。E2E からは差し替えられない）なので、後片付けをしないと**実機に残骸が溜まる**
 * ——実際に 4 つ残っているのを cross 点検が見つけた。テストが途中で落ちても消えるよう `afterEach` で消す。
 */
const madeRepos = new Set<string>();

test.afterEach(async () => {
  for (const repo of madeRepos) {
    // 作成先は `<root>/<repo 名>/<ブランチの slug>`（`defaultCheckoutPath`）。repo 名ごと消す。
    await rm(join(homedir(), ".sodashitsu", "worktrees", basename(repo)), { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
  madeRepos.clear();
});

/** 使い捨ての git リポジトリ（**この実リポジトリに worktree を作らないため**。20260920-git-worktree-actions）。 */
async function makePlainRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-wt-"));
  madeRepos.add(dir);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
  const git = (args: string[]): Promise<unknown> => promisify(execFile)("git", args, { cwd: dir, env });
  await git(["init", "-q", "-b", "main"]);
  await git(["config", "user.email", "e2e@example.com"]);
  await git(["config", "user.name", "soda e2e"]);
  await git(["commit", "-q", "--allow-empty", "-m", "init"]);
  return dir;
}

/**
 * AC3・AC5・AC9・AC-I3（20260920-git-worktree-actions）。
 * **キーだけで**（`prefix+G`）worktree を作り、その場所の workspace が開くこと。
 * 作ったものは**閉じてもディスクに残る**（この work では `git worktree remove` を呼ばない）。
 */
test("worktree：prefix+G で作ると、その場所の workspace が開く。閉じてもディスクには残る（AC3・AC9・AC-I3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // git リポジトリの workspace を作って、そこへ表示を移す（既定の workspace はこのリポジトリを指しうる）。
  const repo = await makePlainRepo();
  const created = client.waitForEvent("workspace.created");
  await client.request("workspace.create", { cwd: repo, label: "wt-repo" }); // 自動の名前（フォルダ名）に頼らず、ラベルで区別する
  const repoWs = (await created).data.workspace;
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(2);
  await page.locator(".sidebar-spaces .sidebar-row").filter({ hasText: "wt-repo" }).click();
  expect(repoWs.cwd).toBe(repo);

  // prefix+G（herdr の new_worktree と同じ位置）。メニューを開かずに始められる。
  await focusTerminal(page);
  await prefixKey(page, "G");
  const dialog = page.locator(".worktree-dialog");
  await expect(dialog).toBeVisible();
  // 候補が入っていて、作成先が見えている（AC1・AC2）。
  const branch = await dialog.locator(".worktree-dialog-input").inputValue();
  expect(branch).toMatch(/^worktree\//);
  await expect(dialog.locator(".worktree-dialog-preview-path")).toContainText("/.sodashitsu/worktrees/");
  const previewPath = await dialog.locator(".worktree-dialog-preview-path").textContent();

  // 条件を付けないと、**先に届いている repo の作成イベント**を拾ってしまう。
  const wsCreated = client.waitForEvent("workspace.created", (e) => e.data.workspace.id !== repoWs.id);
  await page.keyboard.press("Enter"); // 候補のまま確定（キーだけで完結）
  const newWs = (await wsCreated).data.workspace;
  expect(newWs.cwd).toBe(previewPath);
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(3);

  // 閉じてもディスクには残る（削除はこの work の対象外。AC9）。
  await client.request("workspace.close", { workspaceId: newWs.id });
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(2);
  const { stdout } = await promisify(execFile)("git", ["worktree", "list", "--porcelain"], { cwd: repo });
  expect(stdout, "閉じても worktree は残っている").toContain(newWs.cwd);
});

/** AC5・AC6：一覧から開く。既に開いている場所を選んだら、新しく作らずそこへ移る。 */
test("worktree：一覧から開ける。既に開いている worktree を選んでも増えない（AC5・AC6）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  const repo = await makePlainRepo();
  const created = client.waitForEvent("workspace.created");
  await client.request("workspace.create", { cwd: repo, label: "wt-repo" });
  const repoWs = (await created).data.workspace;
  expect(repoWs.cwd).toBe(repo);
  await page.locator(".sidebar-spaces .sidebar-row").filter({ hasText: "wt-repo" }).click();

  // 先に 1 つ作っておく。
  await focusTerminal(page);
  await prefixKey(page, "G");
  await expect(page.locator(".worktree-dialog")).toBeVisible();
  const madeWs = client.waitForEvent("workspace.created", (e) => e.data.workspace.id !== repoWs.id);
  await page.keyboard.press("Enter");
  const made = (await madeWs).data.workspace;
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(3);

  // メニューから一覧を開く（`workspace.git` が埋まるのを待つ——5 秒周期）。
  const row = page.locator(".sidebar-spaces .sidebar-row").filter({ hasText: "wt-repo" });
  const openList = async (): Promise<void> => {
    await row.click({ button: "right" });
    await expect(page.locator(".context-menu")).toBeVisible();
  };
  await expect
    .poll(
      async () => {
        await openList();
        const has = (await page.locator(".context-menu").getByRole("menuitem", { name: "worktree を開く…" }).count()) > 0;
        if (!has) await page.keyboard.press("Escape");
        return has;
      },
      { timeout: 15_000, message: "git の情報が届くとメニューに worktree の項目が出る" },
    )
    .toBe(true);
  await page.locator(".context-menu").getByRole("menuitem", { name: "worktree を開く…" }).click();

  const list = page.locator(".worktree-open-dialog");
  await expect(list).toBeVisible();

  // 選択中の行に**ポインタが乗っても選択色が消えない**（review ラウンド1）。
  // `:hover` と `-selected` の詳細度がそろっていないと、↑↓ で選んで Enter という主操作で
  // どれが確定されるか読めなくなる。実物の CSS でしか確かめられないのでここで見る。
  const selectedItem = list.locator(".worktree-open-dialog-item-selected");
  const selectedBg = await selectedItem.evaluate((el) => getComputedStyle(el).backgroundColor);
  await selectedItem.hover();
  expect(await selectedItem.evaluate((el) => getComputedStyle(el).backgroundColor), "hover しても選択色のまま").toBe(selectedBg);
  const otherBg = await list
    .locator(".worktree-open-dialog-item:not(.worktree-open-dialog-item-selected)")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(selectedBg, "選択色は非選択の行と違う").not.toBe(otherBg);

  // 既に開いている worktree を選ぶ（AC6）。workspace は増えず、**その workspace へ表示が移る**。
  await list.locator(".worktree-open-dialog-item").filter({ hasText: made.cwd }).click();
  await expect(list).toBeHidden();
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(3);
  // 「移る」側もブラウザで観測する（条項 e2e-observe-browser）。表示中の行は 1 つだけで、それが選んだ worktree。
  const current = page.locator(".sidebar-spaces .sidebar-row[aria-current='true']");
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(new RegExp(made.label));
});
