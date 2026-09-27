import { request as httpRequest, type ClientRequestArgs, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from "node:tls";
import WebSocket from "ws";
import type { WebSocketLike } from "@sodashitsu/client-core";

/**
 * Node から手元の `soda serve` へ繋ぐ口（client-core の `Connection` に注入する。20260927-cli-mode の design「net/」）。
 * ブラウザと違い Cookie・Origin・Host を自分で付ける（`packages/cli/src/wsClient.ts` の `connect` と同じ）。
 * **https のときは `certSha256` と一致した相手だけに送る**（自己署名の証明書は検証に通らないので TLS の検証は切り、繋がった直後・何も送る前に
 * 相手の証明書の SHA-256 を比べる。server の `launch/localHttp.ts` の `pinnedTlsConnection` と同じ手順）。
 */
export interface Endpoint {
  baseUrl: string;
  origin: string;
  certSha256?: string | undefined;
  /** 今の cookie（再ログインで替わる）。 */
  cookie(): string;
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
        finish(new CertificateMismatchError(expected, got), socket);
        return;
      }
      finish(null, socket);
    });
    socket.once("error", (err) => finish(err, socket));
    return undefined;
  };
}

export class CertificateMismatchError extends Error {
  constructor(expected: string, got: string | undefined) {
    super(
      `the server certificate does not match serve.json (certSha256 ${expected}, got ${got ?? "none"})`,
    );
    this.name = "CertificateMismatchError";
  }
}

function connectionOptions(ep: Endpoint): { createConnection?: CreateConnection } {
  if (!ep.baseUrl.startsWith("https:")) return {};
  // https なのに指紋が無い（serve.json が古い）なら繋がない——検証を切った TLS で cookie を送らない。
  if (ep.certSha256 === undefined)
    throw new Error("https without certSha256: refusing to connect without a pinned certificate");
  return { createConnection: pinnedTlsConnection(ep.certSha256) };
}

/** `/ws` の URL（`?machine=` は 05 で足す）。 */
export function wsUrlOf(baseUrl: string): string {
  const u = new URL("/ws", `${baseUrl}/`);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

/** `Connection` の `createWebSocket`（`ws` に Cookie・Origin・Host と指紋の照合を付ける）。 */
export function nodeWebSocketFactory(ep: Endpoint): (url: string) => WebSocketLike {
  return (url) => {
    const host = new URL(url).host;
    const ws = new WebSocket(url, {
      headers: { cookie: ep.cookie(), origin: ep.origin, host },
      handshakeTimeout: 10_000,
      ...(connectionOptions(ep) as object),
    });
    ws.binaryType = "arraybuffer";
    return ws as unknown as WebSocketLike;
  };
}

/**
 * `Connection` の `fetchImpl`（`/api/session` の確認に使う）。Cookie・Origin・Host を付け、https なら指紋を照合する。
 * 応答の本文は読み捨て、状態と見出しだけの `Response` を返す（`Connection` は `status` と見出ししか見ない）。
 */
export function nodeFetch(ep: Endpoint, timeoutMs = 5000): typeof fetch {
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const request = url.protocol === "https:" ? httpsRequest : httpRequest;
      let conn: { createConnection?: CreateConnection };
      try {
        conn = connectionOptions(ep);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      const body = typeof init?.body === "string" ? init.body : undefined;
      const extra: Record<string, string> = {};
      if (init?.headers && !(init.headers instanceof Headers) && !Array.isArray(init.headers))
        Object.assign(extra, init.headers);
      const req = request(
        url,
        {
          method: init?.method ?? "GET",
          headers: {
            ...extra,
            cookie: ep.cookie(),
            origin: ep.origin,
            host: url.host,
            ...(body !== undefined ? { "content-length": String(Buffer.byteLength(body)) } : {}),
          },
          timeout: timeoutMs,
          ...conn,
        },
        (res: IncomingMessage) => {
          res.resume();
          res.once("end", () => {
            const headers = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (typeof v === "string") headers.set(k, v);
              else if (Array.isArray(v)) for (const item of v) headers.append(k, item);
            }
            const status = res.statusCode ?? 0;
            // `Response` は 200〜599 だけを受ける。範囲の外は「分からない応答」（`Connection` は再接続する）として 599 にする。
            resolve(
              new Response(null, {
                status: status >= 200 && status <= 599 ? status : 599,
                headers,
              }),
            );
          });
        },
      );
      req.once("timeout", () => req.destroy(new Error("request timed out")));
      req.once("error", reject);
      req.end(body);
    });
}
