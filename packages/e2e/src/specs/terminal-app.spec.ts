import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";
import { focusedPaneIndex, watchClientViews } from "../support/panes.js";

/**
 * AC4 の E2E（05-e2e-docs T3）。design「受け入れ基準との対応」の AC4：
 * 「256 色 / TrueColor・全角・マウスの報告は xterm.js が扱う」「IME は xterm.js の textarea が受ける」
 * 「サイズへの追従は client.view → サイズ権限 → PTY の resize」「検証は vim・htop・Claude Code で行う」。
 * **この製品が担うのは PTY ⇄ WebSocket ⇄ xterm.js のデータの受け渡し**（色・全角・マウス報告そのものの
 * 描画・解釈は xterm.js 自身の責務）なので、色・全角はバイト列が欠落なく往復することを確かめ、
 * 実際の描画（ピクセル）はここでは確かめない——xterm.js は canvas（WebGL）へ描画するため、DOM からは
 * 文字も色も読み取れない（実地に確認して判明。screenReaderMode は既定 false で有効化していない）。
 */

test("vim: 全画面 TUI が alternate screen へ入り、編集・保存・終了できる（崩れの無いことの確認）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  const path = "/tmp/soda-e2e-vim-test.txt";
  await typeLine(page, `vim ${path}`);
  await client.waitForOutput(p1, path); // vim のタイトル/ステータス行にファイル名が出る
  await client.waitForOutput(p1, "\x1b[?1049h"); // alternate screen buffer への切替（崩れず全画面化した証拠）

  await page.keyboard.press("i"); // 挿入モード
  await page.keyboard.type("hello from e2e");
  await page.keyboard.press("Escape");
  await page.keyboard.type(":wq");
  await page.keyboard.press("Enter");
  await client.waitForOutput(p1, "\x1b[?1049l"); // alternate screen から戻る（正常終了の証拠）

  const marker = `soda-e2e-vimcat-${Date.now()}`;
  await typeLine(page, `cat ${path} && echo ${marker}`);
  await client.waitForOutput(p1, "hello from e2e"); // 保存した内容が実際にディスクへ書かれている
  await client.waitForOutput(p1, marker);
  await typeLine(page, `rm -f ${path}`);
});

test("top: 別の全画面 TUI も崩れずにフルスクリーン描画・終了できる（htop はこの検証環境に無いため代替。decisions.md D90 参照）", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  await typeLine(page, "top");
  // `top`（procps）は `htop` と違い alternate screen buffer（`?1049h`）を使わない——実地に確認して判明
  // （`tput smcup` はこの環境の `xterm-256color` terminfo では `?1049h` を含むが、procps の `top` は
  // ncurses の initscr を使わず、カーソル位置指定＋全画面クリアだけで再描画する簡易な実装のため）。
  // 全画面の再描画が実際に起きたこと（クリア＋カーソルホーム）とヘッダ行の到着で確認する。
  await client.waitForOutput(p1, "\x1b[H"); // カーソルホーム（画面の先頭から描き直している）
  await client.waitForOutput(p1, "PID"); // top のヘッダ行（プロセス一覧の列名）
  await page.keyboard.press("q"); // top を終了

  const marker = `soda-e2e-topquit-${Date.now()}`;
  await typeLine(page, `echo ${marker}`); // top 終了後もシェルへ通常どおり入力できる（崩れず終了できた証拠）
  await client.waitForOutput(p1, marker);
});

test("256 色・TrueColor・全角文字のエスケープシーケンス／バイト列が欠落なく往復する", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // TrueColor（24bit）。**typed のエコー**（入力中に打った文字がそのまま返る分）には `\e` が
  // 文字どおりのバックスラッシュ＋e としてしか現れない——実際の ESC バイト（0x1B）は `printf` が
  // **実行されて**初めて出る。実行後の出力だけを待つには、typed echo には絶対に現れない
  // 「本物の ESC バイトを含む」文字列そのものを needle にする（実地の確認で発見。単語のマーカーだと
  // まだ実行前の echo に一致して早期に解決してしまう。decisions.md D90）。
  await typeLine(page, "printf '\\e[38;2;12;34;56mTRUECOLOR_MARK\\e[0m\\n'");
  await client.waitForOutput(p1, "\x1b[38;2;12;34;56m");
  expect(client.rawOutput(p1)).toContain("TRUECOLOR_MARK");

  // 256 色。
  await typeLine(page, "printf '\\e[38;5;208m256COLOR_MARK\\e[0m\\n'");
  await client.waitForOutput(p1, "\x1b[38;5;208m");
  expect(client.rawOutput(p1)).toContain("256COLOR_MARK");

  // 全角文字（日本語）。
  const fullwidth = "全角文字テスト";
  await typeLine(page, `echo ${fullwidth}`);
  await client.waitForOutput(p1, fullwidth); // UTF-8 のバイト列がそのまま届いている
});

