import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./atomicFile.js";
import { AuthFileData, emptyAuthFileData, FsAuthFile } from "./AuthFile.js";

describe("FsAuthFile", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-auth-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports missing before the first save", async () => {
    const file = new FsAuthFile(dir);
    expect((await file.load()).kind).toBe("missing");
  });

  it("round-trips token and sessions", async () => {
    const file = new FsAuthFile(dir);
    const data: AuthFileData = {
      ...emptyAuthFileData(),
      token: { salt: "s", hash: "h", createdAt: "2026-09-18T00:00:00Z" },
      sessions: [{ idHash: "abc", createdAt: "2026-09-18T00:00:00Z", lastSeenAt: "2026-09-18T00:00:00Z" }],
    };
    await file.save(data);
    expect(await file.load()).toEqual({ kind: "ok", data });
  });
});
