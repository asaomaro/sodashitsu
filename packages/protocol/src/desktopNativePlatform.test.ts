import { expect, it } from "vitest";
import { DesktopInputCapabilities, DesktopNativePlatformFailure, supportsDesktopInput } from "./desktopNativePlatform.js";

it("limits native input to the OS adapter's actual capabilities while retaining legacy input", () => {
  const caps = DesktopInputCapabilities.parse({ keys: ["KeyA", "ControlLeft", "Space"], text: false, pointerButtons: [0, 1, 2, 3, 4], wheel: true });
  expect(supportsDesktopInput(caps, { kind: "key", code: "Space", down: true })).toBe(true);
  expect(supportsDesktopInput(caps, { kind: "key", code: "F24", down: true })).toBe(false);
  expect(supportsDesktopInput(caps, { kind: "text", text: "generated" })).toBe(false);
  expect(supportsDesktopInput(caps, { kind: "pointer", event: "down", button: 4, x: .5, y: .5 })).toBe(true);
  expect(supportsDesktopInput({...caps,pointerButtons:[]}, {kind:"pointer",event:"move",button:0,x:.5,y:.5})).toBe(false);
  expect(supportsDesktopInput(undefined, { kind: "key", code: "F24", down: true })).toBe(true);
});

it("rejects unknown capability fields, duplicates and unbounded lists", () => {
  const caps = { keys: ["KeyA"], text: true, pointerButtons: [0], wheel: true };
  for (const invalid of [{ ...caps, executable: "arbitrary" }, { ...caps, keys: ["KeyA", "KeyA"] }, { ...caps, pointerButtons: [0, 0] }, { ...caps, keys: ["bad\nkey"] }, { ...caps, keys: Array.from({ length: 257 }, (_, i) => "Key" + i) }])
    expect(DesktopInputCapabilities.safeParse(invalid).success).toBe(false);
});

it("native failures carry only a fixed backend and reason", () => {
  expect(DesktopNativePlatformFailure.parse({ type: "platform_failure", backend: "linux-portal", code: "permission_denied" })).toMatchObject({ code: "permission_denied" });
  expect(DesktopNativePlatformFailure.safeParse({ type: "platform_failure", backend: "linux-portal", code: "permission_denied", error: "/private/native/exception" }).success).toBe(false);
  expect(DesktopNativePlatformFailure.safeParse({ type: "platform_failure", backend: "synthetic", code: "permission_denied" }).success).toBe(false);
});