test("IME の合成入力：合成中は確定せず、確定（compositionend）で PTY へ届く（design「IME」。実 OS の IME は Playwright を経由しないため合成イベントを直接発火する）", async ({
  page,
  appServer,
}) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  await page.evaluate(() => {
    const ta = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement;
    ta.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true }));
    ta.value = "にほんご";
    ta.dispatchEvent(new CompositionEvent("compositionupdate", { data: "にほんご", bubbles: true }));
  });
  await page.waitForTimeout(200);
  // 合成中（confirm 前）は、合成中の文字列そのものは PTY へ送られていない——確定してから送る、という
  // 設計どおりの確認。**バイト数の完全一致では確かめない**——シェル起動直後のタイトル設定等、この確認とは
  // 無関係な OUTPUT がこの短い待ちの間にたまたま届くことがあり、フレーキーになる（実地の確認で発見）。
  expect(client.rawOutput(p1)).not.toContain("にほんご");

  // `CompositionHelper.compositionend`（xterm.js 本体）は、確定した文字列を `setTimeout(...,0)` の中で
  // `textarea.value` から読み出して PTY へ送る——**その setTimeout が発火するまでは `textarea.value` を
  // 書き換えてはいけない**（実地の確認で発見。先に `ta.value = ""` で消していたため何も送られていなかった。
  // decisions.md D90）。
  await page.evaluate(() => {
    const ta = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement;
    ta.dispatchEvent(new CompositionEvent("compositionend", { data: "にほんご", bubbles: true }));
  });
  await client.waitForOutput(p1, "にほんご"); // 確定した文字列が PTY まで届いている
  await page.evaluate(() => {
    (document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement).value = "";
  });

  const marker = `soda-e2e-ime-${Date.now()}`;
  await typeLine(page, `echo ${marker}`); // 確定後、通常のキー入力を続けられることも確認する
  await client.waitForOutput(p1, marker);
});

/**
 * `command`（数字だけを1行出力するもの。例：`tput cols`）を打って、実行後に新しく届いた出力の中から
 * 数字を読む。**`echo marker-$(cmd)` のように固定の文字列を数字に埋め込んで待つと、
 * まだ実行前の「入力中のエコー」（打った文字がそのまま返る分。marker の部分は数字を含まず実行前にも
 * 現れる）に一致して早期に解決してしまう**（実地の確認で発見。decisions.md D90）——`tput cols` のように
 * コマンド自体が数字を含まないものを選び、実行より前には絶対に現れない「新しく現れた数字」を待つことで
 * 避ける。
 */
