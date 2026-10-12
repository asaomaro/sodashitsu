import { mount, flushPromises } from "@vue/test-utils";
import { createPinia } from "pinia";
import { expect, it, vi } from "vitest";
import type { Workspace } from "@sodashitsu/protocol";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import WorkspaceView from "./WorkspaceView.vue";
it("keeps the newest Git diff when old responses arrive after a staged selection", async () => {
  const pinia = createPinia(),
    session = useSessionStore(pinia);
  session.workspaces.set("w", { id: "w", projectDir: "/pj" } as Workspace);
  const responses: ((r: { text: string }) => void)[] = [];
  const request = vi.fn(async (_method: string, p: { operation: string }) =>
    p.operation === "git-status"
      ? { files: [] }
      : new Promise<{ text: string }>((resolve) => responses.push(resolve)),
  );
  const w = mount(WorkspaceView, {
    props: { workspaceId: "w", tabId: "t", kind: "git-diff" },
    global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  await w.get('input[type="checkbox"]').setValue(true);
  await flushPromises();
  expect(responses).toHaveLength(2);
  responses[1]!({ text: "new staged diff" });
  await flushPromises();
  responses[0]!({ text: "old working diff" });
  await flushPromises();
  expect(w.get(".workspace-code").text()).toContain("new staged diff");
  expect(w.get(".workspace-code").text()).not.toContain("old working diff");
  w.unmount();
});

it("standalone file tree has no duplicate title row and keeps refresh beside search", async () => {
  const pinia = createPinia();
  const request = vi.fn(async () => ({ entries: [] }));
  const w = mount(WorkspaceView, {
    props: { workspaceId: "w", tabId: "t", kind: "files" },
    global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  expect(w.find("header").exists()).toBe(false);
  expect(w.text()).not.toContain("ファイルツリー");
  const refresh = w.get(".workspace-search button[type=button]");
  expect(refresh.text()).toBe("再読込");
  await refresh.trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledTimes(2);
  await w.setProps({ showHeading: true });
  expect(w.get("header strong").text()).toBe("ファイルツリー");
  w.unmount();
});
