import { afterEach, expect, it, vi } from "vitest";
import { DesktopEndpointDrain } from "./DesktopEndpointDrain.js";
const drains: DesktopEndpointDrain[] = [];
afterEach(() => {
  for (const d of drains.splice(0)) d.dispose();
  vi.useRealTimers();
});
function fixture() {
  let active = true;
  const terminal = vi.fn(async () => {}),
    close = vi.fn(() => drain.dispose()),
    drain = new DesktopEndpointDrain({ active: () => active, terminal, close });
  drains.push(drain);
  return {
    drain,
    terminal,
    close,
    revoke: () => {
      active = false;
    },
  };
}
const flush = () => new Promise((r) => setImmediate(r));
it("waits for accepted ciphertext, sends one EOF and closes only after acknowledgement", async () => {
  const f = fixture();
  let release!: () => void;
  f.drain.track(new Promise<void>((r) => (release = r)));
  f.drain.begin(true);
  f.drain.begin(true);
  await flush();
  expect(f.terminal).not.toHaveBeenCalled();
  expect(f.close).not.toHaveBeenCalled();
  release();
  await flush();
  expect(f.terminal).toHaveBeenCalledTimes(1);
  expect(f.close).not.toHaveBeenCalled();
  f.drain.acknowledge();
  expect(f.close).toHaveBeenCalledTimes(1);
});
it("does not wait or send a new EOF to an old peer", async () => {
  const f = fixture();
  f.drain.track(new Promise(() => {}));
  f.drain.begin(false);
  await flush();
  expect(f.close).toHaveBeenCalledTimes(1);
  expect(f.terminal).not.toHaveBeenCalled();
});
it("does not extend a revoked scope while accepted encryption is pending", async () => {
  const f = fixture();
  let release!: () => void;
  f.drain.track(new Promise<void>((r) => (release = r)));
  f.drain.begin(true);
  f.revoke();
  release();
  await flush();
  expect(f.terminal).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledTimes(1);
});
it("bounds a stalled ciphertext queue to two seconds", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.drain.track(new Promise(() => {}));
  f.drain.begin(true);
  await vi.advanceTimersByTimeAsync(1999);
  expect(f.close).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.close).toHaveBeenCalledTimes(1);
  expect(f.terminal).not.toHaveBeenCalled();
});
it("bounds a lost EOF acknowledgement and ignores an unsolicited early acknowledgement", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.drain.acknowledge();
  expect(f.close).not.toHaveBeenCalled();
  f.drain.begin(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.terminal).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1999);
  expect(f.close).toHaveBeenCalledTimes(1);
});
it("cannot publish an EOF after immediate disposal or transport revocation", async () => {
  const f = fixture();
  let release!: () => void;
  f.drain.track(new Promise<void>((r) => (release = r)));
  f.drain.begin(true);
  f.drain.dispose();
  release();
  await flush();
  expect(f.terminal).not.toHaveBeenCalled();
  expect(f.close).not.toHaveBeenCalled();
});
it("closes when an accepted send or the EOF itself fails", async () => {
  for (const phase of ["accepted", "terminal"]) {
    const f = fixture();
    if (phase === "accepted") f.drain.track(Promise.reject(Error("generated failure")));
    else f.terminal.mockRejectedValue(Error("generated failure"));
    f.drain.begin(true);
    await flush();
    expect(f.close).toHaveBeenCalled();
  }
});