async function runAndReadNumber(client: import("../support/wsClient.js").SodaTestClient, page: import("@playwright/test").Page, paneId: string, command: string): Promise<number> {
  const baseline = client.rawOutput(paneId).length;
  await typeLine(page, command);
  const deadline = Date.now() + 5000;
  for (;;) {
    // `tput cols` 自身の出力は「数字だけの 1 行」。周辺の制御シーケンス（bracketed paste の
    // `\e[?2004l` 等）にも数字が混じるので、**改行の直後の数字だけの塊**という形で絞り込む
    // （そうしないと無関係な数字に早期一致する。直前の区切りは実地には `\r\n`（Enter の echo）
    // だけでなく `\e[?2004l\r`（bracketed paste の無効化直後、`\n` を伴わない）の形でも現れることを
    // 実地の確認で発見。decisions.md D90）。
    const match = /[\r\n](\d{1,4})\r\n/.exec(client.rawOutput(paneId).slice(baseline));
    if (match) return Number(match[1]);
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for a number after running "${command}"; got: ${JSON.stringify(client.rawOutput(paneId).slice(baseline))}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("pane サイズ変更への追従：分割で列数が変わると PTY の resize が追従する（`tput cols` で確認）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 2000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // ページ読み込み直後、`PaneLayout.vue` の初回マウントで `client.view` が送られ、PTY が実際の
  // ビューポートへ resize される（D91。以前はここが `onUpdated` 頼みで、初回は resize が一度も
  // 起きなかった）。最初の `pane.size_changed` を待ってから測ることで、確定後の値を読む。
  await client.waitForEvent("pane.size_changed", (e) => e.data.paneId === p1, 15000);
  const beforeCols = await runAndReadNumber(client, page, p1, "tput cols");

  // 分割すると p1 の列数は半分程度に減る（AC3 の分割と地続き。pane.size_changed → PTY の resize）。
  const sizeChanged = client.waitForEvent("pane.size_changed", (e) => e.data.paneId === p1 && e.data.cols !== beforeCols, 8000);
  await page.keyboard.press("Control+b");
  await page.keyboard.press("v");
  const afterEvent = await sizeChanged;
  expect(afterEvent.data.cols).toBeLessThan(beforeCols);
  // `pane.size_changed` は、ブラウザが分割後のレイアウトを描いて送った `client.view` から来る——ブラウザが分割の**応答**を
  // 処理した（p2 へ焦点を移し、D99 の入力の関所を解放した）ことまでは意味しない。その前に p1 をクリックして打つと、
  // 後から来る応答で焦点が p2 へ移り、関所に溜まった `tput cols` も p2 へ流れる（D104）。焦点が p2（DOM の順で 2 番目）へ
  // 移ったことを待ってからクリックする。
  await expect.poll(() => focusedPaneIndex(page)).toBe(1);

  // 分割で新しくできた pane（p2）へ実際のブラウザのフォーカスが移っている（`TerminalPane.vue` の
  // reactive watch。T2 で学んだとおり）——p1 で `tput cols` を打つには、p1 を明示的にクリックし直す必要が
  // ある。`.terminal-pane` は DOM 順（レイアウト木の a→b）で並ぶので、`v`（右分割）の左側＝p1 は常に
  // 最初の要素（`.first()`）のまま——`focusTerminal` の `.first()` 依存がここでは安全に使える
  // （T2 の pane spec のように 3 つ以上に分かれて p1 が先頭でなくなる場合は使えない。decisions.md D88 の
  // 隣接の教訓）。
  await focusTerminal(page);
  const afterCols = await runAndReadNumber(client, page, p1, "tput cols");
  expect(afterCols).toBe(afterEvent.data.cols); // アプリ（シェル）自身が認識する幅もサーバの通知と一致する
  expect(afterCols).toBeLessThan(beforeCols);
});

/**
 * D107（統合 review ラウンド1 で発見）：窓の大きさ・サイドバーの折りたたみの変化に `client.view` が追従し、PTY の大きさが変わる。
 * 以前の `PaneLayout.vue` は mount と自身の描き直しのときしか commit せず、窓やサイドバーを変えても PTY は古い大きさのままだった
 * （上の test は分割——`PaneLayout` 自身の描き直し——しか確かめていなかった）。
 */
test("窓の大きさ・サイドバーの折りたたみを変えると、PTY の大きさが追従する（`tput cols` で確認。D107）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 2000 });
  const views = await watchClientViews(page); // ブラウザが送った `client.view`（測った大きさ）と、送った回数
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  /** ブラウザが測って申告した p1 の大きさに、サーバの p1（`pane.size_changed`）がそろっていれば "COLSxROWS"。 */
  const settled = (): string => {
    const shown = views.latest()?.visible.find((v) => v.paneId === p1);
    const server = client.paneSize(p1);
    return shown && server && shown.cols === server.cols && shown.rows === server.rows ? `${server.cols}x${server.rows}` : JSON.stringify({ shown, server });
  };
  const SIZE = /^\d+x\d+$/;
  await expect.poll(settled).toMatch(SIZE);
  const initial = client.paneSize(p1)!;

  // 窓を小さくする（既定は 1280×720）。
  await page.setViewportSize({ width: 900, height: 500 });
  await expect.poll(() => client.paneSize(p1)!.cols, { message: "窓を狭めると PTY の列が減る" }).toBeLessThan(initial.cols);
  await expect.poll(settled).toMatch(SIZE);
  const narrowed = client.paneSize(p1)!;
  expect(narrowed.rows).toBeLessThan(initial.rows);
  expect(await runAndReadNumber(client, page, p1, "tput cols")).toBe(narrowed.cols); // シェル自身が見る幅も変わっている

  // サイドバーを折りたたむ（prefix+b）と、pane の幅が広がる。
  await prefixKey(page, "b");
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
  await expect.poll(() => client.paneSize(p1)!.cols, { message: "サイドバーを折りたたむと PTY の列が増える" }).toBeGreaterThan(narrowed.cols);
  await expect.poll(settled).toMatch(SIZE);
  const collapsed = client.paneSize(p1)!;
  expect(collapsed.rows).toBe(narrowed.rows);

  // 窓を大きくすると広がる。
  await page.setViewportSize({ width: 1400, height: 800 });
  await expect.poll(() => client.paneSize(p1)!.cols, { message: "窓を広げると PTY の列が増える" }).toBeGreaterThan(collapsed.cols);
  await expect.poll(settled).toMatch(SIZE);
  expect(client.paneSize(p1)!.rows).toBeGreaterThan(collapsed.rows);

  // 落ち着いた後は送り続けない（大きさの変化 → 申告 → PTY の大きさ → … の循環が無い）。
  const count = views.count();
  await page.waitForTimeout(1000);
  expect(views.count()).toBe(count);
});

