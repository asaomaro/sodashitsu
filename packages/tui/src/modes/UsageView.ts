import { paneNameOf, type KeyInput } from "@sodashitsu/client-core";
import { shortId, type AgentUsage } from "@sodashitsu/protocol";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { UsageModel } from "../model/UsageModel.js";
import { plainText } from "./SubagentList.js";
import {
  dialogColors,
  centeredRect,
  drawBox,
  hiddenCursor,
  inside,
  isDown,
  isUp,
  isEsc,
  isEnter,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import type { Grid, Rect } from "../render/Screen.js";
import type { ThemeColors } from "../render/color.js";
import { truncate } from "../render/width.js";

const num = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("ja-JP"));
const basis = { cumulative: "累計", transcript: "記録に残る分", context: "文脈内" };
export function usageLines(u: AgentUsage | null | undefined): string[] {
  if (!u) return ["利用状況を取得できません（記録・会話ID・対応状況を確認してください）"];
  return [
    `${u.kind} / ${u.model ?? "モデル不明"} · ${basis[u.tokens.basis]}`,
    `トークン 合計 ${num(u.tokens.total)} / 入力 ${num(u.tokens.input)} / 出力 ${num(u.tokens.output)}`,
    `キャッシュ 読み ${num(u.tokens.cacheRead)} / 書き ${num(u.tokens.cacheWrite)} · 推論 ${num(u.tokens.reasoning)}`,
    `コスト ${u.costUsd === undefined ? "—" : "$" + u.costUsd.toFixed(4)}${u.costBasis ? " (" + u.costBasis + ")" : ""}`,
    `コンテキスト ${num(u.contextTokens)} / ${num(u.contextWindowTokens)}${u.contextUsedPct === undefined ? "" : " (" + u.contextUsedPct.toFixed(1) + "%)"}`,
    `更新 ${new Date(u.updatedAt).toLocaleString("ja-JP")} · ${u.source}`,
    ...(u.partial ? ["一部の記録のみ"] : []),
    ...(u.scanning ? ["記録を読み取り中"] : []),
    ...(u.updatesStopped ? ["上限に達したため更新停止"] : []),
    ...(u.breakdown
      ? [
          `内訳 主 ${num(u.breakdown.main.total)} / サブ ${num(u.breakdown.subagents.total)} (${u.breakdown.subagents.files}記録)`,
        ]
      : []),
  ];
}
const statusText = (usage: UsageModel) =>
  usage.status === "loading"
    ? "読み込み中…"
    : usage.status === "unsupported"
      ? "このサーバは利用状況に対応していません"
      : usage.status === "failed"
        ? "利用状況を取得できません（画面を開き直すと再取得します）"
        : null;

export class UsageDialog implements Overlay {
  private rect: Rect | null = null;
  private scroll = 0;
  constructor(
    private readonly paneId: string | null,
    private readonly model: SessionModel,
    private readonly ui: UiState,
    private readonly usage: UsageModel,
  ) {}
  handleKey(k: KeyInput): void {
    if (isEsc(k)) this.cancel();
    else if (isDown(k)) this.scroll++;
    else if (isUp(k)) this.scroll = Math.max(0, this.scroll - 1);
  }
  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "wheel") this.scroll = Math.max(0, this.scroll + (ev.button === 65 ? 1 : -1));
    return true;
  }
  cancel(): void {
    this.ui.closeDialog();
  }
  render({ grid, theme }: OverlayRenderContext) {
    this.rect = centeredRect(grid, 90, 16);
    const c = dialogColors(theme),
      area = drawBox(
        grid,
        this.rect,
        c,
        this.paneId ? "利用状況 · " + shortId(this.paneId) : "アカウント利用状況",
      );
    const pane = this.paneId ? this.model.panes.get(this.paneId) : null;
    const lines = [
      ...(pane
        ? [
            `ペイン ${paneNameOf(pane)} · ${pane.agent?.kind ?? "—"} · ${pane.agent?.state ?? "—"}`,
            `作業フォルダ ${pane.cwd}`,
            `会話 ${pane.agentSession?.sessionId ?? "—"}`,
          ]
        : []),
      ...(statusText(this.usage)
        ? [statusText(this.usage)!]
        : this.paneId
          ? usageLines(this.usage.data.panes[this.paneId])
          : this.usage.data.accounts.flatMap((a) => [
              a.label,
              ...a.windows.map(
                (w) =>
                  `${w.label}: ${w.usedPct}% · リセット ${w.resetsAt ? new Date(w.resetsAt).toLocaleString("ja-JP") : "—"}${w.stale ? "（古い値）" : ""}`,
              ),
            ])),
      "↑↓ スクロール · Esc 閉じる",
    ];
    this.scroll = Math.min(this.scroll, Math.max(0, lines.length - area.h));
    lines
      .slice(this.scroll, this.scroll + area.h)
      .forEach((s, i) =>
        grid.text(area.x, area.y + i, truncate(plainText(s), area.w), c.fg, c.bg, 0, area.w),
      );
    return hiddenCursor();
  }
}

