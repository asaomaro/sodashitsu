import type { SessionSnapshot } from "@sodashitsu/protocol";
import type { GlobalOpts } from "./cliArgs.js";
import { RpcFailure } from "./wsClient.js";

/**
 * 自分の pane への操作の歯止め（20260926-agent-skill-file の design「歯止め」）。
 *
 * pane の中で動いている sodactl（`opts.caller` がある＝`SODA_PANE_ID` と `SODA_SERVER_URL` がある）が、その pane を動かしているサーバ（接続先の
 * origin が `SODA_SERVER_URL` の origin と一致する）に対して、自分の pane・それを含む tab・workspace を閉じる／自分の pane へ入力する等を
 * しようとしたら、要求を送る前に `self_target` で断る。自分を閉じると自分が終わり、自分への入力は自分の入力欄に混ざるため。
 *
 * **安全の境界ではない**（環境変数を消せば効かない・生の `/ws` からは効かない）。誤操作を止めるだけ。意図してやるときは `SODA_PANE_ID` を空にして打つ。
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * 同じサーバかを比べるための鍵（http(s) の origin）。ループバックの名前（`localhost`・`127.0.0.1`・`[::1]`）は同じものとして扱う——
 * pane の `SODA_SERVER_URL` が `http://127.0.0.1:7780` で、利用者が `SODACTL_URL=http://localhost:7780` を export していても、同じマシンの同じポートの
 * サーバなので歯止めを外さない（レビュー指摘。外すと黙って効かなくなる）。読めない・http(s) でない（`file:` 等は origin が "null" になり、
 * 互いに一致してしまう）なら undefined。
 */
function serverKeyOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    const host = LOOPBACK_HOSTS.has(u.hostname) ? "loopback" : u.hostname;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return `${u.protocol}//${host}:${port}`;
  } catch {
    return undefined;
  }
}

/**
 * 歯止めが効くときだけ、自分の pane の ID を返す。呼び出し元の pane を既定の対象にするとき（`paneTarget.ts`。20260927-caller-pane-default）も
 * 同じ判定で「接続先がその pane のサーバか」を確かめる（判定を 2 つ持たない）。
 */
export function selfPaneId(opts: GlobalOpts): string | undefined {
  const caller = opts.caller;
  if (caller === undefined) return undefined;
  const target = serverKeyOf(opts.url);
  // どちらかが URL として読めなければ、同じサーバとは言えない（効かせない）。
  if (target === undefined || target !== serverKeyOf(caller.serverUrl)) return undefined;
  return caller.paneId;
}

/**
 * pane を作る操作と `agent start` に添える呼び出し元の名乗り（20261003-graph-auto-nodes）。`selfPaneId(opts)` が確認できたとき
 * （pane の中で、接続先がその pane のサーバのとき。`--machine` では caller が破棄されるので送らない）だけ `{callerPaneId}`、
 * そうでなければ空。要求へ `...callerPaneParam(opts)` と展開する（`agent start` の対象の `paneId` とは別の項目）。
 */
export function callerPaneParam(opts: GlobalOpts): { callerPaneId?: string } {
  const self = selfPaneId(opts);
  return self === undefined ? {} : { callerPaneId: self };
}

function refuse(action: string, what: string, self: string, contains: boolean): never {
  throw new RpcFailure(
    "self_target",
    `refusing to ${action} ${what} because ${contains ? "it contains" : "it is"} the pane this sodactl runs in (SODA_PANE_ID=${self}); ` +
      `to do it on purpose, run with SODA_PANE_ID unset, e.g. "SODA_PANE_ID= sodactl ..."`,
  );
}

/** 対象の pane が自分の pane なら断る（`pane close`・`pane input`・`pane run`・`pane attach`・`agent start`・`agent prompt`・`agent send-keys`）。 */
export function assertNotSelfPane(opts: GlobalOpts, paneId: string, action: string): void {
  const self = selfPaneId(opts);
  if (self !== undefined && paneId === self) refuse(action, `pane ${paneId}`, self, false);
}

/** 対象の tab が自分の pane を含むなら断る（`tab close`）。自分の pane が snapshot に無ければ断らない（含むとは言えない）。 */
export function assertNotSelfTab(
  opts: GlobalOpts,
  snapshot: SessionSnapshot,
  tabId: string,
  action: string,
): void {
  const self = selfPaneId(opts);
  if (self === undefined) return;
  const own = snapshot.panes.find((p) => p.id === self);
  if (own !== undefined && own.tabId === tabId) refuse(action, `tab ${tabId}`, self, true);
}

/** 対象の workspace が自分の pane を含むなら断る（`workspace close`）。 */
export function assertNotSelfWorkspace(
  opts: GlobalOpts,
  snapshot: SessionSnapshot,
  workspaceId: string,
  action: string,
): void {
  const self = selfPaneId(opts);
  if (self === undefined) return;
  const own = snapshot.panes.find((p) => p.id === self);
  if (own === undefined) return;
  const tab = snapshot.tabs.find((t) => t.id === own.tabId);
  if (tab !== undefined && tab.workspaceId === workspaceId)
    refuse(action, `workspace ${workspaceId}`, self, true);
}
