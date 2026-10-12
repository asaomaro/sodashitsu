import { expect, it, vi } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import { registerConversationMethods } from "./conversation.js";
import type { MethodDeps } from "./deps.js";
it("test notification invokes only its fixed callback and accepts no custom payload", async () => {
  const surface = new ControlSurface(),
    notify = vi.fn();
  registerConversationMethods(surface, { notificationTest: notify } as unknown as MethodDeps);
  const context = {
    clientId: "authenticated",
    sink: { sendEvent: vi.fn(), sendOutput: vi.fn(), sendSnapshot: vi.fn() },
  };
  const result = await surface.invoke(context as never, "notification.test", {});
  expect(result).toEqual({ ok: true, result: { ok: true } });
  expect(notify).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledWith();
});
