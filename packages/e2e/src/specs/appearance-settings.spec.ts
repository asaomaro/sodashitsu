import type { Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";

/**
 * 外観と設定の残り（20260922-appearance-settings-rest）の E2E（T8）。
 * design「US1」〜「US5」・受け入れ基準 AC1〜AC15・AC-I3〜AC-I6 のうち、実物のブラウザでしか
 * 確認できない範囲（unit test では検証できない DOM の見た目・タイミング・キー操作の通し）を扱う。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）:
 * - 並び順・表示/非表示・時刻・枠の太さ・エージェント名は **DOM**（クラス・テキスト・`getComputedStyle`）。
 * - `reload_config` の効果は、設定の反映（DOM）と、`.toast` に出る通知文の両方で見る
 *   （tasks.md T8(e) は「`role="status"` に出る」と書いていたが、実際の通知の仕組みは
 *   `view.toast()` → `Toast.vue` の `.toast`〔`aria-live="polite"`〕であり `role="status"` では
 *   ない。既存の他 spec〔`notifications.spec.ts`・`scrollback-copy.spec.ts` 等〕もみな `.toast`
 *   locator で判定しており、ここもそれに合わせる——tasks.md の字面ではなく実装を正とする）。
 *
 * AC1「設定画面に…トグルがある」は requirements の事実誤認で、実装は `Sidebar.vue` 自身に
 * トグルを置く（decisions.md [[D2]]）。この spec もその実装（正）を検証する。
 */

const sidebarLabels = (page: Page) => page.locator(".sidebar-spaces .sidebar-label").allTextContents();
const nameDialog = (page: Page) => page.locator(".name-dialog");

async function openApp(page: Page, appServer: AppServer): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
}

/** workspace の名前を変える（prefix+W → NameDialog。workspace-tab-pane.spec.ts と同じ手順）。 */
async function renameWorkspace(page: Page, label: string): Promise<void> {
  await prefixKey(page, "W");
  await expect(nameDialog(page)).toBeVisible();
  await nameDialog(page).locator(".name-dialog-input").fill(label);
  await nameDialog(page).getByRole("button", { name: "OK" }).click();
  await expect(nameDialog(page)).toBeHidden();
}

test("spaces の並び順トグル：既定は開いた順、押すと名前順、もう一度押すと戻る（AC1・AC2。[[D2]]）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await openApp(page, appServer);
  await focusTerminal(page);

  // 最初の workspace を「zebra」に改名（作成順で先）。
  await renameWorkspace(page, "zebra");

  // 2 つ目の workspace を作り「apple」に改名（作成順で後、名前順では先）。
  const created = client.waitForEvent("workspace.created");
  await prefixKey(page, "N");
  await created;
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(2);
  await renameWorkspace(page, "apple");

  // トグルは Sidebar 自身の spaces 区画ヘッダーにある（[[D2]]。設定画面ではない）。
  const sortBtn = page.locator(".sidebar-spaces .sidebar-sort-btn");
  await expect(sortBtn).toBeVisible();
  await expect(sortBtn, "既定は「開いた順」").toHaveAttribute("aria-label", /開いた順/);
  await expect.poll(() => sidebarLabels(page)).toEqual(["zebra", "apple"]); // 開いた順＝作成順

  await sortBtn.click();
  await expect(sortBtn).toHaveAttribute("aria-label", /名前順/);
  await expect.poll(() => sidebarLabels(page)).toEqual(["apple", "zebra"]); // AC2：ラベルの文字列順

  await sortBtn.click();
  await expect(sortBtn).toHaveAttribute("aria-label", /開いた順/);
  await expect.poll(() => sidebarLabels(page)).toEqual(["zebra", "apple"]); // もう一度押すと開いた順へ戻る（AC1）
});

test("tab バー：tab が1個のときは無く、2個以上で現れる。非表示の間も prefix+c は効き、フォーカスは端末へ戻る（AC4〜AC6・AC-I6）", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await openApp(page, appServer);
  await focusTerminal(page);

  // tab 1個：tab バーが無い（AC4）。「＋」の導線がここに無い代わり、prefix+c はそのまま効く。
  await expect(page.locator(".tab-bar")).toHaveCount(0);

  // prefix+c → NameDialog（workspace-tab-pane.spec.ts と同じ手順）で 2 個目の tab を作る（AC6）。
  await prefixKey(page, "c");
  await expect(nameDialog(page)).toBeVisible();
  await nameDialog(page).locator(".name-dialog-input").fill("second-tab");
  await nameDialog(page).getByRole("button", { name: "OK" }).click();

  // tab 2個：tab バーが現れる（AC5）。
  const tabBar = page.locator(".tab-bar");
  await expect(tabBar).toBeVisible();
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);

  // AC-I6：tab バーの中にフォーカスがある状態で tab を1個に減らすと、フォーカスは端末へ戻る
  // （消えたまま迷子にならない）。最初の tab 項目へフォーカスしてから、表示中（＝いま作った方）
  // の tab を閉じる（`.focus()` はクリックと違い `selectTab` を呼ばないので、閉じるのは
  // 引き続き `view.tabId` が指す「second-tab」——`.tab-bar-new` ではなく `.tab-bar-item` を
  // 使うのは、この AC がタブ項目へのフォーカスを検証対象としているため。`.tab-bar-new` に
  // フォーカスが残っていても、20260925-focus-trapped-keybindings で無修飾の Enter/Space
  // だけを止めるよう直ったので、`prefix+X` は今は届く）。
  await page.locator(".tab-bar-item").first().focus();
  await expect(page.locator(".tab-bar-item").first()).toBeFocused();
  await prefixKey(page, "X"); // close_tab（busy でなければ確認なし。workspace-tab-pane.spec.ts と同じ）
  await expect(page.locator(".tab-bar")).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea").first()).toBeFocused();

  // フォーカスが端末へ戻った証拠として、そのまま入力が届く。
  const marker = `soda-e2e-tabbar-focus-${Date.now()}`;
  await typeLine(page, `echo ${marker}`);
  await client.waitForOutput(p1, marker);
});

