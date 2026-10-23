export type ImeKeyCode = "ImeOn" | "ImeOff";

/** Japanese dedicated IME keys: key is semantic; LANG1/2 cover Process/Unidentified reports. */
export function imeKeyCode(event: Pick<KeyboardEvent, "key" | "code">): ImeKeyCode | undefined {
  // A physical Space shortcut belongs to the remote keyboard layout, even when
  // the local IME labels it as an ON/OFF event.
  if (event.code === "Space") return undefined;
  if (event.key === "IMEOn" || event.key === "ImeOn") return "ImeOn";
  if (event.key === "IMEOff" || event.key === "ImeOff") return "ImeOff";
  if (event.code === "Lang1") return "ImeOn";
  if (event.code === "Lang2") return "ImeOff";
  return undefined;
}
