export type LocalRole = "character" | "settings" | "bubble";
export const LOCAL_ORIGIN = "soda-assistant://app";
const roles = new Set<LocalRole>(["character", "settings", "bubble"]);

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
  if (action === "read" || action === "settings" || action === "open" || action === "chat")
    return true;
  if (action === "hide") return sender.role === "bubble";
  if (action === "inbox") return sender.role === "bubble";
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
