import type { Page } from "@playwright/test";

/**
 * ブラウザが何をどう表示しているかを、ブラウザ側で確かめるためのテスト専用の道具（05-e2e-docs T13・decisions.md D104）。
 *
 * テスト自身の WebSocket クライアント（`SodaTestClient`）にイベントが届いても、**ブラウザがそれを反映したとは限らない**
 * （別の接続で、ブラウザのほうが遅れうる。CPU の混んだマシンでは特に）。ブラウザが持つ状態に依存する操作——巡回
 * （`prefix+Tab`。`ActionDispatcher.cyclePane` はブラウザが持つレイアウトの並びで次の pane を決める）・新しい pane へ
 * 切り替わった後の端末のクリック・goto の一覧（今の pane の行から選び始める）等——の前には、ブラウザ側に反映されたことを
 * ブラウザから確かめてから操作する。製品の DOM には pane の id が出ていないので、次の 2 つを使う：
 *
 * 1. `watchShownPanes`：ブラウザ自身が送る `client.view`（表示中の pane の id。`PaneLayout.vue` が描いた後に
 *    `ViewSync.commit` が送る）を CDP で読む。pane の id そのものなので、**その pane を描いたか**の確かな印になる。
 *    新しい workspace・分割で「表示が新しい pane へ切り替わった」ことは「新しい pane が含まれる」で待つ——新しい pane は
 *    表示を切り替える（`view.setView`・モバイルの `view.focusPane`）まで描かれず、切り替えは新しい pane を作る要求の応答の
 *    中で、焦点の移動と入力の関所の解放（D99 の `InputGate`）と一緒に行うので、これを見てから触れば、クリックも打った文字も
 *    新しい pane へ届く。「新しい pane だけ」では待たない形で書いた（D104 の時点では、表示から外れた pane が 1×1 のまま
 *    `client.view` に残る製品の不具合があった。D105 で直し、`mobile.spec.ts` の回帰テストが「隠れた pane を載せない」ことを
 *    `watchClientView` で確かめる）。
 * 2. `markFocusedPane`・`shownPanes`：xterm.js の要素（`.terminal-pane-mount` の子）にテストが印（`data-e2e-pane`）を付け、
 *    DOM の順（`PaneLayout.vue` は分割の a → b の順に描くので、レイアウト木の深さ優先の順＝巡回の順）で読む。`client.view`
 *    の並びは DOM の順ではないので、**並び**はこちらで見る。`TerminalRegistry` は pane ごとの要素を使い回し、レイアウトが
 *    変わると同じ要素を新しい位置へ付け直すので、印は pane について回る。要素が作り直される（モバイルの LRU の追い出し・
 *    製品の変更）と印は消える——**全部に印の付いた並び（`[p1,p3,p2]` 等）を待つ形なら、消えれば一致しなくなって時間切れで
 *    落ちる（誤って通らない）が、「印の無い pane」を待つ形は作り直された古い pane でも通ってしまう**ので、その目的には
 *    使わず 1. を使う。
 */
const MARK = "data-e2e-pane";
const PANE_ELEMENT = ".terminal-pane-mount > *";

/** ブラウザが送った `client.view` の中身（表示中の pane と、ブラウザが測った大きさ）。 */
export interface ShownView {
  workspaceId: string;
  tabId: string;
  visible: { paneId: string; cols: number; rows: number }[];
}

/**
 * ブラウザが最後に送った `client.view` の中身を返す関数を作る（まだ送っていなければ `null`）。
 * **`page.goto()` の前に `await` して呼ぶ**（CDP の `Network.enable` より前に送られたフレームは見えない。最初の `client.view` を取りこぼす）。
 */
export async function watchClientView(page: Page): Promise<() => ShownView | null> {
  const views = await watchClientViews(page);
  return views.latest;
}

/**
 * `watchClientView` と同じく、ブラウザが送った `client.view` を見る。最後の中身に加えて、送った回数も返す（D107：表示領域の
 * 大きさの変化に追従して送り直すこと・落ち着いた後に送り続けない——大きさの循環が無い——ことを確かめる）。
 * **`page.goto()` の前に `await` して呼ぶ**。
 */
