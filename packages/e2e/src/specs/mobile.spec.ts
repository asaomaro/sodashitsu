import { devices, type Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { routeRecordingWebSocket } from "../support/frames.js";
import { focusTerminal, typeLine } from "../support/keys.js";
import { watchClientView, watchClientViews, watchShownPanes } from "../support/panes.js";

/**
 * AC12 の E2E（05-e2e-docs T9）。design「モバイル」：1 列のレイアウト（表示する pane は 1 つ、pane の
 * ピッカーで切替）・追加キーの列（`Esc`/`Tab`/`Ctrl`/`Alt`/矢印/`PgUp`/`PgDn`/`Prefix`）・
 * 「この端末に合わせる」（`client.fit`）。04-mobile の test 工程の disposable E2E script（decisions.md D86）
 * を正式な spec に育てたもの——実機の代わりに Playwright の `devices["iPhone 13"]`（モバイルのエミュレーション。
 * タッチ・狭い viewport・モバイル UA）を使う。
 */
// `devices["iPhone 13"]` は既定で webkit を使う（`defaultBrowserType: "webkit"`）が、この検証環境には
// webkit が入っていない（chromium のみ）ため、viewport・タッチ・UA だけを借りて chromium のまま使う。
test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

test("モバイルのエミュレーションで1列レイアウトが出て、pane ピッカー・追加キー・端末に合わせるが一通り動く（AC12）", async ({ page, appServer }) => {
  const client = await appServer.openClient("mobile");
  const shown = await watchShownPanes(page); // ブラウザが表示している pane（`client.view`。support/panes.ts）
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // 1 列のレイアウト：モバイルの shell が出て、デスクトップのサイドバーは出ない（design「1 列のレイアウト」）。
  await expect(page.locator(".mobile-shell")).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);

  // pane ピッカー：開いて閉じられる（design「workspace / tab の切替と、エージェントの一覧を
  // 全画面のピッカーで開ける」）。
  await page.locator(".mobile-shell-title").click();
  await expect(page.locator(".pane-picker")).toBeVisible();
  await page.locator(".pane-picker-close").click();
  await expect(page.locator(".pane-picker")).toHaveCount(0);

  // 追加キーの列：開閉ボタンで出し入れでき、design どおり11個のボタンがある。
  await page.locator(".mobile-shell-keyboard-btn").click();
  await expect(page.locator(".extra-keys")).toBeVisible();
  await expect(page.locator(".extra-keys-btn")).toHaveCount(11);

  // Prefix ボタン＋実キーボードでの分割：ExtraKeys の Prefix（Ctrl+B 相当）を押した直後に、
  // 実キーボード（この環境ではソフトキーボードの代わりに Playwright の keyboard API）で `v` を押すと
  // prefix の続きとして解釈され、右分割される。
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const p2Created = client.waitForEvent("pane.created");
  await page.getByRole("button", { name: "Prefix" }).click();
  await page.keyboard.press("v");
  const p2 = (await p2Created).data.pane.id;
  expect(p2).not.toBe(p1);
  // モバイルは常に 1 pane だけを表示する（design「表示する pane は 1 つ」）——分割しても増えて見えない。
  await expect(page.locator(".terminal-pane")).toHaveCount(1);
  // 新しい pane（p2）へ実際に切り替わって入力が届く（D86 で見つかった不具合の回帰確認）。テスト自身のクライアントに
  // `pane.created` が届いても、ブラウザが p2 へ表示を切り替えたとは限らない（D104）——切り替わる前に端末を押すと p1 を
  // 押してしまうので、ブラウザが p2 を描いた（`client.view` に含まれる）ことを待ってから触る。
  await client.request("pane.subscribe", { paneId: p2, scrollbackLines: 200 });
  await expect.poll(shown).toContain(p2);
  await page.locator(".xterm-helper-textarea").first().click();
  const marker = `soda-e2e-mobile-split-${Date.now()}`;
  await page.keyboard.type(marker);
  await page.keyboard.press("Enter");
  await client.waitForOutput(p2, marker);

  // 「この端末に合わせる」：押すと押下状態（`aria-pressed`）になる（`useFitToScreen.ts` は 04-mobile の
  // 単体テストで `client.fit` の RPC 呼び出し自体を確認済みなので、ここでは UI の状態遷移だけを見る）。
  await page.locator(".mobile-shell-fit-btn").click();
  await expect(page.locator(".mobile-shell-fit-btn")).toHaveAttribute("aria-pressed", "true");
});

