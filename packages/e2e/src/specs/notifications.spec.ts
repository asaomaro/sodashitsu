import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { devices, type Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { focusTerminal, prefixKey, typeLine } from "../support/keys.js";
import type { SodaTestClient } from "../support/wsClient.js";

/**
 * 通知の E2E（20260920-agent-notifications の AC1・AC3・AC5・AC10・AC15・AC16・AC-I3）。
 *
 * **観測の代替について**（条項 `.aidev/conventions/e2e-observe-browser.md` の要求）:
 * **OS 通知が出たか・音が鳴ったかは DOM から見えない**（ブラウザは出した通知を列挙させてくれないし、
 * 音は画面に現れない）。そこで `page.addInitScript` で **`window.Notification` と `window.AudioContext` を
 * ページ内で差し替え、呼ばれた事実を DOM の要素として残す**——観測するのはその要素で、
 * **テスト自身の WebSocket クライアントではない**。`grantPermissions(["notifications"])` を使わないのは、
 * こちらなら「許可を取るまで出ない」「この環境では使えない」という**否定側**も同じ仕掛けで書けるため。
 *
 * **移動（`prefix+o` と OS 通知のクリック）の判定も DOM で行う**——`session.focus_changed` は
 * サーバ側の事実であって「利用者の画面が切り替わったか」ではない。**tab バーの選択状態**を見る
 * （`view.setView` がそれを書く唯一の経路なので、落とすとここで落ちる）。
 *
 * **`soda.prefs.v1` も同じ `addInitScript` で仕込む**——E2E に localStorage の事前設定の仕組みが無く、
 * 既定は OS 通知も音も「切」なので、仕込まないと経路が 1 つも通らない。
 *
 * **偽のエージェント**は `agent-detection.spec.ts` と同じ手法（`exec -a claude bash <script>` で
 * argv[0] を差し替え、実物のマニフェストに一致する画面を出す）。ただし**入力待ちになる時点を
 * テストから制御する**（ファイルの出現を待たせる）——`sleep` で固定すると「画面を整えるのが
 * 検知から配送までの 1 秒に間に合うか」の競走になり、負荷のかかった機械で間欠的に落ちる。
 */

interface ProbePrefs {
  notify: { toast: boolean; desktop: boolean; sound: boolean };
  notifyHintDone?: boolean;
}

const tempDirs: string[] = [];

test.afterEach(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

/** ページ内で `Notification` と `AudioContext` を差し替え、呼ばれた事実を DOM へ残す。 */
async function installNotifyProbe(page: Page, prefs: ProbePrefs, permission: "granted" | "denied" | "default" = "granted"): Promise<void> {
  await page.addInitScript(
    ([prefsJson, perm]) => {
      try {
        localStorage.setItem("soda.prefs.v1", prefsJson as string);
      } catch {
        // プライベートウィンドウ等。仕込めなければ既定のまま走る（そのテストは落ちる）。
      }

      const probe = (): HTMLElement => {
        let el = document.getElementById("e2e-notify-probe");
        if (!el) {
          el = document.createElement("div");
          el.id = "e2e-notify-probe";
          el.style.display = "none";
          (document.body ?? document.documentElement).appendChild(el);
        }
        return el;
      };

      class FakeNotification {
        static permission = perm as string;
        static requestPermission = (): Promise<string> => Promise.resolve(perm as string);
        onclick: (() => void) | null = null;
        onclose: (() => void) | null = null;
        node: HTMLElement;
        constructor(title: string, options?: { body?: string; tag?: string }) {
          const tag = options?.tag ?? "";
          // **実物は同じ `tag` の通知を置き換える**。模さないと、置き換えの回数が DOM の件数に出てしまう。
          if (tag) probe().querySelector(`.e2e-notification[data-tag="${tag}"]`)?.remove();
          const node = document.createElement("div");
          node.className = "e2e-notification";
          node.dataset["title"] = title;
          node.dataset["body"] = options?.body ?? "";
          node.dataset["tag"] = tag;
          // テストから「通知をクリックする」を起こすための口（実際の OS 通知は DOM に無い）。
          node.addEventListener("click", () => this.onclick?.());
          probe().appendChild(node);
          this.node = node;
        }
        close(): void {
          this.node.remove();
          this.onclose?.();
        }
      }
      (window as unknown as { Notification: unknown }).Notification = FakeNotification;

      class FakeAudioContext {
        // **実物は「まだ操作されていないページ」では `suspended` で始まる**（自動再生の制限）。
        // `running` で始まる偽物にすると、**解除の結線が無くても鳴っているように見え**、
        // 「読み込み直した直後は永久に鳴らない」という穴が E2E から隠れる（PR レビュー（人間）の指摘）。
        // ここが `suspended` なので、下の音の判定は `main.ts` の `pointerdown`/`keydown` →
        // `noteUserGesture()` → `resume()` が繋がっていて初めて通る（`openApp` が端末をクリックする）。
        state = "suspended";
        currentTime = 0;
        destination = {};
        resume(): Promise<void> {
          // **実物は「一度でも操作されたページ」でしか解除できない**（sticky activation）。
          // ただし**この環境では歯止めにならない**——Playwright の chromium は
          // **何も操作していない時点で既に `hasBeenActive=true`** を返す（実測。`test-result.md` の
          // 負の対照 D）。つまり E2E は「活性化したか」を見分けられない。実物に近い形で書いておくが、
          // **これが守りになっているとは考えないこと**。
          const ua = (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation;
          if (ua && !ua.hasBeenActive) return Promise.reject(new Error("not allowed without user activation"));
          this.state = "running";
          return Promise.resolve();
        }
        createOscillator(): unknown {
          return {
            type: "",
            frequency: {
              setValueAtTime: (hz: number) => {
                const node = document.createElement("div");
                node.className = "e2e-tone";
                node.dataset["hz"] = String(hz);
                probe().appendChild(node);
              },
            },
            connect: () => undefined,
            start: () => undefined,
            stop: () => undefined,
          };
        }
        createGain(): unknown {
          return { gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined }, connect: () => undefined };
        }
      }
      (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    },
    [JSON.stringify(prefs), permission] as const,
  );
}

/** `ManifestEngine.test.ts`「claude: Bash 承認プロンプト」と同じ画面（`bash_permission_prompt` に一致）。 */
const BLOCKED_SCREEN = [
  "────────────────────────────────────────────────────────────────",
  " Bash command",
  "",
  "   curl -sS -o /tmp/probe.html https://example.com",
  "   Download example.com to /tmp/probe.html",
  "",
  " This command requires approval",
  "",
  " Do you want to proceed?",
  " ❯ 1. Yes",
  "   2. Yes, and don't ask again for: curl *",
  "   3. No",
  "",
  " Esc to cancel · Tab to amend · ctrl+e to explain",
];

interface FakeAgent {
  /** 入力待ちの画面へ切り替え、実際に届くまで待つ。**いつ入力待ちにするかをテストが決める**。 */
  block(): Promise<void>;
}

/**
 * 偽のエージェントを起動し、**起動猶予が明けるまで待って**から戻る。
 * 入力待ちにするのは呼ぶ側の `block()`——`sleep` で固定すると競走になる。
 */
async function launchFakeAgent(page: Page, client: SodaTestClient, paneId: string, opts: { via?: "keyboard" | "client" } = {}): Promise<FakeAgent> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-notify-"));
  tempDirs.push(dir);
  const scriptPath = join(dir, "fake-claude.sh");
  const triggerPath = join(dir, "block-now");
  const readyMarker = `soda-e2e-ready-${paneId}`;
  const script = [
    "clear",
    `echo ${readyMarker}`,
    // **テストが合図するまで待つ**（`AgentTracker` の起動猶予 3 秒もこの間に明ける）。
    `while [ ! -f ${JSON.stringify(triggerPath)} ]; do sleep 0.2; done`,
    "clear",
    ...BLOCKED_SCREEN.map((line) => `printf '%s\\n' ${JSON.stringify(line)}`),
    "sleep 60", // 前面プロセスとして居座り続ける
  ].join("\n");
  await writeFile(scriptPath, script);

  const firstJudged = client.waitForEvent("pane.agent_status_changed", (e) => e.data.paneId === paneId);
  const command = `exec -a claude bash ${scriptPath}`;
  // **タッチの検証では `via: "client"`**——ブラウザのキーで打つと `keydown` が「操作」に数えられ、
  // タップだけで解除できるかという問いが成立しなくなる（テストが何も守らなくなる）。
  if (opts.via === "client") client.sendInput(paneId, `${command}\r`);
  else await typeLine(page, command);
  await client.waitForOutput(paneId, readyMarker);
  await firstJudged; // 猶予が明けて 500ms 周期の判定に入った

  return {
    block: async () => {
      await writeFile(triggerPath, "go");
      await client.waitForOutput(paneId, "Esc to cancel"); // 入力待ちの画面が実際に届いた
    },
  };
}

/** `document.hasFocus()` を false に固定する（合成の `blur` イベントでは変わらないので関数ごと差し替える）。 */
async function blurWindow(page: Page): Promise<void> {
  await page.evaluate(() => Object.defineProperty(document, "hasFocus", { value: () => false, configurable: true }));
}

/**
 * 新しい tab を作って移る。**移り終えたことをブラウザ側で確かめてから**戻る（競走にしない）。
 * tab が1個のときは tab バー自体が無い（`.tab-bar-item` の count は 0。20260922-appearance-settings-rest
 * の自動非表示・AC4）ので、その場合は実際の tab 数「1」として扱う（`Math.max(..., 1)`）——さもないと
 * 「0 → 1」を期待してしまい、実際に増える「1 → 2」と食い違う。
 */
async function openNewTab(page: Page): Promise<void> {
  const before = Math.max(await page.locator(".tab-bar-item").count(), 1);
  await prefixKey(page, "c");
  await page.keyboard.press("Enter"); // 名前は既定のまま
  await expect(page.locator(".tab-bar-item")).toHaveCount(before + 1);
  await expect(page.locator(".tab-bar-item").last(), "新しい tab が選択されている＝前の pane は画面から消えた").toHaveClass(/tab-bar-item-active/);
}

const ALL_ON: ProbePrefs = { notify: { toast: true, desktop: true, sound: true }, notifyHintDone: true };

async function openApp(page: Page, appServer: { origin: string; token: string }): Promise<void> {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await focusTerminal(page);
}

test("通知：入力待ちになると、トースト・OS 通知・音がそろって出る（AC1・AC3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await installNotifyProbe(page, ALL_ON);
  await openApp(page, appServer);

  // **表の (a)（3 経路とも出る行）を、入力待ちにする前に作っておく**——後から仕込むと
  // 「検知から配送までの 1 秒に間に合うか」の競走になる。
  await blurWindow(page);
  const agent = await launchFakeAgent(page, client, p1);
  await agent.block();

  // 判定は**ブラウザ側の DOM**で（トーストは画面、OS 通知と音は差し替えた偽物が残した要素）。
  await expect(page.locator(".toast", { hasText: "入力待ちです" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#e2e-notify-probe .e2e-notification")).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator("#e2e-notify-probe .e2e-notification").first()).toHaveAttribute("data-title", /入力待ち/);
  await expect(page.locator("#e2e-notify-probe .e2e-tone")).toHaveCount(2); // 2 音
});

// **否定の主張は、肯定の合図を待ってから測る**——待たずに `toHaveCount(0)` を測ると、
// 配送（検知の 1 秒後）より前に成立して**機能を壊しても通る**。
test("通知：見ている pane では何も出ない（AC3 の (c)）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await installNotifyProbe(page, ALL_ON);
  await openApp(page, appServer);

  // 見ている pane（p1）と、見ていない pane（p2・別 tab）の両方にエージェントを置く。
  const agent1 = await launchFakeAgent(page, client, p1);

  const p2Created = client.waitForEvent("pane.created");
  await openNewTab(page);
  const p2 = (await p2Created).data.pane.id;
  await client.request("pane.subscribe", { paneId: p2, scrollbackLines: 4000 });
  const agent2 = await launchFakeAgent(page, client, p2);

  // p1 の tab へ戻る＝p1 が見えていて、p2 は見えていない状態。
  await page.locator(".tab-bar-item").first().click();
  await expect(page.locator(".tab-bar-item").first()).toHaveClass(/tab-bar-item-active/);

  await agent1.block();
  await agent2.block();

  // **知らせが 1 件だけ出たこと**が、配送が走った証拠（肯定の合図）。これを待ってから否定を測る。
  // **ここが 2 件なら、見ている p1 の分まで出ている**＝表の (c) が効いていない。
  await expect(page.locator(".toast", { hasText: "入力待ちです" })).toHaveCount(1, { timeout: 20_000 });
  // ウィンドウにはフォーカスがあるので、表の (b)＝**OS 通知と音は出ない**（前面で重ねない作法）。
  await expect(page.locator("#e2e-notify-probe .e2e-notification"), "前面にいるので OS 通知は出さない").toHaveCount(0);
  await expect(page.locator("#e2e-notify-probe .e2e-tone"), "前面にいるので鳴らさない").toHaveCount(0);

  // **出た 1 件が p2 のものである**ことを、移動先の tab で確かめる（見ている p1 の分ではない）。
  await prefixKey(page, "o");
  await expect(page.locator(".tab-bar-item").last(), "知らせの対象は 2 つ目の tab の pane").toHaveClass(/tab-bar-item-active/);
  void p2;
});

test("通知：prefix+o で知らせの pane の tab へ移り、その 1 件が消える（AC10・AC-I3）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await installNotifyProbe(page, ALL_ON);
  await openApp(page, appServer);

  const agent = await launchFakeAgent(page, client, p1);
  // **別の tab** へ移る（分割だと p1 も画面に残るので表の (c) になり、何も出ない）。
  await openNewTab(page);
  await agent.block();
  await expect(page.locator(".toast", { hasText: "入力待ちです" })).toBeVisible({ timeout: 15_000 });

  // **キーだけ**で知らせの対象へ移る。判定は**ブラウザ側の tab バー**——
  // `view.setView` が選択中の tab を書く唯一の経路なので、落とすとここで落ちる。
  await expect(page.locator(".tab-bar-item").last(), "いまは 2 つ目の tab にいる").toHaveClass(/tab-bar-item-active/);
  await prefixKey(page, "o");
  await expect(page.locator(".tab-bar-item").first(), "知らせの pane の tab へ移った").toHaveClass(/tab-bar-item-active/);
  await expect(page.locator(".toast", { hasText: "入力待ちです" }), "移ったらその 1 件は消える").toHaveCount(0);

  // もう一度押すと、空である旨が出る（通知の設定とは無関係に必ず出る）。
  await prefixKey(page, "o");
  await expect(page.locator(".toast", { hasText: "未処理の知らせはありません" })).toBeVisible();
});

test("通知：OS 通知のクリックで、その 1 件の pane の tab へ移る（AC15）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await installNotifyProbe(page, ALL_ON);
  await openApp(page, appServer);

  // OS 通知はウィンドウにフォーカスが無いときだけ出る（前面にいるのに重ねないのが作法）。
  await blurWindow(page);
  const agent = await launchFakeAgent(page, client, p1);
  await openNewTab(page);
  await agent.block();
  await expect(page.locator("#e2e-notify-probe .e2e-notification")).toHaveCount(1, { timeout: 15_000 });

  await expect(page.locator(".tab-bar-item").last()).toHaveClass(/tab-bar-item-active/);
  await page.locator("#e2e-notify-probe .e2e-notification").first().dispatchEvent("click");
  await expect(page.locator(".tab-bar-item").first(), "クリックした通知の pane の tab へ移った").toHaveClass(/tab-bar-item-active/);
  await expect(page.locator(".toast", { hasText: "入力待ちです" })).toHaveCount(0);
  await expect(page.locator("#e2e-notify-probe .e2e-notification"), "OS 通知も一緒に閉じる").toHaveCount(0);
});

test("通知：案内は 1 度だけ出る（AC5）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  // **既定のまま**（OS 通知も音も切・案内はまだ）で始める——案内はこの状態の利用者のためにある。
  await installNotifyProbe(page, { notify: { toast: true, desktop: false, sound: false } }, "default");
  await openApp(page, appServer);

  const agent = await launchFakeAgent(page, client, p1);
  await agent.block();
  const hint = page.locator(".toast", { hasText: "OS の通知でも受け取れますか" });
  await expect(hint).toBeVisible({ timeout: 15_000 });

  // **フォーカスが何度戻っても増えない**（`sticky` なので自動では消えない）。
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(hint).toHaveCount(1);

  // ［あとで］を押すと消え、以後は出ない。
  await page.locator(".toast-action", { hasText: "あとで" }).click();
  await expect(hint).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(hint).toHaveCount(0);
});

