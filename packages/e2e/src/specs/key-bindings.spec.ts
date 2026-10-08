import { devices, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { watchSentInput, type SentInput } from "../support/frames.js";
import { focusTerminal, prefixKey } from "../support/keys.js";
import { focusedPaneIndex } from "../support/panes.js";

/**
 * キー割り当てのカスタマイズ（20260921-keybinding-customization。herdr の `[keys]`）の E2E。
 *
 * **判定はブラウザの側で行う**（条項 `.aidev/conventions/e2e-observe-browser.md`）:
 * - 端末へ届いたキーは、**ブラウザが実際に送った INPUT フレーム**（`watchSentInput`。CDP の `Network.webSocketFrameSent`）で見る——
 *   prefix の 2 度押し・素通しの ctrl+b が端末へ送られたか、直接のキーが**端末へ届いていないか**を、アプリの見え方とは別に送る側で確かめる。
 * - 操作の結果は DOM（分割で増える `.pane-frame`・新しい tab の `.tab-bar-item`・prefix 中の `.prefix-indicator`・焦点の pane の位置・設定画面の状態と `role="status"` の文）。
 * - キー入力は Playwright の実物のキー（`page.keyboard.press`）。shift 付きの文字は**大文字で送る**（小文字＋shift は合成の形で、実物のキーボードとは `event.key` が違う。research F24）。
 * - 保存は `localStorage` の `soda.prefs.v1` と、開き直した後の振る舞い。
 */

const dialog = (page: Page) => page.locator("dialog.settings-dialog");
const keysSection = (page: Page) =>
  dialog(page).locator('section[aria-labelledby="settings-keys"]');
const actionRow = (page: Page, id: string) => keysSection(page).locator(`[data-action="${id}"]`);
const capture = (page: Page) => keysSection(page).locator(".keys-capture");
const status = (page: Page) => keysSection(page).locator('[role="status"]');
const prefixChangeButton = (page: Page) => keysSection(page).locator("[data-prefix-change]");
const prefixIndicator = (page: Page) => page.locator(".prefix-indicator");
const paneCount = (page: Page) => page.locator(".pane-frame").count();

async function openApp(page: Page, appServer: AppServer): Promise<() => SentInput[]> {
  const sent = await watchSentInput(page); // `goto` の前に張る（CDP の Network.enable より前の WebSocket は見えない）
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  return sent;
}

/** `soda.prefs.v1` を持たせた新しいブラウザで開く（保存された割り当てから始める）。 */
async function openWithPrefs(
  browser: Browser,
  appServer: AppServer,
  prefs: Record<string, unknown>,
): Promise<{ context: BrowserContext; page: Page; sent: () => SentInput[] }> {
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: appServer.origin,
          localStorage: [{ name: "soda.prefs.v1", value: JSON.stringify(prefs) }],
        },
      ],
    },
  });
  const page = await context.newPage();
  const sent = await openApp(page, appServer);
  return { context, page, sent };
}

/** 設定画面を、いまの prefix の `s` で開く（既定は Ctrl+B）。 */
async function openSettings(page: Page, prefix = "Control+b"): Promise<void> {
  await focusTerminal(page);
  await page.keyboard.press(prefix);
  await page.keyboard.press("s");
  await expect(dialog(page)).toHaveAttribute("open", "");
}

/** 設定画面の節「キー」の、ある操作の行を開く（`<details>`）。 */
async function openRow(page: Page, id: string): Promise<void> {
  const row = actionRow(page, id);
  await row.locator("summary").click();
  await expect(row).toHaveAttribute("open", "");
}

const storedKeys = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem("soda.prefs.v1");
    return raw ? ((JSON.parse(raw) as { keys?: unknown }).keys ?? null) : null;
  });

/** 送った INPUT のうち、`from` 番目以降をつないだ文字列。 */
const sentSince = (sent: () => SentInput[], from: number): string =>
  sent()
    .slice(from)
    .map((s) => s.text)
    .join("");

