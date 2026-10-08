import type { Frame, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { runDisplay } from "../support/display.js";
import { activeTag, engageBtn, focusTerminal, ok, openScriptBrowser, scriptFrame, scriptFrameEl, scriptFrameLoc, setScript, setScriptOk } from "../support/displayScript.js";

/**
 * 操作を始める・操作中（T28 の (7)）と、フォーカスの番の筋（(5) の (i)〜(xiii)）。合否はブラウザの側の観測で見る。
 * 取られる回数は、テストが `frame.evaluate` で 1 回ずつ起こす（回数を決められる。間隔が要る筋は中身のタイマーを使う）。
 */

/** 枠の中の入力欄・受けたイベントの記録・取る関数つきの中身。 */
const PAGE = `<!doctype html><body><input id=i><input id=j><div style="height:3000px">tall</div><script>
window.__ev = [];
['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','keydown','keyup','click'].forEach(function (t) { window.addEventListener(t, function (e) { window.__ev.push(t + ':' + (e.key || '')); }, true); });
window.__steal = function () { window.focus(); document.getElementById('i').focus(); };
window.addEventListener('focus', function () { document.getElementById('i').focus(); });
document.getElementById('i').addEventListener('input', function (e) { soda.action('typed', { v: e.target.value }); });
</script></body>`;

const steal = (f: Frame) => f.evaluate(() => (window as unknown as { __steal(): void }).__steal());
const evs = (f: Frame) => f.evaluate(() => (window as unknown as { __ev: string[] }).__ev.slice());
const stealReports = (sent: { reports(): { problem: string }[] }) => sent.reports().filter((r) => r.problem === "focus_steal").length;

async function waitReports(sent: Parameters<typeof stealReports>[0], n: number): Promise<void> {
  await expect.poll(() => stealReports(sent), { timeout: 8000 }).toBeGreaterThanOrEqual(n);
}

test.describe("(7) 操作を始める・操作中", () => {
  test("覆いがある間、枠の中のボタン・覆いを押しても操作は始まらない（［操作する］が強調される）。3 つの入口（ボタン・Enter・prefix+i）のどれでも操作中になり、始めた押下の pointerup・mouseup・touchend・keyup は枠に届かない", async ({ page, appServer }) => {
    const { paneId, input } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    // 覆いを押す: 始まらず、［操作する］が強調される
    await page.locator("[data-pane-panel] [data-display-cover]").click({ position: { x: 20, y: 20 } });
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0");
    await expect(engageBtn(page)).toHaveClass(/display-engage-hint/);
    expect(await evs(f)).toEqual([]); // 枠の中には何も届かない
    expect(await activeTag(page)).not.toContain("IFRAME");

    const ringColor0 = await page.locator("[data-pane-panel-ring]").evaluate((e) => getComputedStyle(e).borderTopColor);
    const main = page.locator("[data-pane-frame-main]");
    expect(await main.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");

    const checkClean = async (via: string) => {
      const log = await evs(f);
      const bad = log.filter((x) => /^(pointerup|mouseup|touchend|keyup|pointerdown|mousedown|click):/.test(x) || x.startsWith("keyup"));
      expect(bad, `${via} の残りのイベントが枠に届いていない`).toEqual([]);
      await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
      await expect(page.locator("[data-pane-panel-engaged-note]")).toHaveText("入力はこの表示に届きます（Esc で端末へ）");
      expect(await page.locator("[data-pane-panel-ring]").evaluate((e) => getComputedStyle(e).borderTopColor)).not.toBe(ringColor0);
      await expect.poll(() => main.evaluate((e) => getComputedStyle(e).opacity)).toBe("0.55");
      await expect(engageBtn(page)).toHaveCount(0);
      await expect(page.locator("[data-pane-panel] [data-display-cover]")).toHaveCount(0);
      // 枠の中の欄に打った文字が入る
      await page.keyboard.type("ab");
      await expect(scriptFrameLoc(page).locator("#i")).toHaveValue(/ab$/);
    };
    const esc = async () => {
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0");
      await expect(page.locator("[data-pane-panel] [data-display-cover]")).toHaveCount(1);
      await expect(engageBtn(page)).toHaveCount(1);
      expect(await main.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
      expect(await activeTag(page)).not.toContain("IFRAME");
      await f.evaluate(() => { (window as unknown as { __ev: string[] }).__ev.length = 0; (document.getElementById("i") as HTMLInputElement).value = ""; });
    };

    // 入口 1: ポインタで［操作する］を押す
    await engageBtn(page).click();
    await checkClean("ボタン");
    await esc();
    // 入口 2: ［操作する］に Tab で届いて Enter（keyup は親が受けてから始まる）
    await engageBtn(page).focus();
    await page.keyboard.press("Enter");
    await checkClean("Enter");
    await esc();
    // 入口 3: prefix+i（端末にいる状態から）
    await focusTerminal(page);
    await page.keyboard.press("Control+b");
    await page.keyboard.press("i");
    await checkClean("prefix+i");
    // 操作中の枠の中で prefix を押しても、アプリの操作にならない（操作中のまま）
    await page.keyboard.press("Control+b");
    await page.keyboard.press("x");
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
    await esc();
    // Esc のあと、打ったキーは pane に届く
    const before = input().length;
    await page.keyboard.type("zz");
    await expect.poll(() => input().slice(before).map((i) => i.text).join("")).toContain("zz");
  });

  test("フォーカスを受けない場所（パネルの見出しの余白）を押して離れた後に、スクリプトが focus() で取り返すと、横取りとして数えられる（操作中に呼ばれた focus() は数えない）", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    await engageBtn(page).click();
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
    await steal(f); // 操作中に呼ばれた focus() は数えない
    await page.waitForTimeout(600);
    expect(stealReports(sent)).toBe(0);
    // 見出しの余白を押す（フォーカスを受けない）→ 操作中が解ける
    const head = (await page.locator(".pane-panel-head").boundingBox())!;
    await page.mouse.click(head.x + head.width - 70, head.y + head.height / 2);
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0");
    await steal(f); // 取り返す
    await waitReports(sent, 1);
    await expect.poll(() => activeTag(page)).not.toContain("IFRAME");
  });

  test("覆いの上のホイールで、枠の文書がスクロールする", async ({ page, appServer }) => {
    const { paneId } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    const box = (await page.locator("[data-pane-panel] [data-display-cover]").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => f.evaluate(() => document.scrollingElement!.scrollTop)).toBeGreaterThan(0);
  });
});

test.describe("(5) フォーカスの番（pane ごとにサーバが数える）", () => {
  test("(i) 2 回取って止まる中身 → close → 同じ中身を set（面の id が変わる）→ 1 回で閉じて冷却（回数が戻らない）", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await focusTerminal(page);
    const ev = await runDisplay(appServer, paneId, ["events", "g"]);
    await ev.nextLine();
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    let f = await scriptFrame(page);
    await steal(f);
    await waitReports(sent, 1);
    await steal(f);
    await waitReports(sent, 2);
    await expect(scriptFrameEl(page)).toHaveCount(1);
    await ok(await runDisplay(appServer, paneId, ["close", "g"]));
    await expect(scriptFrameEl(page)).toHaveCount(0);
    expect((await ev.nextLine()) as Record<string, unknown>).toMatchObject({ type: "display.closed", reason: "closed" });
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    f = await scriptFrame(page);
    await focusTerminal(page);
    await steal(f);
    await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 8000 });
    expect(await ev.nextLine(8000)).toMatchObject({ type: "display.closed", reason: "focus_steal" });
    expect((await (await setScript(appServer, paneId, "g", PAGE)).done).code).toBe(1);
    ev.kill();
  });

  test("(ii) 別の名前の面 2 つ（1 回と 2 回）でも、合計 3 回で両方閉じる", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await focusTerminal(page);
    await setScriptOk(appServer, paneId, "a", PAGE);
    await setScriptOk(appServer, paneId, "b", PAGE);
    await expect(page.locator("[data-pane-panel] iframe[data-display-script]")).toHaveCount(1); // パネルは選んだ 1 つだけ出る
    // 2 つ目はタブで選べる
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    let f = await scriptFrame(page);
    await steal(f);
    await waitReports(sent, 1);
    await page.locator("[data-pane-panel-tab]").nth(1).click();
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    f = await scriptFrame(page);
    await focusTerminal(page);
    await steal(f);
    await waitReports(sent, 2);
    await focusTerminal(page);
    await steal(f);
    await expect(page.locator("[data-pane-panel]")).toHaveCount(0, { timeout: 8000 }); // 両方閉じた
  });

  test("(iii) 2 回取った後に画面を再読み込みしても、次の 1 回で閉じる", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await focusTerminal(page);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    await steal(f);
    await waitReports(sent, 1);
    await focusTerminal(page);
    await steal(f);
    await waitReports(sent, 2);
    await page.reload();
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f2 = await scriptFrame(page);
    await focusTerminal(page);
    await steal(f2);
    await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 8000 });
  });

  test("(iv) 2 回取った後に、利用者が操作を始めて終えても、次の 1 回で閉じる", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await focusTerminal(page);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    await steal(f);
    await waitReports(sent, 1);
    await focusTerminal(page);
    await steal(f);
    await waitReports(sent, 2);
    await engageBtn(page).click();
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0");
    await steal(f);
    await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 8000 });
  });

  test("(v) 間隔をあけて（4 秒おきに 1 回）取る中身でも、3 回目で閉じる（時間で数え直さない）", async ({ page, appServer }) => {
    test.setTimeout(60_000);
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await focusTerminal(page);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    for (let i = 1; i <= 2; i++) {
      await focusTerminal(page);
      await steal(f);
      await waitReports(sent, i);
      await page.waitForTimeout(4000);
    }
    await focusTerminal(page);
    await steal(f);
    await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 8000 });
  });

  test("(vi) 別の pane の端末にフォーカスを置いた状態で取られたら、フォーカスはその別の pane の端末へ戻る（打ったキーが、別の pane に届く）", async ({ page, appServer }) => {
    const { paneId, client, input, sent } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const split = await client.request("pane.split", { paneId, direction: "right" });
    const p2 = split.pane.id;
    // テストの接続が分割したので、ブラウザの焦点は動かない。2 つ目の端末を押して焦点を置き、p2 に打てることを確かめてから取らせる。
    await expect(page.locator(".xterm-screen")).toHaveCount(2);
    await page.locator(".xterm-screen").nth(1).click();
    await expect.poll(async () => {
      const n = input().length;
      await page.keyboard.type("k");
      await page.waitForTimeout(150);
      return input().slice(n).some((i) => i.paneId === p2);
    }).toBe(true);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached(); // 分割で枠が作り直されることがある。取り直す。
    await steal(await scriptFrame(page));
    await waitReports(sent, 1);
    const n = input().length;
    await page.keyboard.type("back");
    await expect.poll(() => input().slice(n).filter((i) => i.paneId === p2).map((i) => i.text).join("")).toContain("back");
    expect(input().slice(n).filter((i) => i.paneId === paneId)).toEqual([]); // 面の pane（p1）の端末には動かさない
  });

  test("(xii) 知らせを落とせない: 中身が soda.action を毎秒 200 回流しながらフォーカスを取っても、3 回で閉じて冷却に入る", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await focusTerminal(page);
    await setScriptOk(appServer, paneId, "g", PAGE.replace("</script>", "setInterval(function () { soda.action('flood'); }, 5);</script>"));
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    for (let i = 1; i <= 3; i++) {
      await focusTerminal(page);
      await steal(f).catch(() => undefined);
      await waitReports(sent, i);
    }
    await expect(scriptFrameEl(page)).toHaveCount(0, { timeout: 8000 });
    expect((await (await setScript(appServer, paneId, "g2", PAGE)).done).code).toBe(1);
  });

  test("(xiii) 閉じる直前の知らせ: 2 回取った後、3 回目を取った直後に close しても、その pane は冷却に入る（直後の script-html の set が誤り）", async ({ page, appServer }) => {
    const { paneId, sent } = await openScriptBrowser(page, appServer);
    await focusTerminal(page);
    await setScriptOk(appServer, paneId, "g", PAGE);
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    const f = await scriptFrame(page);
    for (let i = 1; i <= 2; i++) {
      await focusTerminal(page);
      await steal(f);
      await waitReports(sent, i);
    }
    await focusTerminal(page);
    await Promise.all([steal(f).catch(() => undefined), runDisplay(appServer, paneId, ["close", "g"]).then((r) => r.done)]);
    await expect.poll(() => stealReports(sent), { timeout: 8000 }).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => (await (await setScript(appServer, paneId, "g2", PAGE)).done).code, { timeout: 8000 }).toBe(1);
  });

  test("(x) 操作を終えるために端末を押したとき、枠が自分の blur の中で focus() を呼び返す中身は、横取りとして数えられ、端末へ戻る", async ({ page, appServer }) => {
    const { paneId, sent, input } = await openScriptBrowser(page, appServer);
    await setScriptOk(appServer, paneId, "g", PAGE.replace("</script>", "window.addEventListener('blur', function () { document.getElementById('i').focus(); });</script>"));
    await expect(scriptFrameLoc(page).locator("#i")).toBeAttached();
    await engageBtn(page).click();
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "1");
    // 端末を押して操作を終える
    const box = (await page.locator(".xterm-screen").first().boundingBox())!;
    await page.mouse.click(box.x + 40, box.y + 40);
    await expect(page.locator("[data-pane-panel]")).toHaveAttribute("data-display-engaged", "0", { timeout: 5000 });
    await expect.poll(() => activeTag(page), { timeout: 5000 }).not.toContain("IFRAME");
    console.log(`MEASURE blur-regrab: steal-reports=${stealReports(sent)} active-after=${await activeTag(page)}`);
    const n = input().length;
    await page.keyboard.type("t");
    await expect.poll(() => input().slice(n).map((i) => i.text).join("")).toContain("t");
  });
});

