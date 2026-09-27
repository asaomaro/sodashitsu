import type { ClientRequestArgs } from "node:http";
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from "node:tls";

/**
 * 証明書の指紋（`serve.json` の `certSha256`）で相手を確かめる TLS の接続（20260927-cli-mode）。**端末版と server の `launch/localHttp.ts` の
 * 共有の置き場はここ**：client-core は DOM にも Node にも触れない約束なので置けない。server の `launch/localHttp.ts` も
 * `@sodashitsu/tui/pinnedTls` から使う（index を通さない subpath なので、server の起動に端末版の読み込みの費用を足さない）。
 * 自己署名の証明書は検証に通らないので TLS の検証は切り、繋がった直後・何も送る前に相手の証明書の SHA-256 を比べ、違えば切る。
 */
export type CreateConnection = NonNullable<ClientRequestArgs["createConnection"]>;

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

export class MissingCertificatePinError extends Error {
  constructor() {
    super(
      "the server uses https but serve.json has no certSha256: refusing to connect without a pinned certificate",
    );
    this.name = "MissingCertificatePinError";
  }
}
