import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findCodexRecordFile, newestCodexRecordFiles } from "../agent/codexSession.js";
import { CodexUsageAdapter } from "./codexAdapter.js";

/** 20261010-agent-usage の AC4・AC8: Codex のアダプタ（pane の会話・アカウントの枠・記録の探し方・守り）。作ったデータ。 */

const A = "aaaaaaaa-1111-4222-8333-444444444444";
const B = "bbbbbbbb-1111-4222-8333-444444444444";
let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "usage-codex-home-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const j = (o: unknown): string => JSON.stringify(o) + "\n";
const usage = (input: number, cached: number, output: number) => ({ input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: 7, total_tokens: input + output });
function rollout(opts: { id: string; model?: string; at?: string; total?: number; last?: number; window?: number; rl?: unknown; originator?: string }): string {
  const at = opts.at ?? "2026-10-10T00:00:05.000Z";
  return (
    j({ timestamp: "2026-10-10T00:00:00.000Z", type: "session_meta", payload: { id: opts.id, cwd: "/work", originator: opts.originator ?? "codex-tui" } }) +
    j({ timestamp: at, type: "turn_context", payload: { model: opts.model ?? "gpt-6.1-sol", cwd: "/work" } }) +
    (opts.total === undefined
      ? ""
      : j({
          timestamp: at,
          type: "event_msg",
          payload: {
            type: "token_count",
            info: { total_token_usage: usage(opts.total, Math.floor(opts.total / 4), 20), last_token_usage: usage(opts.last ?? 100, 0, 0), model_context_window: opts.window ?? 200_000 },
            rate_limits: opts.rl ?? { limit_id: "codex", primary: { used_percent: 17, window_minutes: 10080, resets_at: 1_792_150_968 }, secondary: null, plan_type: "pro" },
          },
        }))
  );
}
function put(day: string, id: string, body: string, ts = "10-00-00"): string {
  const [y, m, d] = day.split("-");
  const dir = join(home, "sessions", y!, m!, d!);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, `rollout-${day}T${ts}-${id}.jsonl`);
  writeFileSync(f, body);
  return f;
}
const adapter = (extra: ConstructorParameters<typeof CodexUsageAdapter>[0] = {}) => new CodexUsageAdapter({ home: () => home, now: () => Date.parse("2026-10-10T01:00:00.000Z"), ...extra });
const src = (id = A) => ({ paneId: "p1", sessionId: id, transcriptPath: undefined });

describe("CodexUsageAdapter: pane の会話", () => {
  it("記録の末尾から、累計・モデル・コンテキストの率を返す。コストは無い。基準は cumulative・source は rollout", async () => {
    put("2026-10-10", A, rollout({ id: A, total: 8000, last: 50_000, window: 200_000 }));
    const u = await adapter().usageFor(src());
    expect(u).toMatchObject({
      model: "gpt-6.1-sol",
      source: "rollout",
      tokens: { basis: "cumulative", input: 8000 - 2000, cacheRead: 2000, cacheWrite: 0, output: 20, reasoning: 7, total: 8020 },
      contextTokens: 50_000,
      contextWindowTokens: 200_000,
      contextUsedPct: 25,
      updatedAt: Date.parse("2026-10-10T00:00:05.000Z"),
    });
    expect(u?.costUsd).toBeUndefined();
    expect(u?.costBasis).toBeUndefined();
  });

  it("まだ token_count が無い（始まったばかり）・記録が無い・会話の id の形が違う: null（落ちない）", async () => {
    put("2026-10-10", A, rollout({ id: A }));
    expect(await adapter().usageFor(src())).toBeNull();
    expect(await adapter().usageFor(src(B))).toBeNull();
    expect(await adapter().usageFor(src("../../etc/passwd"))).toBeNull();
    expect(await new CodexUsageAdapter({ home: () => join(home, "no-such-home") }).usageFor(src())).toBeNull();
  });

  it("記録のファイルがリンク・ハードリンク・FIFO なら読まない（外のファイルの数字が出ない）", async () => {
    const outside = join(home, "outside.jsonl");
    writeFileSync(outside, rollout({ id: A, total: 999_999 }));
    const dir = join(home, "sessions", "2026", "10", "10");
    mkdirSync(dir, { recursive: true });
    symlinkSync(outside, join(dir, `rollout-2026-10-10T10-00-00-${A}.jsonl`));
    expect(await adapter().usageFor(src())).toBeNull();
    rmSync(join(dir, `rollout-2026-10-10T10-00-00-${A}.jsonl`));
    linkSync(outside, join(dir, `rollout-2026-10-10T10-00-00-${A}.jsonl`));
    expect(await adapter().usageFor(src())).toBeNull();
  });

  it("日付のフォルダがリンクで外を指すときは、歩かない", async () => {
    const outsideDir = join(home, "elsewhere");
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, `rollout-2026-10-10T10-00-00-${A}.jsonl`), rollout({ id: A, total: 5 }));
    mkdirSync(join(home, "sessions", "2026", "10"), { recursive: true });
    symlinkSync(outsideDir, join(home, "sessions", "2026", "10", "10"));
    expect(await adapter().usageFor(src())).toBeNull();
  });

  it("記録の増加: 1 秒以上あけた次の呼び出しで、増えた分を読む", async () => {
    const f = put("2026-10-10", A, rollout({ id: A, total: 1000 }));
    let now = Date.parse("2026-10-10T01:00:00.000Z");
    const a = adapter({ now: () => now });
    expect((await a.usageFor(src()))?.tokens.input).toBe(1000 - 250);
    writeFileSync(f, rollout({ id: A, total: 3000 }) + rollout({ id: A, total: 3000 }).split("\n").slice(2).join("\n"));
    now += 2_000;
    expect((await a.usageFor(src()))?.tokens.input).toBe(3000 - 750);
  });
});

