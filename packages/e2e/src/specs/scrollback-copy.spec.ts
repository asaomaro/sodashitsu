import { expect, test } from "../support/fixtures.js";
import { focusTerminal, grantClipboard, prefixKey, typeLine } from "../support/keys.js";

/**
 * AC5 の E2E（05-e2e-docs T4）。design「受け入れ基準との対応」の AC5：
 * 「scrollback はサーバのミラーから SNAPSHOT で届き、以後はブラウザの xterm.js が持つ。
 * コピーは M4・M5 と copy モード、貼り付けは `Ctrl+Shift+V` とメニュー」。
 * xterm.js は canvas（WebGL）へ描画するため、DOM から文字・色は読み取れない——scrollback を遡って
 * 「正しい行を見ているか」は、copy モードで実際に選択・yank してクリップボードの中身を確かめることで
 * 間接的に証明する（見えている位置を直接読む代わりに、コピー結果という観測窓を使う）。
 */

test("scrollback: copy モードで遡り、選択・yank した内容がクリップボードに届く", async ({ page, context, appServer }) => {
  await grantClipboard(context, appServer.origin);
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // 十分な行数を出力して scrollback を作る（画面の行数より確実に多く。デスクトップの既定は 24 行程度）。
  const marker = Date.now();
  await typeLine(page, `for i in $(seq 1 80); do echo LINE_${marker}_$i; done`);
  await client.waitForOutput(p1, `LINE_${marker}_80`);
  await page.waitForTimeout(300); // ブラウザ側の xterm.js がまだ描画・パース中の可能性があるため一呼吸待つ

  // copy モードに入る（prefix+[）。カーソルは現在の（画面下端付近。新しいプロンプトの行）から始まる
  // （D94：CopyTarget.resetCursor が pane acquire 時点ではなく「今」の位置へ合わせ直す）。
  await prefixKey(page, "[");

  // 「新しいプロンプトの行から何行上」は、プロンプトの行数（rc の PS1）に依る。そこで基準を、出力の最後の行（LINE_marker_80）へ後方検索で飛んで取る
  // （コマンドのエコーには `LINE_${marker}_$i` とあり、`_80` の文字列そのものは出力の行にだけある）。
  await page.keyboard.press("?");
  await page.keyboard.type(`LINE_${marker}_80`);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300); // SearchAddon の検索・スクロールを待つ

  // そこから 1 行ずつ確実に 4 行だけ遡る（PageUp は端末の行数に依存して移動量が変わるため使わない——
  // 何行分動くかを厳密に予測できる k（1 行単位）のほうが、この検証には向く）。
  for (let i = 0; i < 4; i++) await page.keyboard.press("k");

  // 現在行を選択（V＝行単位）して yank（y）。design「選択とコピー」：v・Space・V で選択、y・Enter でコピー。
  await page.keyboard.press("V");
  await page.keyboard.press("y");
  await page.waitForTimeout(200); // クリップボードへの書き込み（Promise）を待つ

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // LINE_marker_80 から 4 行上＝LINE_marker_76。
  expect(copied.trim()).toBe(`LINE_${marker}_76`);
});

test("copy モードの検索（?）で該当行へジャンプし、yank で正しい行を拾える（D93 で修復）", async ({ page, context, appServer }) => {
  await grantClipboard(context, appServer.origin);
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  const marker = Date.now();
  const needle = `NEEDLE_${marker}`;
  // 打ち込んだコマンド自体の中に検索語の文字列そのものが含まれる（`echo ${needle}`）ため、`/`（前方検索）で
  // カーソル（末尾）から探すと、SearchAddon が末尾から折り返してバッファの先頭（＝コマンドのエコーそのもの）
  // に含まれる同じ文字列を先に見つけてしまう（実地の Playwright で判明。この spec 自身の設計上の罠——
  // タイプミスではなく、`?`（後方検索）を使えば末尾から近い方（＝実際の echo の出力行）を先に見つける）。
  await typeLine(page, `for i in $(seq 1 60); do echo filler_${marker}_$i; done; echo ${needle}; for i in $(seq 61 120); do echo filler_${marker}_$i; done`);
  await client.waitForOutput(p1, `filler_${marker}_120`);
  await page.waitForTimeout(300);

  await prefixKey(page, "[");
  await page.keyboard.press("?"); // 後方検索
  await page.keyboard.type(needle);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300); // SearchAddon の検索・スクロールを待つ

  await page.keyboard.press("V");
  await page.keyboard.press("y");
  await page.waitForTimeout(200);

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.trim()).toBe(needle); // 検索が実際にヒットして、その行へカーソルが移っていた証拠
});

test("マウスでの選択は選択終了時に自動でクリップボードへコピーされる（M4）", async ({ page, context, appServer }) => {
  await grantClipboard(context, appServer.origin);
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 500 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  const marker = `m4target${Date.now()}`;
  await typeLine(page, `echo ${marker}`);
  await client.waitForOutput(p1, marker);

  // 基準は pane の枠ではなく、xterm の画面（`.xterm-screen`）。pane の枠の上には、画面より外の余白がある（枠・隙間）ので、枠の上端からの固定の距離だと
  // 画面の外（xterm が受けない場所）を掴むことがある。
  const box = await page.locator(".xterm-screen").first().boundingBox();
  if (!box) throw new Error(".xterm-screen に boundingBox が無い");
  // xterm.js は canvas 描画なので、文字がどのピクセル位置にあるかは DOM から分からない。この pane は
  // つないだ直後で内容がまだ少ないため、実際の文字は画面の上のほうの数行にしか無い
  // （下の方はまだ何も描かれていない空行）——「最終行付近」を狙うと実際には空行を掴んでしまい、
  // 選択が一切発生しないことを実地の Playwright で確認した。プロンプト＋打ち込んだコマンドが必ずある
  // 先頭付近を、複数行にまたいでドラッグすることで確実に文字を拾う。
  const startY = box.y + 8;
  const endY = box.y + 50;
  await page.mouse.move(box.x + 5, startY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, endY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300); // M4 の `navigator.clipboard.writeText()` を待つ

  await expect(page.locator(".toast").filter({ hasText: "コピーしました" })).toBeVisible({ timeout: 3000 });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.length).toBeGreaterThan(0); // 何かしら選択・コピーされている（厳密な文字列一致は求めない。M4 の発火自体の確認）
});

test("Ctrl+Shift+V で貼り付けると、その内容が端末（PTY）へ届く", async ({ page, context, appServer }) => {
  await grantClipboard(context, appServer.origin);
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 500 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  const pasteMarker = `soda-e2e-paste-${Date.now()}`;
  await page.evaluate((text) => navigator.clipboard.writeText(text), `echo ${pasteMarker}`);
  await page.keyboard.press("Control+Shift+V");
  await page.waitForTimeout(300); // readClipboard() の Promise を待つ
  await page.keyboard.press("Enter");
  await client.waitForOutput(p1, pasteMarker);
});
