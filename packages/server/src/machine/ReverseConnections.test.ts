import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { afterEach, expect, it, vi } from "vitest";
import { ReverseConnections } from "./ReverseConnections.js";
import { ManualClock } from "./testing.js";
import { MemoryLogger } from "../log/Logger.js";
import type { BridgeEndpoint } from "./BridgeEndpoint.js";
import type { MachineManager } from "./MachineManager.js";
import type { DelegationGrants } from "./DelegationGrants.js";
const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});
it("terminates silent links on provider heartbeat timeout instead of waiting indefinitely for TCP close", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-heartbeat-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1", autoPong: false });
  await new Promise<void>((ok) => wss.once("listening", ok));
  cleanup.push(() => new Promise<void>((ok) => wss.close(() => ok())));
  const addr = wss.address();
  if (typeof addr === "string" || !addr) throw Error("listen");
  const clock = new ManualClock();
  const reverse = new ReverseConnections({
    stateDir: dir,
    clock,
    logger: new MemoryLogger(),
    endpoint: () => ({ handleSocket: vi.fn() }) as unknown as BridgeEndpoint,
    machines: {} as MachineManager,
    grants: {} as DelegationGrants,
  });
  cleanup.push(() => reverse.close());
  reverse.setReady(true);
  const id = "a".repeat(32);
  await reverse.start({ url: `ws://127.0.0.1:${addr.port}`, machineId: id, token: "t".repeat(43) });
  await vi.waitFor(() => expect(reverse.list().delegations[0]?.state).toBe("online"));
  clock.advance(45_000);
  await vi.waitFor(() => expect(reverse.list().delegations[0]?.state).toBe("reconnecting"));
  await reverse.stop(id);
  expect(reverse.list().delegations).toEqual([]);
});
