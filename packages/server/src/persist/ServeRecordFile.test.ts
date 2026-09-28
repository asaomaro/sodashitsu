import { chmod, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "./atomicFile.js";
import {
  parseServeRecord,
  readServeRecord,
  SERVE_RECORD_FILE_NAME,
  writeServeRecord,
} from "./ServeRecordFile.js";

/** 20260926-named-session-ui（AC10・AC11）。 */
describe("serve.json（起動の記録）", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-serve-record-");
  });
  afterEach(async () => {
    await chmod(join(dir, SERVE_RECORD_FILE_NAME), 0o600).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  });

  const valid = { pid: 123, hostname: "h", port: 7781, https: false, host: "127.0.0.1" };

  it("書いたものを読める（0600）", async () => {
    await writeServeRecord(dir, valid);
    expect(await readServeRecord(dir)).toMatchObject({ schema: 1, ...valid });
    if (process.platform !== "win32")
      expect((await stat(join(dir, SERVE_RECORD_FILE_NAME))).mode & 0o777).toBe(0o600);
  });

  it("TLS の証明書の指紋（certSha256）を書いて読める。無ければ項目ごと無い・空文字は無いとみなす（20260927-cli-mode）", async () => {
    const certSha256 = "AA:BB:CC";
    await writeServeRecord(dir, { ...valid, https: true, certSha256 });
    expect(await readServeRecord(dir)).toMatchObject({ https: true, certSha256 });
    await writeServeRecord(dir, valid);
    expect(await readServeRecord(dir)).not.toHaveProperty("certSha256");
    const raw = JSON.stringify({ schema: 1, ...valid, certSha256: "" });
    expect(parseServeRecord(raw)).not.toHaveProperty("certSha256");
  });

  it("状態ディレクトリが無ければ作って書く", async () => {
    const nested = join(dir, "sessions", "work");
    await writeServeRecord(nested, valid);
    expect((await readServeRecord(nested))?.port).toBe(7781);
  });

  it("無いときは undefined", async () => {
    expect(await readServeRecord(dir)).toBeUndefined();
  });

  it.each([
    ["JSON でない", "{not json"],
    ["null", "null"],
    ["schema が違う", JSON.stringify({ ...valid, schema: 2 })],
    ["ポートが 0", JSON.stringify({ schema: 1, ...valid, port: 0 })],
    ["ポートが 65536", JSON.stringify({ schema: 1, ...valid, port: 65536 })],
    ["ポートが小数", JSON.stringify({ schema: 1, ...valid, port: 1.5 })],
    ["ポートが文字列", JSON.stringify({ schema: 1, ...valid, port: "7781" })],
    ["pid が無い", JSON.stringify({ schema: 1, ...valid, pid: undefined })],
    ["pid が 0", JSON.stringify({ schema: 1, ...valid, pid: 0 })],
    ["pid が負", JSON.stringify({ schema: 1, ...valid, pid: -1 })],
    ["pid が小数", JSON.stringify({ schema: 1, ...valid, pid: 1.5 })],
    ["https が無い", JSON.stringify({ schema: 1, ...valid, https: undefined })],
    ["host が空", JSON.stringify({ schema: 1, ...valid, host: "" })],
    ["hostname が数", JSON.stringify({ schema: 1, ...valid, hostname: 1 })],
  ])("壊れている（%s）なら undefined（投げない）", async (_label, raw) => {
    await writeFile(join(dir, SERVE_RECORD_FILE_NAME), raw);
    expect(await readServeRecord(dir)).toBeUndefined();
  });

  it("端のポート（1・65535）は受け付ける", () => {
    expect(parseServeRecord(JSON.stringify({ schema: 1, ...valid, port: 1 }))?.port).toBe(1);
    expect(parseServeRecord(JSON.stringify({ schema: 1, ...valid, port: 65535 }))?.port).toBe(
      65535,
    );
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "読めない（権限）なら undefined（投げない）",
    async () => {
      await writeServeRecord(dir, valid);
      await chmod(join(dir, SERVE_RECORD_FILE_NAME), 0o000);
      expect(await readServeRecord(dir)).toBeUndefined();
    },
  );

  it("ディレクトリになっていても undefined", async () => {
    await mkdir(join(dir, SERVE_RECORD_FILE_NAME));
    expect(await readServeRecord(dir)).toBeUndefined();
  });
});
