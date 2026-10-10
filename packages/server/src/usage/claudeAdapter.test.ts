import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeUsageAdapter } from "./claudeAdapter.js";
import type { ClaudeSessionScan } from "./claudeScan.js";
import { locateClaudeMain } from "./claudeSource.js";

/** 20261010-agent-usage の U2・R5: 探索は約束を共有する・閉じたら読みが止まる・書き換えの繰り返しでも生涯の上限が効く。 */

const SID = "cccccccc-1111-4222-8333-444444444444";
let base: string;
let root: string;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "usage-adapter-")));
  root = join(base, "projects");
  mkdirSync(root);
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

let n = 0;
const assistant = (out = 1): string => {
  n++;
  return JSON.stringify({ type: "assistant", timestamp: "2026-10-10T00:00:00.000Z", message: { id: `m${n}`, model: "claude-sonnet-5-5", usage: { input_tokens: 1, output_tokens: out, cache_read_input_tokens: 1, cache_creation_input_tokens: 1 } } }) + "\n";
};

describe("ClaudeUsageAdapter", () => {
  it("同じ pane への 50 回の同時の呼び出しは、場所の探索を 1 回だけにする（重ねない）", async () => {
    for (let i = 0; i < 20; i++) mkdirSync(join(root, `proj-${i}`));
    writeFileSync(join(root, "proj-3", `${SID}.jsonl`), assistant(7));
    let located = 0;
    const adapter = new ClaudeUsageAdapter({
      roots: () => [root],
      locate: async (...a) => {
        located++;
        await new Promise((r) => setTimeout(r, 30));
        return locateClaudeMain(...a);
      },
    });
    const results = await Promise.all(Array.from({ length: 50 }, () => adapter.usageFor({ paneId: "p1", sessionId: SID, transcriptPath: undefined })));
    expect(located).toBe(1);
    for (const r of results) expect(r?.tokens.output).toBe(7);
  });

  it("探索で見つからなかった結果は、同時の呼び出し全部に同じ null を返し、先に付いた値を null で上書きしない", async () => {
    let located = 0;
    const found: string | null = null;
    const adapter = new ClaudeUsageAdapter({
      roots: () => [root],
      locate: async () => {
        located++;
        await new Promise((r) => setTimeout(r, 20));
        return found;
      },
    });
    const r = await Promise.all([1, 2, 3].map(() => adapter.usageFor({ paneId: "p1", sessionId: SID, transcriptPath: undefined })));
    expect(r).toEqual([null, null, null]);
    expect(located).toBe(1);
  });

  it("forget の後は、走っている読みが止まる（読みの続きを、閉じた pane のために読まない）", async () => {
    mkdirSync(join(root, "proj"));
    let body = "";
    for (let i = 0; i < 40_000; i++) body += assistant();
    const file = join(root, "proj", `${SID}.jsonl`);
    writeFileSync(file, body);
    let scan: ClaudeSessionScan | undefined;
    const adapter = new ClaudeUsageAdapter({ roots: () => [root], scanLimits: { chunkBytes: 8 * 1024 }, onScan: (_p, s) => (scan = s) });
    const p = adapter.usageFor({ paneId: "p1", sessionId: SID, transcriptPath: undefined });
    await new Promise((r) => setTimeout(r, 40));
    expect(scan).toBeDefined();
    adapter.forget("p1");
    expect(await p).toBeNull();
    await new Promise((r) => setTimeout(r, 100));
    const stopped = scan!.bytesRead;
    await new Promise((r) => setTimeout(r, 300));
    expect(scan!.bytesRead).toBe(stopped); // もう増えない
    expect(stopped).toBeLessThan(body.length); // 最後まで読まずに止まった
  });

  it("close（サーバの停止）で、全部の読みが止まる", async () => {
    mkdirSync(join(root, "proj"));
    let body = "";
    for (let i = 0; i < 40_000; i++) body += assistant();
    writeFileSync(join(root, "proj", `${SID}.jsonl`), body);
    let scan: ClaudeSessionScan | undefined;
    const adapter = new ClaudeUsageAdapter({ roots: () => [root], scanLimits: { chunkBytes: 8 * 1024 }, onScan: (_p, s) => (scan = s) });
    const p = adapter.usageFor({ paneId: "p1", sessionId: SID, transcriptPath: undefined });
    await new Promise((r) => setTimeout(r, 40));
    adapter.close();
    await p;
    await new Promise((r) => setTimeout(r, 200));
    expect(scan!.bytesRead).toBeLessThan(body.length / 2);
  });

  it("記録の書き換えを繰り返しても、生涯の読む量の上限が効き、更新を止めて updatesStopped を返す（R5）", async () => {
    mkdirSync(join(root, "proj"));
    const file = join(root, "proj", `${SID}.jsonl`);
    const one = assistant(5).length;
    let now = 1_000_000;
    const adapter = new ClaudeUsageAdapter({ roots: () => [root], now: () => now, scanLimits: { readTotalMax: one * 40 } });
    let r;
    for (let i = 0; i < 60; i++) {
      // 前より小さく書き直す（reset を起こす）。
      let body = "";
      for (let j = 0; j < 60 - i; j++) body += assistant(5);
      writeFileSync(file, body);
      now += 2_000;
      r = await adapter.usageFor({ paneId: "p1", sessionId: SID, transcriptPath: undefined });
      if (r?.updatesStopped) break;
    }
    expect(r?.updatesStopped).toBe(true);
    expect(r?.partial).toBe(true);
    const out = r!.tokens.output!;
    writeFileSync(file, assistant(5).repeat(3));
    now += 2_000;
    const again = await adapter.usageFor({ paneId: "p1", sessionId: SID, transcriptPath: undefined });
    expect(again?.tokens.output).toBe(out); // 止まった後は、増えても変わらない
  });
});
