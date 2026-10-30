import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";

// Standalone generated UI verification: headless Chromium only, no Electron/OS/agent start.
const root = fileURLToPath(new URL("../assets/", import.meta.url));
const files = new Set([
  "character.html",
  "character.js",
  "settings.html",
  "settings.js",
  "bubble.html",
  "bubble.js",
  "style.css",
  "captain-male.svg",
  "captain-female.svg",
  "captain-robot.svg",
]);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname.slice(1);
  if (!files.has(path)) {
    response.writeHead(404).end();
    return;
  }
  const ext = path.split(".").at(-1);
  response.setHeader(
    "Content-Type",
    { html: "text/html", js: "text/javascript", css: "text/css", svg: "image/svg+xml" }[ext],
  );
  response.end(await readFile(join(root, path)));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--disable-gpu", "--disable-frame-rate-limit"],
  });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.calls = [];
    window.preferences = {
      version: 1,
      enabled: false,
      mode: "character",
      characterId: "captain-female",
      characterSize: 192,
      serverOrigin: "http://127.0.0.1:7780",
      launchAtLogin: false,
      mute: false,
      reducedMotion: false,
      position: null,
    };
    window.assistant = {
      inbox: async () => ({
        status: "connected",
        revision: 1,
        notices: [{ message: "「操舵室 / worker」の作業が完了しました。" }],
      }),
      onInbox: (callback) => {
        window.noticeCallback = callback;
        return () => {};
      },
      read: async () => window.preferences,
      save: async (preferences) => {
        window.calls.push(["save", preferences]);
        window.preferences = preferences;
        return preferences;
      },
      open: async () => window.calls.push(["open"]),
      settings: async () => window.calls.push(["settings"]),
      chat: async () => window.calls.push(["chat"]),
      hide: async () => window.calls.push(["hide"]),
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/settings.html`);
  await expect(page.getByRole("button", { name: "操舵室を開く" })).toBeDisabled();
  await page.locator("#enabled").press("Space");
  await expect(page.locator("#enabled")).toBeChecked();
  for (const character of ["captain-male", "captain-female", "captain-robot"]) {
    await page.locator("#characterId").selectOption(character);
    await page.getByRole("button", { name: "保存", exact: true }).press("Enter");
    await expect(page.getByRole("status")).toHaveText("保存しました。");
    assert.equal(await page.evaluate(() => window.preferences.characterId), character);
  }
  await page.locator("#mode").selectOption("tray");
  await page.getByRole("button", { name: "保存", exact: true }).press("Enter");
  await expect(page.getByRole("status")).toHaveText("保存しました。");
  assert.equal(await page.evaluate(() => window.preferences.characterId), "captain-robot");
  assert.equal(await page.evaluate(() => window.preferences.mode), "tray");
  await page.getByRole("button", { name: "操舵室を開く" }).press("Enter");
  assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), "open");
  await page.evaluate(() => {
    window.assistant.save = async () => {
      throw Error("disk full");
    };
  });
  await page.getByRole("button", { name: "保存", exact: true }).press("Enter");
  await expect(page.getByRole("status")).toContainText("disk full");
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
  await page.goto(`${origin}/character.html`);
  await expect(page.locator("#portrait")).toHaveAttribute("src", "captain-female.svg");
  await page.getByRole("button", { name: "船長と話す" }).press("Enter");
  assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), "chat");
  await page.goto(`${origin}/bubble.html`);
  await expect(page.getByRole("log")).toContainText("こんにちは。操舵室の船長です。");
  await expect(page.locator("#destination")).toHaveText("専用アシスタント");
  await expect(page.getByRole("log")).toContainText("作業が完了しました。");
  await page.evaluate(() =>
    window.noticeCallback({
      status: "connected",
      revision: 2,
      notices: [{ message: "<img src=x onerror=alert(1)>確認してください。" }],
    }),
  );
  await expect(page.locator(".notice")).toHaveText(
    "<img src=x onerror=alert(1)>確認してください。",
  );
  await expect(page.locator(".notice img")).toHaveCount(0);
  await page.evaluate(() => window.noticeCallback({ status: "offline", revision: 1, notices: [] }));
  await expect(page.locator(".notice")).toContainText("確認してください。");
  await expect(page.locator("#send")).toBeDisabled(); // No false successful chat before backend connection.
  await page.getByRole("button", { name: "吹き出しを閉じる" }).press("Enter");
  assert.equal(await page.evaluate(() => window.calls.at(-1)[0]), "hide");
  assert.deepEqual(errors, []);
  await context.close();
  console.log(
    "PASS: generated settings keyboard flow, three-character selection, recovery, character/bubble actions and disconnected conversation state",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
