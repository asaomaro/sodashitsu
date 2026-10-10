import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClaudeSessionScan } from "./claudeScan.js";

/**
 * 20261010-agent-usage の AC3・AC8: Claude の記録の集計（重複・サブエージェント・増分・`cost-state`・壊れた行・大きな行・末尾だけ）。
 * 試験のデータは作ったもの（利用者の記録を写さない）。
 */

const SID = "11111111-2222-4333-8444-555555555555";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "usage-scan-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

let n = 0;
function assistant(opts: { id?: string; model?: string; i?: number; o?: number; cr?: number; cw?: number; ts?: string; sidechain?: boolean; text?: string } = {}): string {
  n++;
  return (
    JSON.stringify({
      type: "assistant",
      uuid: `u${n}`,
      timestamp: opts.ts ?? "2026-10-10T00:00:00.000Z",
      ...(opts.sidechain ? { isSidechain: true } : {}),
      message: {
        id: opts.id ?? `msg_${n}`,
        model: opts.model ?? "claude-sonnet-5-5",
        usage: { input_tokens: opts.i ?? 1, output_tokens: opts.o ?? 10, cache_read_input_tokens: opts.cr ?? 100, cache_creation_input_tokens: opts.cw ?? 5 },
        content: [{ type: "text", text: opts.text ?? "hello" }],
      },
    }) + "\n"
  );
}
function costState(total: number, ts?: string, extra: Record<string, unknown> = {}): string {
  return (
    JSON.stringify({
      type: "cost-state",
      sessionId: SID,
      totalCostUSD: total,
      modelUsage: { "claude-sonnet-5-5": { inputTokens: 1000, outputTokens: 2000, cacheReadInputTokens: 30000, cacheCreationInputTokens: 4000, costUSD: total } },
      ...(ts ? { timestamp: ts } : {}),
      ...extra,
    }) + "\n"
  );
}
async function run(scan: ClaudeSessionScan): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const r = await scan.advance();
    if (!r.more) return;
  }
}

