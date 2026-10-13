/** IME candidate cancellation belongs to xterm; plain Escape returns to the app. */
export function isEmbeddedAppEscape(
  ev: Pick<
    KeyboardEvent,
    "key" | "isComposing" | "keyCode" | "ctrlKey" | "altKey" | "metaKey" | "shiftKey"
  >,
): boolean {
  return (
    ev.key === "Escape" &&
    !ev.isComposing &&
    ev.keyCode !== 229 &&
    !ev.ctrlKey &&
    !ev.altKey &&
    !ev.metaKey &&
    !ev.shiftKey
  );
}
