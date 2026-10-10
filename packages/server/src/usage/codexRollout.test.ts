import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodexRolloutTail, TAIL_STEP_BYTES, toWindows, windowLabel } from "./codexRollout.js";

/** 20261010-agent-usage の AC4・AC8: Codex の記録の末尾の読み（最後の token_count・window_minutes のラベル・secondary が null・壊れた行・大きな記録・続きから）。作ったデータ。 */

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "usage-codex-"));
  file = join(dir, "rollout-2026-10-10T00-00-00-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jsonl");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const j = (o: unknown): string => JSON.stringify(o) + "\n";
const usage = (input: number, cached: number, output: number) => ({ input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 3, total_tokens: input + output });
function tokenCount(at: string, total: number, last: number, rl: unknown, window = 354_350): string {
  return j({
    timestamp: at,
    type: "event_msg",
    payload: { type: "token_count", info: { total_token_usage: usage(total, Math.floor(total / 2), 10), last_token_usage: usage(last, 0, 1), model_context_window: window }, rate_limits: rl },
  });
}
const turn = (model: string, at = "2026-10-10T00:00:01.000Z"): string => j({ timestamp: at, type: "turn_context", payload: { turn_id: "t", model, cwd: "/work" } });
const weekly = (pct: number) => ({ limit_id: "codex", primary: { used_percent: pct, window_minutes: 10080, resets_at: 1_792_150_968 }, secondary: null, plan_type: "pro" });

