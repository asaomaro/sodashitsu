import { afterEach, expect, it, vi } from "vitest";
import { RemoteNotices } from "./remoteNotices.js";
const services: RemoteNotices[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.stop();
});
function fixture() {
  const id = "a".repeat(32),
    changed = vi.fn(),
    request = vi.fn(async () => ({ machines: [{ id, label: "sr-pc", state: "online" }] })),
    notices: Array<{ options: any; start: any; stop: any }> = [],
    rpcs: any[] = [];
  const service = new RemoteNotices(
    "https://hub.test",
    { request: request as any },
    {
      cookie: async () => "soda_session=generated",
      changed,
      notice: ((_origin: string, options: any) => {
        const entry = { options, start: vi.fn(), stop: vi.fn() };
        notices.push(entry);
        return entry;
      }) as any,
      rpc: ((_origin: string, options: any) => {
        const entry = { options, start: vi.fn(), stop: vi.fn(), request: vi.fn() };
        rpcs.push(entry);
        return entry;
      }) as any,
    },
  );
  services.push(service);
  return { service, id, changed, request, notices, rpcs };
}
it("pins notices and replies to registered online hub routes and revokes on disable", async () => {
  const f = fixture();
  f.service.connection(true);
  await vi.waitFor(() => expect(f.notices).toHaveLength(1));
  expect(f.notices[0]!.options.machineId).toBe(f.id);
  expect(f.rpcs[0].options.machineId).toBe(f.id);
  expect(f.service.rpcFor(f.id)).toBe(f.rpcs[0]);
  f.notices[0]!.options.changed(
    [
      {
        id: "notice",
        source: { machineId: f.id },
        title: "PJ",
        message: "確認してください",
        at: 1,
      },
    ],
    true,
  );
  expect(f.changed).toHaveBeenLastCalledWith(
    [expect.objectContaining({ title: "sr-pc / PJ" })],
    true,
  );
  f.service.configure(false);
  expect(f.service.rpcFor(f.id)).toBeNull();
  f.notices[0]!.options.changed([{ id: "late", title: "late", message: "late", at: 2 }], true);
  expect(f.changed).toHaveBeenLastCalledWith([], false);
});
it("does not create remote sockets from a stale machine list or unregistered route", async () => {
  const f = fixture();
  let finish!: (value: any) => void;
  f.request.mockImplementation(
    () =>
      new Promise<any>((resolve) => {
        finish = resolve;
      }),
  );
  f.service.connection(true);
  f.service.connection(false);
  finish({ machines: [{ id: f.id, label: "old", state: "online" }] });
  await Promise.resolve();
  await Promise.resolve();
  expect(f.notices).toHaveLength(0);
  expect(f.service.rpcFor("unregistered")).toBeNull();
});
