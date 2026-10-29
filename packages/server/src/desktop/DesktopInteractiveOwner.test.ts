import { expect, it, vi } from "vitest";
import { DesktopInteractiveOwner } from "./DesktopInteractiveOwner.js";
function fixture() {
  let now = 0;
  const sent: { source: object; id: string }[] = [],
    fault = vi.fn(),
    idle = vi.fn();
  const owner = new DesktopInteractiveOwner<object, object>({
    send: (source, id) => {
      sent.push({ source, id });
      return true;
    },
    fault,
    idle,
    now: () => now,
  });
  return {
    owner,
    sent,
    fault,
    idle,
    advance: (n: number) => {
      now += n;
      owner.tick();
    },
  };
}
it("serializes all resources until the same physical helper acknowledges cleanup", async () => {
  const f = fixture(),
    a = {},
    b = {},
    source = {},
    other = {};
  expect(f.owner.acquire(a, source, "control")).toBe(true);
  expect(f.owner.acquire(a, source, "clipboard")).toBe(true);
  expect(f.owner.acquire(b, other, "microphone")).toBe(true);
  f.owner.release(a, "control");
  expect(f.sent).toHaveLength(1);
  expect(f.owner.owns(a, "clipboard")).toBe(true);
  expect(f.owner.acquire(b, other, "control")).toBe(false);
  const id = f.sent[0]!.id;
  expect(f.owner.acknowledge(other, id)).toBe(false);
  expect(f.owner.acknowledge(source, "old")).toBe(false);
  expect(f.owner.acknowledge(source, id)).toBe(true);
  expect(f.owner.acquire(b, other, "control")).toBe(true);
  expect(f.owner.acknowledge(source, id)).toBe(false);
  await Promise.resolve();
  expect(f.idle).toHaveBeenCalledWith(source);
  f.owner.dispose();
});
it.each(["timeout", "death", "clock"])("never treats %s as a release proof", async (fault) => {
  const f = fixture(),
    a = {},
    source = {};
  f.owner.acquire(a, source, "control");
  f.owner.releaseAll(a);
  if (fault === "timeout") f.advance(5000);
  else if (fault === "death") f.owner.sourceGone(source);
  else f.advance(-1);
  expect(f.owner.faulted).toBe(true);
  expect(f.owner.acquire({}, {}, "clipboard")).toBe(false);
  expect(f.owner.acknowledge(source, f.sent[0]!.id)).toBe(false);
  await Promise.resolve();
  expect(f.fault).toHaveBeenCalledOnce();
  f.owner.dispose();
});
it("sets pending state before synchronous helper ACK and remains safe on write failure", () => {
  const source = {},
    a = {};
  let owner: DesktopInteractiveOwner<object, object>;
  owner = new DesktopInteractiveOwner({
    send: (s, id) => owner.acknowledge(s, id),
    idle: () => {},
    fault: () => {},
  });
  owner.acquire(a, source, "microphone");
  owner.releaseAll(a);
  expect(owner.acquire({}, {}, "control")).toBe(true);
  owner.dispose();
  const failed = new DesktopInteractiveOwner<object, object>({
    send: () => {
      throw Error("closed");
    },
    idle: () => {},
    fault: () => {},
  });
  failed.acquire(a, source, "control");
  failed.releaseAll(a);
  expect(failed.acquire({}, {}, "control")).toBe(false);
  failed.dispose();
});

it("requires exact terminal ownership proof before a closed source can release its owner", () => {
  let epoch = "",
    clean = "";
  const source = {},
    fault = vi.fn();
  const owner = new DesktopInteractiveOwner<object, object>({
    begin: (_s, id) => {
      epoch = id;
      return true;
    },
    clean: (_s, id) => id === clean,
    send: () => true,
    idle: () => {},
    fault,
  });
  owner.acquire({}, source, "control");
  clean = epoch;
  owner.sourceGone(source);
  expect(owner.faulted).toBe(false);
  expect(owner.acquire({}, {}, "clipboard")).toBe(true);
  owner.dispose();
});