describe("CodexRolloutTail", () => {
  it("最後の token_count（累計・直近・窓）と、最後の turn_context の model を読む。secondary が null でも、primary だけ", async () => {
    writeFileSync(file, j({ type: "session_meta", payload: { id: "x" } }) + turn("gpt-old") + tokenCount("2026-10-10T00:00:02.000Z", 1000, 100, weekly(10)) + turn("gpt-6.1-sol") + tokenCount("2026-10-10T00:00:05.000Z", 5000, 700, weekly(17)));
    const t = new CodexRolloutTail(file);
    expect(await t.refresh()).toBe(true);
    expect(t.model).toBe("gpt-6.1-sol");
    expect(t.count).toMatchObject({ total: { input: 5000, cached: 2500, output: 10, reasoning: 3, total: 5010 }, last: { total: 701 }, contextWindow: 354_350, at: Date.parse("2026-10-10T00:00:05.000Z") });
    expect(t.limits?.windows).toEqual([{ slot: "primary", usedPct: 17, resetsAtMs: 1_792_150_968_000, windowMinutes: 10080 }]);
    expect(t.limits?.plan).toBe("pro");
  });

  it("info が null の行（制限だけ）では、累計は前のまま・制限は新しいもの", async () => {
    writeFileSync(file, tokenCount("2026-10-10T00:00:02.000Z", 1000, 100, weekly(10)) + j({ timestamp: "2026-10-10T00:00:09.000Z", type: "event_msg", payload: { type: "token_count", info: null, rate_limits: weekly(33) } }));
    const t = new CodexRolloutTail(file);
    await t.refresh();
    expect(t.count?.total?.input).toBe(1000);
    expect(t.limits?.windows[0]?.usedPct).toBe(33);
    expect(t.limits?.at).toBe(Date.parse("2026-10-10T00:00:09.000Z"));
  });

  it("window_minutes のラベル: 300→5 時間・10080→週・ほかは N 分。primary・secondary の、ある方だけ", () => {
    expect(windowLabel(300, "primary")).toBe("5 時間");
    expect(windowLabel(10080, "secondary")).toBe("週");
    expect(windowLabel(1440, "primary")).toBe("1440 分");
    expect(windowLabel(undefined, "primary")).toBe("主の枠");
    const now = 1_000_000;
    const w = toWindows(
      { windows: [{ slot: "primary", usedPct: 40, resetsAtMs: now + 1000, windowMinutes: 300 }, { slot: "secondary", usedPct: 9, resetsAtMs: now - 1, windowMinutes: 10080 }], plan: "plus", at: 1 },
      now,
    );
    expect(w).toEqual([
      { label: "5 時間", usedPct: 40, resetsAt: now + 1000, windowMinutes: 300 },
      { label: "週", usedPct: 9, resetsAt: now - 1, windowMinutes: 10080, stale: true }, // リセットを過ぎた枠は、古い印
    ]);
  });

  it("壊れた行・知らない形・巨大な行が混ざっても、読める最後の token_count を取る", async () => {
    const big = j({ type: "response_item", payload: { type: "message", text: "x".repeat(300_000) } });
    writeFileSync(file, tokenCount("2026-10-10T00:00:02.000Z", 111, 11, weekly(1)) + "{broken json}\n" + big + '{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":"many"}}}\n' + j({ type: "event_msg", payload: 42 }));
    const t = new CodexRolloutTail(file);
    await t.refresh();
    expect(t.count?.total?.input).toBe(111);
  });

  it("大きな記録は末尾から読む（先頭を全部は読まない）。窓の外にだけ token_count があれば、窓を広げて見つける", async () => {
    let body = tokenCount("2026-10-10T00:00:02.000Z", 4242, 42, weekly(5)) + turn("gpt-x");
    const filler = j({ type: "response_item", payload: { type: "message", text: "y".repeat(1000) } });
    body += filler.repeat(Math.ceil((TAIL_STEP_BYTES * 2) / filler.length)); // 最初の窓より大きく、後ろに token_count が無い
    writeFileSync(file, body);
    const t = new CodexRolloutTail(file);
    await t.refresh();
    expect(t.count?.total?.input).toBe(4242);
    expect(t.model).toBe("gpt-x");
  });

  it("最後の turn_context が末尾から 5 MiB 離れていても、model を見つける（長いターンの後。実機では 8.7 MB の例があった）", async () => {
    const filler = j({ type: "response_item", payload: { type: "message", text: "z".repeat(10_000) } });
    writeFileSync(file, turn("gpt-far") + tokenCount("2026-10-10T00:00:02.000Z", 77, 7, weekly(3)) + filler.repeat(Math.ceil((5 * 1024 * 1024) / filler.length)) + tokenCount("2026-10-10T00:00:09.000Z", 88, 8, weekly(4)));
    const t = new CodexRolloutTail(file);
    await t.refresh();
    expect(t.model).toBe("gpt-far");
    expect(t.count?.total?.input).toBe(88);
  });

  it("続きから読む: 増えた分だけ。書き途中の最後の行は次に読む。同じ位置なら何も変わらない", async () => {
    writeFileSync(file, tokenCount("2026-10-10T00:00:02.000Z", 1000, 100, weekly(10)) + turn("m1"));
    const t = new CodexRolloutTail(file);
    await t.refresh();
    const next = tokenCount("2026-10-10T00:00:07.000Z", 2000, 200, weekly(20));
    appendFileSync(file, next.slice(0, 40)); // 途中まで
    await t.refresh();
    expect(t.count?.total?.input).toBe(1000);
    appendFileSync(file, next.slice(40));
    await t.refresh();
    expect(t.count?.total?.input).toBe(2000);
    expect(t.limits?.windows[0]?.usedPct).toBe(20);
    await t.refresh();
    expect(t.count?.total?.input).toBe(2000);
  });

  it("ファイルが小さくなったら、末尾からやり直す。無いファイル・リンクは読めない（false）", async () => {
    writeFileSync(file, tokenCount("2026-10-10T00:00:02.000Z", 9000, 1, weekly(1)) + turn("a"));
    const t = new CodexRolloutTail(file);
    await t.refresh();
    writeFileSync(file, tokenCount("2026-10-10T00:00:03.000Z", 5, 1, weekly(2)));
    await t.refresh();
    expect(t.count?.total?.input).toBe(5);
    expect(await new CodexRolloutTail(join(dir, "nope.jsonl")).refresh()).toBe(false);
  });

  it("model の絞り（/ を含む・空白）は無い扱い。会話の文は保持しない", async () => {
    writeFileSync(file, tokenCount("2026-10-10T00:00:02.000Z", 1, 1, weekly(1)) + turn("/etc/passwd") + j({ type: "response_item", payload: { text: "SECRET-CONTENT" } }));
    const t = new CodexRolloutTail(file);
    await t.refresh();
    expect(t.model).toBeNull();
    expect(JSON.stringify({ c: t.count, l: t.limits, m: t.model })).not.toContain("SECRET-CONTENT");
  });

  it("limit_id が codex でない行（モデルごとの別枠）の rate_limits は使わない。無いか codex のものだけ（指摘 1）", async () => {
    const other = { limit_id: "codex_other", limit_name: "GPT-Spark", primary: { used_percent: 3, window_minutes: 300, resets_at: 5 }, secondary: null, plan_type: "plus" };
    writeFileSync(file, tokenCount("2026-10-10T00:00:02.000Z", 1000, 100, weekly(20)) + tokenCount("2026-10-10T00:00:09.000Z", 2000, 200, other));
    const t = new CodexRolloutTail(file);
    await t.refresh();
    expect(t.count?.total?.input).toBe(2000); // 累計は新しい行
    expect(t.limits?.windows[0]?.usedPct).toBe(20); // 枠は、codex の行（新しい行の別枠は使わない）
    expect(t.limits?.plan).toBe("pro");
    // limit_id が無い行は使う。別枠だけの記録は、枠が無い。
    writeFileSync(file, tokenCount("2026-10-10T00:00:02.000Z", 5, 1, { primary: { used_percent: 9, window_minutes: 300, resets_at: 5 } }));
    const t2 = new CodexRolloutTail(file);
    await t2.refresh();
    expect(t2.limits?.windows[0]?.usedPct).toBe(9);
    writeFileSync(file, tokenCount("2026-10-10T00:00:02.000Z", 5, 1, other));
    const t3 = new CodexRolloutTail(file);
    await t3.refresh();
    expect(t3.limits).toBeNull();
  });

  it("limitsOnly（アカウントの枠）は、model を探さない・枠が見つかった時点で止まる", async () => {
    writeFileSync(file, turn("gpt-x") + tokenCount("2026-10-10T00:00:02.000Z", 1000, 100, weekly(20)));
    const t = new CodexRolloutTail(file, true);
    await t.refresh();
    expect(t.limits?.windows[0]?.usedPct).toBe(20);
    expect(t.model).toBeNull();
  });

  it("大きく増えたとき（1 MiB 超）は末尾の窓だけ読み直し、窓に無い項目（model・累計）は前の値のまま（指摘 6）", async () => {
    writeFileSync(file, turn("gpt-keep") + tokenCount("2026-10-10T00:00:02.000Z", 1234, 12, weekly(7)));
    const t = new CodexRolloutTail(file);
    await t.refresh();
    expect(t.model).toBe("gpt-keep");
    // token_count・turn_context の無い大きな追記（1 MiB 超 かつ 末尾の窓 256 KB より大きい。窓を 16 MiB まで広げても見つからない量は避ける）。
    const filler = j({ type: "response_item", payload: { type: "message", text: "q".repeat(10_000) } });
    appendFileSync(file, filler.repeat(Math.ceil((1.5 * 1024 * 1024) / filler.length)));
    await t.refresh();
    expect(t.count?.total?.input).toBe(1234);
    expect(t.model).toBe("gpt-keep");
    expect(t.limits?.windows[0]?.usedPct).toBe(7);
  });
});