/**
 * D105 の回帰テスト（親の統合 test ラウンド5 で発見）：モバイルで表示する pane を切り替えても、隠れた pane の PTY の大きさは
 * そのまま（1×1 に縮めない）。以前は `PaneLayout.vue` の葉の ref が、外すときにその時点の（もう新しい）pane の id を読んだため、
 * 隠れた pane が切り離された要素のまま `client.view` に `cols:1, rows:1` で載り続け、サイズ権限を持つモバイルのブラウザの
 * `client.view` でサーバがその PTY を 1×1 に縮めていた（実測 53×24 → 1×1。隠れた TUI・エージェントの画面が 1 桁で折り返す）。
 * サイズ権限は「この端末に合わせる」（`client.fit`）で取らせる（D106）：fit していないモバイルは権限を取らない（D13）ので、
 * 押さないと隠れた p1 が `client.view` に載っても PTY の大きさは動かず、大きさの確かめが意味を失う（D106 より前のこの test は、
 * fit していないモバイルが最初の `client.view` で権限を取る——D13 に反する不具合——を前提にしていた）。
 */
test("表示する pane を切り替えても、隠れた pane の PTY の大きさは変わらず、client.view にも載らない（D105）", async ({ page, appServer }) => {
  const client = await appServer.openClient("mobile"); // `client.view` を送らない（見るだけ）——サイズ権限は下で fit したブラウザが持つ
  const view = await watchClientView(page); // ブラウザが送った `client.view`（表示中の pane とブラウザが測った大きさ）
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  const p1 = client.helloSnapshot()!.panes[0]!.id;

  // 追加キーの列を先に開く（開くと pane の高さが変わるので、分割の前の大きさはその後で取る）。
  await page.locator(".mobile-shell-keyboard-btn").click();
  await expect(page.locator(".extra-keys")).toBeVisible();

  // 「この端末に合わせる」を押して、このブラウザにサイズ権限を取らせる（`client.fit`。fit していないモバイルは権限を取らず
  // 大きさを変えない——D13・D106）。
  await page.locator(".mobile-shell-fit-btn").click();
  await expect(page.locator(".mobile-shell-fit-btn")).toHaveAttribute("aria-pressed", "true");

  // ブラウザが p1 だけを描いて測った大きさに、サーバの p1 がそろうのを待つ（ここで一致すれば、fit したこのブラウザの
  // `client.view` が p1 の PTY の大きさを決めている——サーバの `SizeAuthority`。D106）。
  const p1Settled = (): string => {
    const shown = view();
    const server = client.paneSize(p1);
    const entry = shown?.visible.length === 1 ? shown.visible[0] : undefined;
    return entry?.paneId === p1 && server && entry.cols === server.cols && entry.rows === server.rows ? "settled" : JSON.stringify({ shown, server });
  };
  await expect.poll(p1Settled).toBe("settled");
  // 追加キーの列を開いた直後は、ブラウザの測り直しで大きさが一度変わる（29 行 → 26 行。実測）。途中の一致（一時の 29 行）を「分割の前の大きさ」に取らないよう、
  // 400ms 変わらずに一致し続けるのを待つ（20261007-soda-extensions で通信が 1 本増えて時機がずれ、途中の一致を取るようになった。時機の競合そのものは元からあった）。
  let lastKey = "";
  let lastChange = Date.now();
  await expect
    .poll(() => {
      const key = p1Settled() + JSON.stringify(client.paneSize(p1));
      if (key !== lastKey) {
        lastKey = key;
        lastChange = Date.now();
      }
      return p1Settled() === "settled" && Date.now() - lastChange >= 400;
    })
    .toBe(true);
  const before = client.paneSize(p1)!;
  expect(before.cols).toBeGreaterThan(1);
  expect(before.rows).toBeGreaterThan(1);

  // 分割（Prefix ボタン＋`v`）：モバイルは新しい pane（p2）へ表示を切り替え、p1 は隠れる。
  const p2Created = client.waitForEvent("pane.created");
  await page.getByRole("button", { name: "Prefix" }).click();
  await page.keyboard.press("v");
  const p2 = (await p2Created).data.pane.id;
  await expect.poll(() => view()?.visible.map((v) => v.paneId) ?? []).toContain(p2);

  // 同期点：p2 を描いた後にブラウザから p2 へ打った文字のエコーを待つ。ブラウザの接続では、p2 を載せた `client.view` が
  // 打った文字より先にサーバへ届き、サーバはそれを受けたその場で大きさを反映する（`client.view` の処理に待ちは無い）。
  // 隠れた p1 が `client.view` に載っていれば、p1 の `pane.size_changed` はこのエコーより先にこのクライアントへ届いている。
  await client.request("pane.subscribe", { paneId: p2, scrollbackLines: 200 });
  await page.locator(".xterm-helper-textarea").first().click();
  const marker = `soda-e2e-hidden-size-${Date.now()}`;
  await page.keyboard.type(marker);
  await page.keyboard.press("Enter");
  await client.waitForOutput(p2, marker);

  // 隠れた p1 の PTY の大きさは分割の前のまま（以前は 1×1 に縮められた）。`expect.soft`：落ちても次の確かめまで見る。
  expect.soft(client.paneSize(p1)).toEqual(before);
  // ブラウザの `client.view` は表示中の p2 だけを載せる（以前は隠れた p1 が `cols:1, rows:1` で残っていた）。
  expect(view()?.visible.map((v) => v.paneId)).toEqual([p2]);
});

