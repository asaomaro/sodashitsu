import type { AgentUsageResult } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { formatUsageTable } from "./agentUsage.js";

describe("formatUsageTable（20261010-agent-usage）", () => {
  const now = Date.parse("2026-10-10T01:10:00.000Z");
  const result: AgentUsageResult = {
    panes: {
      "aaaaaaaa-1111": {
        paneId: "aaaaaaaa-1111",
        kind: "claude",
        model: "claude-sonnet-5-5",
        tokens: { basis: "transcript", input: 100, output: 2500, cacheRead: 1_200_000, cacheWrite: 800 },
        contextTokens: 98_000,
        source: "transcript",
        updatedAt: now - 5 * 60_000,
        partial: true,
      },
      "bbbbbbbb-2222": null,
    },
    accounts: [{ kind: "codex", accountKey: "k", label: "codex", windows: [{ label: "週", usedPct: 17, resetsAt: now + 3_600_000 }], plan: "pro", source: "rollout", asOf: now - 60_000 }],
  };
  it("基準の印・無い項目の「—」・一部の印・アカウントの枠を出す", () => {
    const t = formatUsageTable(result, new Map([["aaaaaaaa-1111", "main-agent"]]), now);
    expect(t).toContain("aaaaaaaa");
    expect(t).toContain("main-agent");
    expect(t).toContain("記録に残る分・一部");
    expect(t).toContain("出力 2.5k");
    expect(t).toContain("98.0k（率は不明）");
    expect(t).toMatch(/bbbbbbbb\s+—/);
    expect(t).toContain("アカウント");
    expect(t).toContain("17%");
    expect(t).toContain("5 分前");
  });
  it("制御文字を含む名前は逃がす（端末の表示を偽装させない）", () => {
    const t = formatUsageTable({ panes: { "p": { ...result.panes["aaaaaaaa-1111"]!, paneId: "p" } }, accounts: [] }, new Map([["p", "evil\u001b[2Jname"]]), now);
    expect(t).not.toContain("\u001b");
  });

  it("アカウントの枠: プラン・枠のラベル・リセットを過ぎた枠は古い印（20261010-agent-usage の Codex）", () => {
    const r: AgentUsageResult = {
      panes: {},
      accounts: [
        {
          kind: "codex",
          accountKey: "k",
          label: "codex",
          plan: "pro",
          windows: [
            { label: "5 時間", usedPct: 42, resetsAt: now + 3_600_000 },
            { label: "週", usedPct: 17, resetsAt: now - 60_000, stale: true },
          ],
          source: "rollout",
          asOf: now - 120_000,
        },
      ],
    };
    const t = formatUsageTable(r, new Map(), now);
    expect(t).toContain("codex（pro）");
    expect(t).toContain("5 時間");
    expect(t).toContain("42%");
    expect(t).toContain("17%（古い）");
    expect(t).toContain("過ぎた");
  });
});

describe("アカウントの枠（ステータスラインの包みの報告。20261010-agent-usage PR2）", () => {
  it("古い枠には「古い」を付け、組織の枠は使った額と上限を添える", () => {
    const out = formatUsageTable(
      {
        panes: {},
        accounts: [{ kind: "claude", accountKey: "k", label: "Claude Code", source: "statusline", asOf: 1_000_000, windows: [{ label: "5 時間", usedPct: 12, resetsAt: 500_000, stale: true }, { label: "組織の枠", usedPct: 5, usedUsd: 10, limitUsd: 200 }] }],
      },
      new Map(),
      1_000_000,
    );
    expect(out).toContain("12%（古い）");
    expect(out).toContain("5%（$10.00 / $200.00）");
  });
});

describe("Codex と Claude の枠は、同じ表に、同じ列の決まりで、種類ごとに並ぶ", () => {
  it("claude（古い・使用額／上限）と codex（プラン・古い）が 1 つの表に出る。並びは種類の順", () => {
    const out = formatUsageTable(
      {
        panes: {},
        accounts: [
          { kind: "codex", accountKey: "c", label: "codex", plan: "pro", source: "rollout", asOf: 1_000_000, windows: [{ label: "週", usedPct: 20, resetsAt: 900_000, stale: true }] },
          { kind: "claude", accountKey: "k", label: "Claude Code", source: "statusline", asOf: 1_000_000, windows: [{ label: "組織の枠", usedPct: 5, usedUsd: 10, limitUsd: 200 }] },
        ],
      },
      new Map(),
      1_000_000,
    );
    const lines = out.split("\n").filter((l) => /Claude Code|codex/.test(l));
    expect(lines[0]).toContain("Claude Code");
    expect(lines[1]).toContain("codex（pro）");
    expect(lines[0]).toContain("5%（$10.00 / $200.00）");
    expect(lines[1]).toContain("20%（古い）");
    expect(out.match(/アカウント/g)?.length).toBe(1); // 見出しは 1 つ
  });
});
