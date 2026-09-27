import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures.js";
import { routeRecordingWebSocket, type RecordingWebSocketRoute } from "../support/frames.js";

/**
 * AC10 の E2E（05-e2e-docs T8）。design「受け入れ基準との対応」：
 * 「/ws の upgrade で Cookie と Origin を検証し、HTTP の API も Cookie を要求する（/api/login だけ例外）」。
 * Cookie 無し・token 誤りは実物のブラウザ（`LoginView.vue`）でのユーザーから見える結果まで確かめる
 * （401/403 そのものは `packages/server` の integration test で既に厳密に確認済み——
 * `HttpServer.integration.test.ts`・`WsGateway.integration.test.ts`。ここでは「拒否されたときログイン画面が
 * 出て、勝手には繋がらない」という利用者から見た結果を確かめる）。Origin 不一致は、許可された名前で開いたページの
 * 同一オリジンナビゲーションでは再現できない（ブラウザは常に自分が開いているページの Origin を正しく送る）
 * ため、実物のサーバへの生の fetch でも確認する（他の2つと対称に「拒否されること」を確かめる。画面での表示は下の D105）。
 *
 * D105：ログイン画面は失敗を理由ごとに示す（以前は全て「ログインできませんでした」で、Origin の不一致（403）の利用者が
 * token の誤りと思い込み `soda token reset` へ進んでいた）。403・429 は実物のサーバの振る舞いで確かめる——403 は
 * サーバの許可リストに無い名前でページを開く（Chromium の `--host-resolver-rules` で `soda-e2e.test` を 127.0.0.1 へ
 * 向ける。ブラウザは自分が開いているページの Origin を正しく送るので、利用者が LAN の名前・転送したポートで開いたときと
 * 同じ形になる）、429 は誤った token を 5 回送ってからブラウザで正しい token を送る。soda 自身は付けない `Retry-After` と
 * 通信の失敗は `page.route` で作る。
 */

// `soda-e2e.test` を 127.0.0.1 へ向ける（上の 403 の確かめ用。他の test は 127.0.0.1 で開くので影響しない）。launch の引数は
// ワーカー単位なので、describe ではなくファイルの先頭で指定する。
const FOREIGN_HOST = "soda-e2e.test";
test.use({ launchOptions: { args: [`--host-resolver-rules=MAP ${FOREIGN_HOST} 127.0.0.1`] } });

/** 次の `POST /api/login` の応答（ブラウザが受けたもの）を待つ。 */
function nextLoginResponse(page: Page) {
  return page.waitForResponse((res) => new URL(res.url()).pathname === "/api/login" && res.request().method() === "POST");
}

test("token が誤っているとログインできず、ログイン画面のまま「token が違います」と表示される", async ({ page, appServer }) => {
  const loginResponse = nextLoginResponse(page);
  await page.goto(`${appServer.origin}/#token=wrong-token-${Date.now()}`);
  expect((await loginResponse).status()).toBe(401);
  await expect(page.locator(".login-view-error")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".login-view-error")).toContainText("token が違います");
  await expect(page.locator(".login-view-error-command")).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(0); // 端末へは繋がっていない
});

test("Cookie（token）無しではログイン画面のままで、pane は表示されない", async ({ page, appServer }) => {
  await page.goto(appServer.origin); // #token= を付けない＝Cookie も無い最初の訪問
  await expect(page.locator(".login-view")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(0);
});

test("Origin が一致しない login は 403 で拒否される", async ({ appServer }) => {
  const res = await fetch(`${appServer.origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://evil.example", host: new URL(appServer.origin).host },
    body: JSON.stringify({ token: appServer.token }),
  });
  expect(res.status).toBe(403);
});

test("サーバが許可していないアドレスで開くと、403 の理由と `--origin <そのページの Origin>` を示し、token は入力欄に残る（D105）", async ({ page, appServer }) => {
  const foreignOrigin = `http://${FOREIGN_HOST}:${new URL(appServer.origin).port}`;
  const loginResponse = nextLoginResponse(page);
  await page.goto(`${foreignOrigin}/#token=${appServer.token}`); // token は正しい——拒否の理由は Origin だけ
  expect((await loginResponse).status()).toBe(403); // 実物のサーバの Origin／Host の検査
  const alert = page.locator(".login-view-error");
  await expect(alert).toContainText(`このページのアドレス（${foreignOrigin}）`);
  // 403 の時点ではサーバは token をまだ確かめていない（429 → 403 → 400 → 401 の順）——正誤を言わず、作り直しも勧めない。
  await expect(alert).toContainText("この拒否は token とは関係ありません（token はまだ確かめていません）");
  await expect(alert).not.toContainText("token が違います");
  await expect(alert).not.toContainText("token reset");
  await expect(page.locator(".login-view-error-command")).toHaveText(`--origin ${foreignOrigin}`);
  // `#token=` は URL から消したが、token は入力欄に残っている（押し直せる）。
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.locator(".login-view input")).toHaveValue(appServer.token);
  await expect(page.locator(".login-view button[type=submit]")).toBeEnabled();
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(0);
});

test("ログインの失敗が続いたら（429）、正しい token でも入れないことと待つことを示す（D105。実物のサーバの制限）", async ({ page, appServer }) => {
  // 誤った token を 5 回（接続元の IP ごとに 1 分に 5 回まで。`LoginRateLimiter`）。ブラウザも同じ 127.0.0.1 から送る。
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${appServer.origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appServer.origin },
      body: JSON.stringify({ token: `wrong-token-${i}` }),
    });
    expect(res.status).toBe(401);
  }
  const loginResponse = nextLoginResponse(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  expect((await loginResponse).status()).toBe(429);
  const alert = page.locator(".login-view-error");
  await expect(alert).toContainText("ログインの失敗が続いた");
  await expect(alert).toContainText("正しい token でも入れません");
  await expect(alert).toContainText("1 分ほど待って");
  await expect(alert).toContainText("1 時間に 20 回に達したときは");
  await expect(alert).not.toContainText("token が違います");
  await expect(page.locator(".login-view input")).toHaveValue(appServer.token);
});