test("prefix を ctrl+a に変えると、新しい prefix で入り、旧い ctrl+b は端末へ届き、2 度押しは ctrl+a を端末へ送る。再読み込みでも残る（AC3・AC8・AC-I4）", async ({
  page,
  appServer,
}) => {
  const sent = await openApp(page, appServer);
  await openSettings(page);
  await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+b");
  await prefixChangeButton(page).click();
  await expect(capture(page)).toBeFocused(); // AC-I4：取り込みの部品へフォーカスが移る
  await page.keyboard.press("Control+a");
  await expect(status(page)).toHaveText("prefix を ctrl+a にしました。");
  await expect(capture(page)).toHaveCount(0);
  await expect(prefixChangeButton(page), "AC-I4：確定したら押したボタンへ戻る").toBeFocused();
  await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+a");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");
  expect(await storedKeys(page), "保存される（差だけ）").toEqual({ prefix: "ctrl+a" });

  // 旧い prefix（ctrl+b）は端末へそのまま届き、prefix には入らない。
  await focusTerminal(page);
  let n = sent().length;
  await page.keyboard.press("Control+b");
  await expect.poll(() => sentSince(sent, n)).toContain("\x02");
  await expect(prefixIndicator(page)).toHaveCount(0);

  // 新しい prefix で入り、次のキーが操作になる（prefix+c＝新しい tab）。
  // tab が1個のときは tab バー自体が無い（`.tab-bar-item` の count は 0。20260922-appearance-settings-rest
  // の自動非表示・AC4）ので、実際の tab 数「1」として扱う（さもないと「0→1」を期待し、実際の「1→2」と食い違う）。
  const tabs = Math.max(await page.locator(".tab-bar-item").count(), 1);
  await page.keyboard.press("Control+a");
  await expect(prefixIndicator(page)).toBeVisible();
  await page.keyboard.press("c");
  // 新しい tab は名前を尋ねる（既存の挙動）。Enter で既定の名前のまま作る。
  await expect(page.getByRole("textbox", { name: "新しい tab の名前" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab-bar-item")).toHaveCount(tabs + 1);

  // 2 度押しは、その prefix のキー自身（ctrl+a＝\x01）を端末へ送る。
  await focusTerminal(page);
  n = sent().length;
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+a");
  await expect.poll(() => sentSince(sent, n)).toContain("\x01");

  // 再読み込みでも残る。
  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  await page.keyboard.press("Control+a");
  await expect(prefixIndicator(page)).toBeVisible();
  await page.keyboard.press("Escape");
});

test("直接のキー：ctrl+alt+d を右へ分割に足すと、prefix なしの 1 打で分割でき、そのキーは端末へ届かない（AC5・AC8）", async ({
  page,
  appServer,
}) => {
  const sent = await openApp(page, appServer);
  await openSettings(page);
  await openRow(page, "split_vertical");
  await actionRow(page, "split_vertical").locator('[data-add="direct"]').click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("Control+Alt+d");
  await expect(status(page)).toHaveText("「右へ分割」に ctrl+alt+d を割り当てました。");
  await expect(actionRow(page, "split_vertical").locator(".keys-bindings")).toHaveText(
    "prefix+v / ctrl+alt+d",
  );
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");

  await focusTerminal(page);
  expect(await paneCount(page)).toBe(1);
  const n = sent().length;
  await page.keyboard.press("Control+Alt+d");
  await expect.poll(() => paneCount(page)).toBe(2);
  // 分割の応答で焦点が新しい pane へ移る（入力の関所が開く）まで待ってから確かめる——漏れたキーは関所が応答まで溜めるので、待たないと否定が空振りで通りうる。
  await expect.poll(() => focusedPaneIndex(page)).toBe(1);
  // 直接のキーは端末へ届かない（ESC＋Ctrl+D＝`\x1b\x04` を送っていない）。
  expect(sentSince(sent, n)).not.toContain("\x1b\x04");
  // prefix の後の v も従来どおり効く（割り当ては足しただけ）。
  await focusTerminal(page);
  await prefixKey(page, "v");
  await expect.poll(() => paneCount(page)).toBe(3);
});

test("端末の外（フォーカスできない要素＝サイドバーの行をクリックした後）でも、直接のキーは効く（AC5）", async ({
  browser,
  appServer,
}) => {
  const { context, page } = await openWithPrefs(browser, appServer, {
    keys: { bindings: { split_vertical: ["prefix+v", "ctrl+alt+d"] } },
  });
  await focusTerminal(page);
  expect(await paneCount(page)).toBe(1);
  // サイドバーの行（focus できない要素）をクリックして、端末からフォーカスを外す——この間の keydown は window の listener（`handleDomKey`）が受ける。
  await page.locator(".sidebar-row").first().click();
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.classList.contains("xterm-helper-textarea")),
    )
    .toBe(false);
  await page.keyboard.press("Control+Alt+d");
  await expect.poll(() => paneCount(page)).toBe(2);
  await context.close();
});

// 20260925-focus-trapped-keybindings（review 指摘。AC1・AC2・AC4・AC8）: 単体テスト
// （happy-dom）は「コード側が伝播を止めていない」ことまでしか示せない。実ブラウザで
// 「ボタンにフォーカスが残ったまま prefix・直接のキーを押すと実際に効く」ことを確認する。
// `Sidebar.vue`・`TabBar.vue` は design が明示的に「モジュールを共有しない」とした別々の
// `onButtonKeydown`（同型だが同一参照ではない）なので、代表1箇所ずつ（サイドバーの
// 「並び順」・tab バーの「＋」）で個別に確認する（T6 taskcheck round1 の指摘）。
// 「並び順」ボタンを選ぶのは、クリックしてもダイアログ等を開かず（＋新規・メニューと違い
// フォーカスを奪う副作用が無く）、クリック後もボタン自身へフォーカスが残るため。

test("サイドバーのボタン（並び順）にフォーカスが残ったままでも prefix キーが実際に効く（AC1・AC8）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  expect(await paneCount(page)).toBe(1);
  const sortBtn = page.locator(".sidebar-spaces .sidebar-sort-btn");
  await sortBtn.click();
  await expect(sortBtn).toBeFocused();
  // フォーカスが残ったまま prefix キーで実際に分割できる。
  await prefixKey(page, "v");
  await expect.poll(() => paneCount(page)).toBe(2);
});

test("サイドバーのボタン（並び順）にフォーカスが残ったままでも修飾付きの直接のキーが実際に効く（AC2・AC8）", async ({
  browser,
  appServer,
}) => {
  // prefix を経由しない直接のキー（AC2）は既定に無いので割り当てる（既存の AC5 テストと同じ形）。
  const { context, page } = await openWithPrefs(browser, appServer, {
    keys: { bindings: { split_vertical: ["prefix+v", "ctrl+alt+d"] } },
  });
  expect(await paneCount(page)).toBe(1);
  const sortBtn = page.locator(".sidebar-spaces .sidebar-sort-btn");
  await sortBtn.click();
  await expect(sortBtn).toBeFocused();
  await page.keyboard.press("Control+Alt+d");
  await expect.poll(() => paneCount(page)).toBe(2);
  await context.close();
});

