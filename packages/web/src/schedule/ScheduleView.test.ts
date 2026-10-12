import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { expect, it, vi } from "vitest";
import ScheduleView from "./ScheduleView.vue";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import type { Workspace } from "@sodashitsu/protocol";
it("does not discard a second editor opened during a pending save", async () => {
  const pinia = createPinia();
  useSessionStore(pinia).workspaces.set("w", { id: "w", label: "work" } as Workspace);
  let release!: (value: unknown) => void;
  const request = vi.fn((method: string) =>
    method === "schedule.save"
      ? new Promise((resolve) => (release = resolve))
      : Promise.resolve({ jobs: [], runs: [] }),
  );
  const wrapper = mount(ScheduleView, {
    global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  const register = () => wrapper.findAll("button").find((b) => b.text() === "予約を登録")!;
  await register().trigger("click");
  await wrapper.find("input").setValue("first");
  await wrapper.find("textarea").setValue("printf ok");
  await wrapper.find("form").trigger("submit");
  await register().trigger("click");
  expect(wrapper.find("input").element.value).toBe("first");
  expect(wrapper.find("button[type=button]").attributes("disabled")).toBeDefined();
  release({});
  await flushPromises();
  expect(wrapper.find("form").exists()).toBe(false);
  wrapper.unmount();
});
