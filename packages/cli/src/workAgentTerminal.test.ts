import { expect, it, vi } from "vitest";
import { relayWorkAgentTerminal } from "./workAgentTerminal.js";
import type { SodaClient } from "./wsClient.js";
import type { AttachTerminal } from "./commands/attach.js";
import { RESTORE_SCREEN } from "./commands/attach.js";
const encode = (s: string) => Buffer.from(s).toString("base64");
it("resets partial escape/UTF8 state on snapshots and restores raw mode when the executor closes", async () => {
  let text = "",
    calls = 0;
  const raw: boolean[] = [],
    stops = vi.fn();
  const term: AttachTerminal = {
    isTTY: true,
    size: () => ({ cols: 80, rows: 24 }),
    setRawMode: (value) => raw.push(value),
    write: (value) => {
      text += value;
    },
    onInput: () => stops,
    onResize: () => stops,
    onSignal: () => stops,
  };
  const request = vi.fn(async (method: string) => {
    if (method.endsWith("close")) return {};
    if (++calls === 1)
      return {
        state: "open",
        epoch: "generation",
        inputLease: "lease",
        connected: true,
        inputAck: 0,
        output: [{ seq: 1, data: encode("\x1b[") }],
      };
    if (calls === 2)
      return {
        state: "open",
        epoch: "generation",
        inputLease: "lease",
        connected: true,
        inputAck: 1,
        output: [{ seq: 2, data: encode("\x1b[2J\x1b[HFRESH"), snapshot: true }],
      };
    return { state: "closed", reason: "executor_closed" };
  });
  await relayWorkAgentTerminal({ request } as unknown as SodaClient, "request", term);
  expect(text).toContain("\x1b[HFRESH");
  expect(text).not.toContain("\x1b[\x1b[");
  expect(text.endsWith(RESTORE_SCREEN)).toBe(true);
  expect(raw).toEqual([true, false]);
  expect(stops).toHaveBeenCalledTimes(3);
});
it("restores the terminal on an RPC failure and closes only its own requester session", async () => {
  const raw: boolean[] = [],
    write = vi.fn(),
    stop = vi.fn();
  const term: AttachTerminal = {
    isTTY: true,
    size: () => ({ cols: 80, rows: 24 }),
    setRawMode: (value) => raw.push(value),
    write,
    onInput: () => stop,
    onResize: () => stop,
    onSignal: () => stop,
  };
  const request = vi.fn(async (method: string) => {
    if (method.endsWith("close")) return {};
    throw Error("requester disconnected");
  });
  await expect(
    relayWorkAgentTerminal({ request } as unknown as SodaClient, "own-request", term),
  ).rejects.toThrow(/disconnected/);
  expect(raw).toEqual([true, false]);
  expect(write).toHaveBeenLastCalledWith(RESTORE_SCREEN);
  expect(request).toHaveBeenLastCalledWith("work.agent_terminal_close", { id: "own-request" });
});