interface Size {
  cols: number;
  rows: number;
}

const SIZE = /^\d+x\d+$/;
const fmt = (size: Size): string => `${size.cols}x${size.rows}`;

/** 表示領域（`.mobile-shell-pane`）の大きさと、pane の xterm.js のセルの寸法（CSS px。読めなければ null）。 */
interface AreaGeometry {
  area: { width: number; height: number };
  cell: { width: number; height: number } | null;
}

/**
 * ブラウザから、表示領域の大きさと pane のセルの寸法を読む（D108）。セルの寸法は製品（`term/measure.ts` の `getCellSize`）と
 * 同じ出どころ——xterm.js の描画の寸法（`_core._renderService.dimensions.css.cell`）——から読む。製品の部品は DOM に出ていない
 * ので、Vue のアプリ（`#app` の `__vue_app__`）が provide した `TerminalRegistry`（`injection.ts` の `TerminalRegistryKey`。
 * `Symbol("terminalRegistry")`）を引く（読むだけ）。以前は縮小の枠の `style.width` を PTY の列数で割っていたが、Chromium は
 * CSS の長さを 6 桁に丸めて返す（`388.667px`）ので、切り捨ての境目の近くで 1 ずれうる（D108 の独立点検 #4）。
 */
async function paneAreaGeometry(page: Page, paneId: string): Promise<AreaGeometry> {
  return page.evaluate((id) => {
    const area = document.querySelector(".mobile-shell-pane")!.getBoundingClientRect();
    type Cell = { width: number; height: number };
    type Term = { _core?: { _renderService?: { dimensions?: { css?: { cell?: Cell } } } } };
    const app = (document.querySelector("#app") as unknown as { __vue_app__?: { _context: { provides: Record<symbol, unknown> } } }).__vue_app__;
    const provides = app?._context.provides ?? {};
    const key = Object.getOwnPropertySymbols(provides).find((sym) => sym.description === "terminalRegistry");
    const registry = key ? (provides[key] as { get(paneId: string): { term: Term } | undefined }) : undefined;
    const cell = registry?.get(id)?.term._core?._renderService?.dimensions?.css?.cell;
    return { area: { width: area.width, height: area.height }, cell: cell && cell.width > 0 && cell.height > 0 ? { width: cell.width, height: cell.height } : null };
  }, paneId);
}

/**
 * `size` が表示領域いっぱいの大きさ（表示領域 ÷ セルの寸法の切り捨て。製品の `term/measure.ts` と同じ計算）か。製品と同じ値
 * （同じ要素の `getBoundingClientRect()`・同じセルの寸法）から計算するので、ふつうは切り捨てがそのまま一致する。比が整数から
 * 1e-3 以内のときだけ、浮動小数の誤差として境目の両側を許す（D108 の独立点検 #4）。xterm.js の WebGL の描画では、セルの寸法は
 * 列数によらない（`device.cell / devicePixelRatio`。この環境の描画はこれ）。
 */
function fitsArea(size: Size, geometry: AreaGeometry): boolean {
  const { cell, area } = geometry;
  return cell !== null && fitsAxis(size.cols, area.width / cell.width) && fitsAxis(size.rows, area.height / cell.height);
}

