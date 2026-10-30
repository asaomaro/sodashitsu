import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, expect, it, vi } from "vitest";
import { OcrRunner, type OcrLaunch } from "./ocrRunner.js";
const png = () =>
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
    "base64",
  );
function fixture(extra: { now?: () => number } = {}) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  const spawn = vi.fn((_request: OcrLaunch) => child as unknown as ChildProcessWithoutNullStreams);
  const runner = new OcrRunner({
    resolve: async () => "/usr/bin/tesseract",
    spawn,
    environment: { PATH: "/usr/bin", SODA_TOKEN: "secret", OPENAI_API_KEY: "secret" },
    ...extra,
  });
  return { runner, child, spawn };
}
afterEach(() => vi.useRealTimers());
it("uses a fixed local command with PNG stdin and a restricted environment", async () => {
  const { runner, child, spawn } = fixture();
  const pending = runner.run(png(), "/usr/bin/tesseract", "jpn+eng", new AbortController().signal);
  await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
  expect(spawn.mock.calls[0]![0]).toEqual({
    executable: "/usr/bin/tesseract",
    args: ["stdin", "stdout", "-l", "jpn+eng"],
    cwd: "/usr/bin",
    env: { OMP_THREAD_LIMIT: "2", PATH: "/usr/bin" },
    shell: false,
    windowsHide: true,
  });
  child.stdout.write("認識した文字\n");
  child.emit("close", 0);
  await expect(pending).resolves.toBe("認識した文字");
});
it("waits for physical close after cancellation", async () => {
  const { runner, child, spawn } = fixture();
  const controller = new AbortController();
  const pending = runner.run(png(), "x", "jpn", controller.signal);
  const caught = pending.catch((error) => error);
  await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
  controller.abort();
  expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  let settled = false;
  void caught.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  child.emit("close", 0);
  expect((await caught).message).toMatch(/中止/);
});
it("bounds output and rejects after process closes", async () => {
  const { runner, child, spawn } = fixture();
  const caught = runner
    .run(png(), "x", "jpn", new AbortController().signal)
    .catch((error) => error);
  await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
  child.stdout.write(Buffer.alloc(256 * 1024 + 1));
  expect(child.kill).toHaveBeenCalled();
  child.emit("close", 0);
  expect((await caught).message).toContain("大きすぎ");
});
it("checks absolute deadlines when callbacks outrun the timeout", async () => {
  let now = 0;
  const { runner, child, spawn } = fixture({ now: () => now });
  const caught = runner
    .run(png(), "x", "jpn", new AbortController().signal)
    .catch((error) => error);
  await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
  now = 60_000;
  child.emit("close", 0);
  expect(await caught).toBeInstanceOf(Error);
  expect((await caught).message).toMatch(/制限時間/);
});
it("rejects invalid language and pre-aborted requests without spawning", async () => {
  const { runner, spawn } = fixture();
  await expect(runner.run(png(), "x", "eng --psm 1", new AbortController().signal)).rejects.toThrow(
    "言語",
  );
  const c = new AbortController();
  c.abort();
  await expect(runner.run(png(), "x", "jpn", c.signal)).rejects.toThrow();
  expect(spawn).not.toHaveBeenCalled();
});
