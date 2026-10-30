import { randomUUID } from "node:crypto";
import { lstat, readFile, writeFile, link, unlink } from "node:fs/promises";
import { z } from "zod";

/** Main-process installation identity, separate from editable renderer preferences. */
export async function deviceIdentity(path: string): Promise<string> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128)
      throw Error("アシスタントの端末識別情報を確認できません。");
    return z
      .uuid()
      .parse((await readFile(path, "utf8")).trim())
      .toLowerCase();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const id = randomUUID();
    // Publish a complete file without replacing a concurrent installation identity.
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${id}\n`, { mode: 0o600, flag: "wx" });
    try {
      try {
        await link(temporary, path);
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code === "EEXIST") return deviceIdentity(path);
        throw writeError;
      }
      return id;
    } finally {
      await unlink(temporary);
    }
  }
}
