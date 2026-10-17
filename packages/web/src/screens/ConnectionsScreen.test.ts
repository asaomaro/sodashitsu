import { mount, flushPromises } from "@vue/test-utils";
import { it, expect, vi } from "vitest";
import { ConnectionKey, LocalClientFactoryKey } from "../injection.js";
import ConnectionsScreen from "./ConnectionsScreen.vue";
it("manages the local controller even when the visible terminal connection points to another machine", async () => {
  let opened!: () => void;
  const request = vi.fn((method: string) =>
    Promise.resolve(
      method === "machine.connections"
        ? {
            connections: [
              {
                id: "a".repeat(32),
                label: "office",
                target: "reverse",
                transport: "reverse",
                enabled: true,
                state: "online",
                message: null,
              },
            ],
          }
        : method === "machine.delegations"
          ? { delegations: [] }
          : method === "machine.pairing_requests"
            ? { requests: [] }
            : {},
    ),
  );
  const local = { request, start: () => opened(), stop: vi.fn() };
  const remote = vi.fn();
  const w = mount(ConnectionsScreen, {
    global: {
      provide: {
        [ConnectionKey as symbol]: { request: remote },
        [LocalClientFactoryKey as symbol]: (callback: () => void) => {
          opened = callback;
          return local;
        },
      },
    },
  });
  await flushPromises();
  await w
    .findAll("button")
    .find((b) => b.text() === "無効化")!
    .trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith("machine.manage", { id: "a".repeat(32), action: "disable" });
  expect(remote).not.toHaveBeenCalled();
  w.unmount();
  expect(local.stop).toHaveBeenCalledOnce();
});
