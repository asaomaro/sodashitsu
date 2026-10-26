import { spawn } from "node:child_process";
import { createConnection, type Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { DesktopPcmStream } from "./DesktopPcmStream.js";

it.skipIf(process.platform === "win32")(
  "keeps generated helper PCM sequence contiguous through local pipe backpressure",
  async () => {
    const helper = fileURLToPath(
        new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs", import.meta.url),
      ),
      fixture = fileURLToPath(
        new URL("../../../../scripts/remote-desktop/fixtures/h264-generated.json", import.meta.url),
      );
    const child = spawn(
      process.execPath,
      [helper, "--static", "--native-audio", "--native-fixture", fixture],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    const write = (value: unknown) => child.stdin.write(JSON.stringify(value) + "\n"),
      heartbeat = setInterval(() => write({ type: "heartbeat" }), 1000),
      id = randomUUID(),
      pipeName = "SodaDesktopAudio-" + randomUUID().replaceAll("-", ""),
      path = join(tmpdir(), pipeName + ".sock");
    let socket: Socket | undefined;
    const frames: number[] = [];
    let failure: unknown;
    const parser = new DesktopPcmStream(
      () => {},
      (frame) => {
        frames.push(frame.seq);
        frame.pcm.fill(0);
      },
    );
    try {
      write({
        type: "configure",
        allowSystemAudio: true,
        allowNativeVideo: true,
        options: { width: 640, fps: 10, quality: 65 },
      });
      write({ type: "native_video", enabled: true, id, fps: 30, window: 3 });
      write({ type: "native_audio", enabled: true, id, pipeName, pipePath: path });
      await expect
        .poll(
          async () => {
            const client = createConnection(path);
            const connected = await new Promise<boolean>((resolve) => {
              client.once("connect", () => resolve(true));
              client.once("error", () => resolve(false));
            });
            if (connected) {
              socket = client;
              socket.on("data", (bytes) => {
                try {
                  parser.push(bytes);
                } catch (error) {
                  failure = error;
                }
              });
              socket.on("error", () => {});
              return true;
            }
            client.destroy();
            return false;
          },
          { timeout: 3000, interval: 50 },
        )
        .toBe(true);
      await expect.poll(() => frames.length).toBeGreaterThan(1);
      socket!.pause();
      const before = frames.length;
      // Leave the actual private local socket unread long enough to fill its OS
      // buffer. The helper must drop work before allocating a wire sequence.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      socket!.resume();
      await expect
        .poll(() => ({ failure: String(failure ?? ""), progress: frames.length > before + 10 }), {
          timeout: 4000,
        })
        .toEqual({ failure: "", progress: true });
      expect(frames.every((seq, index) => seq === index + 1)).toBe(true);
    } finally {
      clearInterval(heartbeat);
      socket?.destroy();
      write({ type: "stop" });
      child.kill();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once("close", () => resolve());
      });
    }
  },
  12000,
);