// review ラウンド2：`text-overflow: ellipsis` は**幅を縛らないと効かない**（flex の子は
// min-content より縮まない）。効いていないと長い呼び名でトーストが横へ伸び、
// **［移動］と［×］が視界の外へ出て、知らせから移る手段が届かなくなる**。
// **CSS の効き目は実ブラウザでしか確かめられない**ので、ここで見る。
test("通知：呼び名が長くても、［移動］と［×］が画面の中に収まる（US4）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
  await installNotifyProbe(page, ALL_ON);
  await openApp(page, appServer);

  // pane に**とても長い名前**を付ける（実際には端末のタイトルにコマンド行がそのまま入って長くなる）。
  await client.request("pane.rename", { paneId: p1, label: "とても長い名前".repeat(20) });
  const agent = await launchFakeAgent(page, client, p1);
  await openNewTab(page);
  await agent.block();

  const toast = page.locator(".toast", { hasText: "入力待ちです" });
  await expect(toast).toBeVisible({ timeout: 15_000 });

  // **視界の中にあること**を実際の座標で確かめる（`toBeVisible` は要素の有無しか見ない）。
  const move = toast.locator(".toast-action", { hasText: "移動" });
  await expect(move).toBeInViewport();
  await expect(toast.locator(".toast-close")).toBeInViewport();

  // 押せば移れる（届いているだけでなく、機能する）。
  await move.click();
  await expect(page.locator(".tab-bar-item").first()).toHaveClass(/tab-bar-item-active/);
});