describe("CodexUsageAdapter: アカウント全体", () => {
  it("いちばん新しい記録の最後の rate_limits。pane との対応が無くても出る。ラベル・プラン・asOf・secondary が null", async () => {
    const old = put("2026-10-08", B, rollout({ id: B, total: 10, at: "2026-10-08T00:00:00.000Z", rl: { primary: { used_percent: 90, window_minutes: 300, resets_at: 1 }, secondary: null, plan_type: "plus" } }));
    const fresh = put("2026-10-10", A, rollout({ id: A, total: 10, at: "2026-10-10T00:30:00.000Z", rl: { primary: { used_percent: 17, window_minutes: 10080, resets_at: 1_792_150_968 }, secondary: null, plan_type: "pro" } }));
    utimesSync(old, 1_000, 1_000);
    const acc = await adapter().accounts();
    expect(acc).toHaveLength(1);
    expect(acc[0]).toMatchObject({ kind: "codex", label: "codex", plan: "pro", source: "rollout", asOf: Date.parse("2026-10-10T00:30:00.000Z"), windows: [{ label: "週", usedPct: 17, resetsAt: 1_792_150_968_000, windowMinutes: 10080 }] });
    expect(acc[0]!.windows[0]!.stale).toBeUndefined();
    expect(acc[0]!.accountKey).toMatch(/^[0-9a-f]{16}$/);
    void fresh;
  });

  it("primary と secondary の両方（5 時間・週）。リセットを過ぎた枠は古い印", async () => {
    put("2026-10-10", A, rollout({ id: A, total: 10, rl: { primary: { used_percent: 40, window_minutes: 300, resets_at: 1_791_593_000 }, secondary: { used_percent: 8, window_minutes: 10080, resets_at: 1_792_150_968 }, plan_type: "pro" } }));
    // now = 2026-10-10T01:00:00Z = 1_791_594_000。primary のリセット（1_791_593_000）は過ぎている。
    const w = (await adapter().accounts())[0]!.windows;
    expect(w.map((x) => [x.label, x.usedPct, x.stale === true])).toEqual([
      ["5 時間", 40, true],
      ["週", 8, false],
    ]);
  });

  it("いちばん新しい記録が token_count をまだ持たないときは、次に新しい記録", async () => {
    const a = put("2026-10-10", A, rollout({ id: A, total: 10, at: "2026-10-10T00:10:00.000Z" }));
    const b = put("2026-10-10", B, rollout({ id: B }), "11-00-00"); // 新しいが、token_count が無い
    utimesSync(a, 2_000, 2_000);
    utimesSync(b, 3_000, 3_000);
    expect((await adapter().accounts())[0]!.windows[0]!.usedPct).toBe(17);
  });

  it("sessions が無い・どの記録にも rate_limits が無いときは空。結果は短く覚える（10 秒）", async () => {
    expect(await adapter().accounts()).toEqual([]);
    let n = 0;
    let now = 1_000_000;
    const a = adapter({
      now: () => now,
      newest: async () => {
        n++;
        return [];
      },
    });
    await a.accounts();
    await a.accounts();
    expect(n).toBe(1);
    now += 11_000;
    await a.accounts();
    expect(n).toBe(2);
  });
});

describe("記録の探し方（#132 の歩き方に揃う）", () => {
  it("findCodexRecordFile: id の記録の場所を返す（読まない）。無ければ null・sessions が無ければ undefined・id の形が違えば null", async () => {
    const f = put("2026-10-10", A, rollout({ id: A }));
    expect(await findCodexRecordFile(home, A)).toBe(f);
    expect(await findCodexRecordFile(home, B)).toBeNull();
    expect(await findCodexRecordFile(join(home, "none"), A)).toBeUndefined();
    expect(await findCodexRecordFile(home, "x/../y")).toBeNull();
  });

  it("newestCodexRecordFiles: 新しい日付のフォルダから、上限の件数・日数まで。古い日付は歩かない（総当たりしない）", async () => {
    for (let d = 1; d <= 28; d++) put(`2026-09-${String(d).padStart(2, "0")}`, `${String(d).padStart(8, "0")}-1111-4222-8333-444444444444`, "{}\n");
    put("2026-10-02", A, "{}\n");
    put("2026-10-02", B, "{}\n", "12-00-00");
    const files = await newestCodexRecordFiles(home, 5, 3);
    expect(files).toHaveLength(4); // 日数の上限 3（10-02・09-28・09-27）の中の、5 件に満たない 4 件
    expect(files[0]).toContain("2026-10-02T12-00-00-"); // 同じ日の中は、名前の新しい順
    expect(files[1]).toContain(`${A}`);
    expect(files.every((f) => /2026-(10-02|09-28|09-27)/.test(f))).toBe(true);
    expect(files.some((f) => f.includes("2026-09-01"))).toBe(false);
    expect(await newestCodexRecordFiles(join(home, "none"))).toEqual([]);
  });
});
