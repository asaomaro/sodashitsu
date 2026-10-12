import { ScrollBar } from "./ScrollBar.js";
import type { ScheduleListResult, ScheduledJob, ScheduleDraft } from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { TextInput } from "./TextInput.js";
import { safeText } from "./document.js";
import {
  dialogColors,
  hiddenCursor,
  isEsc,
  isEnter,
  isDown,
  isUp,
  inside,
  type OverlayMouse,
} from "./overlay.js";
import type { Grid, Rect, CursorState } from "../render/Screen.js";
import type { ThemeColors } from "../render/color.js";
import { stringWidth } from "../render/width.js";
const status = {
  running: "実行中",
  sent: "指示送信済み",
  succeeded: "成功",
  failed: "失敗",
  interrupted: "中断",
};
export class ScheduleView {
  private readonly scrollbar = new ScrollBar();
  private data: ScheduleListResult = { jobs: [], runs: [] };
  private selected = 0;
  private mode: "list" | "edit" | "results" = "list";
  private error = "";
  private active = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private rect: Rect | null = null;
  private hits = new Map<number, number>();
  private generation = 0;
  private inputs = [
    new TextInput(),
    new TextInput(),
    new TextInput("60"),
    new TextInput("600"),
    new TextInput(),
  ];
  private field = 0;
  private agent = false;
  private repeat = false;
  private enabled = true;
  private targetId = "";
  private id: string | undefined;
  private deleteId: string | null = null;
  constructor(
    private model: SessionModel,
    private ui: UiState,
    private conn: RequestPort,
    private redraw: () => void,
  ) {}
  cancelInteraction() {
    this.scrollbar.cancel();
  }
  sync(active: boolean) {
    if (!active) this.cancelInteraction();
    if (this.active === active) return;
    this.active = active;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (active) {
      void this.refresh();
      this.timer = setInterval(() => void this.refresh(), 5000);
      this.timer.unref?.();
    }
  }
  reset() {
    this.cancelInteraction();
    this.generation++;
    this.data = { jobs: [], runs: [] };
    this.mode = "list";
    this.selected = 0;
    this.error = "";
  }
  private async refresh() {
    const generation = this.generation;
    try {
      const result = await this.conn.request("schedule.list", {});
      if (generation === this.generation) {
        this.data = result;
        this.selected = Math.min(this.selected, Math.max(0, result.jobs.length - 1));
        this.error = "";
      }
    } catch {
      if (generation === this.generation) this.error = "予約を取得できません";
    } finally {
      if (this.active) this.redraw();
    }
  }
  private targets() {
    return this.agent
      ? [...this.model.panes.values()]
          .filter((p) => p.agent && !p.virtual)
          .map((p) => ({ id: p.id, name: p.label || p.agent!.label }))
      : [...this.model.workspaces.values()].map((w) => ({ id: w.id, name: w.label }));
  }
  private edit(job?: ScheduledJob) {
    this.id = job?.id;
    this.agent =
      job?.action.type === "agent" ||
      (!job && [...this.model.panes.values()].some((p) => p.agent && !p.virtual));
    this.repeat = job?.trigger.type === "interval";
    this.enabled = job?.enabled ?? true;
    this.inputs = [
      new TextInput(job?.label ?? ""),
      new TextInput(
        job
          ? job.trigger.type === "once"
            ? job.trigger.at
            : job.trigger.startAt
          : new Date(Date.now() + 300000).toISOString(),
      ),
      new TextInput(String(job?.trigger.type === "interval" ? job.trigger.everyMinutes : 60)),
      new TextInput(String(job?.timeoutSeconds ?? 600)),
      new TextInput(
        job ? (job.action.type === "agent" ? job.action.text : job.action.command) : "",
      ),
    ];
    const targetId = job
      ? job.action.type === "agent"
        ? job.action.paneId
        : job.action.workspaceId
      : this.agent
        ? this.model.focusedPaneId
        : this.model.workspaceId;
    this.targetId = targetId ?? this.targets()[0]?.id ?? "";
    this.mode = "edit";
    this.field = 0;
    this.error = "";
  }
  private async perform(work: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    try {
      await work();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
      this.redraw();
    }
  }
  private async save() {
    await this.perform(async () => {
      const target = this.targets().find((t) => t.id === this.targetId);
      if (!target) throw new Error("対象を選んでください");
      const at = new Date(this.inputs[1]!.value).toISOString();
      const job: ScheduleDraft = {
        label: this.inputs[0]!.value,
        enabled: this.enabled,
        trigger: this.repeat
          ? { type: "interval", startAt: at, everyMinutes: Number(this.inputs[2]!.value) }
          : { type: "once", at },
        timeoutSeconds: Number(this.inputs[3]!.value),
        action: this.agent
          ? { type: "agent", paneId: target.id, text: this.inputs[4]!.value }
          : { type: "command", workspaceId: target.id, command: this.inputs[4]!.value },
      };
      await this.conn.request("schedule.save", { ...(this.id ? { id: this.id } : {}), job });
      this.mode = "list";
      await this.refresh();
    });
  }
  private currentInput() {
    return this.field === 0
      ? this.inputs[0]
      : this.field === 3
        ? this.inputs[1]
        : this.field === 4
          ? this.inputs[2]
          : this.field === 5
            ? this.inputs[3]
            : this.field === 7
              ? this.inputs[4]
              : undefined;
  }
  handleKey(k: KeyInput) {
    this.scrollbar.cancel();
    if (this.busy) return;
    if (this.mode === "edit") {
      if (isEsc(k)) {
        this.mode = "list";
        return;
      }
      if (k.ctrl && k.key === "s") {
        void this.save();
        return;
      }
      if (k.key === "Tab") {
        this.field = (this.field + (k.shift ? -1 : 1) + 9) % 9;
        return;
      }
      const input = this.currentInput();
      if (input) {
        if (isEnter(k) && this.field === 7) {
          const before = [...input.value].slice(0, input.cursor).join(""),
            after = [...input.value].slice(input.cursor).join(""),
            cursor = input.cursor;
          input.value = before + "\n" + after;
          input.cursor = cursor + 1;
        } else input.handleKey(k);
        return;
      }
      if (isEnter(k) && this.field === 8) {
        void this.save();
        return;
      }
      if (["ArrowLeft", "ArrowRight", " "].includes(k.key) || isEnter(k)) {
        if (this.field === 1) {
          this.agent = !this.agent;
          this.targetId = this.targets()[0]?.id ?? "";
        }
        if (this.field === 2) this.repeat = !this.repeat;
        if (this.field === 6)
          this.targetId = (() => {
            const targets = this.targets(),
              index = targets.findIndex((t) => t.id === this.targetId);
            return (
              targets[
                (index + (k.key === "ArrowLeft" ? -1 : 1) + Math.max(1, targets.length)) %
                  Math.max(1, targets.length)
              ]?.id ?? ""
            );
          })();
        if (this.field === 8) this.enabled = !this.enabled;
      }
      return;
    }
    if (isEsc(k)) {
      if (this.mode === "results") this.mode = "list";
      else this.ui.setScreen("base");
      return;
    }
    if (this.mode === "results") {
      if (isUp(k)) this.selected = Math.max(0, this.selected - 1);
      else if (isDown(k)) this.selected++;
      return;
    }
    if (isUp(k)) this.selected = Math.max(0, this.selected - 1);
    else if (isDown(k))
      this.selected = Math.min(Math.max(0, this.data.jobs.length - 1), this.selected + 1);
    const job = this.data.jobs[this.selected];
    if (k.key === "n") this.edit();
    else if (k.key === "r") void this.refresh();
    else if (isEnter(k) && job) this.edit(job);
    else if (k.key === " ") {
      this.mode = "results";
      this.selected = 0;
    } else if (k.key === "x" && job)
      void this.perform(async () => {
        await this.conn.request("schedule.run", { id: job.id });
        await this.refresh();
      });
    else if (k.key === "e" && job)
      void this.perform(async () => {
        await this.conn.request("schedule.save", {
          id: job.id,
          job: { ...job, enabled: !job.enabled },
        });
        await this.refresh();
      });
    else if (k.key === "Delete" && job) {
      if (this.deleteId !== job.id) {
        this.deleteId = job.id;
        this.error = "もう一度Deleteで予約を削除（履歴は残ります）";
      } else
        void this.perform(async () => {
          await this.conn.request("schedule.remove", { id: job.id });
          this.deleteId = null;
          await this.refresh();
        });
    }
  }
  handlePaste(text: string) {
    const input = this.currentInput();
    if (this.mode !== "edit" || !input) return;
    if (this.field === 7) {
      const before = [...input.value].slice(0, input.cursor).join(""),
        after = [...input.value].slice(input.cursor).join(""),
        cursor = input.cursor;
      const clean = text.replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
      input.value = before + clean + after;
      input.cursor = cursor + [...clean].length;
    } else input.insert(text);
  }
  handleMouse(e: OverlayMouse) {
    if (this.scrollbar.handleMouse(e)) return true;
    if (!inside(this.rect, e.x, e.y)) return false;
    const hit = this.hits.get(e.y);
    if (e.action === "down" && e.button === 0 && hit !== undefined) {
      if (this.mode === "edit") this.field = hit;
      else if (this.mode === "list") {
        this.selected = hit;
        this.edit(this.data.jobs[hit]);
      }
    }
    return true;
  }
  render(grid: Grid, area: Rect, theme: ThemeColors): CursorState {
    area = { ...area };
    this.rect = area;
    this.hits.clear();
    const c = dialogColors(theme);
    grid.fill(area, c.fg, c.bg);
    const write = (row: number, text: string, active = false) =>
      grid.text(
        area.x + 1,
        area.y + row,
        safeText(text),
        c.fg,
        active ? c.active : c.bg,
        0,
        Math.max(0, area.w - 2),
      );
    write(
      0,
      "予約 · " +
        (this.mode === "edit"
          ? "登録・編集"
          : this.mode === "results"
            ? "実行結果"
            : "スケジュール一覧"),
    );
    write(1, this.busy ? "処理中…" : this.error);
    if (this.mode === "edit") {
      this.scrollbar.render(grid, { ...area, h: 0 }, 0, 0, c, () => {});
      const prefixes = [
        "名前: ",
        "実行内容: ",
        "実行方式: ",
        "日時(ISO): ",
        "間隔(分): ",
        "上限(秒): ",
        "対象: ",
        "本文: ",
        "有効: ",
      ];
      const values = [
        this.inputs[0]!.value,
        this.agent ? "エージェントへの指示" : "コマンド実行",
        this.repeat ? "繰り返し" : "一回",
        this.inputs[1]!.value,
        this.inputs[2]!.value,
        this.inputs[3]!.value,
        this.targets().find((t) => t.id === this.targetId)?.name ?? "対象なし",
        "",
        this.enabled ? "はい" : "いいえ",
      ];
      const rows: number[] = [];
      let row = 3;
      for (let i = 0; i < 9; i++) {
        rows[i] = row;
        if (row >= area.h - 1) break;
        if (i === 7) {
          const input = this.inputs[4]!,
            before = [...input.value].slice(0, input.cursor).join(""),
            cursorLine = before.split("\n").length - 1;
          const lines = input.value.split("\n"),
            height = Math.max(1, Math.min(5, area.h - row - 2)),
            start = Math.max(0, cursorLine - height + 1);
          for (let j = 0; j < height; j++) {
            write(
              row + j,
              (j === 0 ? prefixes[i] : "      ") + (lines[start + j] ?? ""),
              this.field === i,
            );
            this.hits.set(area.y + row + j, i);
          }
          if (this.field === 7) {
            const col = stringWidth(before.split("\n").at(-1) ?? "");
            write(area.h - 1, "Tab 欄移動 · Enter 改行 · Ctrl+S 保存 · Esc 取消");
            return {
              x: area.x + Math.min(area.w - 2, 7 + col),
              y: area.y + row + cursorLine - start,
              visible: true,
              style: "bar",
              blink: true,
            };
          }
          row += height;
          continue;
        }
        const current = i === this.field ? this.currentInput() : undefined;
        const value = current
          ? current.view(Math.max(0, area.w - 2 - stringWidth(prefixes[i]!))).text
          : values[i];
        write(row, prefixes[i]! + (value ?? ""), this.field === i);
        this.hits.set(area.y + row, i);
        row++;
      }
      write(Math.max(2, area.h - 1), "Tab 欄移動 · ←→ 選択 · Ctrl+S 保存 · Esc 取消");
      const input = this.currentInput(),
        y = rows[this.field];
      if (input && y !== undefined && y < area.h - 1) {
        const prefix = stringWidth(prefixes[this.field]!);
        return {
          x: area.x + 1 + prefix + input.view(Math.max(0, area.w - 2 - prefix)).cursorCol,
          y: area.y + y,
          visible: true,
          style: "bar",
          blink: true,
        };
      }
      return hiddenCursor();
    }
    const lines =
      this.mode === "list"
        ? this.data.jobs.map(
            (j) =>
              `${j.enabled ? "●" : "○"} ${j.label} · ${j.trigger.type === "once" ? "一回" : j.trigger.everyMinutes + "分ごと"} · ${j.nextRunAt ?? "—"}`,
          )
        : this.data.runs.flatMap((r) => [
            `${r.label} · ${status[r.status]} · ${r.startedAt}`,
            r.input,
            ...(r.output || "出力なし").split("\n"),
            "",
          ]);
    area.w = Math.max(1, area.w - 1);
    const height = Math.max(0, area.h - 4),
      start = Math.max(0, this.selected - height + 1);
    lines.slice(start, start + height).forEach((text, i) => {
      write(
        i + 3,
        (this.mode === "list" && this.selected === start + i ? "▶ " : "  ") + text,
        this.mode === "list" && this.selected === start + i,
      );
      this.hits.set(area.y + i + 3, start + i);
    });
    this.scrollbar.render(
      grid,
      { ...area, x: area.x + 1, y: area.y + 3, w: area.w, h: height },
      lines.length,
      start,
      c,
      (offset) => {
        this.selected = Math.min(lines.length - 1, offset + height - 1);
      },
    );
    if (!lines.length) write(3, this.mode === "list" ? "予約はありません" : "実行履歴はありません");
    write(
      Math.max(2, area.h - 1),
      this.mode === "list"
        ? "n 登録 · Enter 編集 · Space 結果 · x 実行 · e 有効切替 · Delete 削除 · Esc 端末"
        : "↑↓ スクロール · Esc 一覧",
    );
    return hiddenCursor();
  }
  dispose() {
    this.sync(false);
    this.generation++;
  }
}
