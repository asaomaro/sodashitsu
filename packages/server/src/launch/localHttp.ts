import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import WebSocket from "ws";
// 指紋の照合は端末版と共有（`@sodashitsu/tui/pinnedTls`。index を通さない subpath なので端末版の読み込みの費用は無い）。
import { pinnedTlsConnection, type CreateConnection } from "@sodashitsu/tui/pinnedTls";

/**
 * 手元の `soda serve` への HTTP・WebSocket（引数なしの `soda`。20260927-cli-mode の design「findOrStart」）。sodactl と同じく Origin・Host を自分で付ける
 * （ループバックの URL なら Origin の方針を常に通る。research-startup §2.2）。
 *
 * **https のときは `serve.json` の証明書の指紋（`certSha256`）と一致した相手だけに送る**。自己署名の証明書は検証に通らないので、TLS の検証は切り、
 * 繋がった直後（何も送る前）に相手の証明書の SHA-256 を比べる。一致しなければ秘密・cookie を送らずに切る。
 */
export interface LocalEndpoint {
  /** `http(s)://127.0.0.1:<port>`（末尾の `/` なし）。 */
  baseUrl: string;
  /** Origin ヘッダ（`baseUrl` と同じ）。 */
  origin: string;
  /** https のとき、受ける証明書の SHA-256 の指紋（`AA:BB:…`）。 */
  certSha256?: string | undefined;
}

function connectionOptions(ep: LocalEndpoint): { createConnection?: CreateConnection } {
  return ep.baseUrl.startsWith("https:") && ep.certSha256 !== undefined
    ? { createConnection: pinnedTlsConnection(ep.certSha256) }
    : {};
}

export interface PostResult {
  status: number;
  /** `Set-Cookie` の最初の `name=value`（無ければ undefined）。 */
  cookie: string | undefined;
}

/** JSON を POST する。応答の本文は読み捨てる。 */
export function postJson(
  ep: LocalEndpoint,
  path: string,
  body: unknown,
  timeoutMs = 5000,
  /** 付ける Cookie（`name=value`。`/api/logout` 用）。 */
  cookie?: string,
): Promise<PostResult> {
  const url = new URL(path, `${ep.baseUrl}/`);
  const payload = JSON.stringify(body);
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          origin: ep.origin,
          host: url.host,
          ...(cookie !== undefined ? { cookie } : {}),
        },
        timeout: timeoutMs,
        ...connectionOptions(ep),
      },
      (res: IncomingMessage) => {
        res.resume();
        const setCookie = res.headers["set-cookie"]?.[0];
        res.once("end", () =>
          resolve({ status: res.statusCode ?? 0, cookie: setCookie?.split(";")[0] }),
        );
      },
    );
    req.once("timeout", () => req.destroy(new Error("request timed out")));
    req.once("error", reject);
    req.end(payload);
  });
}

export type WsProbe =
  | { kind: "open"; ws: WebSocket }
  | { kind: "status"; status: number }
  | { kind: "error"; error: Error };

/** `/ws` を開く（Cookie・Origin・Host つき）。開けたらその接続を、upgrade が断られたら HTTP の status（起動中は 503）を返す。 */
export function openWs(ep: LocalEndpoint, cookie: string, timeoutMs = 5000): Promise<WsProbe> {
  const url = new URL("/ws", `${ep.baseUrl}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return new Promise((resolve) => {
    const ws = new WebSocket(url, {
      headers: { cookie, origin: ep.origin, host: url.host },
      handshakeTimeout: timeoutMs,
      ...(connectionOptions(ep) as object),
    });
    let settled = false;
    const settle = (r: WsProbe): void => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    ws.once("open", () => settle({ kind: "open", ws }));
    ws.once("unexpected-response", (_req, res) => {
      res.resume();
      settle({ kind: "status", status: res.statusCode ?? 0 });
      ws.terminate();
    });
    // `on`（`once` でない）：断った後の切断の error でも受け手が無いまま投げさせない。
    ws.on("error", (err) => settle({ kind: "error", error: err }));
  });
}
