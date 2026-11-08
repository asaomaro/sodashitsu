import { afterEach, expect, it, vi } from "vitest";
import { childRequestId } from "./childRequestId.js";
afterEach(() => vi.unstubAllGlobals());
it("uses native crypto.randomUUID when present", () => {
  const id = "11111111-1111-4111-8111-111111111111",
    randomUUID = vi.fn(() => id),
    getRandomValues = vi.fn();
  vi.stubGlobal("crypto", { randomUUID, getRandomValues });
  expect(childRequestId()).toBe(id);
  expect(randomUUID).toHaveBeenCalledTimes(1);
  expect(getRandomValues).not.toHaveBeenCalled();
});
it("uses sixteen cryptographic random bytes and sets v4/variant bits without native randomUUID", () => {
  const getRandomValues = vi.fn((value: Uint8Array) => value.fill(255));
  vi.stubGlobal("crypto", { getRandomValues });
  expect(childRequestId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  expect(getRandomValues).toHaveBeenCalledTimes(1);
  expect(getRandomValues.mock.calls[0]![0]).toBeInstanceOf(Uint8Array);
  expect(getRandomValues.mock.calls[0]![0].byteLength).toBe(16);
});
it.each(["missing", "throws"])("never invents an ID when cryptographic entropy is %s", (why) => {
  vi.stubGlobal(
    "crypto",
    why === "missing"
      ? {}
      : {
          getRandomValues: () => {
            throw Error("generated entropy failure");
          },
        },
  );
  expect(() => childRequestId()).toThrow();
});