function fitsAxis(n: number, ratio: number): boolean {
  if (n === Math.floor(ratio)) return true;
  const nearest = Math.round(ratio);
  return Math.abs(ratio - nearest) < 1e-3 && (n === nearest || n === nearest - 1);
}

/**
 * D108（統合 review ラウンド1 で発見。04-mobile T9 の (a)）：「この端末に合わせる」（`client.fit`）を有効にしたまま**同じページのまま**
 * 繋ぎ直しても、新しい接続でサイズ権限を取り直し、PTY をスマートフォンの大きさに戻す。サーバは接続ごとに新しい clientId を
 * fit:false で登録する（D106）が、以前の Web は `fitEnabled` を持ち越したまま `client.fit` を送り直さなかった——ボタンは押された
 * 表示のまま、切断の間に別のクライアント（デスクトップ）が決めた大きさのまま等倍で描き、画面からはみ出した。
 * ページの WebSocket を中継して（support/frames.ts）、新しい接続でページが送った要求の順（`client.view` → `client.fit` →
 * `pane.subscribe`）も見る。
 */
test("「この端末に合わせる」を有効にしたまま繋ぎ直すと、新しい接続でも client.fit を送り直し、PTY をスマートフォンの大きさに戻す（D108）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const client = await appServer.openClient("mobile"); // `client.view` を送らない（見るだけ）
  const snapshot = client.helloSnapshot()!;
  const p1 = snapshot.panes[0]!.id;
  const tab = snapshot.tabs.find((t) => t.id === snapshot.panes[0]!.tabId)!;
  const ws = await routeRecordingWebSocket(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  const fitButton = page.locator(".mobile-shell-fit-btn");
  await fitButton.click();
  await expect(fitButton).toHaveAttribute("aria-pressed", "true");

  /** `connection` 番目の接続でブラウザが最後に申告した p1 の大きさ。 */
  const declared = (connection: number): Size | undefined => {
    const views = ws.sent(connection).filter((r) => r.method === "client.view");
    const params = views.at(-1)?.params as { visible: (Size & { paneId: string })[] } | undefined;
    const entry = params?.visible.find((v) => v.paneId === p1);
    return entry ? { cols: entry.cols, rows: entry.rows } : undefined;
  };
  /** ブラウザの申告にサーバの p1 の PTY がそろっていれば "COLSxROWS"。 */
  const settledOn = (connection: number) => (): string => {
    const shown = declared(connection);
    const server = client.paneSize(p1);
    return shown && server && fmt(shown) === fmt(server) ? fmt(server) : JSON.stringify({ shown, server });
  };
  await expect.poll(settledOn(0)).toMatch(SIZE);
  const phone = client.paneSize(p1)!;
  // 表示領域いっぱいの大きさか（(b) の性質。下の test で確かめる）。`expect.soft`：落ちても、この test の主題の繋ぎ直しまで見る。
  await expect.soft
    .poll(
      async () => {
        const geometry = await paneAreaGeometry(page, p1);
        return fitsArea(phone, geometry) ? "fits" : JSON.stringify({ phone, geometry });
      },
      { message: "fit した PTY は表示領域いっぱいの大きさ" },
    )
    .toBe("fits");

  // 接続を切り、繋ぎ直しは許すまで断る（切れている間に、別のクライアントに大きさを変えさせるため）。
  ws.refuseNext(Number.POSITIVE_INFINITY);
  await ws.drop(0);
  const overlay = page.locator(".reconnect-overlay");
  await expect(overlay).toBeVisible();

  // 切れている間に、デスクトップのクライアントが同じ tab を見て操作し（サイズ権限を取る）、PTY を自分の大きさにする。
  const desktop = await appServer.openClient("desktop");
  const other = { cols: phone.cols + 30, rows: phone.rows + 5 };
  await desktop.request("client.view", { workspaceId: tab.workspaceId, tabId: tab.id, visible: [{ paneId: p1, ...other }] });
  await desktop.request("pane.focus", { paneId: p1 });
  await expect.poll(() => client.paneSize(p1), { message: "切断の間にデスクトップが PTY の大きさを変えた" }).toEqual(other);

  // 繋ぎ直させる。
  ws.refuseNext(0);
  await expect(overlay).toBeHidden({ timeout: 30_000 });
  expect(ws.frames.connectionCount()).toBe(2);
  await expect(fitButton).toHaveAttribute("aria-pressed", "true"); // 手元の状態は持ち越す

  // 新しい接続でページが送った順：hello → client.view → client.fit（有効）→ pane.subscribe（fit で決まった大きさで SNAPSHOT を取る）。
  // `expect.soft`：落ちても、下の PTY の大きさまで見る（送らなかったとき、PTY がどうなるかも 1 回の失敗で分かるように）。
  // `client.theme`（20260921-theme-settings の design D6）・`graph.get`・`ask.subscribe`・`display.subscribe`・`prefs.get` など、接続のたびに送り直す
  // ほかの要求は、fit の並びとは関わらず、機能が増えるたびに増える。主題の 4 つ（hello・view・fit・subscribe）だけを取り出して、その順を見る。
  const ORDER = new Set(["client.hello", "client.view", "client.fit", "pane.subscribe"]);
  await expect.soft
    .poll(() => ws.sent(1).map((r) => r.method).filter((m) => ORDER.has(m)).slice(0, 4), {
      message: "新しい接続で client.view → client.fit → pane.subscribe の順に送る",
    })
    .toEqual(["client.hello", "client.view", "client.fit", "pane.subscribe"]);
  expect.soft(ws.sent(1).map((r) => r.method), "新しい接続でもテーマを送り直す（20260921-theme-settings）").toContain("client.theme");
  expect.soft(ws.sent(1).find((r) => r.method === "client.fit")?.params, "送り直す client.fit は有効").toEqual({ enabled: true });

  // サーバの PTY がスマートフォンの大きさ（新しい接続の申告。表示領域は変わっていないので切断の前と同じ）に戻る。
  await expect.poll(settledOn(1), { message: "繋ぎ直した後、PTY がスマートフォンの申告にそろう" }).toBe(fmt(phone));
});