/**
 * AC11・AC14（20260920-sidebar-tabbar-controls）：足したボタンが端末の大きさを変えていないこと。
 * `cols` / `rows` の固定値は使わない——xterm のフォントをこの製品では指定しておらず、環境でセルの寸法が
 * 変わるため再現しない。**同じ実行の中での相対比較**で見る（このファイルの他のテストと同じ流儀）。
 */
test("tab バーの ＋ は帯を高くしない。サイドバーは折りたたんでも横に溢れない（AC11・AC14）", async ({ page, appServer }) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // tab バー自体が無いと帯の高さを測れない（20260922-appearance-settings-rest の自動非表示・AC4。
  // この work 以前は tab が1個でも常に表示されていた）ので、もう1つ tab を作って表示させる。
  await focusTerminal(page);
  await prefixKey(page, "c");
  await page.keyboard.press("Enter"); // 名前は既定のまま
  await expect(page.locator(".tab-bar-item")).toHaveCount(2);

  // ＋ が帯を高くすると pane の行が減る。**＋ を消したときと比べる**のが唯一の確かめ方——
  // タブも ＋ も同じ行の高さへ引き伸ばされるので、「帯 = タブ + 下線」は ＋ が何 px でも成り立ってしまう
  // （最初そう書いて、負の対照で何も確かめていないことが分かった）。
  const barHeight = (): Promise<number> => page.locator(".tab-bar").evaluate((el) => el.getBoundingClientRect().height);
  const withPlus = await barHeight();
  await page.locator(".tab-bar-new").evaluate((el) => ((el as HTMLElement).style.display = "none"));
  const withoutPlus = await barHeight();
  await page.locator(".tab-bar-new").evaluate((el) => ((el as HTMLElement).style.display = ""));
  expect(withPlus, `＋ の有無で帯の高さが変わらない（あり ${withPlus} / なし ${withoutPlus}）`).toBe(withoutPlus);

  // 折りたたんでも、足した帯が横へ溢れない（先行 work の AC3 と同じ判定の仕方）。
  await focusTerminal(page);
  await prefixKey(page, "b");
  await expect(page.locator(".sidebar-collapsed")).toHaveCount(1);
  const widths = await page.evaluate(() => {
    const el = document.querySelector(".sidebar") as HTMLElement;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });
  expect(widths.scroll, `折りたたみ時（実測 ${JSON.stringify(widths)}）`).toBeLessThanOrEqual(widths.client);
  await expect(page.locator(".sidebar-footer .sidebar-collapse-btn")).toBeVisible(); // 畳んでも戻せる

  // 折りたたむと帯が 2 つ消えるので、Tab で最初に来るサイドバーのボタンは折りたたみだけになる
  // （展開時は 新規 → メニュー → ソート → 折りたたみ の 4 つ。`keys-mouse-dialogs.spec.ts` で確認）。
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // サイドバーの前には、画面の切り替えのボタンと通知のベルが先に来る（20261009 の graph-first PR1b 以降）ので、4 回では届かない。届いたもののうち
  // サイドバーのボタンと tab だけを順に見る（下の `filter`）ので、多めに押しても確かめる中身は同じ。
  const reached: string[] = [];
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    reached.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? ""));
  }
  const btns = reached.filter((c) => c.includes("sidebar-btn") || c.includes("tab-bar-item"));
  expect(btns[0], `到達順: ${reached.join(" → ")}`).toContain("sidebar-collapse-btn");
  expect(btns[1], `到達順: ${reached.join(" → ")}`).toContain("tab-bar-item");
});
