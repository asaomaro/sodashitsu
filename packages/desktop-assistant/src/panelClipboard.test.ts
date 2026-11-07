import { expect, it } from "vitest";
import { PanelClipboard } from "./panelClipboard.js";

it("allows sanitized writes only from the registered current server main frame", () => {
  const policy = new PanelClipboard();
  const contents = { isDestroyed: () => false, mainFrame: {url: "http://127.0.0.1:7780/#pane"} };
  const details = {isMainFrame: true, requestingUrl: contents.mainFrame.url};
  expect(policy.permits(contents, "clipboard-sanitized-write", details)).toBe(false);
  policy.register(contents, "http://127.0.0.1:7780");
  expect(policy.permits(contents, "clipboard-sanitized-write", details)).toBe(true);
  for (const permission of ["clipboard-read", "deprecated-sync-clipboard-read", "clipboard-write", "media", "unknown"]) {
    expect(policy.permits(contents, permission, details)).toBe(false);
  }
  expect(policy.permits(contents, "clipboard-sanitized-write", {...details, isMainFrame:false})).toBe(false);
  expect(policy.permits(contents, "clipboard-sanitized-write", {isMainFrame:true})).toBe(false);
  expect(policy.permits(contents, "clipboard-sanitized-write", {...details, requestingUrl:"http://127.0.0.1:7780/plugin"})).toBe(false);
  expect(policy.permits({...contents}, "clipboard-sanitized-write", details)).toBe(false);
  contents.mainFrame.url = "http://127.0.0.1:7780/plugins/generated/index.html";
  expect(policy.permits(contents, "clipboard-sanitized-write", {isMainFrame:true, requestingUrl:contents.mainFrame.url})).toBe(false);
  contents.mainFrame.url = "https://evil.test/";
  expect(policy.permits(contents, "clipboard-sanitized-write", {isMainFrame:true, requestingUrl:contents.mainFrame.url})).toBe(false);
  contents.mainFrame.url = details.requestingUrl;
  policy.forget(contents);
  expect(policy.permits(contents, "clipboard-sanitized-write", details)).toBe(false);
  policy.register(contents, "http://127.0.0.1:7780");
  contents.isDestroyed = () => true;
  expect(policy.permits(contents, "clipboard-sanitized-write", details)).toBe(false);
  expect(policy.permits(null, "clipboard-sanitized-write", details)).toBe(false);
});
