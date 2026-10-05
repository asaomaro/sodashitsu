import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { watchSentInput } from "../support/frames.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";
import { watchShownPanes } from "../support/panes.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * AC13・AC14・AC-I1〜AC-I5 の E2E（05-e2e-docs T10）。design「受け入れ基準との対応」：
 * AC13「既定のキー」・AC14「マウス操作」・「相互作用の受け入れ基準」（AC-I1〜AC-I5）。
 * `DEFAULT_KEYMAP` の個々のキー（workspace/tab/pane の作成・名前変更・切替・閉じる、copy モード、
 * 分割・境界のリサイズ・フォーカス移動・巡回・入れ替え・拡大表示・resize モード）は既に
 * `workspace-tab-pane.spec.ts`・`scrollback-copy.spec.ts`・`terminal-app.spec.ts` で実地に確認済みのため
 * 重複しない——ここでは**まだ実地の確認が無い残りの UI 面**（ヘルプ・goto・右クリックメニュー）と、
 * AC-I3（マウス無しで一巡できるか）・AC-I4（フォーカスの行き先）を確かめる。
 * 右クリックの振り分け（M7）・pane の枠（M7 の後半）・リンク（M6）は D110（03-web-desktop T34。D109 で見つけた不具合の修正）で足した。
 */

test("ヘルプ（prefix+?）：開いて閉じると、開く前の pane へフォーカスが戻る（AC-I1・AC-I4）", async ({ page, appServer }) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  await prefixKey(page, "?");
  const dialog = page.locator(".help-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("キー一覧"); // キー一覧が実際に出ている
  await expect(dialog).toContainText("新規 workspace"); // 個々の割り当ても描画されている
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // AC-I4：閉じたら開く前の pane（端末）へフォーカスが戻る——マウスで触らずに直接打てることで確認する。
  const marker = `soda-e2e-after-help-${Date.now()}`;
  await page.keyboard.type(marker);
  await page.keyboard.press("Enter");
  await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
});

test("goto（prefix+g）：矢印キーだけで選び Enter で確定すると、選んだ pane へ実際に切り替わる（AC-I3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  // goto の一覧で p1 の行を見分けるための名前（pane の行はこの名前で出る。workspace・tab の行には出ない）。
  await client.request("pane.rename", { paneId: p1, label: "goto-target" });
  const shown = await watchShownPanes(page); // ブラウザが表示している pane（`client.view`。support/panes.ts）
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // もう1つ workspace を作っておく（goto で選ぶ対象を複数にする。キーボードだけで：prefix+shift+n）。
  const p2Created = client.waitForEvent("pane.created");
  await prefixKey(page, "N");
  const p2 = (await p2Created).data.pane.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await client.request("pane.subscribe", { paneId: p2, scrollbackLines: 200 });
  // テスト自身のクライアントに `pane.created` が届いても、ブラウザが新しい workspace（p2）へ切り替えたとは限らない
  // （D104）。goto の一覧は、ブラウザが今の pane とする行から選び始めるので、ブラウザが p2 を描いた（`client.view` に
  // 含まれる）ことを待ってから開く。以前はこれを待たず、どちらの行から始まるか決まらないので「p1 か p2 のどちらかに
  // 届けばよい」としていた——p2 に届く場合は何も切り替えておらず、goto で移れることの確認になっていなかった。
  await expect.poll(shown).toContain(p2);

  // 新しい workspace（p2）へフォーカスがある状態から、goto で最初の workspace（p1）へマウス無しで移る。
  await prefixKey(page, "g");
  const picker = page.locator(".goto-picker");
  await expect(picker).toBeVisible();
  // 一覧は workspace → tab → pane の木で、開いた時点では全展開（`GotoPicker.vue`。herdr と同じ。D76）：
  // [ws1, tab, p1, ws2, tab, p2]。選択は今の pane（p2。「現在地」の印の付く行）から始まるので、3 つ上が p1。
  // Enter の前に、選んでいる行が p1 の pane の行であることを確かめる——選択は一覧の先頭で止まり（`moveSelection`）、
  // workspace・tab の行で Enter しても p1 へ移るので、最初の選択の位置が崩れても p1 に届いて通ってしまうため。
  const selected = picker.locator(".goto-picker-row-selected");
  await expect(selected).toHaveCount(1);
  await expect(selected.locator(".goto-picker-current")).toHaveCount(1); // 最初は今の pane（p2）の行
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await expect(selected.locator(".goto-picker-label")).toHaveText("goto-target"); // p1 の pane の行
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();

  const marker = `soda-e2e-goto-${Date.now()}`;
  await page.keyboard.type(marker);
  await page.keyboard.press("Enter");
  await client.waitForOutput(p1, marker); // 選んだ p1 へ実際に切り替わり、焦点も移っている
  expect(client.rawOutput(p2)).not.toContain(marker);
});