export async function watchClientViews(page: Page): Promise<{ latest: () => ShownView | null; count: () => number }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  let latest: ShownView | null = null;
  let count = 0;
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return; // テキストのフレーム（JSON の要求）だけ。INPUT 等のバイナリは見ない
    try {
      const msg = JSON.parse(e.response.payloadData) as { method?: string; params?: ShownView };
      if (msg.method === "client.view" && msg.params?.visible) {
        latest = msg.params;
        count++;
      }
    } catch {
      // JSON でないテキストは無い想定だが、あっても無視する。
    }
  });
  return { latest: () => latest, count: () => count };
}

/**
 * ブラウザが送った `pane.subscribe` の中身（pane と、SNAPSHOT に求めた scrollback の行数）を送った順に返す関数を作る
 * （20260921-herdr-settings-gaps の AC9・AC11）。**xterm の buffer は DOM に出ていない**ので、ブラウザが実際に求めた行数を
 * ブラウザの側（CDP の `Network.webSocketFrameSent`）で読む——テスト自身の WebSocket クライアントではない。
 * **最初の pane の購読から見たいなら `page.goto()` の前に `await` して呼ぶ**。後から呼んでも、それ以降に送られた
 * フレームは見える（既に張られた接続の新しい購読も届く。settings.spec.ts で確かめた）が、それより前の購読は見えない。
 */
export async function watchPaneSubscribes(page: Page): Promise<() => { paneId: string; scrollbackLines: number }[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const sent: { paneId: string; scrollbackLines: number }[] = [];
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 1) return; // テキストのフレーム（JSON の要求）だけ
    try {
      const msg = JSON.parse(e.response.payloadData) as { method?: string; params?: { paneId: string; scrollbackLines: number } };
      if (msg.method === "pane.subscribe" && msg.params) sent.push({ paneId: msg.params.paneId, scrollbackLines: msg.params.scrollbackLines });
    } catch {
      // JSON でないテキストは無い想定だが、あっても無視する。
    }
  });
  return () => [...sent];
}

/**
 * ブラウザが最後に送った `client.view` の、表示中の pane の id を返す関数を作る（まだ送っていなければ空）。
 * **`page.goto()` の前に `await` して呼ぶ**（`watchClientView` と同じ）。`expect.poll(shown).toContain(paneId)` のように待つ。
 */
export async function watchShownPanes(page: Page): Promise<() => string[]> {
  const view = await watchClientView(page);
  return () => view()?.visible.map((v) => v.paneId) ?? [];
}

/**
 * 焦点のある pane（`document.activeElement`＝xterm.js の textarea を含む要素）に pane の id の印を付ける。
 * その pane へ打った文字が届いたことを確かめた直後に呼ぶ（焦点がその pane にあることの証拠）。
 */
export async function markFocusedPane(page: Page, paneId: string): Promise<void> {
  await page.evaluate(
    ([attr, selector, id]) => {
      const el = document.activeElement?.closest(selector);
      if (!el) throw new Error(`焦点のある pane が無い（activeElement: ${document.activeElement?.className ?? "none"}）`);
      el.setAttribute(attr, id);
    },
    [MARK, PANE_ELEMENT, paneId] as const,
  );
}

/** 画面に出ている pane を DOM の順（＝深さ優先の順）に、付けた印で返す（印の無い pane は `"?"`）。`expect.poll` で待つ。 */
export async function shownPanes(page: Page): Promise<string[]> {
  return page.locator(PANE_ELEMENT).evaluateAll((els, attr) => els.map((el) => el.getAttribute(attr) ?? "?"), MARK);
}

/**
 * 焦点のある pane が、画面の pane のうち DOM の順で何番目か（0 始まり。焦点が端末に無ければ -1）。印を使わないので、
 * 要素が作り直されても誤らない。分割の直後に「新しい pane（右・下の分割なら DOM の順で元の pane の次）へ焦点が移った」
 * ——すなわちブラウザが分割の応答を処理し、入力の関所も解放した（`ActionDispatcher.splitPane`）——ことを待つのに使う。
 */
export async function focusedPaneIndex(page: Page): Promise<number> {
  return page.evaluate((selector) => {
    const el = document.activeElement?.closest(selector);
    return el ? Array.from(document.querySelectorAll(selector)).indexOf(el) : -1;
  }, PANE_ELEMENT);
}
