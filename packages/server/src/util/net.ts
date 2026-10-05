/**
 * 横断的に使う純関数（architecture.md 依存の規則 6）。OS への実アクセスは行わない
 * （インタフェースの列挙は `infra/OsNetworkInfo`＝`NetworkInfo` の実装。T8）。
 */

/**
 * `[::1]` のような角括弧付きの IPv6 から角括弧を外す（それ以外はそのまま）。`config.ts` が `--host` に使い
 * （`listen()` は角括弧付きを名前として引き、`ENOTFOUND` で落ちる）、`formatUrlHost` も使う（D102・F8）。
 */
export function unbracketHost(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * ループバックアドレス / ホスト名かどうか（design.md「起動オプション」。証明書なし起動を許す条件）。
 * 角括弧付きの `[::1]` は受け付けない——`config.ts` が先に `unbracketHost` で外すため（D102）。
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost");
}

/** `--host` に `0.0.0.0` / `::` を渡したときの「全インタフェース」判定（角括弧は `config.ts` が先に外す。D102）。 */
export function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

/** OS のネットワークインタフェースの 1 アドレス（`os.networkInterfaces()` の要素のうち、ここで使う項目）。 */
export interface InterfaceAddress {
  /** インタフェースの名前（`os.networkInterfaces()` のキー。`eth0`・`docker0`・`vEthernet (WSL)` 等）。 */
  name: string;
  address: string;
  family: string;
  internal: boolean;
}

/**
 * 別のマシンからは届かない仮想のブリッジ・スイッチか（名前で見る。表示だけから除く。許可リストは変えない。D102）。
 * **利用者が名前を付けたもの（実際の LAN の IP が載りうる）を落とさない**ことを優先し、ツールが付ける名前だけに一致させる。
 * - Linux：コンテナ・VM のブリッジと veth（`docker0`・`virbr0`（libvirt）・`veth*`・`cni*`・`podman*`・`lxcbr*`/`lxdbr*`
 *   （LXC/LXD）・`vboxnet*`（VirtualBox のホストオンリー）・`vmnet*`（VMware））。`br-` は docker のユーザー定義ネットワークの
 *   `br-<ネットワーク id の先頭 12 桁の 16 進>` だけ（`br-lan`・`br-ex` 等、利用者・OpenStack 等が付けたブリッジは残す）。
 * - Windows：Hyper-V の内部（NAT）スイッチの管理用 vNIC の**既知の名前と完全に一致するものだけ**（`vEthernet (WSL)`・
 *   `vEthernet (WSL (Hyper-V firewall))`・`vEthernet (Default Switch)`・`vEthernet (nat)`・`vEthernet (DockerNAT)`）と、
 *   VirtualBox・VMware が付けるホストオンリー/NAT のアダプタ名（`VirtualBox Host-Only Network[ #n]`・
 *   `VMware Network Adapter VMnet<n>`）。外部スイッチを作ると母艦の実際の LAN の IP は物理 NIC ではなく
 *   `vEthernet (<スイッチ名>)` に載り、スイッチ名は利用者が付ける（Hyper-V マネージャーの既定は `New Virtual Switch`。
 *   `WSLBridge`・`WSL-External` のように既知の名前で始まることもある）ので、前方一致では除かない。
 * - WSL2 の mirrored モードでは、Windows 側の仮想アダプタも `eth1` 等の名前で見えるので名前では見分けられない
 *   （その 172.x 等は表示に残る。docs/tls-setup.md）。
 */
