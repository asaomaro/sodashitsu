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

it("registers SSH targets and completes code-exchange delegation through the local connection", async () => {
  const request = vi.fn(async (method: string) => {
    if (method === "machine.connections") return { connections: [] };
    if (method === "machine.delegations") return { delegations: [] };
    if (method === "machine.pairing_requests") return { requests: [] };
    return { id: "request-id" };
  });
  const remote = vi.fn();
  let opened!: () => void;
  const w = mount(ConnectionsScreen, {
    global: {
      provide: {
        [ConnectionKey as symbol]: { request: remote },
        [LocalClientFactoryKey as symbol]: (callback: () => void) => {
          opened = callback;
          return { request, start: () => opened(), stop: vi.fn() };
        },
      },
    },
  });
  try {
    await flushPromises();
    await w.get("header button").trigger("click");
    await w.get('input[placeholder="user@host または SSH設定のHost名"]').setValue("user@build");
    const add = w.findAll("fieldset").find((f) => f.text().includes("追加（SSH）"))!;
    await add.findAll("input")[0]!.setValue("Build");
    await add.get('input[placeholder="default"]').setValue("work");
    await add.get("form").trigger("submit");
    await flushPromises();
    expect(request).toHaveBeenCalledWith("machine.add", {
      label: "Build",
      target: "user@build",
      session: "work",
    });
    expect(w.text()).not.toContain("外部Sodashitsuを追加（SSH）");
    const delegation = w
      .findAll("fieldset")
      .find((f) => f.text().includes("このPCの操作を委譲する"))!;
    await delegation.findAll("input")[0]!.setValue("https://operator.example");
    await delegation.findAll("input")[1]!.setValue("Laptop");
    await delegation.get("form").trigger("submit");
    await flushPromises();
    expect(request).toHaveBeenCalledWith("machine.request_delegation", {
      url: "https://operator.example",
      label: "Laptop",
    });
    await delegation.get("input").setValue("12345678");
    await delegation.get("form").trigger("submit");
    await flushPromises();
    expect(request).toHaveBeenCalledWith("machine.confirm_delegation", {
      id: "request-id",
      code: "12345678",
    });
    expect(remote).not.toHaveBeenCalled();
  } finally {
    w.unmount();
  }
});