test("tab バーのボタン（＋）にフォーカスが残ったままでも prefix キーが実際に効く（AC4・AC8）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  // tab バーは tab が2個以上でないと現れない（自動非表示）ので、まず prefix+c でもう1つ作る。
  await focusTerminal(page);
  await prefixKey(page, "c");
  await expect(page.getByRole("textbox", { name: "新しい tab の名前" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);
  const paneCountBefore = await paneCount(page);
  // `.click()` ではなく `.focus()` を使う——`.tab-bar-new` のクリックは新しい tab の名前入力
  // ダイアログを開き、フォーカスがそちらへ移ってしまう（「並び順」ボタンと違う副作用を持つ）。
  // `onButtonKeydown` は keydown だけを見るハンドラなので、フォーカスの経路（クリック／
  // プログラムからの `.focus()`／Tab 移動）を問わず同じに振る舞う——D11(1) が報告した実際の
  // 不具合も「クリック後にフォーカスが残る」状態が起点であり、ここでの検証対象と同じ状態。
  const newTabBtn = page.locator(".tab-bar-new");
  await newTabBtn.focus();
  await expect(newTabBtn).toBeFocused();
  await prefixKey(page, "v");
  await expect.poll(() => paneCount(page)).toBe(paneCountBefore + 1);
});

test("衝突は理由（持ち主の名前）を出して拒否し、元のまま終わってフォーカスは押したボタンへ戻る（AC6・AC-I2・AC-I4）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  await openRow(page, "goto");
  const add = actionRow(page, "goto").locator('[data-add="prefix"]');
  await add.click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("v"); // 右へ分割の既定
  await expect(status(page)).toContainText("prefix+v");
  await expect(status(page)).toContainText("右へ分割");
  await expect(capture(page)).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(actionRow(page, "goto").locator(".keys-bindings")).toHaveText("prefix+g"); // 変わらない
  expect(await storedKeys(page)).toBeNull();

  // 直接のキーとして、修飾キーの無い文字は拒否する。
  await actionRow(page, "goto").locator('[data-add="direct"]').click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("y");
  await expect(status(page)).toContainText("直接のキーにできません");
});

test("下に固定した結果の文は、フォーカスした部品（一覧の下のほうの取り込みの部品）を隠さない（AC-I4・WCAG 2.4.11）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  await openRow(page, "toggle_sidebar"); // pane 群の最後＝一覧の下のほう
  const add = actionRow(page, "toggle_sidebar").locator('[data-add="direct"]');
  // ［追加：直接］が、下に固定した文の帯のすぐ上に見える位置までスクロールしておく。押すとその下に取り込みの部品が出るので、
  // **スクロールの余白（`scroll-padding-bottom`）が無ければ、部品は「見えている領域の内側」のまま帯の下に入る**（ブラウザは動かさない）——
  // 自動のスクロールに任せると、この位置にならず、余白を外しても通ってしまう。
  await dialog(page).evaluate((d) => {
    const a = d.querySelector('[data-action="toggle_sidebar"] [data-add="direct"]')!;
    const band = d.querySelector(".keys-status-band")!;
    d.scrollTop += a.getBoundingClientRect().bottom - (band.getBoundingClientRect().top - 2);
  });
  await add.click();
  await expect(capture(page)).toBeFocused();
  const box = await capture(page).boundingBox();
  // 固定する帯は `.keys-status-band`（文言＋「こちらへ移す」を一緒に運ぶ。20260922-keybinding-usability・
  // review 指摘）。`.keys-message` 単体ではなく帯全体で「隠さない」ことを確かめる。
  const message = await keysSection(page).locator(".keys-status-band").boundingBox();
  const dialogBox = await dialog(page).boundingBox();
  expect(box && message && dialogBox).toBeTruthy();
  // 取り込みの部品はダイアログの見えている領域の中にあり、下に固定した文の帯と重ならない。
  expect(box!.y + box!.height).toBeLessThanOrEqual(message!.y + 1);
  expect(box!.y).toBeGreaterThanOrEqual(dialogBox!.y);
  expect(message!.y + message!.height).toBeLessThanOrEqual(dialogBox!.y + dialogBox!.height + 1);
  // 部品の中心を最前面で受けているのは、部品自身（帯ではない）。
  const onTop = await capture(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit === el || el.contains(hit);
  });
  expect(onTop, "部品の中心が帯に覆われていない").toBe(true);
  await page.keyboard.press("Escape");
});