test("tab バー：表示されている間だけ現在時刻（HH:mm）が出る（AC7）", async ({ page, appServer }) => {
  await openApp(page, appServer);
  await focusTerminal(page);
  await prefixKey(page, "c");
  await expect(nameDialog(page)).toBeVisible();
  await nameDialog(page).locator(".name-dialog-input").fill("second-tab");
  await nameDialog(page).getByRole("button", { name: "OK" }).click();

  const clock = page.locator(".tab-bar-clock");
  await expect(clock).toBeVisible();
  await expect(clock).toHaveText(/^\d{2}:\d{2}$/);
  // 定期更新自体（AC8）は実時間を待つ検証が不安定になりやすいので、`setInterval` の呼び出しは
  // T6 の unit test（`TabBar.test.ts`）の対象とし、ここでは「表示されている」ことだけ確認する
  // （tasks.md T8(c) の記述どおり。理由は decisions.md には残さない——tasks.md 自体に既に理由が
  // 書かれている軽微な判断のため）。
});

test("設定：pane の枠・隙間の太さを変えると、実際に描画される padding が変わる。PTY のリサイズが飛んでもクラッシュしない（AC9。既定4px→太い6px→細い2px。[[D8]]）", async ({
  page,
  appServer,
}) => {
  // [[D8]]：太さを変えると葉の要素の大きさが変わり、既存の `ResizeObserver`（followResize。design「依拠する
  // 既存の事実」）を通じて実際に PTY のリサイズ要求（`client.view` → サーバの `pane.resize` 相当）が飛びうる。
  // ただし何 px 変わるかは cols/rows のセルの境界を跨ぐかどうか次第で決定的ではない（`ViewSync.commit` は
  // 送信前の cols/rows が変わらなければ `client.view` 自体を送らない。`ViewSync.ts:92` 参照）ので、
  // D8「影響」節の「実際にリサイズ要求が飛ぶこと（**または**少なくともクラッシュ・エラーが起きないこと）」の
  // うち、決定的に検証できる後者（クラッシュ・エラーが起きないこと）を軸に、実際に端末が機能し続ける
  // （入力が届き、出力が来る）ことまで確認する（taskcheck 指摘。review.md 参照）。
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  // `pageerror`（捕まらなかった例外）だけを見る——`console` の error レベルは、この操作と無関係な
  // 既存の雑音（CSP の既定の説明・トークン付与前の 401 等）まで拾ってしまい判定にならない
  // （実際に確かめた。この spec のためだけの取捨ではなく「クラッシュしたか」の直接の証拠は
  // 捕まらなかった例外の方）。
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await openApp(page, appServer);
  await focusTerminal(page);
  await prefixKey(page, "s");
  const dialog = page.locator("dialog.settings-dialog");
  await expect(dialog).toHaveAttribute("open", "");
  const display = dialog.locator('section[aria-labelledby="settings-display"]');
  const frame = page.locator(".pane-frame-enabled");
  const paddingLeft = () => frame.evaluate((el) => getComputedStyle(el).paddingLeft);

  await expect(paddingLeft()).resolves.toBe("4px"); // 既定

  // AC-I3・AC-I4：ラジオ列（`name="settings-pane-frame-thickness"` の group）まで実際に Tab で
  // 辿り着く（数えず、着くまで）。ネイティブの radio group は**選ばれている 1 個だけ**が Tab の
  // 止まり先になる（roving tabindex）ので、group の中は Tab ではなく矢印キーで移動する
  // （選ぶと同時に checked も変わるのがネイティブの挙動）。
  const defaultRadio = display.locator('input[name="settings-pane-frame-thickness"][value="default"]');
  const thickRadio = display.locator('input[name="settings-pane-frame-thickness"][value="thick"]');
  const thinRadio = display.locator('input[name="settings-pane-frame-thickness"][value="thin"]');
  await display.locator('[role="switch"]').first().focus(); // 節の先頭（既存の「状態を記号でも示す」switch）から
  for (let i = 0; i < 12; i++) {
    const name = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name);
    if (name === "settings-pane-frame-thickness") break;
    await page.keyboard.press("Tab");
  }
  await expect(defaultRadio, "group に入ると、いま選ばれている「既定」に止まる").toBeFocused();

  await page.keyboard.press("ArrowDown"); // 既定 → 太い（DOM 順で次）
  await expect(thickRadio).toBeFocused();
  await expect(thickRadio).toBeChecked();
  await expect(paddingLeft()).resolves.toBe("6px");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp"); // 太い → 既定 → 細い（DOM 順で前へ2つ）
  await expect(thinRadio).toBeFocused();
  await expect(thinRadio).toBeChecked();
  await expect(paddingLeft()).resolves.toBe("2px");

  // ページの再読み込みなしに反映される（design「pane の枠・隙間の太さ」の申し送りどおり）。
  await expect(dialog).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");

  // [[D8]]：太さを2回変えた（既定→太い→細い）あとも、クラッシュ・コンソールエラーが起きておらず、
  // 端末が引き続き機能する（実際に入力が届き、出力が返る）ことを確認する。
  // `ResizeObserver` のコールバック・`RESIZE_COMMIT_INTERVAL_MS`（100ms）の throttle が確実に
  // 走りきってから確認するため、一呼吸おく。
  await page.waitForTimeout(300);
  await focusTerminal(page);
  const marker = `soda-e2e-paneframe-resize-${Date.now()}`;
  await typeLine(page, `echo ${marker}`);
  await client.waitForOutput(p1, marker);
  expect(pageErrors, `ページのエラー: ${pageErrors.join(" / ")}`).toEqual([]);
});

