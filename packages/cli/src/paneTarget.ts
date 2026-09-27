import type { SessionSnapshot } from "@wtm/protocol";
import type { GlobalOpts, PaneTarget } from "./cliArgs.js";
import { selfPaneId } from "./selfGuard.js";
import { RpcFailure } from "./wsClient.js";

/**
 * pane の対象の指定（`PaneTarget`）を pane の ID に解決する（20260927-caller-pane-default の design「実行」）。
 *
 * 呼び出し元の pane は、接続先がその pane を動かしているサーバだと確かめられるときだけ使う（確かめ方は自分の pane の歯止めと同じ `selfPaneId`）。
 * 確かめられなければ推測せず `caller_pane_unknown` で断る——ID はサーバごとに別で、別のサーバでは同じ ID が無関係な pane を指すため。
 * `self_target` は確かめられないとき歯止めを外す側に倒すが、ここは断る側に倒す（どちらも「確かでないとき別のサーバの pane を自分とみなさない」）。
 */

/** 呼び出し元の pane の ID。接続する前に呼ぶ（断るときは何も送らない）。 */
export function resolveCallerPane(
  opts: GlobalOpts,
  target: Extract<PaneTarget, { kind: "caller" }>,
): string {
  const confirmed = selfPaneId(opts);
  if (confirmed === undefined) {
    const serverUrl = opts.caller?.serverUrl;
    // WTM_SERVER_URL が無い（サーバが URL にできない待ち受け）ときは「WTM_SERVER_URL につなぐ」を勧められない（タスク横断の点検の指摘）。
    const advice =
      serverUrl === undefined
        ? "if it is, pass the pane ID with --pane"
        : "if it is, pass the pane ID with --pane; otherwise connect to WTM_SERVER_URL (unset WTMCTL_URL, drop --url)";
    throw new RpcFailure(
      "caller_pane_unknown",
      `cannot use the calling pane (WTM_PANE_ID=${target.paneId}): cannot confirm that ${opts.url} is the server running this pane ` +
        `(WTM_SERVER_URL=${serverUrl ?? "(unset)"}); ${advice}`,
    );
  }
  return confirmed;
}

/** サーバのフォーカスの pane（hello の snapshot の `focus`）。無ければ `not_found`。 */
export function resolveFocusedPane(snapshot: SessionSnapshot): string {
  const paneId = snapshot.focus?.paneId;
  if (paneId === undefined) throw new RpcFailure("not_found", "no focused pane");
  return paneId;
}

/** 接続する前に決まる ID（明示の ID・呼び出し元）。フォーカスの pane なら undefined（接続後に `resolveFocusedPane`）。 */
export function paneTargetIdBeforeConnect(
  opts: GlobalOpts,
  target: PaneTarget,
): string | undefined {
  switch (target.kind) {
    case "id":
      return target.paneId;
    case "caller":
      return resolveCallerPane(opts, target);
    case "focused":
      return undefined;
  }
}