test("通知：prefix+s で設定を開き、キーだけで切り替えられる（AC16・AC-I3）", async ({ page, appServer }) => {
  await installNotifyProbe(page, { notify: { toast: true, desktop: false, sound: false }, notifyHintDone: true });
  await openApp(page, appServer);

  await prefixKey(page, "s");
  // 20260921-herdr-settings-gaps で通知だけのダイアログが、節に分かれた「設定」（`.settings-dialog`）に広がった。
  // 通知の切り替えは「通知」節にある。
  const dialog = page.locator(".settings-dialog");
  await expect(dialog).toBeVisible();
  const notify = dialog.locator('section[aria-labelledby="settings-notify"]');

  // 開いたら最初の切り替えへフォーカスが移り、Space で切り替わる（AC-I4・AC-I2）。
  const first = notify.locator('[role="switch"]').first();
  await expect(first).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-checked", "false");

  // Esc で閉じても、押した結果が残る（AC-I1）。
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await prefixKey(page, "s");
  await expect(notify.locator('[role="switch"]').first()).toHaveAttribute("aria-checked", "false");
});

/**
 * **タッチ端末**（`devices["iPhone 13"]` のエミュレーション。`mobile.spec.ts` と同じ流儀で
 * chromium に載せる）。**マウスのクリックもキーも使わない**——タップと、ブラウザの外から打ち込む
 * 偽エージェントだけで、知らせが届いて音が鳴るところまでを見る。
 * モバイルは OS 通知を出せない（research F79）ので、**音が唯一の経路**になる。
 *
 * **このテストは `main.ts` の `pointerup` の要否を確かめられない**。HTML 仕様ではタッチの
 * `pointerdown` は「操作」に数えられず `pointerup` が要る（D12）が、**この環境の chromium は
 * タップ前から `hasBeenActive=true` を返す**ので、`pointerup` を外しても通ってしまう
 * （負の対照 D で実測）。**タッチでの解除の確認は実機に残っている**（`test-result.md` の未検証の穴）。
 */