test("右クリックメニュー（M3）：pane のメニューが開き、項目のクリックで実際に分割される", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  const paneEl = page.locator(".terminal-pane").first();
  const p2Created = client.waitForEvent("pane.created");
  await paneEl.click({ button: "right" });
  const menu = page.locator(".context-menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "右へ分割" }).click();
  await p2Created; // 実際にサーバへ pane.split が飛び、新しい pane ができた
  await expect(page.locator(".terminal-pane")).toHaveCount(2);
  await expect(menu).toBeHidden(); // 項目を選んだら閉じる
});

test("prefix 直後以外のキーは端末へそのまま届く（AC-I5）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // "v"（copy モードでは移動キーだが、prefix を経ていない terminal モードでは通常の文字として届く）。
  const marker = `soda-e2e-passthrough-v${Date.now()}`;
  await typeLine(page, `echo v${marker}`); // 先頭に v を含む文字列を打っても素直に文字として届く
  await client.waitForOutput(p1, `v${marker}`);
});

/**
 * SGR の形のマウスの報告を求め、届いた入力を `cat -v` で行に出す（docs/verification.md の M7 の手順と同じ。報告は tty のエコーで
 * `^[[<ボタン;列;行M`（押した）・`…m`（離した）の形で出る。右ボタンは 2、左ボタンは 0）。ブラウザの xterm.js が報告を作る状態に
 * なった（`enable-mouse-events`）ことを画面で確かめてから返す（D104）。
 */
async function startMouseReportEcho(page: Page): Promise<void> {
  await typeLine(page, "printf '\\e[?1000h\\e[?1006h'; cat -v");
  await expect(page.locator(".xterm.enable-mouse-events")).toHaveCount(1);
}

/** 端末（xterm.js の描画面）。 */
function terminalScreen(page: Page) {
  return page.locator(".xterm-screen").first();
}

/**
 * 右クリックの振り分け（M7）の 1——既定の宛先（D110。D109 で発見）：以前は、アプリがマウスの報告を求めていると、メニューが開くと
 * 同時に右ボタンの報告（`\e[<2;…M`・`\e[<2;…m`）もアプリへ届いていた（`MouseBridge` が xterm.js の mousedown を止めていなかった）。
 */
test("右クリック（M7）：既定の宛先では、アプリがマウスの報告を求めていてもメニューだけが開き、右ボタンの報告はアプリへ届かない", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  const sent = await watchSentInput(page); // ブラウザが送った INPUT（送る側での確かめ）
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  await startMouseReportEcho(page);

  // 対照：左クリックの報告はアプリへ届く（この 2 つの観測の手段——`cat -v` の行・ブラウザが送った INPUT——で報告が見えることの確かめ）。
  await terminalScreen(page).click({ position: { x: 40, y: 40 } });
  await client.waitForOutput(p1, "^[[<0;");
  await expect.poll(() => sent().some((s) => s.text.startsWith("\x1b[<0;"))).toBe(true);
  const outputMark = client.rawOutput(p1).length;
  const sentMark = sent().length;

  await terminalScreen(page).click({ button: "right", position: { x: 60, y: 40 } });
  const menu = page.locator(".context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "右クリックを pane に送る" })).toBeVisible(); // pane のメニュー
  // 報告は mousedown の処理の中で送られる（メニューが出る前）。CDP のイベントの遅れの分だけ待ってから、送っていないことを見る。
  await page.waitForTimeout(500);
  expect(JSON.stringify(sent().slice(sentMark).map((s) => s.text))).not.toContain("\\u001b[<2;");

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  // 閉じたら右クリックした端末へフォーカスが戻り（APG の Menu。D110）、そのまま打てる。打った行は、右クリックの後の入力の区切りになる。
  await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
  const marker = `soda-e2e-after-right-click-${Date.now()}`;
  await typeLine(page, marker);
  await client.waitForOutput(p1, marker);
  const echoed = client.rawOutput(p1).slice(outputMark);
  expect(echoed, `右クリックの後にアプリへ届いた入力: ${JSON.stringify(echoed)}`).not.toContain("^[[<2;");
  await page.keyboard.press("Control+c");
});

