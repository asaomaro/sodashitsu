import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { SessionModel } from "../model/SessionModel.js";
import {
  CertificateMismatchError,
  nodeFetch,
  nodeWebSocketFactory,
  wsUrlOf,
  type Endpoint,
} from "./nodeTransport.js";
import { TuiNet } from "./TuiNet.js";

/**
 * 証明書の指紋の照合を、実物の https サーバ（自己署名。`testing/tls/` の試験用の証明書と鍵）で確かめる。
 * 指紋が違えば何も送らない（cookie が相手に届かない）・合えば繋がる・https なのに指紋が無ければ繋がずに終える。
 */
const tlsDir = fileURLToPath(new URL("../testing/tls/", import.meta.url));
const cert = readFileSync(`${tlsDir}cert.pem`);
const key = readFileSync(`${tlsDir}key.pem`);
const RIGHT = new X509Certificate(cert).fingerprint256;
const WRONG = RIGHT.replace(/^../, RIGHT.startsWith("00") ? "11" : "00");

describe("証明書の指紋の照合（実物の TLS）", () => {
  let server: Server;
  let wss: WebSocketServer;
  let baseUrl: string;
  /** サーバが受け取った Cookie（HTTP の要求と WebSocket の upgrade）。 */
  const seenCookies: string[] = [];

  beforeAll(async () => {
    server = createServer({ cert, key }, (req, res) => {
      seenCookies.push(req.headers.cookie ?? "");
      res.statusCode = 204;
      res.end();
    });
    wss = new WebSocketServer({ server });
    wss.on("connection", (_ws, req) => seenCookies.push(req.headers.cookie ?? ""));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    wss.close();
    await new Promise((r) => server.close(r));
  });

  const ep = (certSha256: string | undefined): Endpoint => ({
    baseUrl,
    origin: baseUrl,
    certSha256,
    cookie: () => "sid=secret",
  });

  it("指紋が合えば HTTP も WebSocket も繋がり、cookie が届く", async () => {
    seenCookies.length = 0;
    const res = await nodeFetch(ep(RIGHT))(`${baseUrl}/api/session`);
    expect(res.status).toBe(204);
    const ws = nodeWebSocketFactory(ep(RIGHT.toLowerCase()))(wsUrlOf(baseUrl));
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onclose = () => reject(new Error("closed"));
    });
    ws.close();
    await vi.waitFor(() => expect(seenCookies).toEqual(["sid=secret", "sid=secret"]));
  });

  it("指紋が違えば HTTP は CertificateMismatchError、WebSocket は開かず、どちらも cookie を送らない", async () => {
    seenCookies.length = 0;
    await expect(nodeFetch(ep(WRONG))(`${baseUrl}/api/session`)).rejects.toBeInstanceOf(
      CertificateMismatchError,
    );
    const ws = nodeWebSocketFactory(ep(WRONG))(wsUrlOf(baseUrl));
    let opened = false;
    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        opened = true;
      };
      ws.onerror = () => undefined;
      ws.onclose = () => resolve();
    });
    expect(opened).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(seenCookies).toEqual([]);
  });

  it("TuiNet：指紋が違えば終了の案内（onFatal）、https なのに指紋が無ければログインもせずに終える", async () => {
    const handlers = () => ({
      model: new SessionModel(),
      sink: { onOutput: vi.fn(), onSnapshot: vi.fn(), onSizeChanged: vi.fn() },
      onState: vi.fn(),
      onOpened: vi.fn(),
      onClosed: vi.fn(),
      onFatal: vi.fn(),
    });
    const wrong = handlers();
    const net = new TuiNet(
      { baseUrl, origin: baseUrl, certSha256: WRONG, login: async () => "sid=x", stateDir: "/x" },
      wrong,
    );
    await net.start();
    await vi.waitFor(() =>
      expect(wrong.onFatal).toHaveBeenCalledWith(expect.stringContaining("does not match")),
    );

    const none = handlers();
    const login = vi.fn(async () => "sid=x");
    const net2 = new TuiNet({ baseUrl, origin: baseUrl, login, stateDir: "/x" }, none);
    await net2.start();
    expect(none.onFatal).toHaveBeenCalledWith(expect.stringContaining("no certSha256"));
    expect(login).not.toHaveBeenCalled();
  });
});