test("取り込み待ちの Esc は取り込みだけを取り消し、設定画面は閉じない。押したキーは prefix にも端末にも漏れない（AC-I1・AC-I5）", async ({
  page,
  appServer,
}) => {
  const sent = await openApp(page, appServer);
  await openSettings(page);
  await prefixChangeButton(page).click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page), "Esc 1 回で設定画面は閉じない").toHaveAttribute("open", "");
  await expect(capture(page)).toHaveCount(0);
  await expect(prefixChangeButton(page)).toBeFocused();
  expect(await storedKeys(page)).toBeNull();

  // 取り込み待ちの間に prefix（ctrl+b）を押しても、prefix には入らず、端末へも届かない。
  // **注意**：設定画面は `showModal()` で背後が inert・window の listener はダイアログ中は何もしない・ルーターは dialog モードなので、「prefix の帯が出ない」「送ったフレームが空」の
  // 否定は取り込みの keydown 処理が無くても成り立つ。ここで実際に観測しているのは「同じ prefix を押しても設定は変わらず取り込みが終わる」こと。漏れの直接の守り
  // （`stopPropagation`・`preventDefault`）は単体テスト（`KeySettings.test.ts`）が変異で確かめている。
  const n = sent().length;
  await prefixChangeButton(page).click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("Control+b");
  await expect(status(page)).toHaveText("prefix を ctrl+b にしました。"); // 同じ prefix なので何も変わらない
  await expect(prefixIndicator(page)).toHaveCount(0);
  expect(sentSince(sent, n)).toBe("");

  // Tab も取り込む（フォーカスを動かさない）。送れない形の prefix なので理由が出て、押したボタンへ戻る。
  await prefixChangeButton(page).click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(status(page)).toContainText("prefix には");
  await expect(prefixChangeButton(page)).toBeFocused();

  // 取り込み待ちでなければ、Esc で閉じる（いつもどおり）。
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");
});

test("壊れた保存値は値ごとに落として既定へ戻し、残りを生かして起動する（AC8）", async ({
  browser,
  appServer,
}) => {
  const { context, page } = await openWithPrefs(browser, appServer, {
    keys: {
      prefix: "cmd+b",
      bindings: { zoom: ["prefix+y"], bogus_action: ["prefix+q"], goto: 42, help: ["nonsense"] },
    },
  });
  await openSettings(page); // prefix が送れない形（cmd+b）なので、既定の ctrl+b で開ける
  await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+b");
  await expect(actionRow(page, "zoom").locator(".keys-bindings")).toHaveText("prefix+y"); // 有効な上書きは生きる
  await expect(actionRow(page, "goto").locator(".keys-bindings")).toHaveText("prefix+g"); // 配列でない値は既定へ
  await expect(actionRow(page, "help").locator(".keys-bindings")).toHaveText("prefix+?"); // 全部無効なら既定へ
  await context.close();

  const broken = await openWithPrefs(browser, appServer, { keys: "こわれている" });
  await openSettings(broken.page);
  await expect(keysSection(broken.page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+b");
  await broken.context.close();
});

test("すべて既定に戻す：確認を挟み、［やめる］で何も変えず、［戻す］で prefix も割り当ても既定へ戻る（AC9・AC-I2）", async ({
  browser,
  appServer,
}) => {
  const { context, page } = await openWithPrefs(browser, appServer, {
    keys: { prefix: "ctrl+a", bindings: { zoom: ["prefix+y"] } },
  });
  await openSettings(page, "Control+a");
  await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+a");
  await keysSection(page).locator("[data-reset-all]").click();
  await expect(keysSection(page).locator("[data-confirm-no]")).toBeFocused(); // 安全側
  await keysSection(page).locator("[data-confirm-no]").click();
  await expect(keysSection(page).locator("[data-reset-all]")).toBeFocused();
  expect(await storedKeys(page), "やめたので何も変わらない").toEqual({
    prefix: "ctrl+a",
    bindings: { zoom: ["prefix+y"] },
  });
  await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+a");
  await expect(actionRow(page, "zoom").locator(".keys-bindings")).toHaveText("prefix+y");

  await keysSection(page).locator("[data-reset-all]").click();
  await keysSection(page).locator("[data-confirm-yes]").click();
  await expect(status(page)).toHaveText("すべての割り当てと prefix を既定へ戻しました。");
  await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+b");
  await expect(actionRow(page, "zoom").locator(".keys-bindings")).toHaveText("prefix+z");
  expect(await storedKeys(page), "keys ごと消える").toBeNull();
  await page.keyboard.press("Escape");

  // 既定の prefix（ctrl+b）でまた設定画面を開ける。
  await openSettings(page);
  await page.keyboard.press("Escape");
  await context.close();
});

test("おすすめの直接のキー（ctrl+alt）を足すと、prefix なしで pane を行き来できる（AC10）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  await keysSection(page).locator("[data-add-preset]").click();
  await expect(status(page)).toContainText(
    "herdr のおすすめの直接のキー（ctrl+alt）を 10 個足しました",
  );
  await expect(actionRow(page, "focus_pane_left").locator(".keys-bindings")).toHaveText(
    "prefix+h / ctrl+alt+h",
  );
  await page.keyboard.press("Escape");

  await focusTerminal(page);
  await prefixKey(page, "v"); // 右へ分割：焦点は新しい（右の）pane
  await expect.poll(() => paneCount(page)).toBe(2);
  await expect.poll(() => focusedPaneIndex(page)).toBe(1);
  await page.keyboard.press("Control+Alt+h");
  await expect.poll(() => focusedPaneIndex(page)).toBe(0);
  await page.keyboard.press("Control+Alt+l");
  await expect.poll(() => focusedPaneIndex(page)).toBe(1);
  // 拡大表示（ctrl+alt+z）も prefix なしで効く。tab バーの「Z」（`.tab-bar-zoomed`）は tab が
  // 2個以上ないと出ない（20260922-appearance-settings-rest の自動非表示・AC4）ので、tab バーに
  // 依存しない印（`.pane-layout-zoomed`。workspace-tab-pane.spec.ts と同じ判定）で見る。
  await page.keyboard.press("Control+Alt+z");
  await expect(page.locator(".pane-layout-zoomed")).toHaveCount(1);
});

test("「tmux 風」プリセットを選んで足すと、prefix+% で右へ分割できる（20260922-keybinding-presets。AC1・AC2）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  await keysSection(page).locator("#keys-preset-select").selectOption("tmux");
  await keysSection(page).locator("[data-add-preset]").click();
  await expect(status(page)).toContainText("tmux 風を");
  await expect(actionRow(page, "split_vertical").locator(".keys-bindings")).toHaveText(
    "prefix+v / prefix+%",
  );
  await page.keyboard.press("Escape");

  await focusTerminal(page);
  await prefixKey(page, "%"); // tmux 風の右へ分割
  await expect.poll(() => paneCount(page)).toBe(2);
});