/**
 * 右クリックの振り分け（M7）の 2——「pane に送る」と pane の枠（D110。D109 で発見：design の「pane の枠の右クリックは常にメニューを
 * 開く」が未実装で、「pane に送る」にした後はマウスを使うアプリが動いている間、その pane のメニューを開く手段が無かった）。
 */
test("右クリック（M7）：「pane に送る」にした pane では、端末の上の右クリックはアプリへ届いてメニューは開かず、pane の枠の右クリックではメニューが開いて既定へ戻せる", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.input.set", { paneId: p1, rightClick: "pane" }); // ページを開く前に（hello の snapshot で届く）
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  await startMouseReportEcho(page);
  const menu = page.locator(".context-menu");

  // 端末の上：右ボタンの報告がアプリへ届き（押した・離した）、メニューは開かない。
  await terminalScreen(page).click({ button: "right", position: { x: 60, y: 40 } });
  await client.waitForOutput(p1, "^[[<2;");
  await expect.poll(() => client.rawOutput(p1)).toMatch(/\^\[\[<2;\d+;\d+M\^\[\[<2;\d+;\d+m/);
  await expect(menu).toBeHidden();
  // 届いた報告は `cat` の行の途中に残る（改行までは読まれない）ので、行を終えてから区切る——後の行の `cat -v` の出力に混ざらない。
  const flush = `soda-e2e-flush-${Date.now()}`;
  await typeLine(page, flush);
  await expect.poll(() => client.rawOutput(p1).split(flush).length - 1).toBe(2); // tty のエコーと `cat -v` の出力

  // pane の枠：pane の置き場の左端の縁。以前は端末が置き場の端まであり、同じ所の右クリックもアプリへ届いた。
  const outputMark = client.rawOutput(p1).length;
  // 左端の 4px はサイドバーの幅の境目が受ける（20261004-ui-interaction-polish の D2）ので、上端の縁で確かめる（下端・右端ではメニューが画面の外へ出る）。
  const area = (await page.locator(".app-panes").boundingBox())!;
  await page.mouse.click(area.x + area.width / 2, area.y + 2, { button: "right" });
  await expect(menu).toBeVisible();
  // メニューから既定（herdr のメニュー）へ戻す。
  const updated = client.waitForEvent("pane.updated", (e) => e.data.pane.id === p1 && e.data.pane.rightClick === "herdr");
  await menu.getByRole("menuitem", { name: "herdr のメニューを使う" }).click();
  await updated;
  await expect(menu).toBeHidden();

  // ブラウザにも反映された（枠のメニューの項目が戻っている）ことを画面で確かめてから、端末の上を右クリックする（D104）。
  await page.mouse.click(area.x + area.width / 2, area.y + 2, { button: "right" });
  await expect(menu.getByRole("menuitem", { name: "右クリックを pane に送る" })).toBeVisible();
  await page.keyboard.press("Escape");
  await terminalScreen(page).click({ button: "right", position: { x: 60, y: 40 } });
  await expect(menu).toBeVisible(); // 既定に戻ったので、アプリが報告を求めていてもメニューが開く
  await page.keyboard.press("Escape");

  const marker = `soda-e2e-after-frame-${Date.now()}`;
  await typeLine(page, marker);
  await client.waitForOutput(p1, marker);
  const echoed = client.rawOutput(p1).slice(outputMark);
  expect(echoed, `枠の右クリックの後にアプリへ届いた入力: ${JSON.stringify(echoed)}`).not.toContain("^[[<2;");
  await page.keyboard.press("Control+c");
});

test("pane の枠はキーボードでも開ける：tab バーから Tab で枠に止まり、Enter でメニューを開き、Esc で枠へ戻る（M7 の後半・D110）", async ({ page, appServer }) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // tab バー自体が無いと Tab で辿り着けない（20260922-appearance-settings-rest の自動非表示・AC4。
  // この work 以前は tab が1個でも常に表示されていた）ので、もう1つ tab を作って表示させる。
  await focusTerminal(page);
  await prefixKey(page, "c");
  await page.keyboard.press("Enter"); // 名前は既定のまま
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);

  await page.locator(".tab-bar-item").last().click(); // 端末の外（端末の中では Tab は端末へ届く）。最後の項目から始めると「＋」まで Tab 1回で着く（tab-bar-item が1個の頃と同じ）
  await page.keyboard.press("Tab"); // tab バーの「＋」（20260920-sidebar-tabbar-controls で足した）
  await expect(page.locator(".tab-bar-new")).toBeFocused();
  await page.keyboard.press("Tab");
  const edge = page.locator(".pane-frame-edge").first();
  await expect(edge).toBeFocused();
  await expect(edge).toHaveAttribute("aria-haspopup", "menu");
  await page.keyboard.press("Enter");
  const menu = page.locator(".context-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused();
  await expect(menu.getByRole("menuitem", { name: "右クリックを pane に送る" })).toBeVisible(); // pane のメニュー
  await expect(edge).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(edge).toBeFocused();
  await expect(edge).toHaveAttribute("aria-expanded", "false");
});

/** 今フォーカスのある要素の短い説明（枠・端末は何番目の pane のものか）。Tab の順を確かめるのに使う。 */
function describeFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return "body";
    const frames = Array.from(document.querySelectorAll(".pane-frame"));
    const index = frames.findIndex((frame) => frame.contains(active));
    const where = index >= 0 ? `@pane${index + 1}` : "";
    if (active.classList.contains("pane-frame-edge")) return `frame${where}`;
    if (active.classList.contains("xterm-helper-textarea")) return `terminal${where}`;
    // 3 か所の境目（サイドバーの幅・区画・pane の間）を区別する（20261004-ui-interaction-polish）。
    if (active.classList.contains("sidebar-divider")) return "sidebar-width";
    if (active.classList.contains("sidebar-section-divider")) return "sidebar-sections";
    if (active.getAttribute("role") === "separator") return "splitter";
    if (active.classList.contains("tab-bar-item")) return "tab";
    if (active.classList.contains("tab-bar-new")) return "newTab";
    return active.tagName.toLowerCase();
  });
}

