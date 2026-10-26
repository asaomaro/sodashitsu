import { afterEach, expect, it, vi } from "vitest";
import { DesktopFileClient } from "./fileClient.js";
import type { DesktopFileRequest } from "@sodashitsu/protocol";
afterEach(() => vi.useRealTimers());
it("queues six paused-transfer keepalives within the wire limit without failing any", async () => {
  const sent: DesktopFileRequest[] = [],
    client = new DesktopFileClient(
      (v) => {
        sent.push(v);
        return true;
      },
      () => {},
    ),
    id = "22222222-2222-4222-8222-222222222222";
  const waits = Array.from({ length: 6 }, () => client.request({ action: "status", id }));
  expect(sent).toHaveLength(1);
  for (let i = 0; i < 6; i++) {
    const m = sent[i]!;
    client.receive({
      type: "desktop_file_result",
      id: m.id,
      ok: true,
      result: { offset: 7, bytes: 20 },
    });
  }
  expect(await Promise.all(waits)).toHaveLength(6);
  expect(sent).toHaveLength(6);
  client.stop();
});
it("reserves a cancellation slot and gives revoke priority over queued data", async () => {
  const sent: DesktopFileRequest[] = [],
    client = new DesktopFileClient(
      (v) => {
        sent.push(v);
        return true;
      },
      () => {},
    ),
    id = "22222222-2222-4222-8222-222222222222";
  const first = client.request({ action: "status", id }),
    second = client.request({ action: "status", id }),
    revoke = client.request({ action: "grant", enabled: false });
  expect(sent.map((v) => v.request.action)).toEqual(["status", "grant"]);
  client.receive({
    type: "desktop_file_result",
    id: sent[1]!.id,
    ok: true,
    result: { enabled: false },
  });
  expect(sent).toHaveLength(2);
  client.receive({
    type: "desktop_file_result",
    id: sent[0]!.id,
    ok: true,
    result: { offset: 0, bytes: 1 },
  });
  expect(sent).toHaveLength(3);
  client.receive({
    type: "desktop_file_result",
    id: sent[2]!.id,
    ok: true,
    result: { offset: 0, bytes: 1 },
  });
  await Promise.all([first, second, revoke]);
  client.stop();
});
it("rejects queued and pending work when the parent share ends", async () => {
  const client = new DesktopFileClient(
      () => true,
      () => {},
    ),
    id = "22222222-2222-4222-8222-222222222222",
    waits = Array.from({ length: 5 }, () => client.request({ action: "status", id }));
  const settled = Promise.allSettled(waits);
  client.stop();
  expect((await settled).every((v) => v.status === "rejected")).toBe(true);
});

it("accepts revoke even when the normal queue is full", async () => {
  const sent: DesktopFileRequest[] = [],
    end = vi.fn(),
    client = new DesktopFileClient((v) => {
      sent.push(v);
      return true;
    }, end),
    id = "22222222-2222-4222-8222-222222222222";
  const waiting = Array.from({ length: 17 }, () => client.request({ action: "status", id })),
    settled = Promise.allSettled(waiting);
  const revoked = client.request({ action: "grant", enabled: false });
  expect(sent.map((v) => v.request.action)).toEqual(["status", "grant"]);
  client.receive({
    type: "desktop_file_result",
    id: sent[1]!.id,
    ok: true,
    result: { enabled: false },
  });
  expect(await revoked).toEqual({ enabled: false });
  expect(end).not.toHaveBeenCalled();
  client.stop();
  await settled;
});
it("closes the dedicated lane if even the control queue is full", async () => {
  const end = vi.fn(),
    client = new DesktopFileClient(() => true, end),
    id = "22222222-2222-4222-8222-222222222222",
    waiting = Array.from({ length: 20 }, () => client.request({ action: "abort", id })),
    settled = Promise.allSettled(waiting);
  await expect(client.request({ action: "grant", enabled: false })).rejects.toThrow();
  expect(end).toHaveBeenCalledOnce();
  await settled;
});