/** Main screen, leaving the sidebar usable. Arrow keys/scroll select, Enter goes to the pane. */
export class UsageDashboard {
  private selected = 0;
  private sort: "name" | "tokens" | "cost" | "context" = "name";
  private hits: { y: number; paneId: string }[] = [];
  private area: Rect | null = null;
  constructor(
    private readonly model: SessionModel,
    private readonly ui: UiState,
    private readonly usage: UsageModel,
    private readonly focus: (id: string) => void,
  ) {}
  private rows() {
    return [...this.model.panes.values()]
      .filter((p) => p.agent)
      .sort((a, b) => {
        const u = this.usage.data.panes;
        const metric = (id: string) =>
          this.sort === "tokens"
            ? u[id]?.tokens.total
            : this.sort === "cost"
              ? u[id]?.costUsd
              : u[id]?.contextUsedPct;
        return this.sort === "name"
          ? paneNameOf(a).localeCompare(paneNameOf(b), "ja")
          : (metric(b.id) ?? -1) - (metric(a.id) ?? -1) || a.id.localeCompare(b.id);
      });
  }
  handleKey(k: KeyInput): void {
    if (isEsc(k)) {
      this.ui.setScreen("base");
      return;
    }
    const rows = this.rows();
    this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
    if (isDown(k)) this.selected = Math.min(rows.length - 1, this.selected + 1);
    else if (isUp(k)) this.selected = Math.max(0, this.selected - 1);
    else if (k.key === "a") this.ui.openDialogWithContext({ kind: "usageAccounts" });
    else if (k.key === "s") {
      const sorts = ["name", "tokens", "cost", "context"] as const;
      this.sort = sorts[(sorts.indexOf(this.sort) + 1) % sorts.length]!;
      this.selected = 0;
    } else if (isEnter(k) && rows[this.selected]) {
      this.ui.setScreen("base");
      this.focus(rows[this.selected]!.id);
    }
  }
  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.area, ev.x, ev.y)) return false;
    if (ev.action === "wheel")
      this.selected = Math.max(
        0,
        Math.min(this.rows().length - 1, this.selected + (ev.button === 65 ? 1 : -1)),
      );
    if (ev.action === "down" && ev.button === 0) {
      const hit = this.hits.find((h) => h.y === ev.y);
      if (hit) {
        this.ui.setScreen("base");
        this.focus(hit.paneId);
      }
    }
    return true;
  }
  render(grid: Grid, area: Rect, theme: ThemeColors): void {
    this.area = area;
    this.hits = [];
    const c = dialogColors(theme);
    grid.fill(area, c.fg, c.bg);
    const put = (y: number, text: string, bg = c.bg) => {
      if (y < area.y + area.h)
        grid.text(
          area.x + 1,
          y,
          truncate(plainText(text), Math.max(0, area.w - 2)),
          c.fg,
          bg,
          0,
          Math.max(0, area.w - 2),
        );
    };
    let y = area.y;
    put(y++, "利用状況 · s:並び順 " + this.sort + " · a:アカウント · ↑↓ / Enter:ペインへ · Esc:基本");
    const status = statusText(this.usage);
    if (status) put(y++, status);
    const accountLines = this.usage.data.accounts.flatMap((a) => [
      `${a.label}${a.plan ? " · " + a.plan : ""} · ${new Date(a.asOf).toLocaleString("ja-JP")}`,
      ...a.windows.map(
        (w) =>
          `  ${w.label}: ${w.usedPct.toFixed(1)}%${w.resetsAt ? " · リセット " + new Date(w.resetsAt).toLocaleString("ja-JP") : ""}${w.stale ? "（古い値）" : ""}`,
      ),
    ]);
    const accountRoom = Math.max(0, Math.min(Math.floor(area.h / 3), area.y + area.h - y - 4));
    for (const line of accountLines.slice(0, accountRoom)) put(y++, line);
    if (accountLines.length > accountRoom && accountRoom > 0)
      put(y - 1, `アカウント枠: ほか ${accountLines.length - accountRoom + 1} 行（aで一覧）`);
    const rows = this.rows();
    this.selected = Math.max(0, Math.min(this.selected, rows.length - 1));
    const rowHeight = area.h < 7 ? 1 : 3;
    const available = Math.max(0, Math.floor((area.y + area.h - y - 1) / rowHeight));
    const start = Math.max(0, this.selected - available + 1);
    if (!rows.length) put(y++, "エージェントがありません");
    for (const [i, p] of rows.slice(start, start + available).entries()) {
      const tab = this.model.tabs.get(p.tabId),
        ws = tab ? this.model.workspaces.get(tab.workspaceId) : undefined;
      const bg = start + i === this.selected ? c.active : c.bg;
      put(
        y,
        `${paneNameOf(p)} · ${ws?.label ?? shortId(tab?.workspaceId ?? p.tabId)} / ${tab?.label ?? shortId(p.tabId)}`,
        bg,
      );
      this.hits.push({ y, paneId: p.id });
      y++;
      if (rowHeight === 1) continue;
      const u = this.usage.data.panes[p.id];
      put(
        y,
        u
          ? `${u.kind} · ${u.model ?? "—"} · ${basis[u.tokens.basis]} ${num(u.tokens.total)} · $${u.costUsd === undefined ? "—" : u.costUsd.toFixed(4)} · 文脈 ${u.contextUsedPct === undefined ? "—" : u.contextUsedPct.toFixed(1) + "%"}${u.partial ? " · 一部" : ""}${u.scanning ? " · 読取中" : ""}${u.updatesStopped ? " · 更新停止" : ""}`
          : "利用状況を取得できません",
        bg,
      );
      this.hits.push({ y, paneId: p.id });
      y++;
      put(y++, u ? "更新 " + new Date(u.updatedAt).toLocaleString("ja-JP") : "", bg);
    }
    put(
      area.y + area.h - 1,
      `${rows.length} エージェント · ${this.selected + Number(rows.length > 0)} / ${rows.length}`,
    );
  }
}
