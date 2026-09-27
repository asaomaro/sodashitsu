import type { ServerSessionEntry } from "@sodashitsu/protocol";

/**
 * session の一覧の 1 項目を、このブラウザから開く URL か、開けない理由にする（20260926-named-session-ui の design「web」・AC6）。
 * いまのページのホスト名（`location.hostname`）はブラウザしか知らないので、URL はここで決める（サーバは待ち受けのホスト・ポート・
 * TLS かの生の値だけを返す）。
 */
export type SessionTarget =
  | { kind: "open"; url: string }
  | { kind: "current" }
  /** 止まっている。`command` は起動のコマンド（既定の session も `--session default`——名前付き session の pane の `SODA_SESSION` に選ばせない）。 */
  | { kind: "stopped"; command: string }
  /** ループバックで待ち受けていて、いまのホスト名がループバックでない（このマシンのブラウザからだけ開ける）。 */
  | { kind: "unreachable" }
  /** 動いているが開くための情報が無い（記録が無い・持ち主と一致しない）・URL にできない。 */
  | { kind: "unknown" };

function unbracket(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** server の `util/net.ts` `isWildcardHost` と同じ集合。 */
function isWildcard(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

/** server の `util/net.ts` `isLoopbackHost` と同じ集合（大文字小文字を区別しない）。 */
function isLoopback(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost");
}

function urlHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

/**
 * 待ち受けのホストごとの URL のホスト（design「web」。decisions D6）。相手のサーバの Origin の方針（`OriginPolicy.allowedHostPorts`）は
 * `localhost`・`127.0.0.1`・`::1` と待ち受けのホスト（全インタフェースならこのマシンの全アドレスとホスト名）を許すので、それに収まる名前を選ぶ。
 * - ループバック: 待ち受けのホストそのもの（相手が必ず許し、待ち受けたアドレス族に届く）。いまのホスト名がループバックでなければ
 *   unreachable（同じマシンのブラウザが LAN の IP で開いていることもあるが、ページからは見分けられないので保守側に倒す）。
 * - 全インタフェース: いまのホスト名がループバックなら、その族のループバックのアドレス（`0.0.0.0`→`127.0.0.1`・`::`→`::1`。server の
 *   `paneServerUrl` と同じ）。そうでなければいまのホスト名。ただし `0.0.0.0`（IPv4 だけ）でいまが IPv6 のアドレスなら、IPv4 のアドレスが
 *   分からないので unknown。
 * - それ以外（特定のアドレス・名前）: 待ち受けのホストそのもの。
 *
 * **限界（ページからは判定できない。docs にも書く。decisions D7）**:
 * - いまのページを相手が許さない名前で開いているとき——`--origin` で足した名前（ポート転送・リバースプロキシ・Tailscale）、`--host` に
 *   付けた名前、`os.hostname()` と違う FQDN・mDNS の名前——全インタフェースの相手に出した URL は拒否される（相手のログインの画面が
 *   403 の理由を出す）。IP アドレスで開いていれば届く。
 * - ループバックへのポート転送（`ssh -L`・devcontainer 等）で `localhost` を開いているとき、ループバックの URL は**ブラウザ側のマシン**を
 *   指すので届かない（別のサービスに繋がりうる。開いた先は soda のログインを求めるだけで、token は送らない）。
 */
export function sessionTarget(entry: ServerSessionEntry, hereHostname: string): SessionTarget {
  if (entry.current) return { kind: "current" };
  if (!entry.running)
    return {
      kind: "stopped",
      command: `soda serve --session ${entry.name}`,
    };
  const ep = entry.endpoint;
  if (ep === undefined) return { kind: "unknown" };
  const here = unbracket(hereHostname).toLowerCase();
  const bind = unbracket(ep.host);
  let host: string;
  if (isLoopback(bind)) {
    if (!isLoopback(here)) return { kind: "unreachable" };
    host = bind.toLowerCase();
  } else if (isWildcard(bind)) {
    if (isLoopback(here)) host = bind === "::" ? "::1" : "127.0.0.1";
    else if (bind === "0.0.0.0" && here.includes(":")) return { kind: "unknown" };
    else host = here;
  } else host = bind;
  const url = `${ep.https ? "https" : "http"}://${urlHost(host)}:${ep.port}/`;
  try {
    new URL(url);
  } catch {
    return { kind: "unknown" };
  }
  return { kind: "open", url };
}
