import type { AgentUsage, Pane } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { ReportedUsage, UsageReportIntake, accountKeyOf, type UsageReport, type UsageVerdict } from "./reportedUsage.js";
import { UsageService } from "./UsageService.js";

const ID = "3e81f9a7-a757-461a-b21c-196db1d9196e";
const OTHER = "9c9c9c9c-1111-4111-8111-999999999999";
const rep = (over: Partial<UsageReport> = {}): UsageReport => ({ paneId: "p1", sessionId: ID, ...over });

describe("ReportedUsage", () => {
  it("pane の報告は、その会話（sessionId）の分だけ返る。会話が替われば（/clear の後）返らない", () => {
    const r = new ReportedUsage(() => 1000);
    r.note(rep({ costUsd: 2 }));
    expect(r.paneReport("p1", ID)?.report.costUsd).toBe(2);
    expect(r.paneReport("p1", OTHER)).toBeUndefined();
    r.forgetPane("p1");
    expect(r.paneReport("p1", ID)).toBeUndefined();
  });

  it("アカウント: 5 時間・週・組織の枠。resets_at（秒）は ms にする。過ぎた枠は stale。設定のフォルダの場所は持たない", () => {
    let now = 1_000_000;
    const r = new ReportedUsage(() => now);
    r.note(rep({ configKey: "a".repeat(16), fiveHour: { usedPct: 12, resetsAt: 2000 }, sevenDay: { usedPct: 30, resetsAt: 9_000_000 }, spendLimit: { usedPct: 5, usedUsd: 10, limitUsd: 200, period: "month" } }));
    const [acc] = r.accountList();
    expect(acc).toMatchObject({ kind: "claude", label: "Claude Code", source: "statusline", asOf: 1_000_000 });
    expect(acc!.accountKey).toBe(accountKeyOf("claude", "a".repeat(16)));
    expect(acc!.accountKey).toMatch(/^[0-9a-f]{16}$/);
    const w = Object.fromEntries(acc!.windows.map((x) => [x.label, x]));
    expect(w["5 時間"]).toMatchObject({ usedPct: 12, resetsAt: 2_000_000, windowMinutes: 300 });
    expect(w["週"]).toMatchObject({ usedPct: 30, resetsAt: 9_000_000_000 });
    expect(w["組織の枠"]).toMatchObject({ usedPct: 5, usedUsd: 10, limitUsd: 200 });
    expect(w["5 時間"]!.stale).toBeUndefined();
    now = 3_000_000; // 5 時間の枠の resetsAt（2,000,000 ms）を過ぎた
    const w2 = Object.fromEntries(r.accountList()[0]!.windows.map((x) => [x.label, x]));
    expect(w2["5 時間"]!.stale).toBe(true);
    expect(w2["週"]!.stale).toBeUndefined();
    expect(JSON.stringify(r.accountList())).not.toContain("/");
  });

  it("枠は窓ごとに独立: 後の報告に無い枠は、前の値を残す（リセットの後は stale）。別の設定のフォルダは別のアカウント。2 つ以上あるときだけ、名前を添える", () => {
    const r = new ReportedUsage(() => 5);
    r.note(rep({ configKey: "a".repeat(16), fiveHour: { usedPct: 1 }, sevenDay: { usedPct: 2 } }));
    r.note(rep({ configKey: "a".repeat(16), fiveHour: { usedPct: 3 } }));
    expect(r.accountList()[0]!.windows.map((w) => [w.label, w.usedPct])).toEqual([["5 時間", 3], ["週", 2]]);
    expect(r.accountList()[0]!.label).toBe("Claude Code");
    r.note(rep({ configKey: "b".repeat(16), configDirName: ".claude-work", fiveHour: { usedPct: 9 } }));
    expect(r.accountList().map((a) => a.label).sort()).toEqual(["Claude Code (.claude-work)", "Claude Code (既定)"]);
  });
});

describe("ReportedUsage: 鍵が別の pane と重なったとき（指摘 6）", () => {
  it("同じ鍵を別の pane が使い始めたら、1 度だけ知らせる（鍵と pane の id だけ）。枠はいちばん新しい報告が勝つ", () => {
    let now = 1000;
    const seen: { accountKey: string; paneId: string; otherPanes: number }[] = [];
    const r = new ReportedUsage(() => now, (i) => seen.push(i));
    const key = "b".repeat(16);
    r.note(rep({ paneId: "p1", configKey: key, fiveHour: { usedPct: 10 } }));
    expect(seen).toEqual([]);
    now = 2000;
    r.note(rep({ paneId: "p2", configKey: key, fiveHour: { usedPct: 40 } }));
    r.note(rep({ paneId: "p2", configKey: key, fiveHour: { usedPct: 41 } }));
    expect(seen).toEqual([{ accountKey: accountKeyOf("claude", key), paneId: "p2", otherPanes: 1 }]);
    expect(r.accountList()[0]!.windows[0]!.usedPct).toBe(41);
  });
});

