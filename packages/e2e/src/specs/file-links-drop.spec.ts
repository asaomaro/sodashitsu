import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { watchSentInput, type SentInput } from "../support/frames.js";
import { focusTerminal, typeLine } from "../support/keys.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * 端末のファイルのリンクとドロップ。ブラウザ版はローカルのファイルに触れないので、リンクは「サーバのマシンのアプリで開く」か「ダウンロード」、
 * ドロップは「元のパスを貼る」か「サーバへ送って置いた先のパスを貼る」（`web/src/term/FileTransfer.ts`）。
 *
 * 合否はブラウザの側で見る（e2e-observe-browser）：指のカーソル（リンクを描いて重なりを判定した印）・ブラウザのダウンロード・ブラウザが
 * 送った INPUT（CDP）・ドロップの重なりの表示（DOM）。テスト自身のクライアントは、出力が届いたこと（前提）と pane の大きさにだけ使う。
 * 「サーバのマシンのアプリで開く」は、実物のアプリを起動するので E2E では通さない（`FileOpener`・`FileTransfer` の単体試験と `/ws` の結合試験で確かめる）。
 */

/** 端末の文字の位置（0 始まりの列・行）の中心の座標。 */
async function cellCenter(page: Page, client: SodaTestClient, paneId: string, col: number, row: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator(".xterm-screen").first().boundingBox())!;
  const size = client.paneSize(paneId)!;
  return { x: box.x + ((col + 0.5) * box.width) / size.cols, y: box.y + ((row + 0.5) * box.height) / size.rows };
}

/** このブラウザの「ファイルのリンクとドロップ」の設定を、読み込みの前に入れる（ブラウザごとの設定。localStorage）。 */
async function setFileLocality(page: Page, value: "auto" | "local" | "remote"): Promise<void> {
  await page.addInitScript((v) => localStorage.setItem("soda.prefs.v1", JSON.stringify({ fileLocality: v })), value);
}

/**
 * ファイルのドラッグ＆ドロップを、ページの中で `DataTransfer` を組み立てて起こす（Playwright は OS からのドラッグを起こせない）。
 * 返すのは、ドロップの既定の動作（ブラウザがそのファイルを開く）が止められたか。
 */
async function dropFiles(page: Page, selector: string, files: { name: string; text: string }[], uriList?: string): Promise<{ dragOverPrevented: boolean; dropPrevented: boolean }> {
  return page.evaluate(
    ({ selector, files, uriList }) => {
      const target = document.querySelector(selector)!;
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([f.text], f.name));
      if (uriList) dt.setData("text/uri-list", uriList);
      const fire = (type: string): boolean => !target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      fire("dragenter");
      const dragOverPrevented = fire("dragover");
      return { dragOverPrevented, dropPrevented: fire("drop") };
    },
    { selector, files, uriList },
  );
}

/** ブラウザがその pane へ送った INPUT をつないだ文字列。 */
function inputTo(sent: SentInput[], paneId: string): string {
  return sent
    .filter((s) => s.paneId === paneId)
    .map((s) => s.text)
    .join("");
}