test("キー一覧とトーストは現在の割り当てを出す（AC11）", async ({ browser, appServer }) => {
  const { context, page } = await openWithPrefs(browser, appServer, {
    keys: { prefix: "ctrl+a", bindings: { split_vertical: ["prefix+v", "ctrl+alt+d"] } },
  });
  // 初めて pane にフォーカスが入ったときの案内は、現在の割り当てで出る。
  await expect(page.locator(".toast-list")).toContainText("ctrl+a ? でキー一覧");
  await focusTerminal(page);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("?");
  const help = page.locator("dialog.help-dialog");
  await expect(help).toHaveAttribute("open", "");
  await expect(help.locator("dt").first()).toHaveText("ctrl+a"); // 先頭は prefix 自身
  const split = help.locator("dt", { hasText: /^prefix\+v \/ ctrl\+alt\+d$/ });
  await expect(split).toHaveCount(1);
  await expect(split.locator("xpath=following-sibling::dd[1]")).toHaveText("右へ分割");
  await page.keyboard.press("Escape");
  await context.close();
});

test("置き換え（［変更］）：キー一覧の prefix+? を prefix+y に変えると、prefix+y で開き、外した prefix+? は何も起こさない（AC4・AC-I4）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  await openRow(page, "help");
  await actionRow(page, "help").locator('[data-change="help|prefix+?"]').click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("y");
  await expect(status(page)).toHaveText("「キー一覧」に prefix+y を割り当てました。");
  await expect(actionRow(page, "help").locator(".keys-bindings")).toHaveText("prefix+y");
  await expect(
    actionRow(page, "help").locator('[data-change="help|prefix+y"]'),
    "AC-I4：作り直された chip の［変更］へ",
  ).toBeFocused();
  await page.keyboard.press("Escape"); // 取り込み待ちではないので、設定画面を閉じる
  await expect(dialog(page)).not.toHaveAttribute("open", "");

  // キー一覧はクライアントだけで開く（応答を待たない）ので、押した直後に開いていなければ「何も起こさなかった」と言える。
  const help = page.locator("dialog.help-dialog");
  await focusTerminal(page);
  await prefixKey(page, "?"); // 外したキー：黙って捨てられる
  await expect(help).not.toHaveAttribute("open", "");
  await prefixKey(page, "y"); // 割り当てたキー：開く
  await expect(help).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
});

test("［既定に戻す］：操作ごと・prefix のそれぞれで、その分だけが戻り、フォーカスは同じ行の［追加：prefix の後］・prefix の［変更］へ行く（AC9・AC-I4）", async ({
  browser,
  appServer,
}) => {
  const { context, page } = await openWithPrefs(browser, appServer, {
    keys: { prefix: "ctrl+a", bindings: { zoom: ["prefix+y"], help: ["prefix+u"] } },
  });
  await openSettings(page, "Control+a");
  await openRow(page, "zoom");
  await actionRow(page, "zoom").locator("[data-reset-action]").click();
  await expect(status(page)).toHaveText("「拡大表示」を既定へ戻しました。");
  await expect(actionRow(page, "zoom").locator(".keys-bindings")).toHaveText("prefix+z");
  await expect(actionRow(page, "zoom").locator('[data-add="prefix"]')).toBeFocused();
  // ほかは変わらない（キー一覧の上書きと prefix）。
  await expect(actionRow(page, "help").locator(".keys-bindings")).toHaveText("prefix+u");
  await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+a");
  expect(await storedKeys(page)).toEqual({ prefix: "ctrl+a", bindings: { help: ["prefix+u"] } });

  await keysSection(page).locator("[data-reset-prefix]").click();
  await expect(status(page)).toHaveText("prefix を既定（ctrl+b）へ戻しました。");
  await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("ctrl+b");
  await expect(prefixChangeButton(page)).toBeFocused();
  await expect(actionRow(page, "help").locator(".keys-bindings")).toHaveText("prefix+u");
  expect(await storedKeys(page)).toEqual({ bindings: { help: ["prefix+u"] } });
  await context.close();
});

