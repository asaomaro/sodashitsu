import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { writeFileAtomic } from "../persist/atomicFile.js";
export const WINDOWS_CONTROL_SECRET = "windows-control.key";
export async function controlSecret(stateDir: string, create = false): Promise<string> {
  const path = join(stateDir, WINDOWS_CONTROL_SECRET);
  try {
    const s = (await readFile(path, "utf8")).trim();
    if (!/^[a-f0-9]{64}$/.test(s)) throw new Error("invalid Windows control secret");
    return s;
  } catch (e) {
    if (!create || (e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    const s = randomBytes(32).toString("hex");
    await writeFileAtomic(path, s + "\n");
    return s;
  }
}