/**
 * 独立点検 #2：以前は全ての pane の枠が Tab で止まり、端末（Tab をそのまま受け取る）も並んでいたので、端末の外から Tab で進むと先頭の
 * pane の端末で止まり、2 つ目以降の pane の枠へは届かなかった。今は選ばれている pane の枠と端末だけが Tab で止まる（roving tabindex）。
 */
test("分割した 2 つ目の pane も、prefix のキーで選んでから、tab バーから Tab でその枠へ移り、キーボードだけでそのメニューを使える（M7 の後半・D110）", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const shown = await watchShownPanes(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // tab バー自体が無いと、この後 tab バーへフォーカスを置けない（20260922-appearance-settings-rest
  // の自動非表示・AC4。この work 以前は tab が1個でも常に表示されていた）ので、もう1つ tab を作って
  // 表示させ、**最初の tab（これから分割する方）へ戻る**（作った直後は新しい方が選ばれているため）。
  const newTabCreated = client.waitForEvent("pane.created");
  await prefixKey(page, "c");
  await page.keyboard.press("Enter"); // 名前は既定のまま
  const newTabPaneId = (await newTabCreated).data.pane.id; // 分割の pane.created と取り違えないよう捕まえておく
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("1");
  await focusTerminal(page);

  const p1 = client.helloSnapshot()!.panes[0]!.id;
  // `waitForEvent` は述語を付けないと「直前に届いた最後の pane.created」を即座に返す（`wsClient.ts`）。
  // 上の tab 作成自身の pane.created が既に「最後」になっているので、述語でそれを除く
  // （さもないと分割ではなく tab 作成の方の pane を拾ってしまう）。
  const created = client.waitForEvent("pane.created", (e) => e.data.pane.id !== newTabPaneId);
  await prefixKey(page, "v"); // 右へ分割（焦点は新しい p2）
  const p2 = (await created).data.pane.id;
  await expect.poll(shown).toContain(p2);
  const edges = page.locator(".pane-frame-edge");
  await expect(edges).toHaveCount(2);

  // prefix のキーで p1 → p2 と選び直す（DOM の順で 2 つ目の枠が p2。PaneLayout は分割の a → b の順に描く）。ブラウザは焦点を
  // 手元で移してから `pane.focus` を送るので、サーバの知らせ（`session.focus_changed`）が届いたらブラウザでも選ばれている。
  await prefixKey(page, "h");
  await client.waitForEvent("session.focus_changed", (e) => e.data.focus?.paneId === p1);
  await prefixKey(page, "l");
  await client.waitForEvent("session.focus_changed", (e) => e.data.focus?.paneId === p2);

  // 端末の外へ出る。実際にはブラウザのキー（アドレスバーへ出てページへ戻る等）で出るが、ヘッドレスのブラウザでは押せないので、
  // tab バーへフォーカスを置いて代える。そこから Tab で進む順を記録する。
  // 最後の tab 項目（さっき作った2つ目の tab）から始めると「＋」まで Tab 1回で着き、下の期待値は変わらない
  // （DOM の順は tab-bar-item が先、いま表示中の tab の内容はその後ろに続く——どちらの tab-bar-item から
  // 始めても、続く Tab は同じ「＋」→表示中の内容、という順になる）。
  await page.locator(".tab-bar-item").last().focus();
  const order: string[] = [];
  for (let i = 0; i < 5 && order.at(-1) !== "frame@pane2"; i++) {
    await page.keyboard.press("Tab");
    order.push(await describeFocus(page));
  }
  // 先頭の「＋」は tab バーの新しいタブのボタン（20260920-sidebar-tabbar-controls の AC6）。
  // 境界（Splitter）の次が p2 の枠で、p1 の枠・端末には止まらない。
  expect(order).toEqual(["newTab", "splitter", "frame@pane2"]);
  await expect(edges.nth(1)).toHaveAttribute("tabindex", "0"); // 選ばれている p2 の枠だけが Tab で止まる
  await expect(edges.nth(0)).toHaveAttribute("tabindex", "-1");
  await expect(page.locator(".xterm-helper-textarea").nth(0)).toHaveAttribute("tabindex", "-1"); // 選ばれていない p1 の端末も

  // Enter で p2 のメニューを開き、キーボードだけで「右クリックを pane に送る」を選ぶ——p2 に効く。
  await page.keyboard.press("Enter");
  const menu = page.locator(".context-menu");
  await expect(menu).toBeFocused();
  const updated = client.waitForEvent("pane.updated", (e) => e.data.pane.rightClick === "pane");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown"); // 名前の変更 → 右へ分割 → 下へ分割 → 拡大表示 → 右クリックを pane に送る
  await expect(menu.locator(".context-menu-active")).toHaveText("右クリックを pane に送る");
  await page.keyboard.press("Enter");
  expect((await updated).data.pane.id).toBe(p2); // p1 ではなく p2 に効いた
  await expect(menu).toBeHidden();
  await expect(edges.nth(1)).toBeFocused(); // 閉じたら枠へ戻る。Tab で p2 の端末へ入れる
  await page.keyboard.press("Tab");
  expect(await describeFocus(page)).toBe("terminal@pane2");
});

