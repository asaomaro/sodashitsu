import { afterEach, expect, it, vi } from "vitest";
import { loadTerminalFonts } from "./terminalFonts.js";

const original = Object.getOwnPropertyDescriptor(document, "fonts");
afterEach(() => {
  vi.useRealTimers();
  if (original) Object.defineProperty(document, "fonts", original);
  else Reflect.deleteProperty(document, "fonts");
});
it("continues startup after a stalled font transfer and repaints when it eventually loads", async () => {
  vi.useFakeTimers();
  let finish!: (value: FontFace[]) => void;
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      load: () =>
        new Promise<FontFace[]>((resolve) => {
          finish = resolve;
        }),
    },
  });
  const repaint = vi.fn();
  const startup = loadTerminalFonts(repaint);
  await vi.advanceTimersByTimeAsync(1500);
  await startup;
  expect(repaint).not.toHaveBeenCalled();
  finish([]);
  await Promise.resolve();
  expect(repaint).toHaveBeenCalledOnce();
});