/**
 * D108（統合 review ラウンド1 で発見。04-mobile T9 の (b)）：モバイルの `client.view` の大きさは、縮小の枠（naturalSize × scale。
 * naturalSize はサーバの PTY の大きさ × セルの寸法）の中の葉ではなく、表示領域（上部のバー・追加キーの列を除いた範囲）の大きさで
 * 測り、表示領域の変化（回転・窓の大きさ・追加キーの列の開閉。ソフトキーボードも visual viewport の高さを通じて同じ経路）に追従する。
 * 以前は葉を測っていたので、fit していない間は表示領域より小さい大きさを申告し（iPhone 13 で 53×24。表示領域には 53×41 が
 * 収まる）、「この端末に合わせる」を押すと PTY はその大きさ（縦に 17 行ぶんの余白）で止まり、回転しても何も送らなかった。
 * サイズ権限の意味（D13・D106）も確かめる：fit していない間の申告は表示・購読のために送るが PTY の大きさは変えず、fit 中は PTY が
 * 申告（＝表示領域から決まる大きさ）になる。落ち着いた後は送り続けない（申告 → PTY → 申告 … の循環が無い）。
 */
test("表示領域の大きさで client.view を申告して回転・追加キーの列に追従し、fit 中は PTY がそれに落ち着く。fit していなければ PTY は変えない（D108・D13・D106）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const client = await appServer.openClient("mobile"); // 見るだけ
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 }); // 同期点（エコー）に使う
  const views = await watchClientViews(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  const initial = client.paneSize(p1)!; // 誰も大きさを決めていない（クライアントが居ないときに作った 120×40）

  const declared = (): Size | undefined => {
    const entry = views.latest()?.visible.find((v) => v.paneId === p1);
    return entry ? { cols: entry.cols, rows: entry.rows } : undefined;
  };
  /** ブラウザの申告が、表示領域いっぱいの大きさ（ブラウザから読んだ表示領域とセルの寸法で計算する）なら "COLSxROWS"。 */
  const declaresArea = async (): Promise<string> => {
    const shown = declared();
    const geometry = await paneAreaGeometry(page, p1);
    return shown && fitsArea(shown, geometry) ? fmt(shown) : JSON.stringify({ shown, geometry, server: client.paneSize(p1) });
  };
  /** ブラウザから打った文字のエコーを待つ（同じ接続で、その前に送った `client.view` をサーバが処理し終えた印）。 */
  const syncViaEcho = async (label: string): Promise<void> => {
    await focusTerminal(page);
    const marker = `soda-e2e-${label}-${Date.now()}`;
    await typeLine(page, `echo ${marker}`);
    await client.waitForOutput(p1, marker);
  };

  // (1) fit していない：縦長の表示領域いっぱいの大きさを申告する（縮めた葉の大きさではない）が、PTY の大きさは変えない。
  await expect.poll(declaresArea, { message: "縦長：申告は表示領域いっぱいの大きさ" }).toMatch(SIZE);
  const portraitUnfit = declared()!;
  await syncViaEcho("portrait-unfit");
  expect(client.paneSize(p1), "fit していないモバイルの申告は PTY を変えない（D13・D106）").toEqual(initial);

  // 横長へ回す（iPhone 13 の横長の viewport。幅 750 は 1 列のレイアウトのまま）。申告は追従するが PTY は変えない。
  await page.setViewportSize({ width: 750, height: 342 });
  await expect.poll(() => declared()?.cols ?? 0, { message: "回すと申告の列が増える" }).toBeGreaterThan(portraitUnfit.cols);
  await expect.poll(declaresArea, { message: "横長：申告は表示領域いっぱいの大きさ" }).toMatch(SIZE);
  const landscapeUnfit = declared()!;
  expect(landscapeUnfit.rows).toBeLessThan(portraitUnfit.rows);
  await syncViaEcho("landscape-unfit");
  expect(client.paneSize(p1), "fit していないモバイルの申告は PTY を変えない（D13・D106）").toEqual(initial);

  // (2) 「この端末に合わせる」：PTY が横長の表示領域いっぱいの大きさになる。
  const fitButton = page.locator(".mobile-shell-fit-btn");
  await fitButton.click();
  await expect(fitButton).toHaveAttribute("aria-pressed", "true");
  /** ブラウザの申告にサーバの p1 がそろい、それが表示領域いっぱいの大きさなら "COLSxROWS"。 */
  const settled = async (): Promise<string> => {
    const area = await declaresArea();
    const server = client.paneSize(p1)!;
    return area === fmt(server) ? area : JSON.stringify({ area, server });
  };
  await expect.poll(settled, { message: "fit：PTY が横長の表示領域いっぱいの大きさになる" }).toBe(fmt(landscapeUnfit));

  // 追加キーの列を開く（表示領域が縦に縮む）：PTY の行が減る。
  await page.locator(".mobile-shell-keyboard-btn").click();
  await expect(page.locator(".extra-keys")).toBeVisible();
  await expect.poll(() => client.paneSize(p1)!.rows, { message: "追加キーの列を開くと PTY の行が減る" }).toBeLessThan(landscapeUnfit.rows);
  await expect.poll(settled).toMatch(SIZE);
  const withKeys = client.paneSize(p1)!;
  expect(withKeys.cols).toBe(landscapeUnfit.cols);

  // 縦長へ戻す：PTY の列が減り、行が増える。
  await page.setViewportSize({ width: 390, height: 664 });
  await expect.poll(() => client.paneSize(p1)!.cols, { message: "縦長へ戻すと PTY の列が減る" }).toBeLessThan(withKeys.cols);
  await expect.poll(settled).toMatch(SIZE);
  const portraitFit = client.paneSize(p1)!;
  expect(portraitFit.rows).toBeGreaterThan(withKeys.rows);
  expect(portraitFit.cols).toBe(portraitUnfit.cols);

  // 落ち着いた後は送り続けない（申告 → PTY の大きさ → 縮小の枠 → 申告 … の循環が無い。D107 の実測では 53 → 51 列まで縮んだ）。
  const count = views.count();
  await page.waitForTimeout(1000);
  expect(views.count()).toBe(count);
  expect(client.paneSize(p1)).toEqual(portraitFit);
});