/** 端末の文字の位置（0 始まりの列・行）の中心の座標。セルの寸法は描画面の大きさと PTY の大きさ（＝ブラウザの xterm.js の大きさ）から求める。 */
async function cellCenter(page: Page, client: SodaTestClient, paneId: string, col: number, row: number): Promise<{ x: number; y: number }> {
  const box = (await terminalScreen(page).boundingBox())!;
  const size = client.paneSize(paneId)!;
  return { x: box.x + ((col + 0.5) * box.width) / size.cols, y: box.y + ((row + 0.5) * box.height) / size.rows };
}

/** `timeoutMs` の間に新しいページ（タブ）が開いたか。開かないことを確かめる側で使う。 */
function pageOpenedWithin(context: BrowserContext, timeoutMs: number): Promise<"opened" | "none"> {
  return context.waitForEvent("page", { timeout: timeoutMs }).then(
    async (opened) => {
      await opened.close();
      return "opened" as const;
    },
    () => "none" as const,
  );
}

/**
 * リンク（M6。D110。D109 で発見：以前は Ctrl を押さないクリックでも、出力の中の URL が新しいタブに開いた。OSC 8 のリンクは
 * `linkHandler` が無く、xterm.js の既定の `confirm()` を出していた——Playwright はダイアログを閉じるので開かない）。
 */