test("429 に Retry-After があれば、その時間を示す（soda 自身は付けない——前段のプロキシ等の場合。page.route で作る。D105）", async ({ page, appServer }) => {
  await page.route("**/api/login", (route) => route.fulfill({ status: 429, headers: { "retry-after": "30" } }));
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".login-view-error")).toContainText("30 秒ほど待って");
});

test("ログインの要求がサーバに届かなければ、サーバに接続できないと示す（D105。page.route で通信を失敗させる）", async ({ page, appServer }) => {
  await page.route("**/api/login", (route) => route.abort("connectionrefused"));
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".login-view-error")).toContainText("サーバに接続できません");
  await expect(page.locator(".login-view input")).toHaveValue(appServer.token);
});

test("ログインできた後、/ws がつながるまでは「接続中…」を出して入力を止め、つながったらアプリの画面へ替わる（D105。サーバの起動の途中の 503 の代わりに page.routeWebSocket で最初の接続を止める）", async ({ page, appServer }) => {
  // 最初の `/ws` は hello に答えないまま 3 秒後に閉じる（ブラウザから見て、つながらない間）。2 回目からは実物のサーバへ通す。
  let attempts = 0;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    attempts++;
    if (attempts === 1) {
      setTimeout(() => ws.close(), 3000);
      return;
    }
    ws.connectToServer();
  });
  const loginResponse = nextLoginResponse(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  expect((await loginResponse).status()).toBe(204);
  const status = page.locator(".login-view-status");
  await expect(status).toContainText("接続中…");
  await expect(page.locator(".login-view input")).toBeDisabled();
  await expect(page.locator(".login-view button[type=submit]")).toBeDisabled();
  await expect(page.locator(".login-view-error")).toHaveCount(0);
  // 閉じられた後は繋ぎ直し（1 秒後）、2 回目で実物のサーバにつながってアプリの画面へ替わる。
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".login-view")).toHaveCount(0);
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test("ログインできた後の接続の確認で認証を求められたら、「接続中…」のまま止めず、入力できる状態に戻して理由を示す（D105。page.route で /api/session を 401 にする）", async ({ page, appServer }) => {
  await page.route("**/api/session", (route) => route.fulfill({ status: 401 }));
  const loginResponse = nextLoginResponse(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  expect((await loginResponse).status()).toBe(204); // ログインそのものは実物のサーバで通る
  await expect(page.locator(".login-view-error")).toContainText("ログインはできましたが");
  await expect(page.locator(".login-view-status")).toHaveCount(0);
  await expect(page.locator(".login-view input")).toBeEnabled();
  await expect(page.locator(".login-view input")).toHaveValue(appServer.token);
  await expect(page.locator(".login-view button[type=submit]")).toBeEnabled();
});

/**
 * D107：Cookie は有効だが、このページのアドレスをサーバが許可していない（`--origin` を付けずに起動し直した・転送した名前で開いた）と、
 * サーバは `/api/session` も 403 で断る（サーバの D106）。以前の Web は 401 以外を「繋ぎ直す」と扱い、「再接続中…」（ログインの直後なら
 * ログイン画面の「接続中…」）のまま理由を示さず繋ぎ直し続けた。
 * ただし `/api/session` は Host で、`/ws` は Origin で許すかを見る。前段のプロキシが Host を許可外の名前に書き換え、`--origin` は正しい
 * 構成（D106 の残る制約）では、`/api/session` が 403 でも `/ws` はつながる——Web は 403 でも `/ws` を 1 回だけ試し、それも開く前に
 * 閉じたときだけ理由を示して止まる（独立点検 #2。T33 の最初の版は 403 だけで止まり、`--origin` が既にあるのにそれを足すよう示した）。
 * 逆に、Host を許可内の名前で渡すプロキシの下でページの Origin が許可されていないと、`/api/session` は 204 なのに `/ws` だけが
 * 403 になる——開く前に閉じる試みが続いたら「再接続中…」に手がかりを添える（独立点検 #1）。
 * 実物のサーバで「Cookie は有効・宛先だけ許可外」を作るには、許可された名前でログインした後にサーバの許可を変える必要がある
 * （Cookie はホストに結び付くので、別の名前で開き直すと Cookie が無い）。ここでは `page.route` で `/api/session` を、実物の
 * サーバが 204（Cookie が有効）を返すときだけ 403 にし（Cookie が無効なら実物の 401 のまま——サーバは Cookie を先に確かめる。
 * D106）、`/ws` の拒否は、中継（`page.routeWebSocket`）がサーバへつながずに閉じて作る——ページの WebSocket は開く前に閉じる
 * （実物の upgrade の 403 と同じく、ブラウザからは状態コードが見えない）。
 */
async function rejectSessionCheck(page: Page): Promise<() => number> {
  let sessionChecks = 0;
  await page.route("**/api/session", async (route) => {
    sessionChecks++;
    let real;
    try {
      real = await route.fetch();
    } catch {
      // test の後始末でサーバを止めた後にも、ページは繋ぎ直しの確認を送る——通信の失敗として返す。
      return route.abort("connectionrefused").catch(() => undefined);
    }
    if (real.status() === 204) return route.fulfill({ status: 403 });
    return route.fulfill({ response: real });
  });
  return () => sessionChecks;
}

/** `/api/session` を 403 にし、`/ws` の試みもつながずに閉じる（宛先が許可外：`/api/session` も `/ws` も断られる）。 */
async function rejectConnections(page: Page, ws: RecordingWebSocketRoute): Promise<() => number> {
  const sessionChecks = await rejectSessionCheck(page);
  ws.refuseNext(Number.POSITIVE_INFINITY);
  return sessionChecks;
}

/** サーバが `--origin` を付けて起動し直された（許可された）ことにする。 */
async function acceptConnections(page: Page, ws: RecordingWebSocketRoute): Promise<void> {
  await page.unroute("**/api/session");
  ws.refuseNext(0);
}

async function expectRejectedPanel(page: Page, origin: string): Promise<void> {
  await expect(page.locator(".reconnect-overlay-panel")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".reconnect-overlay-text")).toContainText(`このページのアドレス（${origin}）からの接続を、サーバが許可していません`);
  await expect(page.locator(".reconnect-overlay-text")).toContainText("token を作り直す必要はありません");
  await expect(page.locator(".reconnect-overlay-command")).toHaveText(`--origin ${origin}`);
  await expect(page.locator(".reconnect-overlay")).not.toContainText("再接続中");
  await expect(page.locator(".login-view")).toHaveCount(0);
}

