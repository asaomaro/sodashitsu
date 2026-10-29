import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { DesktopResourceChannel } from "./DesktopResourceChannel.js";
import type { DesktopHelper } from "./DesktopSharedCapture.js";
class Helper extends EventEmitter implements DesktopHelper {
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode = null;
  commands: any[] = [];
  ended = false;
  blocked: (() => void) | undefined;
  stdin = new Writable({
    write: (chunk, _encoding, done) => {
      const value = JSON.parse(chunk.toString());
      this.commands.push(value);
      if (value.type === "blocked") this.blocked = done;
      else done();
    },
    final: (done) => {
      this.ended = true;
      done();
    },
  });
  kill = vi.fn(() => {
    this.exitCode = 1;
    this.emit("close", 1, null);
    return true;
  });
  send(value: unknown) {
    this.stdout.write(JSON.stringify(value) + "\n");
  }
}
it("keeps fences behind queued commands and waits for exact ACK before physical stdin end", async () => {
  const child = new Helper(),
    ack = vi.fn(),
    closed = vi.fn(),
    channel = new DesktopResourceChannel(child, { ack, close: closed });
  const output: string[] = [];
  channel.stdout.on("data", (value) => output.push(String(value)));
  child.send({ type: "ready", resourceFences: true });
  expect(channel.begin(randomUUID())).toBe(true);
  channel.stdin.write('{"type":"blocked"}\n');
  channel.stdin.write('{"type":"old-control"}\n');
  const id = randomUUID();
  expect(channel.fence(id)).toBe(true);
  channel.stdin.end();
  await vi.waitFor(() =>
    expect(child.commands.map((m) => m.type)).toEqual(["resource_epoch", "blocked"]),
  );
  expect(child.ended).toBe(false);
  child.blocked!();
  await vi.waitFor(() =>
    expect(child.commands.map((m) => m.type)).toEqual([
      "resource_epoch",
      "blocked",
      "old-control",
      "resource_fence",
    ]),
  );
  expect(child.ended).toBe(false);
  child.send({ type: "resource_fence_ack", id: randomUUID() });
  expect(child.ended).toBe(false);
  child.send({ type: "resource_fence_ack", id });
  await vi.waitFor(() => expect(child.ended).toBe(true));
  expect(ack).toHaveBeenCalledWith(channel, id);
  expect(output.join("")).not.toContain("resource_fence_ack");
  child.send({ type: "resource_fence_ack", id });
  expect(ack).toHaveBeenCalledOnce();
  channel.kill();
  expect(closed).toHaveBeenCalledWith(channel);
});
it("requires current helper proof and rejects malformed private ACKs", () => {
  const child = new Helper(),
    ack = vi.fn(),
    channel = new DesktopResourceChannel(child, { ack, close: () => {} });
  expect(channel.fence(randomUUID())).toBe(false);
  child.send({ type: "ready", resourceFences: true });
  channel.begin(randomUUID());
  expect(channel.fence(randomUUID())).toBe(true);
  child.send({ type: "resource_fence_ack", id: "bad", extra: true });
  expect(child.kill).toHaveBeenCalledOnce();
  expect(ack).not.toHaveBeenCalled();
});
it("preserves native diagnostics and enforces one pending fence", () => {
  const child = new Helper(),
    channel = new DesktopResourceChannel(child, { ack: () => {}, close: () => {} });
  expect(channel.stderr).toBe(child.stderr);
  child.send({ type: "ready", resourceFences: true });
  channel.begin(randomUUID());
  const id = randomUUID();
  expect(channel.fence(id)).toBe(true);
  expect(channel.fence(id)).toBe(true);
  expect(channel.fence(randomUUID())).toBe(false);
  channel.kill();
});

it("accepts terminal cleanup only for the current ownership epoch and blocks later commands", () => {
  const child = new Helper(),
    ack = vi.fn(),
    channel = new DesktopResourceChannel(child, { ack, close: () => {} });
  child.send({ type: "ready", resourceFences: true });
  const epoch = randomUUID();
  channel.begin(epoch);
  child.send({ type: "resource_fence_ack", id: randomUUID(), terminal: true });
  expect(channel.clean(epoch)).toBe(false);
  child.send({ type: "resource_fence_ack", id: epoch, terminal: true });
  expect(channel.clean(epoch)).toBe(true);
  expect(channel.begin(randomUUID())).toBe(false);
  const id = randomUUID();
  expect(channel.fence(id)).toBe(true);
  expect(ack).toHaveBeenCalledWith(channel, id);
  channel.kill();
});