test("ファイルのリンク：出力の中の実在するパスは、Ctrl を押している間だけ指のカーソルを出し、Ctrl を押しながらのクリックでダウンロードされる（別のマシンとして扱う設定）", async ({
  page,
  appServer,
}) => {
  const work = await mkdtemp(join(tmpdir(), "soda-e2e-files-"));
  try {
    const body = "line1\nline2\n見積\n";
    await writeFile(join(work, "report.txt"), body);
    const client = await appServer.openClient();
    const p1 = client.helloSnapshot()!.panes[0]!.id;
    await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
    await setFileLocality(page, "remote");
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await focusTerminal(page);

    // 画面を消して、1 行目に実在するパス（行番号つき）、2 行目に実在しないパスを出す。
    await typeLine(page, `printf '\\e[H\\e[2Jerr %s:2:1\\nerr %s\\n' ${join(work, "report.txt")} ${join(work, "none.txt")}`);
    await client.waitForOutput(p1, `err ${join(work, "none.txt")}\r\n`); // printf の出力（打った行のエコーは改行の前に ' が続く）

    const pointer = page.locator(".xterm-screen.xterm-cursor-pointer");
    const away = await cellCenter(page, client, p1, 5, 10);
    const real = await cellCenter(page, client, p1, 8, 0);
    const missing = await cellCenter(page, client, p1, 8, 1);

    // 実在しないパスはリンクにならない（Ctrl を押しても指のカーソルにならない）。先に実在するほうで「判定が済むと出る」ことを確かめてから見る。
    await page.mouse.move(away.x, away.y);
    await page.mouse.move(real.x, real.y);
    await page.keyboard.down("Control");
    await expect(pointer).toHaveCount(1); // サーバに確かめた後に出る
    await page.keyboard.up("Control");
    await expect(pointer).toHaveCount(0); // Ctrl を離すと消える（URL のリンクと同じ）

    // ただのクリックではダウンロードしない。
    const plain = page.waitForEvent("download", { timeout: 1500 }).then(
      () => "downloaded",
      () => "none",
    );
    await page.mouse.click(real.x, real.y);
    expect(await plain).toBe("none");

    // Ctrl を押しながらのクリックで、ブラウザのダウンロードになる（名前と中身が元のファイルと同じ）。
    const downloading = page.waitForEvent("download", { timeout: 10_000 });
    await page.keyboard.down("Control");
    await page.mouse.click(real.x, real.y);
    await page.keyboard.up("Control");
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("report.txt");
    expect(await readFile(await download.path(), "utf8")).toBe(body);

    await page.mouse.move(away.x, away.y);
    await page.mouse.move(missing.x, missing.y);
    await page.keyboard.down("Control");
    await page.mouse.move(missing.x + 1, missing.y);
    // 指のカーソルが出ないこと。判定（サーバへの問い合わせ）が済むだけの時間を、実在する行で出るまでにかかった時間より十分長く待つ。
    await page.waitForTimeout(1000);
    await expect(pointer).toHaveCount(0);
    await page.keyboard.up("Control");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

test("ファイルのドロップ（別のマシンとして扱う設定）：ブラウザの既定の動作を止め、サーバへ送って置いた先のパスを引用して pane へ貼る", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const sent = await watchSentInput(page);
  await setFileLocality(page, "remote");
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // 重なりの表示（DOM）：dragenter で付き、drop で消える。
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "x.txt"));
    document.querySelector(".terminal-pane")!.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(page.locator(".terminal-pane.terminal-pane-drop-target")).toHaveCount(1);

  const result = await dropFiles(page, ".terminal-pane", [
    { name: "my notes.txt", text: "hello drop" },
    { name: "b.txt", text: "second" },
  ]);
  expect(result).toEqual({ dragOverPrevented: true, dropPrevented: true });
  await expect(page.locator(".terminal-pane.terminal-pane-drop-target")).toHaveCount(0);

  // ブラウザが pane へ送った入力：置いた先のパス 2 つ（空白を含む名前は単一引用符で包む）と、それぞれの後ろの空白。
  const dropDir = join(appServer.stateDir, "dropped-files");
  const escaped = dropDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pasted = new RegExp(`'(${escaped}/soda-drop-[^/]+/my notes\\.txt)' (${escaped}/soda-drop-[^/]+/b\\.txt) `);
  await expect.poll(() => inputTo(sent(), p1), { timeout: 10_000 }).toMatch(pasted);
  const [, first, second] = pasted.exec(inputTo(sent(), p1))!;
  // サーバの側の状態：貼ったパスに、ドロップした中身がある。
  expect(await readFile(first!, "utf8")).toBe("hello drop");
  expect(await readFile(second!, "utf8")).toBe("second");

  // pane の外（サイドバー）へ落としても、ブラウザにファイルを開かせない（この画面のまま）。何も送らない。
  const before = inputTo(sent(), p1);
  const outside = await dropFiles(page, ".sidebar", [{ name: "c.txt", text: "third" }]);
  expect(outside).toEqual({ dragOverPrevented: true, dropPrevented: true });
  await page.waitForTimeout(500);
  expect(inputTo(sent(), p1)).toBe(before);
  expect(await readdir(dropDir)).toHaveLength(2);
});

test("ファイルのドロップ（同じマシン）：ドラッグ元が渡した元のパスがサーバで実在すれば、送らずにそのパスを貼る", async ({ page, appServer }) => {
  const work = await mkdtemp(join(tmpdir(), "soda-e2e-files-"));
  try {
    await writeFile(join(work, "local file.txt"), "same machine");
    const client = await appServer.openClient();
    const p1 = client.helloSnapshot()!.panes[0]!.id;
    const sent = await watchSentInput(page);
    // 設定は既定（自動）。テストのブラウザは 127.0.0.1 から繋ぐので、サーバは同じマシンと判定する。
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
    await focusTerminal(page);

    const uri = `file://${join(work, "local file.txt").split("/").map(encodeURIComponent).join("/")}`;
    const result = await dropFiles(page, ".terminal-pane", [{ name: "local file.txt", text: "same machine" }], uri);
    expect(result.dropPrevented).toBe(true);
    await expect.poll(() => inputTo(sent(), p1), { timeout: 10_000 }).toContain(`'${join(work, "local file.txt")}' `);
    // 送っていない（サーバの置き場所は作られていない）。
    expect(await readdir(appServer.stateDir)).not.toContain("dropped-files");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
