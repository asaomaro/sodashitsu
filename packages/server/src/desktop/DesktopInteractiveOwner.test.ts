import { expect, it, vi } from "vitest";
import { DesktopInteractiveOwner } from "./DesktopInteractiveOwner.js";
function fixture() {
  let now = 0;
  let clockBroken = false;
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
    now: () => {
      if (clockBroken) throw Error("clock unavailable");
      return now;
    },
  });
  return {
    owner,
    sent,
    fault,
    idle,
    breakClock: () => {
      clockBroken = true;
      owner.tick();
    },
    advance: (n: number) => {
      now += n;
      owner.tick();
    },
  };
}
it("exposes a releasing identity only to its original member without weakening confirmed release",async()=>{
 const f=fixture(),member={},other={},source={};expect(f.owner.acquire(member,source,"control")).toBe(true);const epoch=f.owner.identity(member,"control")!.epoch;f.owner.release(member,"control");const pending=f.owner.releasing(member,"control");expect(pending).toEqual({source,id:f.sent[0]!.id,epoch});expect(f.owner.releasing(other,"control")).toBeUndefined();expect(f.owner.releasing(member,"clipboard")).toBeUndefined();await expect(f.owner.releaseConfirmed(member,"control")).rejects.toThrow("not owned");expect(f.owner.acquire(member,source,"control")).toBe(false);expect(f.owner.acknowledge(source,pending!.id)).toBe(true);expect(f.owner.releasing(member,"control")).toBeUndefined();expect(f.owner.acquire(member,source,"control")).toBe(true);f.owner.dispose();
});
it("cannot inspect or revive an expired releasing identity",()=>{const f=fixture(),member={},source={};f.owner.acquire(member,source,"control");f.owner.release(member,"control");f.advance(5000);expect(f.owner.releasing(member,"control")).toBeUndefined();expect(f.owner.faulted).toBe(true);expect(f.owner.acquire(member,source,"control")).toBe(false);f.owner.dispose();});
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

it("returns a cleanup receipt only for the exact helper, request and original epoch", async () => {
  const f = fixture(),
    member = {},
    source = {};
  expect(f.owner.acquire(member, source, "control")).toBe(true);
  const identity = f.owner.identity(member, "control")!;
  expect(identity.source).toBe(source);
  expect(f.owner.identity({}, "control")).toBeUndefined();
  let settled = false;
  const receipt = f.owner.releaseConfirmed(member, "control").then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(f.owner.acquire({}, source, "control")).toBe(false);
  expect(f.owner.acknowledge({}, f.sent[0]!.id)).toBe(false);
  expect(f.owner.acknowledge(source, crypto.randomUUID())).toBe(false);
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(f.owner.acknowledge(source, f.sent[0]!.id)).toBe(true);
  expect(await receipt).toEqual({ id: f.sent[0]!.id, epoch: identity.epoch });
  expect(f.owner.acknowledge(source, f.sent[0]!.id)).toBe(false);
  expect(f.owner.acquire(member, source, "control")).toBe(true);
  expect(f.owner.identity(member, "control")!.epoch).not.toBe(identity.epoch);
  f.owner.dispose();
});

it.each(["timeout", "death", "clock", "throw", "dispose"])(
  "rejects confirmed release on %s without reviving it",
  async (mode) => {
    const f = fixture(),
      member = {},
      source = {};
    f.owner.acquire(member, source, "control");
    let outcome: { kind: string; error?: unknown } = { kind: "pending" };
    const receipt = f.owner.releaseConfirmed(member, "control").then(
      () => {
        outcome = { kind: "resolved" };
      },
      (error) => {
        outcome = { kind: "rejected", error };
      },
    );
    if (mode === "timeout") f.advance(5000);
    if (mode === "death") f.owner.sourceGone(source);
    if (mode === "clock") f.advance(-1);
    if (mode === "throw") expect(() => f.breakClock()).not.toThrow();
    if (mode === "dispose") f.owner.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(outcome).toMatchObject({ kind: "rejected", error: expect.any(Error) });
    await receipt;
    expect(f.owner.acknowledge(source, f.sent[0]!.id)).toBe(false);
    f.owner.dispose();
  },
);

it.each(["false", "throw", "dispose"])(
  "does not accept a synchronous ACK followed by %s",
  async (mode) => {
    let owner: DesktopInteractiveOwner<object, object>;
    const member = {},
      source = {};
    owner = new DesktopInteractiveOwner({
      send: (physical, id) => {
        expect(owner.acknowledge(physical, id)).toBe(true);
        if (mode === "throw") throw Error("write failed");
        if (mode === "dispose") owner.dispose();
        return mode !== "false";
      },
      idle: () => {},
      fault: () => {},
    });
    expect(owner.acquire(member, source, "control")).toBe(true);
    await expect(owner.releaseConfirmed(member, "control")).rejects.toThrow();
    owner.dispose();
  },
);

it("accepts a synchronous ACK only after a successful send returns", async () => {
  let owner: DesktopInteractiveOwner<object, object>;
  const member = {},
    source = {};
  let id = "";
  owner = new DesktopInteractiveOwner({
    send: (physical, value) => {
      id = value;
      expect(owner.acknowledge(physical, value)).toBe(true);
      expect(owner.acquire({}, source, "control")).toBe(false);
      return true;
    },
    idle: () => {},
    fault: () => {},
  });
  owner.acquire(member, source, "control");
  const epoch = owner.identity(member, "control")!.epoch;
  expect(await owner.releaseConfirmed(member, "control")).toEqual({ id, epoch });
  expect(owner.acquire({}, source, "control")).toBe(true);
  owner.dispose();
});
