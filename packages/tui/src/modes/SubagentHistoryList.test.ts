import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SubagentList } from "./SubagentList.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { Grid } from "../render/Screen.js";
import { ThemeColors } from "../render/color.js";
import { snapshot } from "../testing/fixtures.js";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({
  id: `child-${n}`,
  entryId: uuid(n + 1),
  terminalStatus: "completed",
  description: `Generated finished ${n}`,
  model: "observed-model",
  modelBasis: "turn",
  hasTranscript: true,
});
const page = (items: unknown[]) => ({
  status: "ok",
  items,
  offset: items.length,
  revision: uuid(999),
  reset: false,
  more: false,
  omittedBefore: false,
  incomplete: false,
});
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
let lists: SubagentList[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const list of lists.splice(0)) list.dispose();
  vi.useRealTimers();
});
function fixture(reply: () => unknown | Promise<unknown> = () => page([row(0)])) {
  const model = new SessionModel();
  model.applySnapshot(snapshot(), "client");
  const p = model.panes.get("p1")!;
  model.panes.set("p1", {
    ...p,
    agent: {
      ...p.agent!,
      kind: "codex",
      instanceId: "i",
      subagents: { count: 0, countBasis: "alive", items: [] },
    },
    agentSession: { kind: "codex", sessionId: "s", reportedAt: 1 },
  });
  const ui = new UiState(model),
    request = vi.fn(async (_m: string, _p: unknown) => reply());
  let scope: string | null = "parent-instance-kind-ref-session-machine-client";
  const list = new SubagentList("p1", ui, model, Date.now, {
    port: { request } as never,
    scope: () => scope,
    redraw: vi.fn(),
  });
  lists.push(list);
  const render = () => {
    const grid = new Grid(110, 28);
    list.render({ grid, theme: new ThemeColors("dracula") });
    return { grid, text: Array.from({ length: grid.h }, (_, y) => grid.rowText(y)).join("\n") };
  };
  return {
    list,
    model,
    ui,
    request,
    render,
    invalidate: () => {
      scope = "other";
    },
  };
}
it("opens an exact terminal entry from the zero-current selector without changing active count", async () => {
  const f = fixture();
  await flush();
  expect(f.render().text).toContain("Generated finished 0");
  f.list.handleKey({ key: "Enter" } as never);
  expect(f.ui.dialogContext).toMatchObject({
    kind: "childConversation",
    agentId: "child-0",
    historical: { entryId: uuid(1), terminalStatus: "completed" },
  });
  expect(f.model.panes.get("p1")?.agent?.subagents?.count).toBe(0);
});
it("supports rendered history row selection by mouse", async () => {
  const f = fixture();
  await flush();
  const y = f
    .render()
    .text.split("\n")
    .findIndex((s) => s.includes("Generated finished 0"));
  f.list.handleMouse({ action: "down", button: 0, x: 10, y });
  expect(f.ui.dialogContext).toMatchObject({
    kind: "childConversation",
    historical: { entryId: uuid(1) },
  });
});
it("reaches the last variable-height history row after dragging the thumb to the bottom", async () => {
  const f = fixture(() => page(Array.from({ length: 64 }, (_, i) => row(i))));
  await flush();
  const { grid } = f.render();
  let x = -1;
  for (let col = 0; col < grid.w; col++)
    if (
      Array.from({ length: grid.h }, (_, y) => grid.cell(col, y).ch).some(
        (c) => c === "█" || c === "░",
      )
    )
      x = col;
  expect(x).toBeGreaterThan(0);
  const track = Array.from({ length: grid.h }, (_, y) => y).filter((y) =>
      ["█", "░"].includes(grid.cell(x, y).ch),
    ),
    thumb = track.find((y) => grid.cell(x, y).ch === "█")!;
  f.list.handleMouse({ action: "down", button: 0, x, y: thumb });
  f.list.handleMouse({ action: "move", button: 0, x, y: track.at(-1)! + 5 });
  f.list.handleMouse({ action: "up", button: 0, x, y: track.at(-1)! + 5 });
  expect(f.render().text).toContain("Generated finished 63");
  f.list.handleKey({ key: "Enter" } as never);
  expect(f.ui.dialogContext).toMatchObject({
    agentId: "child-63",
    historical: { entryId: uuid(64) },
  });
});
it("clears a late result when scope changes and never selects a stale history entry", async () => {
  let finish!: (v: unknown) => void;
  const f = fixture(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  f.invalidate();
  finish(page([row(0)]));
  await flush();
  expect(f.render().text).not.toContain("Generated finished 0");
  f.list.handleKey({ key: "Enter" } as never);
  expect(f.ui.dialogContext).toBeNull();
  await vi.advanceTimersByTimeAsync(30000);
  expect(f.request).toHaveBeenCalledTimes(1);
});
it("reports old peer unsupported without a current history/transcript fallback", async () => {
  const f = fixture(() => {
    throw { code: "method_not_found" };
  });
  await flush();
  expect(f.render().text).toContain("この操舵室の接続経路");
  await vi.advanceTimersByTimeAsync(30000);
  expect(f.request).toHaveBeenCalledTimes(1);
  expect(f.request.mock.calls[0]?.[0]).toBe("agent.subagent_history");
});