// **`defaultBrowserType` は describe の中では使えない**（worker を切り替えることになるため。
// Playwright がその場でそう言う）。この一式は既に chromium で走っているので、端末の条件だけを借りる。
const IPHONE_13 = { ...devices["iPhone 13"] };
delete (IPHONE_13 as { defaultBrowserType?: string }).defaultBrowserType;

test.describe("タッチ端末", () => {
  test.use(IPHONE_13);

  test("通知：タッチ端末でも知らせが届き、音が鳴る（AC13）", async ({ page, appServer }) => {
    const client = await appServer.openClient();
    const p1 = client.helloSnapshot()!.panes[0]!.id;
    await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 4000 });
    await installNotifyProbe(page, ALL_ON);

    // **`openApp` を使わない**（`focusTerminal` の `.click()` はマウスの押下なので、`pointerdown` で
    // 活性化してしまいタッチの経路を通らない）。
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

    const box = (await page.locator(".xterm-helper-textarea").first().boundingBox())!;
    await page.touchscreen.tap(box.x + 10, box.y + 10); // これがこのテストで唯一の「操作」

    await blurWindow(page);
    const agent = await launchFakeAgent(page, client, p1, { via: "client" });
    await agent.block();

    await expect(page.locator(".toast", { hasText: "入力待ちです" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#e2e-notify-probe .e2e-tone"), "タッチ端末でも音の経路が通る").toHaveCount(2, { timeout: 5000 });
  });
});