test("ログインできた後の接続の確認が 403 で、/ws も断られたら、「接続中…」のまま止めず、理由と `--origin` を示して再試行を待つ（D107）", async ({ page, appServer }) => {
  const ws = await routeRecordingWebSocket(page);
  const sessionChecks = await rejectConnections(page, ws);
  const loginResponse = nextLoginResponse(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  expect((await loginResponse).status()).toBe(204); // ログインそのものは実物のサーバで通る
  await expectRejectedPanel(page, appServer.origin);
  expect(ws.refusedCount()).toBe(1); // 403 でも /ws を 1 回だけ試した

  // 黙って繋ぎ直し続けない（/api/session も /ws も、もう試みない）。
  const checks = sessionChecks();
  await page.waitForTimeout(3000);
  expect(sessionChecks()).toBe(checks);
  expect(ws.refusedCount()).toBe(1);
  expect(ws.frames.connectionCount()).toBe(0);

  // `--origin` を付けてサーバを起動し直した後に「再試行」を押すと繋がる。
  await acceptConnections(page, ws);
  await page.locator(".reconnect-overlay-retry").click();
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".reconnect-overlay")).toHaveCount(0);
});

test("接続の確認が 403 でも /ws が通れば（Host を書き換える前段のプロキシ・--origin は正しい）、止めずに繋ぎ、切断の後も繋ぎ直す（D107・独立点検 #2）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  await client.request("pane.subscribe", { paneId: p1, scrollbackLines: 200 });
  const ws = await routeRecordingWebSocket(page);
  const sessionChecks = await rejectSessionCheck(page); // `/ws` は実物のサーバへ通す
  const loginResponse = nextLoginResponse(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  expect((await loginResponse).status()).toBe(204);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".reconnect-overlay")).toHaveCount(0);
  await expect(page.locator(".login-view")).toHaveCount(0);
  expect(sessionChecks()).toBeGreaterThanOrEqual(1); // 確かめたうえで 403 だった

  // 切断されても、確認の 403 の後に /ws を試して繋ぎ直す（止まらない）。
  await ws.drop(0);
  await expect(page.locator(".reconnect-overlay")).toBeVisible();
  await expect(page.locator(".reconnect-overlay")).toHaveCount(0, { timeout: 15_000 });
  expect(ws.frames.connectionCount()).toBe(2);
  await expect(page.locator(".reconnect-overlay-panel")).toHaveCount(0);
  await expect.poll(() => ws.frames.snapshots(1, p1).length, { timeout: 10_000 }).toBeGreaterThan(0);
});

