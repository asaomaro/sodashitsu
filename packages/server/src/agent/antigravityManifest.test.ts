import { join } from "node:path";
import { expect, it } from "vitest";
import { FsManifestSource } from "../infra/FsManifestSource.js";
import { MemoryLogger } from "../log/Logger.js";
import { DefaultManifestStore } from "./ManifestStore.js";
import { evaluate } from "./ManifestEngine.js";

it("identifies the observed agy workspace trust dialog as blocked", async () => {
  const root = join(import.meta.dirname, "../../../..");
  const store = await DefaultManifestStore.load([
    new FsManifestSource(join(root, "third_party/herdr/agent-detection")),
    new FsManifestSource(join(root, "packages/server/assets/agent-detection")),
  ], new MemoryLogger());
  const manifest = store.get("agy")!;
  const check = (lines: string[]) => evaluate({ lines, oscTitle: "", oscProgress: null }, manifest);
  expect(check(["Accessing workspace:", "Do you trust the contents of this project?", "Antigravity CLI requires permission to read, edit, and execute files here.", "> Yes, I trust this folder", "No, exit"])).toMatchObject({ state: "blocked", visibleBlocker: true });
  expect(check(["> "])).toMatchObject({ state: "idle" });
});
