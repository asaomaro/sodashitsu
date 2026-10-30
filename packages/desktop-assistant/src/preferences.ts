import { randomUUID } from "node:crypto";
import { readFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DesktopAssistantPreferences } from "@sodashitsu/protocol";

/** Only local preferences; cookies/tokens are owned by Electron's separate session storage. */
export class PreferencesFile {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly path: string) {}

  async read(): Promise<DesktopAssistantPreferences> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return DesktopAssistantPreferences.parse({});
      throw error;
    }
    if (Buffer.byteLength(text) > 16_384) throw new Error("設定ファイルが大きすぎます");
    return DesktopAssistantPreferences.parse(JSON.parse(text));
  }

  write(input: unknown): Promise<void> {
    // Validate and detach before queueing so callers cannot mutate a pending write.
    const preferences = DesktopAssistantPreferences.parse(input);
    const operation = this.queue.then(async () => {
      const parent = dirname(this.path);
      await mkdir(parent, { recursive: true, mode: 0o700 });
      const temporary = join(parent, `.assistant-${randomUUID()}.tmp`);
      try {
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(JSON.stringify(preferences, null, 2) + "\n");
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, this.path);
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