describe("UsageReportIntake（確かめ・保留・捨てる）", () => {
  function make(verdicts: UsageVerdict[]) {
    const noted: UsageReport[] = [];
    const logs: string[] = [];
    const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
    let i = 0;
    const intake = new UsageReportIntake({
      verdict: () => verdicts[Math.min(i++, verdicts.length - 1)]!,
      sink: { note: (r) => noted.push(r) },
      retryMs: [10, 20],
      setTimer: (fn, ms) => {
        const t = { fn, ms, cancelled: false };
        timers.push(t);
        return { cancel: () => (t.cancelled = true) };
      },
      log: (reason) => logs.push(reason),
    });
    return { intake, noted, logs, timers, fire: () => timers.filter((t) => !t.cancelled).at(-1)!.fn() };
  }

  it("受ける・捨てる（理由だけをログに）", () => {
    const a = make([{ verdict: "accept" }]);
    a.intake.offer(rep());
    expect(a.noted).toHaveLength(1);
    const b = make([{ verdict: "reject", reason: "other conversation" }]);
    b.intake.offer(rep());
    expect(b.noted).toHaveLength(0);
    expect(b.logs).toEqual(["other conversation"]);
  });

  it("保留して、確かめ直して、合えば受ける。最新の 1 件だけを保留する（古い報告は取り消す）", () => {
    const h = make([{ verdict: "hold" }, { verdict: "hold" }, { verdict: "accept" }]);
    const first = rep({ costUsd: 1 });
    const second = rep({ costUsd: 2 });
    h.intake.offer(first);
    h.intake.offer(second); // 2 件目で、1 件目の保留は取り消す
    expect(h.timers.filter((t) => !t.cancelled)).toHaveLength(1);
    h.fire();
    expect(h.noted).toEqual([second]);
  });

  it("確かめ直しの回数を過ぎても合わなければ、捨てる", () => {
    const h = make([{ verdict: "hold" }]);
    h.intake.offer(rep());
    h.fire(); // 1 回目の確かめ直し → まだ hold → 次の保留
    h.fire(); // 2 回目 → まだ hold → 上限
    expect(h.noted).toHaveLength(0);
    expect(h.logs.length).toBe(1);
  });

  it("pane が閉じたら、保留は取り消す", () => {
    const h = make([{ verdict: "hold" }]);
    h.intake.offer(rep());
    h.intake.forgetPane("p1");
    expect(h.timers.every((t) => t.cancelled)).toBe(true);
  });
});

describe("UsageService: 包みの報告を重ねる（記録からの合計は置き換えない）", () => {
  const pane = (over: Partial<Pane> = {}): Pane =>
    ({ id: "p1", tabId: "t", label: null, cwd: "/", shell: "", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: { instanceId: "i", kind: "claude", label: "c", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0 }, agentSession: { kind: "claude", sessionId: ID, reportedAt: 1 }, ...over }) as Pane;
  const baseUsage: Omit<AgentUsage, "paneId" | "kind"> = { model: "claude-opus-5-5", tokens: { basis: "transcript", input: 100, output: 50, total: 150 }, source: "transcript", updatedAt: 1000, contextTokens: 5 };

  function svc(base: typeof baseUsage | null, reported: ReportedUsage, p = pane()) {
    return new UsageService({
      session: { getPane: () => p, snapshot: () => ({ panes: [p] }) },
      adapters: [{ kind: "claude", usageFor: async () => base }],
      logger: { debug: () => undefined, warn: () => undefined },
      reported,
    });
  }

  it("記録がある: トークンの合計（basis: transcript）は、そのまま。コスト（reported）・コンテキストの率・窓の大きさは、報告のもの", async () => {
    const r = new ReportedUsage(() => 5000);
    r.note(rep({ costUsd: 3.5, contextUsedPct: 40, contextWindowSize: 200000, contextTokens: 80000 }));
    const u = (await svc(baseUsage, r).get("p1")).panes["p1"]!;
    expect(u.tokens).toEqual({ basis: "transcript", input: 100, output: 50, total: 150 });
    expect(u).toMatchObject({ costUsd: 3.5, costBasis: "reported", contextUsedPct: 40, contextWindowTokens: 200000, contextTokens: 80000, source: "statusline", updatedAt: 5000 });
  });

  it("記録が無い（読めない）: 報告だけで、tokens は basis: context", async () => {
    const r = new ReportedUsage(() => 5000);
    r.note(rep({ model: "claude-opus-5-5", costUsd: 1, contextTokens: 1234 }));
    const u = (await svc(null, r).get("p1")).panes["p1"]!;
    expect(u).toMatchObject({ model: "claude-opus-5-5", tokens: { basis: "context", input: 1234 }, costUsd: 1, costBasis: "reported", source: "statusline" });
  });

  it("別の会話の報告は、重ねない。報告が無ければ、記録だけ", async () => {
    const r = new ReportedUsage(() => 5000);
    r.note(rep({ sessionId: OTHER, costUsd: 99 }));
    const u = (await svc(baseUsage, r).get("p1")).panes["p1"]!;
    expect(u.costUsd).toBeUndefined();
    expect(u.source).toBe("transcript");
  });

  it("アカウントの枠が、答えの accounts に出る", async () => {
    const r = new ReportedUsage(() => 5000);
    r.note(rep({ fiveHour: { usedPct: 7 } }));
    const res = await svc(baseUsage, r).get("p1");
    expect(res.accounts).toHaveLength(1);
    expect(res.accounts[0]!.windows[0]).toMatchObject({ label: "5 時間", usedPct: 7 });
  });
});
