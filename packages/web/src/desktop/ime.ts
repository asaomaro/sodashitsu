export type ImeKeyCode = "ImeOn" | "ImeOff";

/** Japanese dedicated IME keys: key is semantic; LANG1/2 cover Process/Unidentified reports. */
export function imeKeyCode(event: Pick<KeyboardEvent, "key" | "code">): ImeKeyCode | undefined {
  if (event.key === "IMEOn" || event.key === "ImeOn") return "ImeOn";
  if (event.key === "IMEOff" || event.key === "ImeOff") return "ImeOff";
  if (event.code === "Lang1") return "ImeOn";
  if (event.code === "Lang2") return "ImeOff";
  return undefined;
}