test("キーボードだけで通せる：行へ Tab→開く→［追加］→キーを押して確定→［削除］→もう一度足して［既定に戻す］（AC-I3・AC-I4・AC9）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  const row = actionRow(page, "goto");
  const add = row.locator('[data-add="prefix"]');
  // 前の行の見出しから Tab で次の行の見出しへ（数えず、着くまで）。Enter で開く（<details> の標準）。
  await row.locator("xpath=preceding::summary[1]").focus();
  await page.keyboard.press("Tab");
  await expect(row.locator("summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("open", "");
  // Tab で［追加：prefix の後］まで進む（数えず、着くまで）。
  for (let i = 0; i < 8; i++) {
    if (await add.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(add).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("y");
  await expect(row.locator(".keys-bindings")).toHaveText("prefix+g / prefix+y");
  await expect(add, "AC-I4：押した［追加］へ戻る").toBeFocused();

  // Shift+Tab で戻ると、いま足した割り当ての［削除］（Tab の順で辿れる）。Enter で外す。
  await page.keyboard.press("Shift+Tab");
  await expect(
    row.getByRole("button", {
      name: "「goto（workspace・tab・pane から探す）」の prefix+y を削除",
    }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row.locator(".keys-bindings")).toHaveText("prefix+g");
  await expect(add, "AC-I4：最後を消したら［追加：prefix の後］へ").toBeFocused();
  // 既定と同じ内容に戻ったので、上書きは無くなり、［既定に戻す］も消える。
  await expect(row.locator("[data-reset-action]")).toHaveCount(0);
  expect(await storedKeys(page)).toBeNull();

  // もう一度足して、Tab 2 回（［追加：直接］の次）で［既定に戻す］へ。Enter で戻す。
  await page.keyboard.press("Enter");
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("y");
  await expect(row.locator(".keys-bindings")).toHaveText("prefix+g / prefix+y");
  await page.keyboard.press("Tab"); // ［追加：直接］
  await page.keyboard.press("Tab"); // ［既定に戻す］
  await expect(row.locator("[data-reset-action]")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    "「goto（workspace・tab・pane から探す）」を既定へ戻しました。",
  );
  await expect(row.locator(".keys-bindings")).toHaveText("prefix+g");
  await expect(add, "AC-I4：同じ行の［追加：prefix の後］へ").toBeFocused();
  expect(await storedKeys(page)).toBeNull();
});

test("絞り込み欄に文字を打つと一致する行だけが見える。空にすると戻る。Tab で欄へ入り、一致した行まで辿り着ける（AC1〜AC3・AC-I3。20260922-keybinding-usability）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  const totalBefore = await keysSection(page).locator(".keys-details").count();
  expect(totalBefore).toBeGreaterThan(1);
  const groupsBefore = await keysSection(page).locator(".keys-group").count();
  expect(groupsBefore).toBeGreaterThan(1);

  const filter = keysSection(page).locator("#keys-filter-input");
  // AC-I3：絞り込み欄の少し手前の部品（prefix の［変更］。既定のままなので［既定に戻す］は無い）から
  // Tab で絞り込み欄へ入り、打った文字で絞り込んだ後、Tab で一致した行（summary）まで辿り着ける
  // （数えず、実際に Tab で確かめる）。
  await prefixChangeButton(page).focus();
  for (let i = 0; i < 5; i++) {
    if (await filter.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(filter, "AC-I3：絞り込み欄へ Tab で入れる").toBeFocused();
  await page.keyboard.type("拡大表示"); // 「拡大表示」（zoom）だけに一致する固有のラベル
  await expect(keysSection(page).locator(".keys-details")).toHaveCount(1); // AC1
  await expect(actionRow(page, "zoom")).toHaveCount(1);
  await expect(keysSection(page).locator(".keys-group")).toHaveCount(1); // AC2：一致しない群は見出しごと消える
  await expect(keysSection(page).locator(".keys-group-name")).toHaveText("pane");
  await page.keyboard.press("Tab");
  await expect(
    actionRow(page, "zoom").locator("summary"),
    "AC-I3：一致した行（summary）へ Tab で辿り着ける",
  ).toBeFocused();

  await filter.fill(""); // AC3：空にすると戻る
  await expect(keysSection(page).locator(".keys-details")).toHaveCount(totalBefore);
  await expect(keysSection(page).locator(".keys-group")).toHaveCount(groupsBefore);
});

test("衝突を起こして「こちらへ移す」を押すと、衝突相手の割り当てが外れ、対象へ移る。Tab で「こちらへ移す」へ到達し Enter で押せる（AC4・AC5・AC-I8。20260922-keybinding-usability）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  await openRow(page, "goto");
  await actionRow(page, "goto").locator('[data-add="prefix"]').click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("v"); // split_vertical の既定（prefix+v・単一の割り当て）と衝突
  await expect(status(page)).toContainText("prefix+v");
  await expect(status(page)).toContainText("右へ分割");
  const moveHereBtn = keysSection(page).locator("[data-move-here]");
  await expect(moveHereBtn).toBeVisible(); // AC4：単一の割り当てとの衝突なので出る
  await expect(
    actionRow(page, "goto").locator('[data-add="prefix"]'),
    "拒否された後もフォーカスは押したボタンへ戻る（既存の挙動。ここでは Tab の起点として使う）",
  ).toBeFocused();

  // AC-I8：衝突後、フォーカスの位置（押した［追加：prefix の後］）から Tab で「こちらへ移す」まで
  // 辿り着け、Enter で押せる（数えず、実際に Tab で確かめる）。
  // 押したボタンから「こちらへ移す」（キーの節の末尾の帯）までは、操作の行のボタンが続くので Tab が 66 回かかる（操作が増えるほど増える。
  // 60 回では足りなくなった）。上限は 66 に近い値（80）にして、キーボードの操作性が悪くなる退行（Tab の回数が増える）を見逃さない。
  // 超えたら、操作の追加で増えただけか（上限を見直す）、止まる所が不用意に増えたか（直す）を確かめる。何回で届いたかは注記に残す。
  const TAB_LIMIT = 80;
  let tabs = 0;
  for (; tabs <= TAB_LIMIT; tabs++) {
    if (await moveHereBtn.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  test.info().annotations.push({ type: "tab-presses-to-move-here", description: String(tabs) });
  expect(tabs, `「こちらへ移す」まで Tab が ${TAB_LIMIT} 回を超えた。操作が増えたので、上限を見直す（または止まる所の増えすぎを直す）`).toBeLessThanOrEqual(TAB_LIMIT);
  await expect(moveHereBtn, "AC-I8：Tab で「こちらへ移す」へ到達できる").toBeFocused();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText(
    "prefix+v を「右へ分割」から「goto（workspace・tab・pane から探す）」へ移しました。",
  );
  await expect(actionRow(page, "goto").locator(".keys-bindings")).toHaveText("prefix+g / prefix+v");
  await expect(actionRow(page, "split_vertical").locator(".keys-bindings")).toHaveText("なし"); // AC5：衝突相手から外れる
  expect(await storedKeys(page)).toEqual({
    bindings: { goto: ["prefix+g", "prefix+v"], split_vertical: [] },
  });
  await expect(moveHereBtn).toHaveCount(0); // 移したら消える
});

test("「こちらへ移す」ボタンは、下に固定した文の帯と一緒に、ダイアログの見えている領域の中に来る（追加のスクロール無しで押せる。AC4・AC-I6。20260922-keybinding-usability。review 指摘）", async ({
  page,
  appServer,
}) => {
  await openApp(page, appServer);
  await openSettings(page);
  await openRow(page, "goto");
  await actionRow(page, "goto").locator('[data-add="prefix"]').click();
  await expect(capture(page)).toBeFocused();
  await page.keyboard.press("v"); // split_vertical の既定（prefix+v）と衝突
  const moveHereBtn = keysSection(page).locator("[data-move-here]");
  await expect(moveHereBtn).toBeVisible();

  // `toBeVisible()` は CSS の可視性だけを見る（表示領域に入っているかは見ない）ので、
  // ここでは実際の座標を測り、**追加でスクロールしなくても**ダイアログの見えている領域の中に
  // 収まっていることを確かめる（`.keys-message` 単体を sticky にしていた版では、ここが
  // ダイアログの外〔下〕へ大きくはみ出していた。実地の `boundingBox()` で見つけた不具合）。
  const btnBox = await moveHereBtn.boundingBox();
  const dialogBox = await dialog(page).boundingBox();
  expect(btnBox && dialogBox).toBeTruthy();
  expect(btnBox!.y, "追加のスクロール無しでダイアログの上端より下にある").toBeGreaterThanOrEqual(
    dialogBox!.y,
  );
  expect(
    btnBox!.y + btnBox!.height,
    "追加のスクロール無しでダイアログの下端より上にある",
  ).toBeLessThanOrEqual(dialogBox!.y + dialogBox!.height + 1);
});

test("Keyboard Lock の switch：API が無い環境（`navigator.keyboard` を差し替えて再現）でも例外なく動き、既存のキー操作も壊れない（AC14。20260922-keybinding-usability。decisions D6）", async ({
  page,
  appServer,
}) => {
  // この E2E 環境は実は `navigator.keyboard` を持つ（decisions D6）。AC14 の「存在しない」側の
  // 分岐は、`main.ts` の `navigator.keyboard ?? null` の配線ごと実地で再現する。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "keyboard", { value: undefined, configurable: true });
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await openApp(page, appServer);
  await openSettings(page);
  const lockSwitch = keysSection(page).locator('button[role="switch"]');
  await expect(lockSwitch).toHaveAttribute("aria-checked", "false");
  await lockSwitch.click();
  await expect(lockSwitch).toHaveAttribute("aria-checked", "true"); // switch 自体は出して切り替えられる（AC14 の但し書き）
  await expect(dialog(page)).toHaveAttribute("open", ""); // 例外でページが壊れていない
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");

  // 既存のキー操作（prefix 経由の分割）は壊れない。
  await focusTerminal(page);
  expect(await paneCount(page)).toBe(1);
  await prefixKey(page, "v");
  await expect.poll(() => paneCount(page)).toBe(2);

  expect(pageErrors, "switch を有効にしても例外を投げない（AC14）").toEqual([]);
});

test("Keyboard Lock の switch：全画面でなければ `keyboard.lock()` は呼ばれず、節「キー」の表示も既存のキー操作も変わらない（AC9・AC-I12。20260922-keybinding-usability。decisions D6）", async ({
  page,
  appServer,
}) => {
  // この環境は `navigator.keyboard` を実際に持つ（decisions D6）。差し替えず、呼び出しだけを記録する
  // （`e2e-observe-browser.md`：ブラウザが実際に受けた呼び出しで見る。テスト自身のクライアント状態ではない）。
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __sodaKeyboardCalls: string[] }).__sodaKeyboardCalls = calls;
    const install = (): void => {
      const kb = (navigator as unknown as { keyboard?: { lock: (c?: string[]) => Promise<void>; unlock: () => void } })
        .keyboard;
      if (kb === undefined) return;
      const origLock = kb.lock.bind(kb);
      const origUnlock = kb.unlock.bind(kb);
      kb.lock = (codes?: string[]) => {
        calls.push(`lock:${JSON.stringify(codes ?? null)}`);
        return origLock(codes);
      };
      kb.unlock = () => {
        calls.push("unlock");
        origUnlock();
      };
    };
    install();
  });

  await openApp(page, appServer);
  await openSettings(page);
  await openRow(page, "split_vertical");
  await expect(actionRow(page, "split_vertical").locator(".keys-bindings")).toHaveText("prefix+v"); // AC9：mac 向けの置き換えが無いのでいつもどおり（切り替え前）
  const lockSwitch = keysSection(page).locator('button[role="switch"]');
  await lockSwitch.click();
  await expect(lockSwitch).toHaveAttribute("aria-checked", "true");
  await expect(actionRow(page, "split_vertical").locator(".keys-bindings")).toHaveText("prefix+v"); // AC9：switch を切り替えた後も表示は変わらない
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");

  const calls = (await page.evaluate(
    () => (window as unknown as { __sodaKeyboardCalls: string[] }).__sodaKeyboardCalls,
  )) as string[];
  expect(calls.some((c) => c.startsWith("lock:")), "全画面でないので lock() は一度も呼ばれない（AC-I12）").toBe(
    false,
  );

  // 既存のキー操作（prefix 経由の分割）は壊れない。
  await focusTerminal(page);
  expect(await paneCount(page)).toBe(1);
  await prefixKey(page, "v");
  await expect.poll(() => paneCount(page)).toBe(2);
});

test("Keyboard Lock の switch：全画面に入ると keyboard.lock() が LOCKED_CODES で実際に呼ばれ、抜けると unlock() が呼ばれる（main.ts の navigator.keyboard の配線を実地で確認。cross 点検の指摘で追加。20260922-keybinding-usability。decisions D6）", async ({
  page,
  appServer,
}) => {
  // main.ts の `keyboard: navigator.keyboard ?? null` の配線が生きていることを、実際の呼び出しで確認する
  // （この行だけを壊す変異は、既存のどのテストも検出できないことが cross 点検で判明した）。
  // 「OS・ブラウザの予約キーが実際に解放されるか」自体は Playwright から観測できないので、そこは
  // `docs/verification.md` の手動確認へ（decisions D6）。ここで確かめるのは「呼ばれたか」だけ。
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __sodaKeyboardCalls: string[] }).__sodaKeyboardCalls = calls;
    const kb = (navigator as unknown as { keyboard?: { lock: (c?: string[]) => Promise<void>; unlock: () => void } })
      .keyboard;
    if (kb === undefined) return;
    const origLock = kb.lock.bind(kb);
    const origUnlock = kb.unlock.bind(kb);
    kb.lock = (codes?: string[]) => {
      calls.push(`lock:${JSON.stringify(codes ?? null)}`);
      return origLock(codes);
    };
    kb.unlock = () => {
      calls.push("unlock");
      origUnlock();
    };
  });

  await openApp(page, appServer);
  await openSettings(page);
  const lockSwitch = keysSection(page).locator('button[role="switch"]');
  await lockSwitch.click();
  await expect(lockSwitch).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).not.toHaveAttribute("open", "");

  // この環境は自動化からの `requestFullscreen()` をユーザー操作無しでも許す（decisions D6 で probe 済み）。
  await page.evaluate(() => document.documentElement.requestFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __sodaKeyboardCalls: string[] }).__sodaKeyboardCalls),
    )
    .toContainEqual('lock:["KeyT","KeyN","KeyW","Tab","PageUp","PageDown"]');

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __sodaKeyboardCalls: string[] }).__sodaKeyboardCalls),
    )
    .toContainEqual("unlock");
});