test("リンク（M6）：出力の中の URL と OSC 8 のリンクは、ただのクリックでは開かず、Ctrl を押しながらのクリックで新しいタブに開き、Ctrl を押している間だけ指のカーソルを出す", async ({
  page,
  context,
  appServer,
}) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // 開く先はテストのサーバ（外へ出ない）。画面を消して、1 行目に URL、2 行目に OSC 8 のリンク（表示の文字は URL ではない）を出す。
  const plainUrl = `${appServer.origin}/soda-e2e-plain-link`;
  const osc8Url = `${appServer.origin}/soda-e2e-osc8-link`;
  await typeLine(page, `printf '\\e[H\\e[2J%s\\n\\e]8;;%s\\e\\\\osc8-link-text\\e]8;;\\e\\\\\\n' ${plainUrl} ${osc8Url}`);
  await client.waitForOutput(p1, `\x1b]8;;${osc8Url}`); // printf の出力（打った行のエコーには ESC が無い）

  const pointer = page.locator(".xterm-screen.xterm-cursor-pointer");
  const away = await cellCenter(page, client, p1, 5, 10);
  for (const link of [
    { url: plainUrl, at: await cellCenter(page, client, p1, 5, 0) },
    { url: osc8Url, at: await cellCenter(page, client, p1, 3, 1) },
  ]) {
    // xterm.js はリンクの判定を行ごとに覚え、同じ行の中を動く間は出力が変わっても判定し直さない（端末をクリックしたときの
    // 行に、リンクの無い頃の判定が残る）。いったん別の行へ動かしてから重ねる。
    await page.mouse.move(away.x, away.y);
    await page.mouse.move(link.at.x, link.at.y);
    // Ctrl を押すと指のカーソル（下線と同じ条件）が出る——ブラウザがリンクを描いて重なりを判定したことの確かめも兼ねる。
    await page.keyboard.down("Control");
    await expect(pointer, link.url).toHaveCount(1);
    await page.keyboard.up("Control");

    // ただのクリックでは開かない。
    const plainClick = pageOpenedWithin(context, 1500);
    await page.mouse.click(link.at.x, link.at.y);
    expect(await plainClick, `ただのクリック: ${link.url}`).toBe("none");

    // Ctrl を押しながらのクリックで、新しいタブに開く。
    const opened = context.waitForEvent("page", { timeout: 5000 });
    await page.keyboard.down("Control");
    await page.mouse.click(link.at.x, link.at.y);
    await page.keyboard.up("Control");
    const newPage = await opened;
    await expect.poll(() => newPage.url(), { message: link.url }).toBe(link.url);
    await newPage.close();

    // 重なったまま Ctrl を離すと、指のカーソル（と下線）は消える。
    await page.mouse.move(link.at.x + 1, link.at.y);
    await expect(pointer, link.url).toHaveCount(0);
  }
});

/** 枠の計算後のスタイル（AC5・AC6 の判定に使う。単体テストは scoped CSS を当てないので、ここでしか見られない）。 */
function edgeStyle(page: Page): Promise<{ border: string; bg: string }> {
  return page.evaluate(() => {
    const el = document.querySelector(".pane-frame-edge") as HTMLElement;
    const cs = getComputedStyle(el);
    return { border: cs.borderTopWidth, bg: cs.backgroundColor };
  });
}