/**
 * D108 の独立点検 #1：ピンチで拡大しても、fit 中の PTY の大きさは変わらない。`visualViewport.height` は拡大率の分だけ縮む
 * （2 倍なら半分）ので、以前は拡大のたびに表示領域が縮み、申告 → PTY の行が減って SIGWINCH を送っていた（このエミュレーションで
 * 53×41 → 1.5 倍で 53×26 → 2 倍で 53×18）。`useVisualViewportHeight` が拡大率を掛け戻すので、拡大しても表示領域は変わらない。
 * 拡大は CDP の `Emulation.setPageScaleFactor`（`visualViewport.scale` が変わる。ピンチの合成 `Input.synthesizePinchGesture` は
 * この環境では拡大しなかった）。
 */
test("ピンチで拡大しても、fit 中の PTY の大きさは変わらず client.view も送らない（D108）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const client = await appServer.openClient("mobile"); // 見るだけ
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const views = await watchClientViews(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  const fitButton = page.locator(".mobile-shell-fit-btn");
  await fitButton.click();
  await expect(fitButton).toHaveAttribute("aria-pressed", "true");
  const settled = async (): Promise<string> => {
    const shown = views.latest()?.visible.find((v) => v.paneId === p1);
    const server = client.paneSize(p1);
    const geometry = await paneAreaGeometry(page, p1);
    return shown && server && fmt(shown) === fmt(server) && fitsArea(server, geometry) ? fmt(server) : JSON.stringify({ shown, server, geometry });
  };
  await expect.poll(settled).toMatch(SIZE);
  const unzoomed = client.paneSize(p1)!;
  const count = views.count();

  const cdp = await page.context().newCDPSession(page);
  for (const scale of [1.5, 2, 1]) {
    await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: scale });
    await expect.poll(() => page.evaluate(() => window.visualViewport?.scale)).toBe(scale);
    await page.waitForTimeout(1000); // 表示領域の変化の間引き（100ms）より十分に長く待つ
    expect.soft(views.count(), `拡大率 ${scale}：client.view を送らない`).toBe(count);
    expect(client.paneSize(p1), `拡大率 ${scale}：PTY の大きさは変わらない`).toEqual(unzoomed);
  }
});

