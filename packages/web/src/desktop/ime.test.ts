import { expect, it } from "vitest";
import { imeKeyCode } from "./ime.js";

it.each([
  ["Unidentified", "Lang1", "ImeOn"], ["Process", "Lang2", "ImeOff"],
  ["IMEOn", "", "ImeOn"], ["IMEOff", "", "ImeOff"],
  ["ImeOn", "Lang2", "ImeOn"], ["ImeOff", "Lang1", "ImeOff"],
])("normalizes dedicated IME key %s / %s to %s", (key, code, expected) => {
  expect(imeKeyCode({key,code})).toBe(expected);
});
it.each([["Process", "KeyA"], ["Unidentified", ""], ["Convert", "Convert"], ["NonConvert", "NonConvert"], ["ZenkakuHankaku", "Backquote"]])("does not reinterpret %s as a dedicated ON/OFF command", (key,code) => {
  expect(imeKeyCode({key,code})).toBeUndefined();
});
