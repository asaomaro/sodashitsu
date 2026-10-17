import type { ManagedConnection, DelegationStatus, PairingRequest } from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { UiState } from "../model/UiState.js";
import type { Grid, Rect } from "../render/Screen.js";
import type { ThemeColors } from "../render/color.js";
import {
  dialogColors,
  hiddenCursor,
  isEsc,
  isEnter,
  isUp,
  isDown,
  inside,
  type OverlayMouse,
} from "./overlay.js";
import { safeText } from "./document.js";
import { TextInput } from "./TextInput.js";
import { ScrollBar } from "./ScrollBar.js";
type Row = { text: string; run?: () => void };
export class ConnectionsView {
  private connections: ManagedConnection[] = [];
  private delegations: DelegationStatus[] = [];
  private requests: PairingRequest[] = [];
  private active = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private busy = false;
  private error = "";
  private selected = 0;
  private scroll = 0;
  private area: Rect | null = null;
  private hits = new Map<number, () => void>();
  private readonly scrollbar = new ScrollBar();
  private mode: "list" | "request" | "confirm" = "list";
  private fields = [new TextInput(), new TextInput(), new TextInput()];
  private field = 0;
  private pendingId = "";
  private deleteId = "";
  constructor(
    private ui: UiState,
    private conn: RequestPort,
    private redraw: () => void,
  ) {}
  sync(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (active) {
      void this.refresh();
      this.timer = setInterval(() => void this.refresh(), 5000);
      this.timer.unref?.();
    } else this.scrollbar.cancel();
  }
  dispose() {
    this.sync(false);
  }
  async refresh() {
    if (this.busy) return;
    const generation = this.generation;
    try {
      const [a, b, c] = await Promise.all([
        this.conn.request("machine.connections", {}),
        this.conn.request("machine.delegations", {}),
        this.conn.request("machine.pairing_requests", {}),
      ]);
      if (generation !== this.generation) return;
      this.connections = a.connections;
      this.delegations = b.delegations;
      this.requests = c.requests;
      this.error = "";
      this.redraw();
    } catch {
      if (generation === this.generation) {
        this.error = "外部接続を取得できません。サーバーの対応状況を確認してください。";
        this.redraw();
      }
    }
  }
  private async run(task: () => Promise<unknown>) {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    let success = false;
    try {
      await task();
      success = true;
    } catch (e) {
      this.error = e instanceof Error ? e.message : "操作できません";
    } finally {
      this.busy = false;
      this.redraw();
    }
    if (success) await this.refresh();
  }
  private manage(item: ManagedConnection, action: "enable" | "disable" | "remove") {
    if (action === "remove" && this.deleteId !== item.id) {
      this.deleteId = item.id;
      this.error =
        "登録を削除します。もう一度削除を選んで確定してください（作業プロセスは停止しません）。";
      return;
    }
    this.deleteId = "";
    void this.run(() => this.conn.request("machine.manage", { id: item.id, action }));
  }
  private rows(): Row[] {
    const state = (s: string) =>
      ({
        online: "接続済み",
        connecting: "接続待ち",
        reconnecting: "再接続中",
        attention: "要対応",
        disabled: "無効",
      })[s] ?? s;
    const rows: Row[] = [
      { text: "[ 更新 ]", run: () => void this.refresh() },
      {
        text: "[ このPCの操作を委譲する… ]",
        run: () => {
          this.mode = "request";
          this.field = 0;
        },
      },
      { text: "─ 操作する接続 ─" },
    ];
    if (!this.connections.length) rows.push({ text: "登録された接続はありません。" });
    for (const item of this.connections) {
      rows.push({
        text: `${item.label} · ${item.transport === "ssh" ? "SSH" : "外向き接続"} · ${state(item.state)} ${item.message ?? ""}`,
      });
      rows.push(
        {
          text: `  [ ${item.enabled ? "無効化" : "有効化"} ]`,
          run: () => this.manage(item, item.enabled ? "disable" : "enable"),
        },
        { text: "  [ 登録削除 ]", run: () => this.manage(item, "remove") },
      );
    }
    rows.push({ text: "─ 操作を委譲している接続 ─" });
    if (!this.delegations.length) rows.push({ text: "委譲中の接続はありません。" });
    for (const item of this.delegations)
      rows.push(
        { text: `${item.url} · ${state(item.state)}` },
        {
          text: "  [ 委譲を停止 ]",
          run: () =>
            void this.run(() => this.conn.request("machine.stop_delegation", { id: item.id })),
        },
      );
    rows.push({ text: `─ 承認待ちの申請 (${this.requests.length}) ─` });
    if (!this.requests.length) rows.push({ text: "申請はありません。" });
    for (const item of this.requests)
      rows.push(
        { text: `${item.label} · ${item.address}` },
        { text: `確認コード: ${item.code} · ${new Date(item.expiresAt).toLocaleTimeString()}まで` },
        {
          text: "  [ 申請を拒否 ]",
          run: () =>
            void this.run(() => this.conn.request("machine.reject_pairing", { id: item.id })),
        },
      );
    return rows;
  }
  handleKey(k: KeyInput) {
    if (isEsc(k)) {
      if (this.mode !== "list") this.mode = "list";
      else this.ui.setScreen("base");
      return;
    }
    if (this.mode !== "list") {
      if (isEnter(k)) {
        if (this.mode === "request")
          void this.run(async () => {
            const r = await this.conn.request("machine.request_delegation", {
              url: this.fields[0]!.value,
              label: this.fields[1]!.value,
            });
            this.pendingId = r.id;
            this.mode = "confirm";
            this.field = 2;
          });
        else
          void this.run(async () => {
            await this.conn.request("machine.confirm_delegation", {
              id: this.pendingId,
              code: this.fields[2]!.value,
            });
            this.mode = "list";
            this.fields[2] = new TextInput();
          });
      } else if (k.key === "Tab" && this.mode === "request") this.field = this.field === 0 ? 1 : 0;
      else this.fields[this.field]!.handleKey(k);
      return;
    }
    const rows = this.rows();
    if (isDown(k)) this.selected = Math.min(rows.length - 1, this.selected + 1);
    else if (isUp(k)) this.selected = Math.max(0, this.selected - 1);
    else if (isEnter(k)) rows[this.selected]?.run?.();
    else if (k.key === "r") void this.refresh();
    else if (k.key === "n") {
      this.mode = "request";
      this.field = 0;
    }
  }
  handlePaste(text: string) {
    if (this.mode !== "list") this.fields[this.field]!.insert(text);
  }
  handleMouse(ev: OverlayMouse) {
    if (this.scrollbar.handleMouse(ev)) return true;
    if (!inside(this.area, ev.x, ev.y)) return false;
    if (ev.action === "wheel") {
      this.scroll = Math.max(0, this.scroll + (ev.button === 64 ? -3 : 3));
      this.selected = this.scroll;
      return true;
    }
    if (ev.action === "down" && ev.button === 0) {
      this.hits.get(ev.y)?.();
      return true;
    }
    return true;
  }
  render(grid: Grid, area: Rect, theme: ThemeColors) {
    this.area = area;
    this.hits.clear();
    const c = dialogColors(theme);
    grid.fill(area, c.fg, c.bg);
    const text = (y: number, s: string) => {
      if (y < 0 || y >= area.h) return;
      grid.text(area.x + 1, area.y + y, safeText(s), c.fg, c.bg, 0, Math.max(0, area.w - 3));
    };
    text(0, "外部接続（このサーバー）");
    text(1, "↑↓選択 Enter実行 / n委譲申請 / r更新 / Esc端末へ");
    if (this.mode !== "list") {
      text(3, "このセッション全体の操作を委譲します。相手を確認してコードを入力してください。");
      if (this.mode === "request") {
        text(5, "操作する側のURL: " + this.fields[0]!.value);
        text(7, "このPCの名前: " + this.fields[1]!.value);
        text(9, `入力中: ${this.field === 0 ? "URL" : "PC名"} / Tabで移動・Enterで申請`);
        this.hits.set(area.y + 5, () => {
          this.field = 0;
        });
        this.hits.set(area.y + 7, () => {
          this.field = 1;
        });
      } else {
        text(5, "相手に表示された8桁コード: " + this.fields[2]!.value);
        text(7, "[ コードを確認して委譲 ]");
        this.hits.set(area.y + 7, () =>
          this.handleKey({
            key: "Enter",
            code: "Enter",
            type: "keydown",
            composing: false,
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
          }),
        );
      }
      text(area.h - 1, this.error || (this.busy ? "処理中…" : ""));
      return hiddenCursor();
    }
    const rows = this.rows(),
      h = Math.max(0, area.h - 4);
    this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
    if (this.selected < this.scroll) this.scroll = this.selected;
    else if (this.selected >= this.scroll + h) this.scroll = Math.max(0, this.selected - h + 1);
    for (let i = 0; i < h; i++) {
      const row = rows[this.scroll + i];
      if (!row) break;
      grid.text(
        area.x + 1,
        area.y + 3 + i,
        safeText(row.text),
        c.fg,
        this.selected === this.scroll + i ? c.active : c.bg,
        0,
        Math.max(0, area.w - 3),
      );
      if (row.run) this.hits.set(area.y + 3 + i, row.run);
    }
    text(area.h - 1, this.error || (this.busy ? "処理中…" : ""));
    this.scrollbar.render(
      grid,
      { x: area.x, y: area.y + 3, w: area.w, h },
      rows.length,
      this.scroll,
      c,
      (offset) => {
        this.scroll = offset;
        this.selected = offset;
        this.redraw();
      },
    );
    return hiddenCursor();
  }
}
