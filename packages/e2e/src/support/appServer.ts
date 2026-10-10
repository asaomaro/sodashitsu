import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeServer, type ComposedServer, type ImageFetcher } from "@sodashitsu/server";
import WebSocket from "ws";
import { getFreePort } from "./freePort.js";
import { createTestClient, type SodaTestClient } from "./wsClient.js";

/**
 * 1 テストにつき 1 つの実サーバ（空きポート・専用の一時 state dir）を起動する（05-e2e-docs T1）。
 * `smoke.ts`（01・03-web-desktop T26）と同じ土台。テストどうしで状態を共有しないための判断
 * （AC9 の複数クライアントのテストだけは、1 つの `AppServer` に対して複数の WS 接続・ブラウザコンテキストを
 * 張ることで表現する——同一サーバへの複数接続は AC9 の検証そのものなので問題ない）。
 */
export interface AppServer {
  origin: string;
  /** ブラウザの自動ログイン用（`#token=` URL）。design「接続・ログイン・初回表示」。 */
  token: string;
  stateDir: string;
  /** HTTP の Cookie ベースでサーバへ直接リクエストするための login 済み cookie（AC10 のテスト等が使う）。 */
  cookie: string;
  /** API 越しにセッション状態を素早く作る／サーバのイベントを検証するための WS クライアント。 */
  openClient(kind?: "desktop" | "mobile"): Promise<SodaTestClient>;
  /**
   * `soda serve` を止めて再び起動する（AC18。05-e2e-docs T6）。`stateDir` は消さずに同じ場所を使い、
   * 同じポートで新しいプロセス相当（同じ Node プロセス内だが `ComposedServer` を作り直す）を立てる。
   * トークンは初回起動時に生成・永続化されたものを再起動後もそのまま使う（`composeServer` の
   * `freshToken` は「今回新しく作ったときだけ」立つフラグで、既存の state dir から起動し直した
   * 場合は立たない——実物の `soda serve` の「同じトークンで入り直せる」挙動と同じ。実地に確認して
   * 判明）。ログイン済みの Cookie はサーバプロセスごとの状態なので、再起動のたびに取り直す。
   * `appServer.cookie` を再起動後も素直に読めばよい。既存の WS 接続は（サーバを止めるので）全て切れる。
   */
  restart(): Promise<void>;
  close(): Promise<void>;
}

async function login(origin: string, token: string): Promise<string> {
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: new URL(origin).host },
    body: JSON.stringify({ token }),
  });
  if (res.status !== 204) throw new Error(`login failed: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("login did not set a cookie");
  return setCookie.split(";")[0]!;
}

/** 拡張（20261007-ext-host）の差し替えの口。`composeServer` の `internal.extensions` と同じ型（`timings` で起動し直しの間隔を縮める、など）。 */
export type ExtensionsInternal = NonNullable<NonNullable<Parameters<typeof composeServer>[1]>["extensions"]>;

/**
 * pane のシェルを、**利用者の rc を読まない bash**（`--norc --noprofile`）にする包み（20261010-e2e-fake-agent）。製品の既定（利用者のシェルは rc を読む）は変えず、
 * 試験の道具だけで差し替える。この機械の `~/.bashrc` は PATH の先頭へ `~/.local/bin`（実物の `claude`）を足し直すので、PATH の先頭に偽の `claude` を
 * 置いた試験が、実物の Claude Code を起動してしまう。名前は `bash`（シェルの種類を名前で見分ける処理に合わせる）。bash が無い環境（Windows など）は null。
 */
async function rcLessShell(stateDir: string): Promise<string | null> {
  if (process.platform === "win32" || !existsSync("/bin/bash")) return null;
  const dir = join(stateDir, "test-shell");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "bash");
  await writeFile(path, '#!/bin/sh\nexec /bin/bash --norc --noprofile "$@"\n');
  await chmod(path, 0o755);
  return path;
}

async function bootServer(stateDir: string, port: number, opts: { scrollback?: number; askImageFetcher?: ImageFetcher; exposed?: boolean; extensions?: ExtensionsInternal }, previousToken?: string): Promise<{ composed: ComposedServer; origin: string; token: string; cookie: string }> {
  const shell = await rcLessShell(stateDir);
  const composed: ComposedServer = await composeServer({
    host: "127.0.0.1",
    port: String(port),
    stateDir,
    ...(shell !== null ? { shell } : {}),
    // `exposed`: 外向きに公開した構成の対照（`--origin` つき＝リバースプロキシ・ポート転送の先。ask のメディアの上限を外さない）。
    origin: opts.exposed === true ? ["https://soda.example.test"] : [],
    ...(opts.scrollback !== undefined ? { scrollback: String(opts.scrollback) } : {}),
  }, {
    ...(opts.askImageFetcher !== undefined ? { askImageFetcher: opts.askImageFetcher } : {}),
    ...(opts.extensions !== undefined ? { extensions: opts.extensions } : {}),
  });
  await composed.listen();
  const origin = `http://127.0.0.1:${port}`;
  // `freshToken` は「今回新しく作った」ときだけ立つ（既存の state dir から起動し直した場合、トークンは
  // 変わらず永続化済みのものが使われる）。token は `listen()` が待ち受けに成功してから作るので、必ず
  // `listen()` の後に読む（それより前は常に undefined。`composeServer.ts`・D102）。
  const token = composed.freshToken ?? previousToken;
  if (!token) throw new Error("expected a token (freshly generated, or persisted from a previous boot)");
  const cookie = await login(origin, token);
  return { composed, origin, token, cookie };
}

/** `askImageFetcher`: 質問のフォームの外部 URL の画像の取得の差し替え（20261004-ask-media-popup。省くと実物の取得＝SSRF 対策つき）。 */
/** `extensions`: 拡張の起動し直しの間隔などの差し替え（20261007-ext-host。`timings: { backoffMinMs: 20 }` で落ちた拡張の起動し直しを速くする）。 */
export async function startAppServer(opts: { scrollback?: number; askImageFetcher?: ImageFetcher; exposed?: boolean; extensions?: ExtensionsInternal } = {}): Promise<AppServer> {
  const stateDir = await mkdtemp(join(tmpdir(), "soda-e2e-"));
  const port = await getFreePort();
  let booted = await bootServer(stateDir, port, opts);
  const sockets: WebSocket[] = [];

  async function openClient(kind: "desktop" | "mobile" = "desktop"): Promise<SodaTestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { cookie: booted.cookie, origin: booted.origin, host: `127.0.0.1:${port}` } });
    sockets.push(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    const client = createTestClient(ws);
    await client.request("client.hello", { protocol: 1, kind });
    return client;
  }

  async function restart(): Promise<void> {
    for (const ws of sockets.splice(0)) ws.close();
    const previousToken = booted.token;
    await booted.composed.close(); // stateDir は消さない（close() と違い、ここが AC18 の要）
    booted = await bootServer(stateDir, port, opts, previousToken);
  }

  async function close(): Promise<void> {
    for (const ws of sockets) ws.close();
    await booted.composed.close();
    await rm(stateDir, { recursive: true, force: true });
  }

  return {
    get origin() {
      return booted.origin;
    },
    get token() {
      return booted.token;
    },
    get cookie() {
      return booted.cookie;
    },
    stateDir,
    openClient,
    restart,
    close,
  };
}