test("設定：pane にエージェント名を表示する switch（既定は無効。有効にすると枠にエージェント名が出る。AC10〜AC12・AC-I3・AC-I4）", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.rename", { paneId: p1, label: "my-agent" });
  await openApp(page, appServer);
  await focusTerminal(page);

  // 既定は無効：名前を付けた pane でも、画面には出ない（AC12。aria-label だけで伝える）。
  await expect(page.locator(".pane-frame-name")).toHaveCount(0);
  await expect(page.locator(".pane-frame-edge")).toHaveAttribute("aria-label", /my-agent/);

  await prefixKey(page, "s");
  const dialog = page.locator("dialog.settings-dialog");
  const display = dialog.locator('section[aria-labelledby="settings-display"]');
  const nameSwitch = display.locator('[role="switch"]').filter({ hasText: "エージェント名" });

  // AC-I3・AC-I4：この switch まで実際に Tab で辿り着いて Enter で有効にする。
  await display.locator('[role="switch"]').first().focus();
  for (let i = 0; i < 12; i++) {
    if (await nameSwitch.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(nameSwitch).toBeFocused();
  await expect(nameSwitch).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Enter");
  await expect(nameSwitch).toHaveAttribute("aria-checked", "true");
  await expect(nameSwitch, "AC-I4：押した switch へ戻る（フォーカスは離れない）").toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");

  // AC11：有効にすると、pane の枠にエージェント名が可視で出る。
  await expect(page.locator(".pane-frame-name")).toHaveText("my-agent");

  // 無効へ戻すと、また画面から消える（AC12）。
  await prefixKey(page, "s");
  await nameSwitch.click();
  await expect(nameSwitch).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pane-frame-name")).toHaveCount(0);
});

test("prefix+shift+r：外部で変わった設定を読み直し、通知が出て workspace・tab・pane の構成は変わらない（AC13〜AC15）", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await openApp(page, appServer);
  await focusTerminal(page);

  // 前提：既定の記号表示（入）。
  await expect(page.locator(".sidebar-spaces .sidebar-state-icon").first()).toHaveAttribute("data-symbols", "on");
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(1);

  // このページの ActionDispatcher を経ない書き換え（別タブ・別ダイアログ経由を模す。design「US5」）。
  await page.evaluate(() => localStorage.setItem("soda.prefs.v1", JSON.stringify({ statusSymbols: false })));
  // 前提の確認：この時点ではまだ画面に反映されていない（storage イベントには自動で追従しない設計。design「依拠する既存の事実」）。
  await expect(page.locator(".sidebar-spaces .sidebar-state-icon").first()).toHaveAttribute("data-symbols", "on");

  await prefixKey(page, "R");

  // AC14：読み直した結果が一言で分かる。
  await expect(page.locator(".toast", { hasText: "設定を読み直しました。" })).toBeVisible();
  // AC13：実際に反映される。
  await expect(page.locator(".sidebar-spaces .sidebar-state-icon").first()).toHaveAttribute("data-symbols", "off");

  // AC15：workspace・tab・pane の構成・フォーカスは変わらない。表示中の端末へそのまま入力が届く
  // （クリックし直さずに済む＝フォーカスも保たれている証拠）。
  await expect(page.locator(".sidebar-spaces .sidebar-row")).toHaveCount(1);
  await expect(page.locator(".terminal-pane")).toHaveCount(1);
  const marker = `soda-e2e-reloadconfig-${Date.now()}`;
  await typeLine(page, `echo ${marker}`);
  await client.waitForOutput(p1, marker);
});
