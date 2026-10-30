import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DesktopAssistantPreferences, desktopAssistantOrigin } from "@sodashitsu/protocol";
import { PreferencesFile } from "./preferences.js";

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(folders.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), "soda-assistant-test-"));
  folders.push(folder);
  return { folder, path: join(folder, "assistant.json") };
}

it("atomically saves, restores robot captain and serializes concurrent writes", async () => {
  const { folder, path } = await fixture();
  const file = new PreferencesFile(path);
  expect((await file.read()).enabled).toBe(false);
  await Promise.all([
    file.write({ enabled: true, characterId: "captain-male" }),
    file.write({ enabled: true, characterId: "captain-robot", mode: "tray" }),
  ]);
  expect(await file.read()).toEqual(
    DesktopAssistantPreferences.parse({
      enabled: true,
      characterId: "captain-robot",
      mode: "tray",
    }),
  );
  expect(await readdir(folder)).toEqual(["assistant.json"]);
});
it("preserves invalid files for recovery instead of silently replacing them", async () => {
  const { path } = await fixture();
  await writeFile(path, "{broken");
  await expect(new PreferencesFile(path).read()).rejects.toThrow();
  expect(await readFile(path, "utf8")).toBe("{broken");
});
it("rejects unknown native settings, credentials and insecure remote origins", () => {
  expect(() => DesktopAssistantPreferences.parse({ shell: "evil" })).toThrow();
  for (const url of [
    "http://remote.test:7780",
    "https://user:secret@example.test",
    "file:///tmp/x",
    "https://example.test/path",
    "https://example.test/?token=secret",
  ])
    expect(() => desktopAssistantOrigin(url)).toThrow();
  expect(desktopAssistantOrigin("http://[::1]:7780/")).toBe("http://[::1]:7780");
  expect(desktopAssistantOrigin("https://example.test/")).toBe("https://example.test");
});

it("restores model/effort profiles from the actual preferences file", async () => {
 const {path}=await fixture();
 const profiles={claude:{model:"sonnet",effort:"high"},codex:{model:"custom-model",effort:"low"}};
 await new PreferencesFile(path).write({agentProfiles:profiles});
 expect((await new PreferencesFile(path).read()).agentProfiles).toEqual(profiles);
});
