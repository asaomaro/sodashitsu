import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./atomicFile.js";
import { defaultIntegrationFileData, FsIntegrationFile, type IntegrationFileData } from "./IntegrationFile.js";

describe("FsIntegrationFile", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-integrations-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports missing before the first save", async () => {
    const file = new FsIntegrationFile(dir);
    expect((await file.load()).kind).toBe("missing");
  });

  it("defaults autoResumeEnabled to true", () => {
    expect(defaultIntegrationFileData()).toEqual({ schema: 1, autoResumeEnabled: true });
  });

  it("round-trips autoResumeEnabled", async () => {
    const file = new FsIntegrationFile(dir);
    const data: IntegrationFileData = { schema: 1, autoResumeEnabled: false };
    await file.save(data);
    expect(await file.load()).toEqual({ kind: "ok", data });
  });
});
