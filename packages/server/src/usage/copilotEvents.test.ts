import { appendFile, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { copilotUsageOf, CopilotUsageAdapter } from "./copilotAdapter.js";
import { CopilotEventsReader } from "./copilotEvents.js";

/**
 * Copilot CLI の記録の読み（20261016-agent-usage-bob-copilot）。行の形は、実機 1.0.98 の `events.jsonl` から写した（会話の文は除いた）。
 */

const SID = "0290278f-a073-4351-bfa7-32fb9485a632";

function record(o: { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning?: number; nanoAiu: number; at: string; model?: string }): string {
  return JSON.stringify({
    type: "session.usage_record",
    data: {
      usage: {
        model: o.model ?? "gpt-6-luna",
        inputTokens: o.input,
        outputTokens: o.output,
        cacheReadTokens: o.cacheRead,
        cacheWriteTokens: o.cacheWrite,
        reasoningTokens: o.reasoning ?? 0,
        maxPromptTokens: 272000,
        copilotUsage: { tokenDetails: [], totalNanoAiu: o.nanoAiu },
      },
    },
    id: "x",
    timestamp: o.at,
    parentId: "y",
  });
}
const checkpoint = (premium: number, at: string): string =>
  JSON.stringify({ type: "session.usage_checkpoint", data: { totalNanoAiu: 1, totalPremiumRequests: premium }, id: "c", timestamp: at });
const chat = (text: string): string => JSON.stringify({ type: "model.messages_snapshot", data: { messages: [{ role: "user", content: text }] }, id: "m", timestamp: "2026-10-16T08:21:30.000Z" });

const R1 = record({ input: 19101, output: 39, cacheRead: 10245, cacheWrite: 8853, nanoAiu: 122887500, at: "2026-10-16T08:21:34.901Z" });
const R2 = record({ input: 19223, output: 45, cacheRead: 19098, cacheWrite: 122, reasoning: 26, nanoAiu: 22903000, at: "2026-10-16T08:21:48.513Z" });
const R3 = record({ input: 19276, output: 6, cacheRead: 19220, cacheWrite: 53, nanoAiu: 20212500, at: "2026-10-16T08:34:50.000Z" });

describe("CopilotEventsReader", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-copilot-usage-");
    file = join(dir, "events.jsonl");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("呼び出しごとの行を初めから足す（再開の後の行も）。プレミアムリクエストは最後の区切りの値。会話の文の行は使わない", async () => {
    await writeFile(file, [chat("secret"), R1, R2, checkpoint(1, "2026-10-16T08:21:48.638Z"), ""].join("\n"));
    const r = new CopilotEventsReader(file);
    expect(await r.refresh()).toBe(true);
    expect(r.totals).toMatchObject({ input: 6, output: 84, cacheRead: 29343, cacheWrite: 8975, reasoning: 26, nanoAiu: 145790500, records: 2 });
    expect(r.premiumRequests).toBe(1);
    // 再開（同じファイルに足される）
    await appendFile(file, [JSON.stringify({ type: "session.resume", data: {}, timestamp: "2026-10-16T08:34:36.956Z" }), R3, checkpoint(2, "2026-10-16T08:34:54.007Z"), ""].join("\n"));
    await r.refresh();
    const u = copilotUsageOf(r, 0)!;
    expect(u.credits).toEqual({ amount: 0.166003, unit: "aic" }); // 画面の下の `0.17 AIC used`・区切りの 166003000 と同じ
    expect(u.premiumRequests).toBe(2);
    expect(u.tokens).toEqual({ basis: "transcript", input: 9, output: 90, cacheRead: 48563, cacheWrite: 9028, reasoning: 26, total: 57690 });
    expect(u).toMatchObject({ model: "gpt-6-luna", contextTokens: 19276, contextWindowTokens: 272000, contextUsedPct: 7.1, source: "copilot-events" });
    expect(u.updatedAt).toBe(Date.parse("2026-10-16T08:34:54.007Z"));
    expect(JSON.stringify(u)).not.toContain("secret");
  });

  it("書き途中の最後の行は、改行が来てから読む（二重に数えない）", async () => {
    await writeFile(file, `${R1}\n${R2.slice(0, 40)}`);
    const r = new CopilotEventsReader(file);
    await r.refresh();
    expect(r.totals.records).toBe(1);
    await appendFile(file, `${R2.slice(40)}\n`);
    await r.refresh();
    await r.refresh();
    expect(r.totals.records).toBe(2);
  });

  it("改行の無い末尾（書き途中・途中で落ちて切れた行）だけが残っても、読み込み中にしない（毎回読み直さない）", async () => {
    await writeFile(file, `${R1}\n${R2.slice(0, 60)}`);
    const r = new CopilotEventsReader(file);
    await r.refresh();
    expect(r.totals.records).toBe(1);
    expect(r.scanning).toBe(false);
  });

  it("最初の行がまだ書き途中（改行が無い）でも、その行を捨てずに、改行が来てから読む", async () => {
    await writeFile(file, R1.slice(0, 50));
    const r = new CopilotEventsReader(file);
    await r.refresh();
    expect(r.totals.records).toBe(0);
    await appendFile(file, `${R1.slice(50)}\n`);
    await r.refresh();
    expect(r.totals.records).toBe(1);
  });

  it("塊の大きさで区切って続きから読み、塊より長い行（会話の文）は飛ばす。読み残しの間は scanning", async () => {
    const big = chat("x".repeat(5000));
    await writeFile(file, [R1, big, R2, big, R3, ""].join("\n"));
    const r = new CopilotEventsReader(file, { chunk: 1024, lifetime: 1 << 30 });
    let n = 0;
    do {
      expect(await r.refresh()).toBe(true);
      n++;
    } while (r.scanning && n < 100);
    expect(r.scanning).toBe(false);
    expect(n).toBeGreaterThan(5);
    expect(r.totals.records).toBe(3);
    expect(r.totals.nanoAiu).toBe(122887500 + 22903000 + 20212500);
  });

  it("長い行を飛ばし終えた同じ塊の中で始まった次の行が、塊の境目をまたいでも、その行は飛ばさない（回帰）", async () => {
    // 塊 512 バイト（R1 は塊より短い）: 塊より長い行（700 バイト）を飛ばした直後に R1 が始まり、2 つ目の塊の境目をまたぐ。
    expect(R1.length).toBeLessThan(512);
    const long = chat("y".repeat(700 - chat("").length));
    expect(700 + 1 + R1.length).toBeGreaterThan(1024);
    await writeFile(file, [long, R1, ""].join("\n"));
    const r = new CopilotEventsReader(file, { chunk: 512, lifetime: 1 << 30 });
    for (let i = 0; i < 100 && (i === 0 || r.scanning); i++) await r.refresh();
    expect(r.totals.records).toBe(1);
  });

  it("生涯の上限に達したら止め、updatesStopped・partial を付ける", async () => {
    await writeFile(file, [R1, R2, R3, ""].join("\n"));
    const r = new CopilotEventsReader(file, { chunk: 600, lifetime: 600 });
    await r.refresh();
    await r.refresh();
    expect(r.stopped).toBe(true);
    const u = copilotUsageOf(r, 0);
    expect(u?.updatesStopped).toBe(true);
    expect(u?.partial).toBe(true);
  });

  it("同じ大きさ以上の別のファイルに替わった（inode が違う）ら、初めから数え直す（二重に数えない）", async () => {
    await writeFile(file, `${R1}\n`);
    const r = new CopilotEventsReader(file);
    await r.refresh();
    const tmp = join(dir, "new.jsonl");
    await writeFile(tmp, [R2, R3, ""].join("\n"));
    await rename(tmp, file);
    await r.refresh();
    expect(r.totals.records).toBe(2);
    expect(r.totals.nanoAiu).toBe(22903000 + 20212500);
  });

  it("ファイルが小さくなったら初めから数え直す", async () => {
    await writeFile(file, [R1, R2, ""].join("\n"));
    const r = new CopilotEventsReader(file);
    await r.refresh();
    await writeFile(file, `${R3}\n`);
    await r.refresh();
    expect(r.totals.records).toBe(1);
    expect(r.totals.nanoAiu).toBe(20212500);
  });

  it("壊れた行・数でない値・呼び出しの無い記録は数えない（無いものは無い）", async () => {
    await writeFile(file, ["{not json", JSON.stringify({ type: "session.usage_record", data: { usage: { inputTokens: "1", outputTokens: 2 } } }), ""].join("\n"));
    const r = new CopilotEventsReader(file);
    await r.refresh();
    expect(r.totals.records).toBe(0);
    expect(copilotUsageOf(r, 0)).toBeNull();
  });
});