describe("ClaudeSessionScan", () => {
  it("同じ message.id の行は 1 回だけ数える（content ブロックごとの重複で 2 倍にならない）", async () => {
    const f = join(dir, `${SID}.jsonl`);
    writeFileSync(f, assistant({ id: "m1", o: 50 }) + assistant({ id: "m1", o: 50 }) + assistant({ id: "m1", o: 50 }) + assistant({ id: "m2", o: 7 }));
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    await run(scan);
    const r = scan.result();
    expect(r.tokens).toMatchObject({ basis: "transcript", output: 57, input: 2, cacheRead: 200, cacheWrite: 10 });
    expect(r.source).toBe("transcript");
    expect(r.costUsd).toBeUndefined(); // 単価の表は持たない
  });

  it("サブエージェントの記録を含め、内訳を持つ（主・サブエージェント）。isSidechain の行もサブエージェントの分", async () => {
    const f = join(dir, `${SID}.jsonl`);
    const sub = join(dir, "agent-a1.jsonl");
    writeFileSync(f, assistant({ id: "m1", o: 100 }) + assistant({ id: "m2", o: 5, sidechain: true }));
    writeFileSync(sub, assistant({ id: "s1", o: 40 }) + assistant({ id: "s1", o: 40 }) + assistant({ id: "s2", o: 2 }));
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    scan.addFile(sub, true);
    await run(scan);
    const r = scan.result();
    expect(r.breakdown?.main.output).toBe(100);
    expect(r.breakdown?.subagents).toMatchObject({ output: 47, files: 1 });
    expect(r.tokens.output).toBe(147);
  });

  it("増分: 前回の位置から。途中まで書かれた行（改行が無い）は次に読む。同じ行を 2 回数えない", async () => {
    const f = join(dir, `${SID}.jsonl`);
    const l1 = assistant({ id: "m1", o: 10 });
    const l2 = assistant({ id: "m2", o: 20 });
    writeFileSync(f, l1 + l2.slice(0, 30)); // 2 行目は途中
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    await run(scan);
    expect(scan.result().tokens.output).toBe(10);
    appendFileSync(f, l2.slice(30));
    await run(scan);
    expect(scan.result().tokens.output).toBe(30);
    await run(scan); // 変わらなければ、何も足されない
    expect(scan.result().tokens.output).toBe(30);
    appendFileSync(f, assistant({ id: "m3", o: 1 }));
    await run(scan);
    expect(scan.result().tokens.output).toBe(31);
  });

  it("壊れた行・知らない形・巨大な行があっても落ちず、その行だけ飛ばす", async () => {
    const f = join(dir, `${SID}.jsonl`);
    const giant = assistant({ id: "big", o: 999, text: "x".repeat(5000) });
    writeFileSync(f, "{not json at all}\n" + '{"type":"assistant","message":42}\n' + assistant({ id: "m1", o: 3 }) + giant + '{"type":"assistant","message":{"id":"z","usage":{"output_tokens":"many"}}}\n' + assistant({ id: "m2", o: 4 }));
    const scan = new ClaudeSessionScan(SID, { lineMaxBytes: 2000, chunkBytes: 700 });
    scan.addFile(f, false);
    await run(scan);
    expect(scan.result().tokens.output).toBe(7); // 巨大な行（999）は飛ばす。"many" は 0 として数える（id が新しいので 1 件）
  });

  it("cost-state: 最後の行の累計を優先し（basis: cumulative）、その後の記録の分を足す。コストは cost-state の値（時点つき）", async () => {
    const f = join(dir, `${SID}.jsonl`);
    writeFileSync(
      f,
      assistant({ id: "a1", o: 111, ts: "2026-10-10T01:00:00.000Z" }) +
        costState(12.5) +
        assistant({ id: "a2", o: 30, i: 2, cr: 10, cw: 1, ts: "2026-10-10T02:00:00.000Z" }),
    );
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    await run(scan);
    const r = scan.result();
    expect(r.tokens).toMatchObject({ basis: "cumulative", input: 1002, output: 2030, cacheRead: 30010, cacheWrite: 4001 });
    expect(r.costUsd).toBe(12.5);
    expect(r.costBasis).toBe("cost-state");
    expect(r.costAsOf).toBe(Date.parse("2026-10-10T01:00:00.000Z")); // 直前の行の時刻
    expect(r.source).toBe("cost-state");
    // 内訳は記録に残る分
    expect(r.breakdown?.main.output).toBe(141);
  });

  it("cost-state の形が違う・別の会話の行・負の値は、黙って無い扱い（落ちない。記録の合計に落ちる）", async () => {
    const f = join(dir, `${SID}.jsonl`);
    writeFileSync(
      f,
      assistant({ id: "a1", o: 5 }) +
        JSON.stringify({ type: "cost-state", sessionId: SID, totalCostUSD: "x", modelUsage: {} }) + "\n" +
        JSON.stringify({ type: "cost-state", sessionId: SID, totalCostUSD: 1, modelUsage: { m: 3 } }) + "\n" +
        JSON.stringify({ type: "cost-state", sessionId: SID, totalCostUSD: -4, modelUsage: {} }) + "\n" +
        costState(9, undefined, { sessionId: "another-session" }),
    );
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    await run(scan);
    const r = scan.result();
    expect(r.tokens.basis).toBe("transcript");
    expect(r.costUsd).toBeUndefined();
  });

  it("モデルは最後の主の応答（<synthetic> は数えない）。サブエージェントの応答では替わらない。コンテキストは最後の主の応答の入力側", async () => {
    const f = join(dir, `${SID}.jsonl`);
    const sub = join(dir, "agent-b.jsonl");
    writeFileSync(f, assistant({ id: "m1", model: "claude-opus-5-5", i: 3, cr: 1000, cw: 20, ts: "2026-10-10T00:00:01.000Z" }) + assistant({ id: "syn", model: "<synthetic>", ts: "2026-10-10T00:00:02.000Z" }));
    writeFileSync(sub, assistant({ id: "s1", model: "claude-haiku-5-5", i: 9, cr: 9, cw: 9, ts: "2026-10-10T00:00:03.000Z" }));
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    scan.addFile(sub, true);
    await run(scan);
    const r = scan.result();
    expect(r.model).toBe("claude-opus-5-5");
    expect(r.contextTokens).toBe(1023);
    expect(r.contextUsedPct).toBeUndefined(); // 窓の大きさは記録に出ない: 率は無い
    expect(r.contextWindowTokens).toBeUndefined();
  });

  it("モデルの id に [1m] が付くときだけ、窓の大きさ（100 万）が分かり、率が出る", async () => {
    const f = join(dir, `${SID}.jsonl`);
    writeFileSync(f, assistant({ id: "m1", model: "claude-opus-5-5[1m]", i: 100_000, cr: 100_000, cw: 0 }));
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    await run(scan);
    const r = scan.result();
    expect(r.contextWindowTokens).toBe(1_000_000);
    expect(r.contextUsedPct).toBe(20);
  });

  it("大きな記録は末尾だけ読み、「一部」の印を付ける（上限を超えたとき）。最初の途中の行は捨てる", async () => {
    const f = join(dir, `${SID}.jsonl`);
    let body = "";
    for (let i = 0; i < 200; i++) body += assistant({ id: `m${i}`, o: 1 });
    writeFileSync(f, body);
    const scan = new ClaudeSessionScan(SID, { maxInitialBytes: Math.floor(body.length / 2), chunkBytes: 1024 });
    scan.addFile(f, false);
    await run(scan);
    const r = scan.result();
    expect(r.partial).toBe(true);
    expect(r.tokens.output).toBeGreaterThan(50);
    expect(r.tokens.output).toBeLessThan(120);
  });

  it("ファイルが小さくなったら reset を返す（呼び手が数え直す）", async () => {
    const f = join(dir, `${SID}.jsonl`);
    writeFileSync(f, assistant({ id: "m1" }) + assistant({ id: "m2" }));
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    await run(scan);
    writeFileSync(f, assistant({ id: "m9" }));
    const r = await scan.advance();
    expect(r.reset).toBe(true);
  });

  it("結果に、会話の文・場所・セッションの名前が出ない（数字・モデル名・時刻だけ）", async () => {
    const f = join(dir, `${SID}.jsonl`);
    writeFileSync(f, assistant({ id: "m1", text: "SECRET-CONTENT-MARKER" }));
    const scan = new ClaudeSessionScan(SID);
    scan.addFile(f, false);
    await run(scan);
    const json = JSON.stringify(scan.result());
    expect(json).not.toContain("SECRET-CONTENT-MARKER");
    expect(json).not.toContain(dir);
  });

  it("model の絞り: 先頭が英数字で、/ を含まない。/etc/passwd・../x・空白・65 文字以上は null（今のモデルの id と [1m] の形は通る）", async () => {
    const f = join(dir, `${SID}.jsonl`);
    const model = async (m: string): Promise<string | null> => {
      writeFileSync(f, assistant({ id: `x${Math.random()}`, model: m }));
      const scan = new ClaudeSessionScan(SID);
      scan.addFile(f, false);
      await run(scan);
      return scan.result().model;
    };
    expect(await model("claude-opus-5-5[1m]")).toBe("claude-opus-5-5[1m]");
    expect(await model("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5-20251001");
    expect(await model("gpt-6.1-sol")).toBe("gpt-6.1-sol");
    for (const bad of ["/etc/passwd", "../../x", "a/b", "-x", ".hidden", "a b", "x".repeat(65), "", "m\u0000x", "claude[1m", "claude[]"]) {
      expect(await model(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("生涯の読む量の上限は、数え直し（書き換え）をまたいで数える。上限に達したら、更新を止め、partial と stopped を立てる（R5）", async () => {
    const f = join(dir, `${SID}.jsonl`);
    const lines = (k: number, tag: string): string => Array.from({ length: k }, (_, i) => assistant({ id: `${tag}${i}` })).join("");
    const first = lines(20, "a");
    writeFileSync(f, first);
    const limits = { readTotalMax: first.length * 3 };
    let scan = new ClaudeSessionScan(SID, limits);
    scan.addFile(f, false);
    await run(scan);
    expect(scan.bytesRead).toBe(first.length);
    expect(scan.stopped).toBe(false);
    // 書き換えを繰り返す（そのたびに小さくなって、数え直しになる）。数え直しのたびに、読んだ量を引き継ぐ。
    for (let k = 19; k >= 1 && !scan.stopped; k--) {
      writeFileSync(f, lines(k, `r${k}`));
      const r = await scan.advance();
      if (r.reset) {
        const fresh = new ClaudeSessionScan(SID, limits, scan.bytesRead);
        fresh.addFile(f, false);
        scan = fresh;
      }
      await run(scan);
    }
    expect(scan.stopped).toBe(true);
    expect(scan.result().partial).toBe(true);
    const before = scan.bytesRead;
    appendFileSync(f, assistant({ id: "later", o: 999 }));
    await run(scan);
    expect(scan.bytesRead).toBe(before); // 止まった後は、読まない
    expect(scan.result().tokens.output).not.toBe(999);
  });

  it("shouldStop が真になったら、次の行の読みの前で止まる（閉じた pane・サーバの停止）", async () => {
    const f = join(dir, `${SID}.jsonl`);
    let body = "";
    for (let i = 0; i < 400; i++) body += assistant({ id: `m${i}`, o: 1 });
    writeFileSync(f, body);
    const scan = new ClaudeSessionScan(SID, { chunkBytes: 2048 });
    scan.addFile(f, false);
    let calls = 0;
    await scan.advance(undefined, () => ++calls > 3);
    expect(scan.bytesRead).toBeLessThan(body.length / 2);
  });
});