test("表示中に切断され、繋ぎ直しの確認が 403 で /ws も断られたら、「再接続中…」のまま繰り返さず理由を示し、再試行で繋ぎ直す（D107）", async ({ page, appServer }) => {
  const client = await appServer.openClient();
  const p1 = client.helloSnapshot()!.panes[0]!.id;
  const ws = await routeRecordingWebSocket(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });
  await expect(page.locator(".reconnect-overlay")).toHaveCount(0);

  // `--origin` を付けずにサーバが起動し直された（Cookie は有効なまま、このアドレスは許可外）。
  const sessionChecks = await rejectConnections(page, ws);
  await ws.drop(0);
  await expectRejectedPanel(page, appServer.origin);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(1); // 端末は出たまま（scrollback は読める）
  expect(ws.refusedCount()).toBe(1); // 403 の後に 1 回だけ /ws を試した

  const checks = sessionChecks();
  await page.waitForTimeout(3000);
  expect(sessionChecks()).toBe(checks);
  expect(ws.refusedCount()).toBe(1);

  await acceptConnections(page, ws);
  await page.locator(".reconnect-overlay-retry").click();
  await expect(page.locator(".reconnect-overlay")).toHaveCount(0, { timeout: 15_000 });
  expect(ws.frames.connectionCount()).toBe(2);
  // 繋ぎ直した後は、表示中の pane の画面もまた届く（D107 の (a)）。
  await expect.poll(() => ws.frames.snapshots(1, p1).length, { timeout: 10_000 }).toBeGreaterThan(0);
});

test("/api/session は通るのに /ws だけが開く前に閉じ続けたら、「再接続中…」に Origin の拒否かもしれないことと `--origin` を添え、繋ぎ直しは続ける（D107・独立点検 #1）", async ({ page, appServer }) => {
  test.setTimeout(60_000);
  const ws = await routeRecordingWebSocket(page);
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea", { timeout: 15_000 });

  // Host を許可内の名前で渡すプロキシの下で、`--origin` を付けずにサーバが起動し直された：`/api/session` は実物の 204、
  // `/ws` だけが断られる。
  ws.refuseNext(Number.POSITIVE_INFINITY);
  await ws.drop(0);
  const overlay = page.locator(".reconnect-overlay");
  await expect(overlay).toContainText("再接続中");
  const hint = page.locator(".reconnect-overlay-hint");
  // 3 回続いたら（1・2・4 秒の間隔の後）出す。1・2 回目は起動の途中（`/ws` の 503）でも起きるので出さない。
  await expect(hint).toBeVisible({ timeout: 20_000 });
  expect(ws.refusedCount()).toBe(3);
  await expect(hint).toContainText(`このページのアドレス（${appServer.origin}）を拒否しているかもしれません`);
  await expect(page.locator(".reconnect-overlay-hint .reconnect-overlay-command")).toHaveText(`--origin ${appServer.origin}`);
  await expect(overlay).toContainText("再接続中"); // 止まらない（rejected にしない）
  await expect(page.locator(".reconnect-overlay-retry")).toHaveCount(0);

  // 許可された後は、次の試みで繋がり、手がかりも消える。
  ws.refuseNext(0);
  await expect(overlay).toHaveCount(0, { timeout: 20_000 });
  expect(ws.frames.connectionCount()).toBe(2);
  ws.refuseNext(Number.POSITIVE_INFINITY);
  await ws.drop(1);
  await expect(overlay).toContainText("再接続中");
  await expect(hint).toHaveCount(0); // 開けたので数え直している
});