describe("CopilotUsageAdapter", () => {
  let home: string;
  beforeEach(async () => {
    home = await makeTempDir("soda-copilot-home-");
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("<home>/session-state/<id>/events.jsonl を読む。id の形が違えば読まない。リンクの記録は読まない", async () => {
    await mkdir(join(home, "session-state", SID), { recursive: true });
    await writeFile(join(home, "session-state", SID, "events.jsonl"), `${R1}\n`);
    const a = new CopilotUsageAdapter({ home: () => home });
    expect((await a.usageFor({ paneId: "p", sessionId: SID, transcriptPath: undefined }))?.tokens.total).toBe(19140);
    expect(await a.usageFor({ paneId: "q", sessionId: "../x", transcriptPath: undefined })).toBeNull();

    const other = "11111111-2222-3333-4444-555555555555";
    await mkdir(join(home, "session-state", other), { recursive: true });
    await symlink(join(home, "session-state", SID, "events.jsonl"), join(home, "session-state", other, "events.jsonl"));
    expect(await a.usageFor({ paneId: "r", sessionId: other, transcriptPath: undefined })).toBeNull();

    // 会話のフォルダがリンクで根の外を指す（中のファイルは通常のファイル）
    const outside = await makeTempDir("soda-copilot-outside-");
    try {
      await writeFile(join(outside, "events.jsonl"), `${R1}\n`);
      const third = "66666666-7777-8888-9999-000000000000";
      await symlink(outside, join(home, "session-state", third));
      expect(await a.usageFor({ paneId: "s", sessionId: third, transcriptPath: undefined })).toBeNull();
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
