import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { FileLogger } from "./Logger.js";

describe("FileLogger.flush（20260926-live-handoff）", () => {
  let dir: string;
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("それまでに出したログがファイルに書き終わってから解決する（出した順のまま）", async () => {
    dir = await makeTempDir("wtm-logger-");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = new FileLogger(join(dir, "sub", "server.log"));
    for (let i = 0; i < 50; i++) logger.info(`line ${i}`);
    logger.warn("last");
    await logger.flush();
    const lines = (await readFile(join(dir, "sub", "server.log"), "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l).msg as string);
    expect(lines).toEqual([...Array.from({ length: 50 }, (_, i) => `line ${i}`), "last"]);
  });

  it("書けなくても投げない", async () => {
    dir = await makeTempDir("wtm-logger-");
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = new FileLogger(join(dir, "server.log", "\0bad"));
    logger.info("x");
    await expect(logger.flush()).resolves.toBeUndefined();
  });
});