test.describe("(8) 2 MiB ちょうどの script-html", () => {
  test("描かれ（末尾の印が出る）、15 秒たっても面が生きている（navigated・unresponsive で閉じない・soda.action が届く）。2 MiB + 1 バイトは終了コード 2", async ({ page, appServer }) => {
    test.setTimeout(60_000);
    const { paneId } = await openScriptBrowser(page, appServer);
    const head = `<!doctype html><body><p id=m>pending</p><script>/*`;
    const tail = `*/document.getElementById('m').textContent='end';setTimeout(function(){soda.action('alive')},14000);</script></body>`;
    const total = 2 * 1024 * 1024;
    const fill = total - Buffer.byteLength(head) - Buffer.byteLength(tail);
    const html = head + "a".repeat(fill) + tail;
    expect(Buffer.byteLength(html)).toBe(total);
    const w = await runDisplay(appServer, paneId, ["wait", "big"]);
    const set = await setScript(appServer, paneId, "big", html);
    expect((await set.done).code).toBe(0);
    await expect(scriptFrameLoc(page).locator("#m")).toHaveText("end", { timeout: 20_000 });
    const r = await w.done;
    expect(r.lines[0]).toMatchObject({ type: "display.action", action: "alive", source: "script" });
    await expect(scriptFrameEl(page)).toHaveCount(1);
    const over = await setScript(appServer, paneId, "big2", html + "x");
    expect((await over.done).code).toBe(2);
  });
});

test("(1)(login) /ws の経路（ログインあり）でも script-html を set できる", async ({ page, appServer }) => {
  const { paneId } = await openScriptBrowser(page, appServer);
  const r = await (await setScript(appServer, paneId, "g", "<p id=p>via ws</p>", { login: true })).done;
  expect(r.code, r.stderr).toBe(0);
  await expect(scriptFrameLoc(page).locator("#p")).toHaveText("via ws");
});

export type { Page };
