import { request as httpRequest, type ClientRequestArgs, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from "node:tls";
import WebSocket from "ws";

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

type CreateConnection = NonNullable<ClientRequestArgs["createConnection"]>;

/** 指紋で相手を確かめてから渡す TLS の接続（`http.request`・`ws` の `createConnection`）。 */
export function pinnedTlsConnection(certSha256: string): CreateConnection {
  const expected = certSha256.toUpperCase();
  return (options, cb) => {
    let done = false;
    const finish = (err: Error | null, socket: TLSSocket): void => {
      if (done) return;
      done = true;
      cb(err, socket);
    };
    const socket = tlsConnect({ ...(options as ConnectionOptions), rejectUnauthorized: false });
    socket.once("secureConnect", () => {
      const got = socket.getPeerCertificate().fingerprint256?.toUpperCase();
      if (got !== expected) {
        socket.destroy();
        finish(
          new Error(
            `the server certificate does not match serve.json (certSha256 ${expected}, got ${got ?? "none"})`,
          ),
          socket,
        );
        return;
      }
      finish(null, socket);
    });
    socket.once("error", (err) => finish(err, socket));
    return undefined;
  };
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