/**
 * AC4・AC5・AC6（20260920-ui-selection-visuals）：強調はホバーではなく選択で起きる。
 * 以前は `.pane-frame-edge:hover` が 4px の帯を全面塗りしていた（選択とは無関係）。
 */
test("pane の枠：選ばれている pane を 2px の線で強調し、マウスを乗せても見た目は変わらない（AC4・AC5・AC6）", async ({ page, appServer }) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // pane は 1 つだけなので、それが選ばれている。
  await expect(page.locator(".pane-frame-edge.pane-frame-edge-current")).toHaveCount(1);
  const selected = await edgeStyle(page);
  expect(selected.border, "選択中の枠は 2px の線").toBe("2px");

  // 外寸は変えない（変えると PTY の行・列が変わる）。
  const padding = await page.locator(".pane-frame").first().evaluate((el) => getComputedStyle(el).paddingTop);
  expect(padding, "枠の外寸（padding）は 4px のまま").toBe("4px");

  // 4px の帯にポインタを乗せる。`locator.hover()` は中央を狙うので `.pane-frame-body` に横取りされる。
  // 左端の 4px は、サイドバーの幅の境目（外へ 4px はみ出して掴める。20261004-ui-interaction-polish の D2）が受けるので、右端の帯で確かめる。
  const area = (await page.locator(".app-panes").boundingBox())!;
  await page.mouse.move(area.x + area.width - 2, area.y + area.height / 2);
  // **ポインタが本当に帯の上に乗ったか**をブラウザに聞く。これを省くと、座標がずれてホバーが成立しなくても
  // 「前後で変わらない」が成り立ってしまい、`:hover` が復活しても気づけない（空振りのテストになる）。
  await expect
    .poll(() => page.evaluate(() => document.querySelector(".pane-frame-edge:hover") !== null), { message: "ポインタが枠の帯の上にある" })
    .toBe(true);
  await expect.poll(() => edgeStyle(page), { message: "ホバーで見た目が変わらない" }).toEqual(selected);
});

/** AC-I3（20260920-ui-selection-visuals）：既定の経路（prefix+h/l）で選び直すと強調が移る。 */
test("pane の枠：prefix のキーで選び直すと強調が移る（AC-I3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const shown = await watchShownPanes(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
  const p1 = client.helloSnapshot()!.panes[0]!.id;

  const created = client.waitForEvent("pane.created");
  await prefixKey(page, "v"); // 右へ分割（焦点は新しい p2）
  const p2 = (await created).data.pane.id;
  await expect.poll(shown).toContain(p2);

  const edges = page.locator(".pane-frame-edge");
  await expect(edges).toHaveCount(2);
  // `PaneLayout` は分割の a → b の順に描くので、DOM の 2 つ目が p2。
  await expect(edges.nth(1)).toHaveClass(/pane-frame-edge-current/);
  await expect(edges.nth(0)).not.toHaveClass(/pane-frame-edge-current/);

  // ブラウザは焦点を手元で移してから `pane.focus` を送るので、この知らせが届いた時点でブラウザでも選ばれている。
  await prefixKey(page, "h");
  await client.waitForEvent("session.focus_changed", (e) => e.data.focus?.paneId === p1);
  await expect(edges.nth(0)).toHaveClass(/pane-frame-edge-current/);
  await expect(edges.nth(1)).not.toHaveClass(/pane-frame-edge-current/);

  await prefixKey(page, "l");
  await client.waitForEvent("session.focus_changed", (e) => e.data.focus?.paneId === p2);
  await expect(edges.nth(1)).toHaveClass(/pane-frame-edge-current/);
});

/**
 * AC5・AC-I1・AC-I3・AC-I4（20260920-sidebar-tabbar-controls）：全体のメニューは既存の右クリックメニューに
 * 相乗りしているので、キーボードの操作もフォーカスの戻りも同じ実装が担う。それを実地で確かめる。
 */
