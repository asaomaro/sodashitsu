import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import WebSocket from "ws";
import type { WebSocketLike } from "@sodashitsu/client-core";
import {
  MissingCertificatePinError,
  pinnedTlsConnection,
  type CreateConnection,
} from "./pinnedTls.js";

export {
  CertificateMismatchError,
  MissingCertificatePinError,
  pinnedTlsConnection,
} from "./pinnedTls.js";

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

/** https なのに指紋が無い（serve.json が古い）か。あれば繋がない——検証を切った TLS で cookie を送らない。 */
export function lacksPin(ep: Pick<Endpoint, "baseUrl" | "certSha256">): boolean {
  return ep.baseUrl.startsWith("https:") && ep.certSha256 === undefined;
}

function connectionOptions(ep: Endpoint): { createConnection?: CreateConnection } {
  if (!ep.baseUrl.startsWith("https:")) return {};
  if (ep.certSha256 === undefined) throw new MissingCertificatePinError();
  return { createConnection: pinnedTlsConnection(ep.certSha256) };
}

/** `/ws` の URL（ほかのマシンを見るときの `?machine=` は client-core の `wsUrlFor` が付ける）。 */
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