// **`defaultBrowserType` は describe の中では使えない**（`settings.spec.ts` と同じ事情）。端末の条件だけを借りる。
const IPHONE_13 = { ...devices["iPhone 13"] };
delete (IPHONE_13 as { defaultBrowserType?: string }).defaultBrowserType;

test.describe("モバイル", () => {
  test.use(IPHONE_13);

  test("Prefix ボタンは現在の prefix を注入する（alt+x に変えていれば、2 度押しで ESC x を端末へ送る）。設定の節「キー」は出て、画面のキーボードでは取り込めないと添える（AC1・AC11）", async ({
    browser,
    appServer,
  }) => {
    const context = await browser.newContext({
      ...IPHONE_13,
      storageState: {
        cookies: [],
        origins: [
          {
            origin: appServer.origin,
            localStorage: [
              { name: "soda.prefs.v1", value: JSON.stringify({ keys: { prefix: "alt+x" } }) },
            ],
          },
        ],
      },
    });
    const page = await context.newPage();
    const sent = await openApp(page, appServer);
    await page.locator(".mobile-shell-keyboard-btn").click();
    const n = sent().length;
    await page.getByRole("button", { name: "Prefix" }).click();
    await page.getByRole("button", { name: "Prefix" }).click(); // 2 度押し：prefix のキー自身（alt+x＝ESC x）を端末へ送る
    await expect.poll(() => sentSince(sent, n)).toContain("\x1bx");
    expect(sentSince(sent, n), "既定の ctrl+b（\\x02）は送らない").not.toContain("\x02");

    await page.locator(".mobile-shell-settings-btn").click();
    await expect(dialog(page)).toHaveAttribute("open", "");
    await expect(dialog(page).locator("section h3")).toHaveText([
      "通知",
      "テーマ",
      "表示",
      "端末",
      "エージェント連携",
      "キー",
    ]);
    await expect(keysSection(page).locator(".keys-mobile-note")).toContainText(
      "画面のキーボードでは割り当てを取り込めません",
    );
    await expect(keysSection(page).locator(".keys-prefix .keys-binding")).toHaveText("alt+x");
    await context.close();
  });
});