/**
 * M6 のタッチ端末での扱い（D110）：リンクは Ctrl（macOS は Cmd）を押しながらのクリックで開く。タッチのタップには修飾キーが無いので
 * 開かない（以前は修飾キーを見ず、タップでも新しいタブに開いた）。モバイルでリンクを開く別の手段は用意していない（docs「既知の制約」）。
 */
test("タッチのタップでは、出力の中の URL を開かない（M6。修飾キーが無い。D110）", async ({ page, context, appServer }) => {
  const client = await appServer.openClient("mobile");
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);

  // 開く先はテストのサーバ。画面を消して 1 行目に URL だけを出す。
  const url = `${appServer.origin}/soda-e2e-touch-link`;
  await typeLine(page, `printf '\\e[H\\e[2J%s\\n' ${url}`);
  await client.waitForOutput(p1, `\x1b[2J${url}`); // printf の出力（打った行のエコーには ESC が無い）

  // 描画面は縮小の枠の中にあるが、boundingBox は縮小後の大きさなので、PTY の大きさで割ればそのまま文字の位置になる。
  const box = (await page.locator(".xterm-screen").first().boundingBox())!;
  const size = client.paneSize(p1)!;
  const at = { x: box.x + (5.5 * box.width) / size.cols, y: box.y + (0.5 * box.height) / size.rows };
  const away = { x: at.x, y: box.y + (10.5 * box.height) / size.rows };
  // 押す前に、ブラウザが URL を描いて、押す位置をリンクと判定していることを画面で確かめる（独立点検 #5：以前は固定の 500ms の
  // 待ちで、遅い CI では描く前に押して、修正前の（タップでも開いた）版でも開かずに通りえた）。修飾キーを押したままポインタを重ねると
  // 指のカーソルが出る（修正前の版は修飾キーに関わらず出る）。macOS と判定される環境もあるので Ctrl と Meta の両方を押す。
  // xterm.js はリンクの判定を行ごとに覚え、同じ行の中では出力が変わっても判定し直さない（端末を押したときの行に、URL の無い頃の
  // 判定が残る）ので、別の行から重ね、確かめた後も別の行へ外す（タップの位置で判定し直させる）。
  await page.mouse.move(away.x, away.y);
  await page.keyboard.down("Control");
  await page.keyboard.down("Meta");
  await page.mouse.move(at.x, at.y);
  await expect(page.locator(".xterm-screen.xterm-cursor-pointer")).toHaveCount(1);
  await page.keyboard.up("Meta");
  await page.keyboard.up("Control");
  await page.mouse.move(away.x, away.y);
  await expect(page.locator(".xterm-screen.xterm-cursor-pointer")).toHaveCount(0);
  const opened = context.waitForEvent("page", { timeout: 1500 }).then(
    async (p) => {
      await p.close();
      return `opened: ${p.url()}`;
    },
    () => "none",
  );
  await page.touchscreen.tap(at.x, at.y);
  expect(await opened).toBe("none");
});
