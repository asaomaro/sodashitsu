import type { ResourceMonitorSnapshot, UsageInsights, UsageInsightsParams, InsightGroup, UsageReport } from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { UiState } from "../model/UiState.js";
import type { Grid, Rect, CursorState } from "../render/Screen.js";
import type { ThemeColors } from "../render/color.js";
import { dialogColors, hiddenCursor, inside, isEsc, isDown, isUp, wrapText, type OverlayMouse } from "./overlay.js";
import { stringWidth } from "../render/width.js";
import { safeText } from "./document.js";
import { ScrollBar } from "./ScrollBar.js";

const number = (n: number) => n.toLocaleString("ja-JP");
const percent = (n: number | null) => n === null ? "—" : `${n.toFixed(1)}%`;
const bytes = (n: number | null) => n === null ? "—" : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(1)} MiB`;
const tokens = (g: InsightGroup, n = g.total) => g.calls > 0 ? number(n) : "未取得";
const share = (n: number, total: number) => total > 0 ? `${(n / total * 100).toFixed(1)}%` : "—";
const bar = (n: number, max: number) => { const filled = max > 0 ? Math.round(Math.min(1, Math.max(0, n / max)) * 12) : 0; return "[" + "#".repeat(filled) + "-".repeat(12 - filled) + "]"; };
const labels = {server:"操舵室本体",agent:"エージェント",terminal:"端末",service:"関連プロセス",app:"デスクトップアプリ"};
const roles = {main:"メイン",sub:"サブ",unknown:"不明"};
const periods = [7, 30, 90, 365];
const kinds = [undefined, "claude", "codex", "muse", "agy", "copilot"] as const;
const roleFilters = [undefined, "main", "sub", "unknown"] as const;

/** Read-only screens. Only one request is in flight; generation guards isolate host/range changes. */
export class MonitorView {
  private active = false;
  private paused = false;
  private busy = false;
  private generation = 0;
  private requestId = 0;
  private queued = false;
  private reportError = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private error = "";
  private resource: ResourceMonitorSnapshot | null = null;
  private insights: UsageInsights | null = null;
  private report: UsageReport | null = null;
  private reportBusy = false;
  private reportKind = 2;
  private reportScope = "";
  private section = 0;
  private period = 1;
  private kind = 0;
  private role = 0;
  private group = 0;
  private sort = 0;
  private offset = 0;
  private total = 0;
  private rect: Rect | null = null;
  private readonly scrollbar = new ScrollBar();
  private tabHits: {x:number;w:number;index:number}[] = [];
  constructor(readonly mode: "analytics" | "resources", private ui: UiState, private rpc: RequestPort, private redraw: () => void) {}

  sync(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.generation++;
    this.requestId++; this.queued = false;
    this.busy = false;
    this.reportBusy = false;
    this.cancelInteraction();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (active) {
      void this.refresh();
      this.timer = setInterval(() => { if (!this.paused) void this.refresh(); }, this.mode === "resources" ? 3000 : 15000);
      this.timer.unref?.();
    }
  }
  reset(): void {
    this.generation++;
    this.requestId++; this.queued = false;
    this.busy = false;
    this.reportError = "";
    this.report = null; this.reportBusy = false; this.reportScope = "";
    this.resource = null;
    this.insights = null;
    this.error = "";
    this.offset = 0;
    this.cancelInteraction();
  }
  dispose(): void { this.sync(false); this.reset(); }
  cancelInteraction(): void { this.scrollbar.cancel(); }
  private params(): UsageInsightsParams {
    const end = new Date();
    const start = new Date(end); start.setDate(start.getDate() - periods[this.period]! + 1);
    const date = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return {from:date(start),to:date(end),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",kind:kinds[this.kind],role:roleFilters[this.role]};
  }
  private async refresh(): Promise<void> {
    if (!this.active || this.busy) return;
    this.busy = true;
    const generation = this.generation, requestId = ++this.requestId;
    try {
      if (this.mode === "resources") {
        const result = await this.rpc.request("server.resource_monitor", {});
        if (generation === this.generation) this.resource = result;
      } else {
        const result = await this.rpc.request("agent.usage_insights", this.params());
        if (generation === this.generation) this.insights = result;
      }
      if (generation === this.generation) this.error = "";
    } catch {
      if (generation === this.generation) this.error = "取得できません。接続先とサーバの対応状況を確認し、rで再試行してください。";
    } finally {
      if (requestId === this.requestId) {
        this.busy = false;
        if (generation === this.generation) this.redraw();
        if (this.queued) { this.queued = false; void this.refresh(); }
      }
    }
  }
  private async generateReport(): Promise<void> {
    if (!this.active || this.reportBusy) return;
    this.reportBusy = true; this.reportError = "";
    const generation = this.generation, params = this.params();
    this.redraw();
    try {
      const report = await this.rpc.request("agent.usage_report", {
        settings: {kind:kinds[this.reportKind] ?? "codex",model:""},
        history:{from:params.from,to:params.to},
        insights:{timezone:params.timezone,kind:params.kind,role:params.role},
      });
      if (generation === this.generation) {
        this.report = report;
        this.reportScope = `${params.from} ～ ${params.to} · ${params.kind ?? "全CLI"} · ${params.role ?? "メイン/サブすべて"}`;
      }
    } catch {
      if (generation === this.generation) this.reportError = "分析を生成できません。指定CLIの導入・認証を確認してください。";
    } finally {
      if (generation === this.generation) { this.reportBusy = false; this.redraw(); }
    }
  }
  private changeFilters(): void {
    const busy = this.busy, requestId = this.requestId;
    this.reset();
    if (busy) { this.busy = true; this.requestId = requestId; this.queued = true; }
    else void this.refresh();
  }
  handleKey(key: KeyInput): void {
    if (isEsc(key)) { this.ui.setScreen("base"); return; }
    if (key.ctrl || key.alt || key.meta) return;
    if (key.key === "r") void this.refresh();
    else if (key.key === "p") { this.paused = !this.paused; if (!this.paused) void this.refresh(); }
    else if (this.mode === "analytics" && (key.key === "Tab" || /^[1-5]$/.test(key.key))) {
      this.section = key.key === "Tab" ? (this.section + (key.shift ? 4 : 1)) % 5 : Number(key.key) - 1;
      this.offset = 0;
    } else if (this.mode === "analytics" && key.key === "d") { this.period = (this.period + 1) % periods.length; this.changeFilters(); }
    else if (this.mode === "analytics" && key.key === "k") { this.kind = (this.kind + 1) % kinds.length; this.changeFilters(); }
    else if (this.mode === "analytics" && key.key === "m") { this.role = (this.role + 1) % roleFilters.length; this.changeFilters(); }
    else if (this.mode === "analytics" && this.section === 4 && key.key === "g") void this.generateReport();
    else if (this.mode === "analytics" && this.section === 4 && key.key === "a") this.reportKind = this.reportKind % 5 + 1;
    else if (this.mode === "resources" && key.key === "s") this.sort = (this.sort + 1) % 3;
    else if (this.mode === "resources" && key.key === "g") { this.group = (this.group + 1) % 6; this.offset = 0; }
    else if (isDown(key)) this.offset++;
    else if (isUp(key)) this.offset = Math.max(0, this.offset - 1);
    else if (key.key === "PageDown") this.offset += Math.max(1, (this.rect?.h ?? 10) - 5);
    else if (key.key === "PageUp") this.offset = Math.max(0, this.offset - Math.max(1, (this.rect?.h ?? 10) - 5));
    else if (key.key === "Home") this.offset = 0;
    else if (key.key === "End") this.offset = this.total;
    this.redraw();
  }
  handleMouse(ev: OverlayMouse): boolean {
    if (this.scrollbar.handleMouse(ev)) return true;
    if (!this.rect || !inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "wheel") this.offset = Math.max(0, this.offset + (ev.button === 65 ? 3 : -3));
    if (ev.action === "down" && ev.button === 0 && this.mode === "analytics" && ev.y === this.rect.y + 1) {
      const hit = this.tabHits.find(h => ev.x >= h.x && ev.x < h.x + h.w);
      if (hit) { this.section = hit.index; this.offset = 0; }
    }
    this.redraw(); return true;
  }
  private resourceLines(): string[] {
    const d = this.resource;
    if (!d) return ["リソース情報を取得しています…"];
    const all = d.processes, cpu = all.filter(p => p.cpuPercent !== null), mem = all.filter(p => p.rssBytes !== null);
    const groups = [undefined, ...Object.keys(labels)] as (keyof typeof labels | undefined)[];
    const selected = groups[this.group];
    const rows = all.filter(p => !selected || p.group === selected).sort((a,b) => this.sort === 0 ? (b.rssBytes ?? -1) - (a.rssBytes ?? -1) : this.sort === 1 ? (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1) : a.name.localeCompare(b.name));
    return [
      `ホスト ${d.system.hostname} · ${new Date(d.sampledAt).toLocaleTimeString()}`,
      `操舵室関連 CPU ${cpu.length ? percent(cpu.reduce((s,p)=>s+p.cpuPercent!,0)) : "—"} (${cpu.length}/${all.length}取得)`,
      `操舵室関連 RSS ${mem.length ? bytes(mem.reduce((s,p)=>s+p.rssBytes!,0)) : "—"} (${mem.length}/${all.length}取得) · ${all.length}プロセス`,
      `ホスト全体 CPU ${percent(d.system.cpuPercent)} · メモリ ${bytes(d.system.memoryTotalBytes-d.system.memoryAvailableBytes)} / ${bytes(d.system.memoryTotalBytes)}`,
      "CPUは1コア=100%。合計は100%を超えます。RSSは共有ページを重複して含みます。",
      "取得不能は—。合計は絞り込み前の全対象（別OSアプリを含む）です。",
      ...d.warnings.map(w=>`注意: ${w}`),
      `対象: ${selected ? labels[selected] : "すべて"} · 並び: ${["メモリ","CPU","名前"][this.sort]} · ${rows.length}件`,
      "プロセス / PID / CPU / RSS / スレッド / 対象・作業 / OS・接続元",
      ...rows.map(p=>`${p.name} | ${p.pid} | ${percent(p.cpuPercent)} | ${bytes(p.rssBytes)} | ${p.threads ?? "—"} | ${labels[p.group]} · ${p.label} | ${p.platform} · ${p.source}${p.paneId ? ` · pane ${p.paneId.slice(0,8)}` : ""}`),
      ...(rows.length ? [] : ["表示するプロセスがありません。"]),
    ];
  }
  private analyticsLines(): string[] {
    const d = this.insights;
    if (!d) return ["利用記録を集計しています…"];
    const summary = [`期間 ${d.from} ～ ${d.to} (${d.timezone})`,
      `トークン ${tokens(d.totals)} · 呼出 ${number(d.totals.calls)} · ツール ${number(d.totals.tools)} · エラー ${number(d.totals.errors)}`,
      `入力 ${tokens(d.totals,d.totals.input)} / 出力 ${tokens(d.totals,d.totals.output)} / キャッシュ読込 ${tokens(d.totals,d.totals.cacheRead)} / 書込 ${tokens(d.totals,d.totals.cacheWrite)}`,
      d.collecting ? "記録を収集中です。自動更新で集計が進みます。" : d.partial ? "一部の記録のみの集計です（収集状況を参照）。" : "取得できた記録に基づく集計です。",
    ];
    const groups = (title: string, rows: InsightGroup[]) => [title, ...rows.map(g=>`${g.calls > 0 && d.totals.calls > 0 ? bar(g.total,d.totals.total) : "[????????????]"} ${g.label} · ${tokens(g)} tok (${g.calls > 0 && d.totals.calls > 0 ? share(g.total,d.totals.total) : "未取得"}) · ${g.calls}回 · tool ${g.tools}`), ...(rows.length ? [] : ["記録なし"])];
    if (this.section === 0) return [...summary,`活動: 開始 ${d.activity.started} / 完了 ${d.activity.completed} / 中断 ${d.activity.aborted} / 失敗 ${d.activity.failed}`,...groups("エージェント別",d.byKind),...groups("日別",d.byDay)];
    if (this.section === 1) return [...summary,`前期間 ${tokens(d.previous)} tok / ${d.previous.calls}回 · 差分 ${d.totals.calls > 0 && d.previous.calls > 0 ? number(d.totals.total-d.previous.total) : "未取得"} tok`,...groups("モデル別",d.byModel),...groups("プロジェクト別",d.byProject),...groups("アカウント別",d.byAccount),...groups("時間帯別",d.byHour)];
    if (this.section === 2) {
      const direct = d.tools.filter(t=>!t.nested), total = direct.reduce((n,t)=>n+t.calls,0);
      return [...summary,...groups("メイン / サブ（トークン比率）",d.byRole.map(g=>({...g,label:roles[g.key as keyof typeof roles] ?? g.label}))),
        "ツール（呼出比率。同じ呼出の内訳となるnested行は分母から除外）",
        ...d.tools.map(t=>`${t.category}/${t.name} ${t.calls}回 ${t.nested ? "内訳" : share(t.calls,total)} · 成功 ${t.success} / 失敗 ${t.failed} / 不明 ${t.unknown} · ${t.basis === "inferred" ? "推定" : "直接記録"}`),
        "セッション（親子・取り組み先）",...d.sessions.map(s=>`${roles[s.role]} ${s.kind} ${s.label} · project ${s.project} · parent ${s.parent ?? "—"} · ${tokens(s)} tok`),
      ];
    }
    if (this.section === 4) {
      const r = this.report, doc = r?.document;
      return [...summary,`a 分析CLI ${kinds[this.reportKind]} · g 分析を生成（CLIを実行します）`,
        ...(this.reportBusy ? ["分析を生成しています…"] : []),
        ...(this.reportError ? [this.reportError] : []),
        ...(r ? [`生成: ${r.kind} / ${r.model || "既定モデル"} · ${this.reportScope}`,new Date(r.updatedAt).toLocaleString(),
          ...(doc ? [doc.summary,"取り組み中の作業",...doc.work.map(w=>`${w.agent} · ${w.workspace} · ${w.status}: ${w.description} 根拠: ${w.evidence}`),
            "使われ方",...doc.patterns.map(p=>`${p.title}: ${p.detail}`),"改善案",...doc.recommendations.map(p=>`${p.priority} · ${p.title}: ${p.detail}`),"限界",...doc.limitations] : r.text.split("\n"))]
          : ["分析はgを押したときだけ生成します。表示・更新だけではモデルを呼びません。"]),
      ];
    }
    return [...summary,`保持開始 ${d.retainedFrom} · 更新 ${new Date(d.asOf).toLocaleString()}`,
      ...d.coverage.map(c=>`${c.kind}: 読込 ${c.files} / 待機 ${c.pending} / 不足 ${c.missing} / 不正 ${c.invalid} / 上限超 ${c.oversized}${c.limited ? " · 件数上限あり" : ""}`),
      "記録にない呼出・結果は推測で補いません。トークンは収集対象と期間内の記録分です。",
      "ツールの内訳やサブエージェントの取得範囲はCLIごとに異なります。",
    ];
  }
  render(grid: Grid, area: Rect, theme: ThemeColors): CursorState {
    this.rect = {...area}; this.tabHits = [];
    const c = {...dialogColors(theme),bg:theme.ground("--soda-menu-bg")};
    grid.fill(area,c.fg,c.bg);
    const write = (y:number,text:string) => { if(y < area.h) grid.text(area.x+1,area.y+y,safeText(text),c.fg,c.bg,0,Math.max(0,area.w-2)); };
    write(0,`${this.mode === "analytics" ? "エージェント利用分析" : "リソースモニター"} · ${!this.active ? "接続待ち" : this.busy ? "取得中…" : this.paused ? "更新停止中" : "自動更新"}`);
    if (this.mode === "analytics") {
      const tabs = ["1 概要","2 比較","3 親子・ツール","4 収集状況","5 エージェント分析"];
      let x = area.x+1;
      tabs.forEach((label,index)=>{ const text = `${index === this.section ? "[" : " "}${label}${index === this.section ? "]" : " "} `; const w = stringWidth(text); this.tabHits.push({x,w,index}); if (area.h > 1 && x < area.x+area.w-1) grid.text(x,area.y+1,text,c.fg,index===this.section?c.active:c.bg,0,Math.max(0,area.x+area.w-1-x)); x+=w; });
      write(2,`d 期間 ${periods[this.period]}日 · k CLI ${kinds[this.kind] ?? "すべて"} · m 親子 ${roleFilters[this.role] ?? "すべて"}`);
    } else { write(1,"g 対象を切替 · s 並べ替え（メモリ / CPU / 名前）"); write(2,"操舵室本体・エージェント・端末・関連サービス・アプリ"); }
    write(3,this.error ? this.error + ((this.resource||this.insights) ? " 最終取得値を表示中。" : "") : "r 更新 · p 自動更新停止/再開 · ↑↓/PgUp/PgDn スクロール · Esc 端末");
    const body = {...area,y:area.y+4,h:Math.max(0,area.h-4)};
    const lines = (this.mode === "resources" ? this.resourceLines() : this.analyticsLines()).flatMap(line=>wrapText(safeText(line),Math.max(1,area.w-3)));
    this.total = lines.length; this.offset = Math.max(0,Math.min(this.offset,Math.max(0,lines.length-body.h)));
    for(let i=0;i<body.h;i++) write(i+4,lines[this.offset+i] ?? "");
    this.scrollbar.render(grid,body,lines.length,this.offset,c,offset=>{this.offset=offset;this.redraw();});
    return hiddenCursor();
  }
}
