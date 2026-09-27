import { statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { connect, type Socket } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import { makeTempDir } from "../persist/atomicFile.js";
import {
  BRIDGE_FRAME,
  BridgeFrameDecoder,
  encodeBridgeFrame,
  parseBridgeHello,
  type BridgeFrame,
} from "./bridgeFrames.js";
import { bridgeSocketPathFor } from "./BridgeEndpoint.js";

/**
 * リモート側の中継の受け口（20260927-multi-host-machines の T3）を、実物の `composeServer` と実物の `bridge.sock` で確かめる。
 * 手元の側（`MachineLink`）の代わりに、このテストが枠を直接書く。
 */
vi.setConfig({ testTimeout: 20_000 });

class FrameReader {
  private readonly decoder = new BridgeFrameDecoder({ role: "link" });
  private readonly frames: BridgeFrame[] = [];
  private waiters: (() => void)[] = [];
  closed = false;
  constructor(sock: Socket) {
    sock.on("data", (chunk: Buffer) => {
      this.frames.push(...this.decoder.push(new Uint8Array(chunk)));
      for (const w of this.waiters.splice(0)) w();
    });
    sock.on("close", () => {
      this.closed = true;
      for (const w of this.waiters.splice(0)) w();
    });
  }
  async next(pred: (f: BridgeFrame) => boolean, timeoutMs = 10_000): Promise<BridgeFrame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.frames.findIndex(pred);
      if (i >= 0) return this.frames.splice(i, 1)[0]!;
      if (this.closed) throw new Error("socket closed");
      if (Date.now() > deadline) throw new Error("timed out waiting for a frame");
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 100);
      });
    }
  }
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);

describe.skipIf(process.platform === "win32")(
  "BridgeEndpoint（実物の composeServer・bridge.sock。T3）",
  () => {
    const cleanups: (() => Promise<unknown> | unknown)[] = [];
    afterEach(async () => {
      for (const fn of cleanups.splice(0).reverse()) await fn();
    });

    async function start(): Promise<string> {
      const stateDir = await makeTempDir("wtm-bridge-ep-");
      cleanups.push(() =>
        rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
      cleanups.push(() => server.close());
      return bridgeSocketPathFor(stateDir);
    }

    async function open(path: string): Promise<{ sock: Socket; reader: FrameReader }> {
      const sock = connect(path);
      await new Promise<void>((resolve, reject) => {
        sock.once("connect", resolve);
        sock.once("error", reject);
      });
      cleanups.push(() => sock.destroy());
      return { sock, reader: new FrameReader(sock) };
    }

    it("0600 で待ち受け、目印と HELLO を送り、チャネルは /ws と同じ client.hello に答える。PING には PONG", async () => {
      const path = await start();
      expect(statSync(path).mode & 0o777).toBe(0o600);
      const { sock, reader } = await open(path);
      const hello = parseBridgeHello(
        (await reader.next((f) => f.type === BRIDGE_FRAME.HELLO)).payload,
      );
      expect(hello).toMatchObject({ bridge: 1, protocol: 1, sessionName: null });

      sock.write(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 7));
      sock.write(
        encodeBridgeFrame(
          BRIDGE_FRAME.TEXT,
          7,
          text(
            JSON.stringify({
              id: "1",
              method: "client.hello",
              params: { protocol: 1, kind: "external" },
            }),
          ),
        ),
      );
      const reply = JSON.parse(
        new TextDecoder().decode(
          (await reader.next((f) => f.type === BRIDGE_FRAME.TEXT && f.channel === 7)).payload,
        ),
      ) as {
        id: string;
        result: { snapshot: { workspaces: unknown[] } };
      };
      expect(reply.id).toBe("1");
      expect(reply.result.snapshot.workspaces.length).toBeGreaterThan(0);

      sock.write(encodeBridgeFrame(BRIDGE_FRAME.PING, 0, text("p1")));
      expect(
        new TextDecoder().decode((await reader.next((f) => f.type === BRIDGE_FRAME.PONG)).payload),
      ).toBe("p1");

      // チャネル 7 を閉じても socket とほかのチャネルは生きている
      sock.write(encodeBridgeFrame(BRIDGE_FRAME.CLOSE, 7));
      sock.write(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 8));
      sock.write(
        encodeBridgeFrame(
          BRIDGE_FRAME.TEXT,
          8,
          text(JSON.stringify({ id: "2", method: "machine.list", params: {} })),
        ),
      );
      const list = JSON.parse(
        new TextDecoder().decode(
          (await reader.next((f) => f.type === BRIDGE_FRAME.TEXT && f.channel === 8)).payload,
        ),
      ) as { id: string };
      expect(list.id).toBe("2");
    });

    it("待ち受けの一時ディレクトリを残さず、閉じたら bridge.sock を消す", async () => {
      const stateDir = await makeTempDir("wtm-bridge-ep-");
      cleanups.push(() =>
        rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      );
      const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
      const { readdirSync, existsSync } = await import("node:fs");
      expect(readdirSync(stateDir).filter((f) => f.startsWith(".b-"))).toEqual([]);
      expect(existsSync(bridgeSocketPathFor(stateDir))).toBe(true);
      await server.close();
      expect(existsSync(bridgeSocketPathFor(stateDir))).toBe(false);
    });

    it("開いているチャネルへの 2 回目の OPEN・知らない type は、socket ごと切る", async () => {
      const path = await start();
      const a = await open(path);
      await a.reader.next((f) => f.type === BRIDGE_FRAME.HELLO);
      a.sock.write(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 1));
      a.sock.write(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 1));
      await expect(a.reader.next(() => false, 5000)).rejects.toThrow(/socket closed/);

      const b = await open(path);
      await b.reader.next((f) => f.type === BRIDGE_FRAME.HELLO);
      b.sock.write(Uint8Array.of(0x42, 0, 0, 0, 0, 0, 0, 0, 0));
      await expect(b.reader.next(() => false, 5000)).rejects.toThrow(/socket closed/);
    });
  },
);
