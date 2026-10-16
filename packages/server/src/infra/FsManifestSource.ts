import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ManifestSource } from "./ManifestSource.js";

/** `third_party/herdr/agent-detection/*.toml` を読む実装（D5・decisions.md D5）。 */
export class FsManifestSource implements ManifestSource {
  constructor(private readonly dir: string) {}

  async list(): Promise<string[]> {
    const entries = await readdir(this.dir);
    return entries.filter((name) => name.endsWith(".toml")).sort();
  }

  async read(name: string): Promise<string> {
    return readFile(join(this.dir, name), "utf8");
  }

  describe(): string {
    return this.dir;
  }
}
