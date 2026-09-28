import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { processIo, type ProcessStreams } from "./processIo.js";

/** error を受け手なしで emit すると投げる EventEmitter（本物の stream と同じ）。 */
function fakeStream(): EventEmitter & Record<string, unknown> {
  const s = new EventEmitter() as EventEmitter & Record<string, unknown>;
  Object.assign(s, {
    isTTY: true,
    columns: 80,
    rows: 24,
    setRawMode: () => s,
    resume: () => s,
    pause: () => s,
    write: () => true,
  });
  return s;
}

describe("processIo", () => {
  it("raw を外した後に届いた書き込みの失敗（EIO）でも落ちない", () => {
    const stdin = fakeStream();
    const stdout = fakeStream();
    const io = processIo({ stdin, stdout, stderr: fakeStream() } as unknown as ProcessStreams);
    io.setRawMode(true);
    io.setRawMode(false);
    expect(() => stdout.emit("error", new Error("EIO"))).not.toThrow();
    expect(() => stdin.emit("error", new Error("EIO"))).not.toThrow();
    // 何度 raw にしても受け手は 1 つ。
    io.setRawMode(true);
    expect(stdout.listenerCount("error")).toBe(1);
  });
});
