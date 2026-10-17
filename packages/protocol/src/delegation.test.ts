import { expect, it } from "vitest";
import { delegationUrl, DelegationStartParams } from "./delegation.js";
it("requires secure outbound origins, keeps credentials out of URL, and validates scoped IDs", () => {
  expect(delegationUrl("https://controller.example:8443")).toBe(
    "wss://controller.example:8443/machine-delegation",
  );
  expect(delegationUrl("http://127.0.0.1:7780")).toBe("ws://127.0.0.1:7780/machine-delegation");
  for (const url of [
    "http://controller.example",
    "ws://192.168.1.3",
    "https://user:secret@x",
    "https://x?token=a",
    "https://x/#key",
    "https://x/other",
    "file:///tmp/x",
  ])
    expect(() => delegationUrl(url)).toThrow();
  expect(
    DelegationStartParams.safeParse({ url: "https://x", machineId: "../x", token: "a".repeat(43) })
      .success,
  ).toBe(false);
});
