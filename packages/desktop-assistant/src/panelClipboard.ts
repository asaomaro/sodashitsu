import { sameServerNavigation } from "./security.js";

interface PanelContents {
  isDestroyed(): boolean;
  mainFrame: { url: string };
}

/** Only a registered server panel's current top-level document may write.
 * No native bridge is exposed to the server, plugins or embedded documents. */
export class PanelClipboard {
  private readonly origins = new WeakMap<PanelContents, {origin: string; pathname: string}>();

  register(contents: PanelContents, documentUrl: string): void {
    const url = new URL(documentUrl);
    this.origins.set(contents, {origin: url.origin, pathname: url.pathname});
  }

  forget(contents: PanelContents): void {
    this.origins.delete(contents);
  }

  permits(
    contents: PanelContents | null,
    permission: string,
    details: { isMainFrame?: boolean; requestingUrl?: string },
  ): boolean {
    if (!contents || permission !== "clipboard-sanitized-write" ||
      details.isMainFrame !== true || typeof details.requestingUrl !== "string") return false;
    const origin = this.origins.get(contents);
    if (!origin || contents.isDestroyed()) return false;
    const current = contents.mainFrame.url;
    return details.requestingUrl === current && sameServerNavigation(current, origin.origin) &&
      new URL(current).pathname === origin.pathname;
  }
}