const LINUX_VIRTUAL_BRIDGE = /^(?:docker|virbr|veth|cni|podman|lxcbr|lxdbr|vboxnet|vmnet)|^br-[0-9a-f]{12}$/;
// Linux の名前（小文字）とは別に、大文字小文字を区別せずに見る（`veth` を区別なしで見ると `vEthernet` に当たってしまう）。
const WINDOWS_VIRTUAL_ADAPTER =
  /^(?:vEthernet \((?:WSL|WSL \(Hyper-V firewall\)|Default Switch|nat|DockerNAT)\)|VirtualBox Host-Only Network(?: #\d+)?|VMware Network Adapter VMnet\d+)$/i;

function isVirtualBridge(name: string): boolean {
  return LINUX_VIRTUAL_BRIDGE.test(name) || WINDOWS_VIRTUAL_ADAPTER.test(name);
}

/**
 * 別のマシンから宛先にできる、このマシンの IPv4 アドレス（重複を除き、見つけた順）。ループバックの I/F に載ったアドレスは
 * `127.*` でなくても除く（`internal`。WSL2 は `lo` に `10.255.255.254` を載せる）。リンクローカル `169.254.*` と、
 * 仮想のブリッジ・スイッチ（`isVirtualBridge`。docker0・vEthernet (WSL) 等）に載ったアドレスも除く（D102）。
 */
export function lanIpv4Addresses(ifaces: readonly InterfaceAddress[]): string[] {
  const out = ifaces
    .filter((a) => a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.") && !isVirtualBridge(a.name))
    .map((a) => a.address);
  return [...new Set(out)];
}

/**
 * 起動時に「このアドレスで開ける」と表示する URL（`scheme://host[:port]`）の一覧。
 * - **`extraOrigins`（`--origin`。`URL.origin` にそろえ済み）を先頭に置く**：ポート転送・リバースプロキシ・Tailscale の名前等、
 *   ブラウザが実際に開く宛先がこのマシンのインタフェースに無い構成では、利用者が `--origin` で教えたものだけが開ける URL で、
 *   証明書の名前とも一致する（D102）。
 * - `0.0.0.0` / `::` で待ち受けているときに `https://0.0.0.0:…` と表示してもブラウザでは開けない（別のマシンからは宛先に
 *   ならない）ので、代わりに `localhost` と `lanAddresses`（`lanIpv4Addresses` の結果）を並べる——どちらも `OriginPolicy` が
 *   許可する。IPv6 は利用者が打ちにくいので並べない。ホストを明示して待ち受けているときは、そのホストだけ（IPv6 は角括弧で囲む）。
 * - 同じ Origin（`URL.origin` で比べる）は 1 つにする（先に出たものを残す）。
 * - URL にできないホスト（ゾーン付きの IPv6 等）は並べない（**例外を投げない**。空の一覧もありうる——呼び出し側は
 *   URL が 1 つも無くても token を表示する。D103）。
 */
export function accessUrls(
  scheme: "http" | "https",
  host: string,
  port: number,
  lanAddresses: readonly string[],
  extraOrigins: readonly string[],
): string[] {
  const url = (h: string): string => `${scheme}://${formatUrlHost(h)}:${port}`;
  const own = isWildcardHost(host) ? [url("localhost"), ...lanAddresses.map(url)] : [url(host)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...extraOrigins, ...own]) {
    const key = tryUrl(u)?.origin;
    // URL にできないもの（ゾーン付きの IPv6 `fe80::1%eth0` 等）は並べない。WHATWG URL はゾーン識別子を受け付けず
    // （RFC 6874 の `%25` の形も不可）、ブラウザでも開けない。以前はここで `Invalid URL` を投げ、`listen()` の成功後に
    // 作った token を表示できずに終わっていた（D103）。
    if (key === undefined || seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

/** URL・`Host` ヘッダの host 部に置ける形にする（IPv6 は角括弧で囲む。既に囲まれていれば二重に囲まない）。 */
export function formatUrlHost(host: string): string {
  const bare = unbracketHost(host);
  return bare.includes(":") ? `[${bare}]` : bare;
}

/**
 * pane の中の sodactl が、このサーバへつなげる URL（`scheme://host:port`。末尾の `/` なし。20260926-agent-skill-file）。pane の環境の
 * `SODA_SERVER_URL` に入れる。全インタフェース（`0.0.0.0`・`::`）で待ち受けているときは、その族のループバック（`127.0.0.1`・`[::1]`）——
 * Origin の方針（`OriginPolicy`）は `localhost`・`127.0.0.1`・`::1` を常に許す。それ以外は待ち受けのホストそのもの（`localhost` は
 * 名前のまま。待ち受けた側と同じ名前を引けば届く）。`--origin` は使わない（ポート転送・プロキシの先はこのマシンの中から届くとは限らない）。
 * URL にできないもの（ゾーン付きの IPv6 等）は `undefined`。
 */
export function paneServerUrl(scheme: "http" | "https", host: string, port: number): string | undefined {
  const bare = unbracketHost(host);
  const target = isWildcardHost(bare) ? (bare === "::" ? "::1" : "127.0.0.1") : bare;
  const url = `${scheme}://${formatUrlHost(target)}:${port}`;
  return tryUrl(url) === undefined ? undefined : url;
}

const REQUEST_TARGET_BASE = "http://internal.invalid";

/**
 * HTTP の request-target（`req.url`）から経路（pathname）を取り出す。解釈できなければ `undefined`（呼び出し側は 400。D103）。
 * - origin-form（`/…`）：固定の基底（`http://internal.invalid`）に**文字列として連結して**解釈する。`new URL(raw, base)` の
 *   ように相対 URL として解決すると、`//x`・`/\x` がスキーム相対（`x` をホスト）として読まれ、`//`・`///`・`/\` は例外を
 *   投げて認証前の誰でも 1 リクエストごとに error 行を書かせられた。連結なら `//foo`・`/\` もただの経路（`//foo`・`//`）で、
 *   ホストは変わらない（利用者が `https://host//foo` と打つとブラウザは `//foo` を送る——SPA を返す。独立点検 #5）。
 *   `//ws` は `/ws` ではない（upgrade の経路の判定もこの結果をそのまま比べる）。
 * - absolute-form（`http(s)://host/…`。RFC 9112 3.2.2 でサーバは受け付ける）：その URL の pathname。
 * - それ以外（`*`・authority-form・相対）は `undefined`。
 */
export function requestPathname(target: string | undefined): string | undefined {
  const raw = target ?? "/";
  const url = /^https?:\/\//i.test(raw) ? tryUrl(raw) : raw.startsWith("/") ? tryUrl(REQUEST_TARGET_BASE + raw) : undefined;
  return url?.pathname;
}

function tryUrl(s: string): URL | undefined {
  try {
    return new URL(s);
  } catch {
    return undefined;
  }
}

/**
 * ローカル起動か（質問のフォームのメディアの大きさの上限を外してよいか。20261005-ask-local-no-limit）: loopback だけで待ち受け（`0.0.0.0`・LAN の IP は外向き）、
 * TLS（証明書つき＝LAN・外へ公開する構成）も `--origin`（リバースプロキシ・ポート転送・Tailscale の名前）も無い。
 * 別のマシンの `soda serve` の中継越しの画面は、これとは別に実行時に除く（`AskService`）。
 */
export function isLocalOnlyServer(host: string, secure: boolean, extraOrigins: readonly string[]): boolean {
  const h = unbracketHost(host).toLowerCase();
  // `isLoopbackHost` が通す `*.localhost` は含めない（名前の解決先が手元だと確かめられるのは localhost・127.0.0.1・::1 だけ）。
  return (h === "localhost" || h === "127.0.0.1" || h === "::1") && !secure && extraOrigins.length === 0;
}
