import { expect, it, vi } from "vitest";
import { computerInputs, runOpenAiComputer } from "./desktopModel.js";
import type { DesktopAgentSession } from "./desktopSession.js";
it("normalizes pixels and validates every computer action before any input", () => {
  expect(
    computerInputs([{ type: "click", x: 199, y: 99, button: "left" }], { width: 200, height: 100 })
      .inputs,
  ).toEqual([
    { kind: "pointer", event: "down", button: 0, x: 1, y: 1 },
    { kind: "pointer", event: "up", button: 0, x: 1, y: 1 },
  ]);
  for (const actions of [
    [
      { type: "click", x: 1, y: 1 },
      { type: "exec", command: "bad" },
    ],
    [{ type: "click", x: 200, y: 1 }],
    [{ type: "keypress", keys: ["INVALID"] }],
    [{ type: "scroll", x: 1, y: 1, scroll_x: 1, scroll_y: 0 }],
    [{ type: "wait" }, { type: "type", text: "x" }],
  ])
    expect(() => computerInputs(actions, { width: 200, height: 100 })).toThrow();
});
it("runs a stateless model screenshot/action loop against an injected API, never acknowledges safety checks without approval", async () => {
  const observed = {
    observationId: "o",
    frameSeq: 1,
    width: 200,
    height: 100,
    format: "image/png" as const,
    imageBase64: "AQID",
    latestFrameMaxAgeMs: 2000,
  };
  const session = {
    abort: new AbortController(),
    observe: vi.fn(async () => observed),
    act: vi.fn(async () => ({ acknowledged: 2, afterFrameSeq: 1 })),
  } as unknown as DesktopAgentSession;
  let requests = 0;
  const request = vi.fn(async (_url: unknown, opts: any) => {
    const input = JSON.parse(opts.body);
    expect(input.store).toBe(false);
    expect(input.tools).toEqual([{ type: "computer" }]);
    return new Response(
      JSON.stringify(
        ++requests === 1
          ? {
              output: [
                {
                  type: "computer_call",
                  call_id: "c1",
                  actions: [{ type: "click", x: 10, y: 20, button: "left" }],
                  pending_safety_checks: [{ id: "s", code: "check", message: "Confirm" }],
                },
              ],
            }
          : { output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }] },
      ),
    );
  });
  const approve = vi.fn(async () => true),
    event = vi.fn(async () => {});
  await runOpenAiComputer(session, "test", {
    model: "gpt-6.1-sol",
    apiKey: "test-only",
    maxSteps: 3,
    fetchImpl: request as typeof fetch,
    approve,
    event,
  });
  expect(approve).toHaveBeenCalledOnce();
  expect(session.act).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledTimes(2);
  const body = JSON.parse(request.mock.calls[1]![1].body);
  expect(body.input.at(-1)).toEqual(
    expect.objectContaining({
      type: "computer_call_output",
      call_id: "c1",
      acknowledged_safety_checks: [{ id: "s", code: "check", message: "Confirm" }],
    }),
  );
  expect(session.observe).toHaveBeenLastCalledWith(1);
});
it("does not perform model actions when the user declines", async () => {
  const observed = {
    observationId: "o",
    frameSeq: 1,
    width: 2,
    height: 2,
    format: "image/png",
    imageBase64: "AQID",
    latestFrameMaxAgeMs: 2000,
  };
  const session = {
    abort: new AbortController(),
    observe: vi.fn(async () => observed),
    act: vi.fn(),
  } as unknown as DesktopAgentSession;
  await runOpenAiComputer(session, "test", {
    model: "test",
    apiKey: "test-only",
    maxSteps: 1,
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          output: [
            { type: "computer_call", call_id: "c", actions: [{ type: "type", text: "no" }] },
          ],
        }),
      )) as typeof fetch,
    approve: async () => false,
    event: async () => {},
  });
  expect(session.act).not.toHaveBeenCalled();
});
it.each(["response", "call"])(
  "rejects an incomplete %s before approval or any input",
  async (which) => {
    const session = {
      abort: new AbortController(),
      observe: vi.fn(async () => ({
        observationId: "o",
        frameSeq: 1,
        width: 2,
        height: 2,
        format: "image/png",
        imageBase64: "AQID",
      })),
      act: vi.fn(),
    } as unknown as DesktopAgentSession;
    const approve = vi.fn(async () => true);
    await expect(
      runOpenAiComputer(session, "test", {
        model: "test",
        apiKey: "test",
        maxSteps: 1,
        approve,
        event: async () => {},
        fetchImpl: (async (_url, opts) => {
          expect(opts?.redirect).toBe("error");
          return new Response(
            JSON.stringify({
              status: which === "response" ? "incomplete" : "completed",
              output: [
                {
                  type: "computer_call",
                  status: which === "call" ? "in_progress" : "completed",
                  call_id: "c",
                  actions: [{ type: "type", text: "test" }],
                },
              ],
            }),
          );
        }) as typeof fetch,
      }),
    ).rejects.toThrow("not completed");
    expect(session.act).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
  },
);
