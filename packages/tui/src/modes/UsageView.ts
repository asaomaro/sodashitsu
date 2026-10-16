import { ScrollBar } from "./ScrollBar.js";
import { glyphFor, stateColor } from "../render/chrome/context.js";
import { paneNameOf, type KeyInput } from "@sodashitsu/client-core";
import { shortId, type AgentUsage, type AccountCostResult } from "@sodashitsu/protocol";
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
import type { ThemeColors, PackedColor } from "../render/color.js";
import { stringWidth, truncate } from "../render/width.js";

const num = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("ja-JP"));
const basis = { cumulative: "累計", transcript: "記録に残る分", context: "文脈内" };
/** ASCII cells remain readable without an icon font. Percent is used capacity. */
export function usageGauge(percent: number | undefined, cells = 10): string {
  if (percent === undefined || !Number.isFinite(percent)) return "[" + "?".repeat(cells) + "] —";
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * cells);
  return "[" + "#".repeat(filled) + "-".repeat(cells - filled) + "] " + percent.toFixed(1) + "%";
}
/** 数値はそのまま保ち、利用量の棒と率だけを閾値に応じた色で描く。 */
export function paintUsageLine(
  grid: Grid,
  x: number,
  y: number,
  text: string,
  theme: ThemeColors,
  fg: PackedColor,
  bg: PackedColor,
  width: number,
) {
  const clean = plainText(text);
  grid.text(x, y, truncate(clean, width), fg, bg, 0, width);
  for (const match of clean.matchAll(/\[[#?\-]+\]\s*(?:([\d.]+)%|—)/g)) {
    const col = stringWidth(clean.slice(0, match.index));
    const percent = match[1] === undefined ? undefined : Number(match[1]);
    const color = theme.ui(
      clean.includes("古い") || percent === undefined || !Number.isFinite(percent)
        ? "--soda-state-idle"
        : percent >= 90
          ? "--soda-state-blocked"
          : percent >= 70
            ? "--soda-warn-fg"
            : "--soda-state-done",
    );
    if (col < width) grid.text(x + col, y, match[0], color, bg, 0, width - col);
  }
}

function contextPercent(u: AgentUsage): number | undefined {
  return (
    u.contextUsedPct ??
    (u.contextTokens !== undefined && u.contextWindowTokens && u.contextWindowTokens > 0
      ? (u.contextTokens / u.contextWindowTokens) * 100
      : undefined)
  );
}
export function usageLines(u: AgentUsage | null | undefined): string[] {
  if (!u) return ["利用状況を取得できません（記録・会話ID・対応状況を確認してください）"];
  return [
    `${u.kind} / ${u.model ?? "モデル不明"} · ${basis[u.tokens.basis]}`,
    `トークン 合計 ${num(u.tokens.total)} / 入力 ${num(u.tokens.input)} / 出力 ${num(u.tokens.output)}`,
    `キャッシュ 読み ${num(u.tokens.cacheRead)} / 書き ${num(u.tokens.cacheWrite)} · 推論 ${num(u.tokens.reasoning)}`,
    `コスト ${u.costUsd === undefined ? "—" : "$" + u.costUsd.toFixed(4)}${u.costBasis ? " (" + u.costBasis + ")" : ""}`,
    `コンテキスト ${usageGauge(contextPercent(u))} · ${num(u.contextTokens)} / ${num(u.contextWindowTokens)}`,
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
  private readonly scrollbar = new ScrollBar();
  handleScrollMouse(ev: OverlayMouse) {
    return this.scrollbar.handleMouse(ev);
  }
  cancelInteraction() {
    this.scrollbar.cancel();
  }
  private accountHits: { y: number; key: string }[] = [];
  private selectedAccount = 0;
  private scroll = 0;
  constructor(
    private readonly paneId: string | null,
    private readonly model: SessionModel,
    private readonly ui: UiState,
    private readonly usage: UsageModel,
  ) {}
  handleKey(k: KeyInput): void {
    this.scrollbar.cancel();
    if (!this.paneId && isEnter(k)) {
      const a = this.usage.data.accounts[this.selectedAccount];
      if (a) this.ui.openDialogWithContext({ kind: "accountCost", accountKey: a.accountKey });
    } else if (!this.paneId && k.key === "Tab") {
      this.selectedAccount =
        (this.selectedAccount + 1) % Math.max(1, this.usage.data.accounts.length);
    } else if (isEsc(k)) this.cancel();
    else if (isDown(k)) this.scroll++;
    else if (isUp(k)) this.scroll = Math.max(0, this.scroll - 1);
  }
  handleMouse(ev: OverlayMouse): boolean {
    if (this.handleScrollMouse(ev)) return true;
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (!this.paneId && ev.action === "down" && ev.button === 0) {
      const hit = this.accountHits.find((h) => h.y === ev.y);
      if (hit) this.ui.openDialogWithContext({ kind: "accountCost", accountKey: hit.key });
    }
    if (ev.action === "wheel") this.scroll = Math.max(0, this.scroll + (ev.button === 65 ? 1 : -1));
    return true;
  }
  cancel(): void {
    this.ui.closeDialog();
  }
  render({ grid, theme }: OverlayRenderContext) {
    this.rect = centeredRect(grid, grid.w - 2, grid.h - 2);
    const c = dialogColors(theme),
      area = drawBox(
        grid,
        this.rect,
        c,
        this.paneId ? "利用状況 · " + shortId(this.paneId) : "アカウント利用状況",
      );
    area.w = Math.max(0, area.w - 1);
    const pane = this.paneId ? this.model.panes.get(this.paneId) : null;
    this.accountHits = [];
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
          : this.usage.data.accounts.flatMap((a, i) => [
              `${i === this.selectedAccount ? "▶ " : "  "}${a.label} [コスト]`,
              ...a.windows.map(
                (w) =>
                  `${w.label}: ${usageGauge(w.usedPct)} · リセット ${w.resetsAt ? new Date(w.resetsAt).toLocaleString("ja-JP") : "—"}${w.stale ? "（古い値）" : ""}`,
              ),
            ])),
      "↑↓ スクロール · Tab:アカウント選択 / Enter:コスト · Esc 閉じる",
    ];
    this.scroll = Math.min(this.scroll, Math.max(0, lines.length - area.h));
    if (!this.paneId) {
      let offset = 0;
      for (const a of this.usage.data.accounts) {
        const y = area.y + offset - this.scroll;
        if (y >= area.y && y < area.y + area.h) this.accountHits.push({ y, key: a.accountKey });
        offset += 1 + a.windows.length;
      }
    }
    lines
      .slice(this.scroll, this.scroll + area.h)
      .forEach((s, i) => paintUsageLine(grid, area.x, area.y + i, s, theme, c.fg, c.bg, area.w));
    this.scrollbar.render(
      grid,
      { ...area, w: area.w + 1 },
      lines.length,
      this.scroll,
      c,
      (offset) => {
        this.scroll = offset;
      },
    );
    return hiddenCursor();
  }
}

/** Main screen, leaving the sidebar usable. Arrow keys/scroll select, Enter goes to the pane. */
export class UsageDashboard {
  cancelInteraction() {
    this.scrollbar.cancel();
  }
  private readonly scrollbar = new ScrollBar();
  private selected = 0;
  private sort: "name" | "tokens" | "cost" | "context" = "name";
  private hits: { y: number; paneId: string }[] = [];
  private accountHits: { y: number; key: string }[] = [];
  private area: Rect | null = null;
  constructor(
    private readonly model: SessionModel,
    private readonly ui: UiState,
    private readonly usage: UsageModel,
    private readonly focus: (id: string) => void,
    private readonly symbols: () => boolean = () => true,
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
    this.scrollbar.cancel();
    if (k.key === "h") {
      this.ui.openDialogWithContext({ kind: "pastSessions" });
      return;
    }
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
    if (this.scrollbar.handleMouse(ev)) return true;
    if (!inside(this.area, ev.x, ev.y)) return false;
    if (ev.action === "wheel")
      this.selected = Math.max(
        0,
        Math.min(this.rows().length - 1, this.selected + (ev.button === 65 ? 1 : -1)),
      );
    if (ev.action === "down" && ev.button === 0) {
      const account = this.accountHits.find((h) => h.y === ev.y);
      if (account) {
        this.ui.openDialogWithContext({ kind: "accountCost", accountKey: account.key });
        return true;
      }
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
    this.accountHits = [];
    const c = { ...dialogColors(theme), bg: theme.ground("--soda-menu-bg") };
    grid.fill(area, c.fg, c.bg);
    const put = (y: number, text: string, bg = c.bg) => {
      if (y < area.y + area.h)
        paintUsageLine(grid, area.x + 1, y, text, theme, c.fg, bg, Math.max(0, area.w - 2));
    };
    let y = area.y;
    put(
      y++,
      "利用状況 · s:並び順 " +
        this.sort +
        " · a:アカウント · h:過去セッション · ↑↓ / Enter:ペインへ · Esc:基本",
    );
    const status = statusText(this.usage);
    if (status) put(y++, status);
    const section = (title: string) => {
      const label = truncate(`─ ${title} `, Math.max(0, area.w - 2));
      put(y++, label + "─".repeat(Math.max(0, area.w - 2 - stringWidth(label))));
    };
    section("アカウントの利用枠");
    const accountLines = this.usage.data.accounts.flatMap((a) => [
      `${a.label}${a.plan ? " · " + a.plan : ""} · ${new Date(a.asOf).toLocaleString("ja-JP")}`,
      ...a.windows.map(
        (w) =>
          `  ${w.label}: ${usageGauge(w.usedPct)}${w.resetsAt ? " · リセット " + new Date(w.resetsAt).toLocaleString("ja-JP") : ""}${w.stale ? "（古い値）" : ""}`,
      ),
    ]);
    const accountRoom = Math.max(0, Math.min(Math.floor(area.h / 3), area.y + area.h - y - 5));
    let accountOffset = 0;
    for (const a of this.usage.data.accounts) {
      if (accountOffset < accountRoom)
        this.accountHits.push({ y: y + accountOffset, key: a.accountKey });
      accountOffset += a.windows.length + 1;
    }
    for (const line of accountLines.slice(0, accountRoom)) put(y++, line);
    if (accountLines.length > accountRoom && accountRoom > 0) {
      this.accountHits = this.accountHits.filter((hit) => hit.y !== y - 1);
      put(y - 1, `アカウント枠: ほか ${accountLines.length - accountRoom + 1} 行（aで一覧）`);
    }
    if (!accountLines.length && area.h >= 8) put(y++, "利用枠の情報がありません（aで一覧）");
    section("エージェント");
    const rows = this.rows();
    this.selected = Math.max(0, Math.min(this.selected, rows.length - 1));
    const rowHeight = area.y + area.h - y - 1 < 3 ? 1 : 3;
    const available = Math.max(0, Math.floor((area.y + area.h - y - 1) / rowHeight));
    const start = Math.max(0, this.selected - available + 1);
    if (!rows.length) put(y++, "エージェントがありません");
    const trackY = y;
    for (const [i, p] of rows.slice(start, start + available).entries()) {
      const tab = this.model.tabs.get(p.tabId),
        ws = tab ? this.model.workspaces.get(tab.workspaceId) : undefined;
      const bg = start + i === this.selected ? c.active : c.bg;
      const state = this.model.displayStateOf(p);
      const glyph = glyphFor(state, this.symbols());
      put(
        y,
        `${glyph ? glyph + " " : ""}${paneNameOf(p)} · ${ws?.label ?? shortId(tab?.workspaceId ?? p.tabId)} / ${tab?.label ?? shortId(p.tabId)}`,
        bg,
      );
      if (y < area.y + area.h)
        grid.text(area.x + 1, y, glyph, stateColor(theme, state), bg, 0, Math.max(0, area.w - 2));
      this.hits.push({ y, paneId: p.id });
      y++;
      if (rowHeight === 1) continue;
      const u = this.usage.data.panes[p.id];
      put(
        y,
        u
          ? `${u.kind} · ${u.model ?? "—"} · ${basis[u.tokens.basis]} ${num(u.tokens.total)} · $${u.costUsd === undefined ? "—" : u.costUsd.toFixed(4)}${u.partial ? " · 一部" : ""}${u.scanning ? " · 読取中" : ""}${u.updatesStopped ? " · 更新停止" : ""}`
          : "利用状況を取得できません",
        bg,
      );
      this.hits.push({ y, paneId: p.id });
      y++;
      put(
        y++,
        u
          ? "文脈 " +
              usageGauge(contextPercent(u)) +
              " · 更新 " +
              new Date(u.updatedAt).toLocaleString("ja-JP")
          : "",
        bg,
      );
    }
    this.scrollbar.render(
      grid,
      { ...area, y: trackY, h: available * rowHeight },
      rows.length * rowHeight,
      start * rowHeight,
      c,
      (offset) => {
        this.selected = Math.min(rows.length - 1, Math.floor(offset / rowHeight) + available - 1);
      },
    );
    put(
      area.y + area.h - 1,
      `${rows.length} エージェント · ${this.selected + Number(rows.length > 0)} / ${rows.length}`,
    );
  }
}

/** Account cost drilldown is read-only and uses the same authenticated RPC as the web dialog. */
export class AccountCostDialog implements Overlay {
  private rect: Rect | null = null;
  private scroll = 0;
  private readonly scrollbar = new ScrollBar();
  private result: AccountCostResult | null = null;
  private busy = false;
  private error = "";
  private closed = false;
  constructor(
    private readonly key: string,
    private readonly ui: UiState,
    private readonly usage: UsageModel,
  ) {
    void this.load();
  }
  private async load() {
    if (this.busy || this.closed) return;
    this.busy = true;
    this.error = "";
    this.usage.refresh();
    try {
      const result = await this.usage.accountCost(this.key);
      if (!this.closed) this.result = result;
    } catch {
      if (!this.closed)
        this.error = "コストを取得できません（接続・サーバーの対応状況を確認してください）";
    } finally {
      if (!this.closed) {
        this.busy = false;
        this.usage.refresh();
      }
    }
  }
  cancelInteraction() {
    this.scrollbar.cancel();
  }
  handleScrollMouse(ev: OverlayMouse) {
    return this.scrollbar.handleMouse(ev);
  }
  cancel() {
    this.closed = true;
    this.ui.closeDialog();
  }
  handleKey(k: KeyInput) {
    if (isEsc(k)) this.cancel();
    else if (isDown(k)) this.scroll++;
    else if (isUp(k)) this.scroll = Math.max(0, this.scroll - 1);
    else if (k.key === "r") void this.load();
  }
  handleMouse(ev: OverlayMouse) {
    if (this.scrollbar.handleMouse(ev)) return true;
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "wheel") this.scroll = Math.max(0, this.scroll + (ev.button === 65 ? 1 : -1));
    return true;
  }
  render({ grid, theme }: OverlayRenderContext) {
    this.rect = centeredRect(grid, Math.min(100, grid.w - 2), grid.h - 2);
    const c = dialogColors(theme),
      area = drawBox(
        grid,
        this.rect,
        c,
        "コスト · " +
          (this.usage.data.accounts.find((a) => a.accountKey === this.key)?.label ?? "アカウント"),
      );
    const usd = (n: number | undefined) => (n === undefined ? "—" : "$" + n.toFixed(4)),
      r = this.result;
    const lines = [
      "保存済みセッションのUSD集計（契約料金・請求額とは異なります）",
      "内訳のない金額は不明。探索・読み取りには上限があります。",
      ...(this.busy ? ["読み込み中…"] : []),
      ...(this.error ? [this.error] : []),
      ...(r
        ? [
            "─ 全体 ──────────────────────────",
            usd(r.totalUsd) + ` · ${r.sessions} セッション / コスト未取得 ${r.unpricedSessions} 件`,
            ...(r.partial ? ["一部の記録の集計（探索上限・読めない記録があります）"] : []),
            "─ モデル別 ───────────────────────",
            ...r.byModel.map((x) => `${x.label}  ${usd(x.usd)}  (${x.sessions} セッション)`),
            ...(r.byModel.length ? [] : ["取得できる内訳がありません"]),
            "─ エフォート別 ───────────────────",
            ...r.byEffort.map((x) => `${x.label}  ${usd(x.usd)}  (${x.sessions} セッション)`),
            ...(r.byEffort.length ? [] : ["取得できる内訳がありません"]),
            `取得 ${new Date(r.asOf).toLocaleString("ja-JP")}`,
          ]
        : []),
      "↑↓ スクロール · r 更新（最大10秒キャッシュ） · Esc 閉じる",
    ];
    this.scroll = Math.min(this.scroll, Math.max(0, lines.length - area.h));
    lines
      .slice(this.scroll, this.scroll + area.h)
      .forEach((s, i) =>
        grid.text(
          area.x,
          area.y + i,
          truncate(plainText(s), Math.max(0, area.w - 1)),
          c.fg,
          c.bg,
          0,
          Math.max(0, area.w - 1),
        ),
      );
    this.scrollbar.render(grid, area, lines.length, this.scroll, c, (offset) => {
      this.scroll = offset;
    });
    return hiddenCursor();
  }
}