test("全体のメニュー：キーボードだけで開いて閉じ、開いたボタンへフォーカスが戻る（AC5・AC-I1・AC-I3・AC-I4）", async ({ page, appServer }) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // tab バー自体が無いと、この後の Tab の並びに tab-bar-item が出てこない（20260922-appearance-settings-rest
  // の自動非表示・AC4。この work 以前は tab が1個でも常に表示されていた）ので、もう1つ tab を作って表示させる。
  await focusTerminal(page);
  await prefixKey(page, "c");
  await page.keyboard.press("Enter"); // 名前は既定のまま
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);

  // **Tab で到達できること自体を確かめる**（`.focus()` で飛ばすと「キーボードだけで」を確かめたことにならない）。
  // サイドバーは DOM の先頭側にあるので、焦点を外した状態から Tab を押すと足したボタンが順に出る。
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const reached: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    reached.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? ""));
  }
  const trail = reached.join(" → ");
  // 5 つのボタンが、この順に Tab で出る（DOM の順＝spaces の並び順・＋新規・メニュー・agents の並び順・折りたたみ。
  // 20260922-appearance-settings-rest で spaces 区画にも並び順ボタンが増えた）。
  // 先頭にはクラス名を持たない要素が挟まることがあるので、見たい要素だけを抜き出して順序を見る。
  // 20261004-ui-interaction-polish: 区画の見出しのボタン（`sidebar-section-toggle`）と 2 つの境目（`resize-handle`）も Tab で止まる。この順で挟まる:
  // spaces の見出し → spaces の並び順 → ＋ → メニュー → 区画の境目 → agents の見出し → agents の並び順 → 通知のベル（20261005-notify-bell。サイドバーの下端）→ 折りたたみ → サイドバーの幅の境目。
  expect(reached.filter((c) => c !== "").slice(0, 10).map((c) => (c.includes("section-toggle") ? "toggle" : c.includes("resize-handle") ? "divider" : c.includes("notify-bell") ? "bell" : c.includes("sort-btn") ? "sort" : c.includes("sidebar-btn-right") ? "menu" : c.includes("collapse") ? "collapse" : "plus")), trail).toEqual(["toggle", "sort", "plus", "menu", "divider", "toggle", "sort", "bell", "collapse", "divider"]);
  const btns = reached.filter((c) => (c.includes("sidebar-btn") && !c.includes("section-toggle")) || c.includes("tab-bar-item"));
  expect(btns[0], trail).toContain("sidebar-sort-btn"); // spaces の並び順
  expect(btns[1], trail).toBe("sidebar-btn"); // ＋ 新規
  expect(btns[2], trail).toContain("sidebar-btn-right"); // メニュー
  expect(btns[3], trail).toContain("sidebar-sort-btn"); // agents の並び順
  expect(btns[4], trail).toContain("sidebar-collapse-btn");
  expect(btns[5], trail).toContain("tab-bar-item"); // サイドバーを抜けるとタブへ

  // 「メニュー」へ戻って Enter で開く。
  const menuBtn = page.locator(".sidebar-section-footer .sidebar-btn-right");
  await menuBtn.focus();
  await expect(menuBtn).toBeFocused();
  await page.keyboard.press("Enter");
  const menu = page.locator(".context-menu");
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused();
  await expect(menu.getByRole("menuitem", { name: "キー割り当て" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "切り離し" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(menuBtn).toBeFocused(); // 開く前の場所へ戻る
});

/** AC10：並び順は「この端末での好み」なので、再読み込みしても残る。 */
test("agents の並び順は、切り替えると再読み込みしても残る（AC7・AC10）", async ({ page, appServer }) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // `.sidebar-agents` に絞る——20260922-appearance-settings-rest で spaces 区画にも同じ形の
  // 並び順ボタン（`.sidebar-sort-btn`）が増えたので、絞らないと2つに一致してしまう。
  const sortBtn = page.locator(".sidebar-agents .sidebar-section-header .sidebar-sort-btn");
  await expect(sortBtn).toHaveText("グループ順"); // 既定（内部の値は grouped）
  await sortBtn.click();
  await expect(sortBtn).toHaveText("優先度順");

  await page.reload();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".sidebar-agents .sidebar-section-header .sidebar-sort-btn")).toHaveText("優先度順");
});
