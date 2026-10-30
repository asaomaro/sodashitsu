import { expect, it } from "vitest";
import { sodaCookieHeader } from "./cookieHeader.js";
it("includes default and named sessions for the URL-filtered browser cookie scope only", () => {
  expect(
    sodaCookieHeader([
      { name: "soda_session", value: "generated-default", path: "/" },
      { name: "soda_session_A.b-c_1", value: "generated-named", path: "/" },
      { name: "unrelated", value: "not-forwarded", path: "/" },
      { name: "soda_session_other", value: "not-forwarded", path: "/other" },
    ]),
  ).toBe("soda_session=generated-default; soda_session_A.b-c_1=generated-named");
  expect(sodaCookieHeader([])).toBeNull();
});
it("bounds headers and rejects unsafe cookie values instead of silently changing authentication", () => {
  expect(() =>
    sodaCookieHeader([{ name: "soda_session", path: "/", value: "x\r\nX: injected" }]),
  ).toThrow();
  expect(() =>
    sodaCookieHeader(
      Array.from({ length: 65 }, (_, index) => ({
        name: `soda_session_${index}`,
        path: "/",
        value: "generated",
      })),
    ),
  ).toThrow();
});
