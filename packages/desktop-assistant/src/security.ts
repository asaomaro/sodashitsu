export type LocalRole = "character" | "settings" | "bubble" | "notice" | "tools" | "panel";
export const LOCAL_ORIGIN = "soda-assistant://app";
const roles = new Set<LocalRole>(["character", "settings", "bubble", "notice", "tools", "panel"]);

export function localRole(url: string): LocalRole | null {
  try {
    const parsed = new URL(url);
    const role = parsed.pathname.slice(1).replace(/\.html$/, "") as LocalRole;
    return parsed.protocol === "soda-assistant:" &&
      parsed.host === "app" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      roles.has(role) &&
      parsed.pathname === `/${role}.html`
      ? role
      : null;
  } catch {
    return null;
  }
}

/** A subframe, old document or remote panel must never inherit native controls. */
export function authorizeLocalSender(
  sender: {
    frameUrl: string;
    mainFrame: boolean;
    current: boolean;
    role: LocalRole;
  },
  action: string,
): boolean {
  if (!sender.mainFrame || !sender.current || localRole(sender.frameUrl) !== sender.role)
    return false;
  if (sender.role === "panel") return action === "window-action" || action === "window-resize" || action === "window-state";
  if (action === "read" || action === "settings" || action === "open" || action === "chat")
    return true;
  if (action === "voice-test" || action === "voice-speakers" || action === "voice-match" || action === "voice-versions") return sender.role === "settings";
  if (action === "voice-state" || action === "voice-stop") return sender.role !== "character";
  if (action === "notice-state" || action === "notice-dismiss" || action === "notice-open") return sender.role === "notice";
  if (action === "character-state" || action === "character-actor") return sender.role === "character";
  if (action === "character-info") return true;
  if (
    [
      "display-list",
      "character-list",
      "character-pack-preview",
      "yukkuri-characters-preview",
      "character-pack-import",
      "character-pack-remove",
    ].includes(action)
  )
    return sender.role === "settings";
  if (action === "window-action" || action === "window-resize" || action === "window-state") return sender.role === "settings" || sender.role === "tools";
  if (action === "hide") return sender.role === "bubble" || sender.role === "tools";
  if(action==="tools-open")return sender.role==="bubble" || sender.role==="settings";
  if(action==="draft-state"||action==="draft-consume")return sender.role==="bubble";
  if(action==="draft-message")return sender.role==="tools";
  if(sender.role==="tools")return ["tools","apps","app-open","app-call","screenshot-sources","screenshot-approve","screenshot-submit","screenshot-cancel","reminders","reminder-save","reminder-remove","reminder-ack","ocr-state","ocr-file","ocr-clipboard","ocr-crop","ocr-run","ocr-discard","note-save","note-delete","transcribe-file","transcribe-cancel","clipboard-read","clipboard-write","record-start","record-stop","record-discard","record-transcribe"].includes(action);
  if (
    [
      "inbox",
      "notice-read",
      "resize-start",
      "resize-move",
      "resize-end",
      "conversation",
      "start-session",
      "adopt-session",
      "send-message",
      "apps",
      "app-open",
      "app-call",
      "screenshot-sources",
      "screenshot-approve",
      "screenshot-submit",
      "screenshot-cancel",
      "reminders",
      "reminder-save",
      "reminder-remove",
      "reminder-ack",
      "source-open",
      "source-reply",
      "source-key",
      "session-open",
      "ocr-state",
      "ocr-file",
      "ocr-clipboard",
      "ocr-crop",
      "ocr-run",
      "ocr-discard",
      "tools",
      "note-save",
      "note-delete",
      "transcribe-file",
      "transcribe-cancel",
      "clipboard-read",
      "clipboard-write",
      "record-start",
      "record-stop",
      "record-discard",
      "record-transcribe",
    ].includes(action)
  )
    return sender.role === "bubble";
  return action === "save" && sender.role === "settings";
}

export function sameServerNavigation(url: string, origin: string): boolean {
  try {
    const target = new URL(url);
    return !target.username && !target.password && target.origin === origin;
  } catch {
    return false;
  }
}
