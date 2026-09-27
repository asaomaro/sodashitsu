import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir, readFileWithBackup, writeFileAtomic } from "./atomicFile.js";
import { rm } from "node:fs/promises";

describe("writeFileAtomic / readFileWithBackup", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-atomic-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes and reads back a file", async () => {
    const filePath = join(dir, "session.json");
    await writeFileAtomic(filePath, JSON.stringify({ a: 1 }));
    const contents = await readFile(filePath, "utf8");
    expect(JSON.parse(contents)).toEqual({ a: 1 });
  });

  it("leaves no temp directories behind", async () => {
    const filePath = join(dir, "session.json");
    await writeFileAtomic(filePath, "{}");
    const entries = await readdir(dir);
    expect(entries).toEqual(["session.json"]);
  });

  it("reports missing for a file that does not exist", async () => {
    const result = await readFileWithBackup(join(dir, "nope.json"), join(dir, "backups"), (raw) =>
      JSON.parse(raw),
    );
    expect(result.kind).toBe("missing");
  });

  it("reports ok and parses a well-formed file", async () => {
    const filePath = join(dir, "session.json");
    await writeFileAtomic(filePath, JSON.stringify({ schema: 1 }));
    const result = await readFileWithBackup(filePath, join(dir, "backups"), (raw) => JSON.parse(raw) as { schema: number });
    expect(result).toEqual({ kind: "ok", data: { schema: 1 } });
  });

  it("backs up a corrupt file and reports corrupt", async () => {
    const filePath = join(dir, "session.json");
    await writeFile(filePath, "{not json", "utf8");
    const backupsDir = join(dir, "backups");
    const result = await readFileWithBackup(filePath, backupsDir, (raw) => JSON.parse(raw));
    expect(result.kind).toBe("corrupt");
    if (result.kind !== "corrupt") throw new Error("unreachable");
    const backupContents = await readFile(result.backupPath, "utf8");
    expect(backupContents).toBe("{not json");
  });

  it("keeps only the 3 most recent backups", async () => {
    const filePath = join(dir, "session.json");
    const backupsDir = join(dir, "backups");
    for (let i = 0; i < 5; i++) {
      await writeFile(filePath, `{bad-${i}`, "utf8");
      await readFileWithBackup(filePath, backupsDir, (raw) => JSON.parse(raw));
      await new Promise((r) => setTimeout(r, 5)); // タイムスタンプのファイル名を確実にずらす
    }
    const entries = await readdir(backupsDir);
    expect(entries.length).toBe(3);
  });
});
