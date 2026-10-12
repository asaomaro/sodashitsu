import type { Graph, GraphOp, LinkKind, NewCwd, NodeKey, Pane } from "@sodashitsu/protocol";
import { isValidAgentName } from "@sodashitsu/protocol";
import { paneNameOf, errorCodeOf, type KeyInput } from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { DialogContext, UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { Rect } from "../render/Screen.js";
import { TextInput } from "./TextInput.js";
import { stringWidth } from "../render/width.js";
import { safeText } from "./document.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  type Overlay,
  type OverlayRenderContext,
  type OverlayMouse,
} from "./overlay.js";

type Context = Extract<DialogContext, { kind: "graphEdit" }>;
type Field = {
  name: string;
  label: string;
  input: TextInput;
  choices?: { value: string; label: string }[];
};
/** グラフ操作はサーバーのrevを使う。端末専用の配置座標には触れない。 */
export class GraphDialog implements Overlay {
  private graph: Graph | null = null;
  private fields: Field[] = [];
  private row = 0;
  private scroll = 0;
  private rect: Rect | null = null;
  private hits: { row: number; rect: Rect }[] = [];
  private busy = true;
  private dead = false;
  private error = "";
  private createdPaneId: string | null = null;
  private started = false;
  constructor(
    private ctx: Context,
    private model: SessionModel,
    private ui: UiState,
    private conn: RequestPort,
    private redraw: () => void,
    private newCwd: (paneId: string) => NewCwd,
  ) {
    void this.load();
  }
  private async load() {
    try {
      const graph = await this.conn.request("graph.get", {});
      if (this.dead) return;
      this.graph = graph;
      const add = (name: string, label: string, value: string, choices?: Field["choices"]) =>
        this.fields.push({
          name,
          label,
          input: new TextInput(value),
          ...(choices ? { choices } : {}),
        });
      const nodes = graph.nodes.map((n) => ({
        value: n.key,
        label: safeText(
          n.key.startsWith("local:")
            ? paneNameOf(
                this.model.panes.get(n.key.slice(6)) ?? ({ label: n.key, title: "" } as Pane),
              )
            : n.key,
        ),
      }));
      if (this.ctx.mode === "link") {
        const link = graph.links.find((l) => l.id === this.ctx.linkId);
        if (this.ctx.linkId && !link) throw new Error("連携はすでに削除されています");
        const from = link?.from ?? this.ctx.nodeKey ?? nodes[0]?.value ?? "";
        add("from", "元ペイン / 配下", from, nodes);
        add(
          "to",
          "先ペイン / 監督役",
          link?.to ?? nodes.find((n) => n.value !== from)?.value ?? "",
          nodes,
        );
        add("kind", "連携の種類", link?.kind ?? "trigger", [
          { value: "trigger", label: "トリガ（元 → 先）" },
          { value: "supervise", label: "監督（配下 → 監督役）" },
          { value: "approval", label: "承認の代理（配下 → 監督役）" },
        ]);
        add("on", "トリガの条件", link?.trigger?.on ?? "done", [
          { value: "done", label: "完了時" },
          { value: "blocked", label: "入力待ち時" },
        ]);
        add("prompt", "トリガの指示文", link?.trigger?.prompt ?? "");
        add("output", "トリガの末尾行数（0で省略）", String(link?.trigger?.output?.lines ?? 0));
        add("busy", "先が作業中の場合", link?.trigger?.whenBusy ?? "wait", [
          { value: "wait", label: "空くまで待つ" },
          { value: "skip", label: "見送る" },
        ]);
        add("approval", "承認の代理のモード", link?.approval?.mode ?? "notify", [
          { value: "notify", label: "通知のみ" },
          { value: "delegate", label: "返答まで任せる" },
        ]);
        add("lines", "承認の代理の末尾行数", String(link?.approval?.lines ?? 80));
        add("limit", "実行回数の上限（1〜100）", String(link?.limit ?? 10));
      } else {
        const kinds = await this.conn.request("agent.kinds", {});
        if (this.dead) return;
        const tabs = [...this.model.tabs.values()].map((t) => ({
          value: t.id,
          label: safeText(`${this.model.workspaces.get(t.workspaceId)?.label ?? ""} / ${t.label}`),
        }));
        const source = this.ctx.nodeKey?.startsWith("local:")
          ? this.model.panes.get(this.ctx.nodeKey.slice(6))
          : null;
        add(
          "tab",
          "追加するタブ",
          this.ctx.tabId ?? source?.tabId ?? this.model.tabId ?? tabs[0]?.value ?? "",
          tabs,
        );
        add("kind", "端末 / エージェント", "shell", [
          { value: "shell", label: "ターミナル" },
          ...kinds.kinds.filter((k) => k.available).map((k) => ({ value: k.kind, label: k.label })),
        ]);
        add("name", "エージェント名（空なら自動）", "");
        add("supervisor", "監督役（任意）", "", [{ value: "", label: "なし" }, ...nodes]);
      }
    } catch (e) {
      if (!this.dead) this.error = e instanceof Error ? e.message : "設定を取得できません";
    } finally {
      if (!this.dead) {
        this.busy = false;
        this.redraw();
      }
    }
  }
  private value(name: string) {
    return this.fields.find((f) => f.name === name)!.input.value;
  }
  private locked(field: Field) {
    return (
      !!(this.createdPaneId && ["tab", "kind", "name"].includes(field.name)) ||
      !!(this.ctx.linkId && ["from", "to", "kind"].includes(field.name))
    );
  }
  private change(delta: number) {
    const f = this.fields[this.row];
    if (!f?.choices || this.locked(f)) return;
    const i = f.choices.findIndex((c) => c.value === f.input.value);
    f.input.value = f.choices[(i + delta + f.choices.length) % f.choices.length]?.value ?? "";
  }
  handleKey(k: KeyInput) {
    if (k.key === "Escape") {
      this.cancel();
      return;
    }
    if (this.busy) return;
    const total = this.fields.length + 1 + (this.ctx.linkId ? 1 : 0);
    if (k.key === "Tab" || k.key === "ArrowDown" || k.key === "ArrowUp")
      this.row = (this.row + (k.shift || k.key === "ArrowUp" ? -1 : 1) + total) % total;
    else if (k.key === "Enter" && this.row >= this.fields.length)
      void this.submit(this.row > this.fields.length);
    else if (
      this.fields[this.row]?.choices &&
      (k.key === "ArrowLeft" || k.key === "ArrowRight" || k.key === " " || k.key === "Enter")
    )
      this.change(k.key === "ArrowLeft" ? -1 : 1);
    else if (this.fields[this.row] && !this.locked(this.fields[this.row]!))
      this.fields[this.row]?.input.handleKey(k);
    this.redraw();
  }
  handlePaste(text: string) {
    if (
      !this.busy &&
      this.fields[this.row] &&
      !this.locked(this.fields[this.row]!) &&
      !this.fields[this.row]?.choices
    )
      this.fields[this.row]?.input.insert(text);
    this.redraw();
  }
  handleMouse(e: OverlayMouse) {
    if (!inside(this.rect, e.x, e.y)) return false;
    if (this.busy) return true;
    if (e.action === "wheel") {
      this.row = Math.max(
        0,
        Math.min(
          this.fields.length + (this.ctx.linkId ? 1 : 0),
          this.row + (e.button === 64 ? -1 : 1),
        ),
      );
    }
    if (e.action === "down" && e.button === 0) {
      const hit = this.hits.find((h) => inside(h.rect, e.x, e.y));
      if (hit) {
        this.row = hit.row;
        if (this.row >= this.fields.length) void this.submit(this.row > this.fields.length);
        else this.change(1);
      }
    }
    this.redraw();
    return true;
  }
  private async update(ops: GraphOp[]) {
    const graph = await this.conn.request("graph.update", { baseRev: this.graph!.rev, ops });
    this.graph = graph;
    return graph;
  }
  private integer(name: string, min: number, max: number) {
    const v = Number(this.value(name));
    if (!Number.isInteger(v) || v < min || v > max)
      throw new Error(`${this.fields.find((f) => f.name === name)!.label}の値を確認してください`);
    return v;
  }
  private async submit(remove = false) {
    if (this.busy || !this.graph) return;
    this.busy = true;
    this.error = "";
    this.redraw();
    try {
      if (this.ctx.mode === "link") {
        if (remove && this.ctx.linkId)
          await this.update([{ op: "remove_link", id: this.ctx.linkId }]);
        else {
          const kind = this.value("kind") as LinkKind,
            from = this.value("from") as NodeKey,
            to = this.value("to") as NodeKey;
          if (
            from === to ||
            !this.graph.nodes.some((n) => n.key === from) ||
            !this.graph.nodes.some((n) => n.key === to)
          )
            throw new Error("異なる元・先ペインを選択してください");
          const limit = this.integer("limit", 1, 100);
          const config = {
            limit,
            ...(kind === "trigger"
              ? {
                  trigger: {
                    on: this.value("on") as "done" | "blocked",
                    prompt: this.value("prompt"),
                    output: this.integer("output", 0, 500)
                      ? { lines: this.integer("output", 0, 500) }
                      : null,
                    whenBusy: this.value("busy") as "wait" | "skip",
                  },
                }
              : {}),
            ...(kind === "approval"
              ? {
                  approval: {
                    mode: this.value("approval") as "notify" | "delegate",
                    lines: this.integer("lines", 1, 500),
                  },
                }
              : {}),
          };
          const old = this.graph.links.find((l) => l.id === this.ctx.linkId);
          if (old && (from !== old.from || to !== old.to || kind !== old.kind))
            throw new Error("既存の連携の元・先・種類は変更できません。削除して追加してください");
          await this.update([
            old
              ? { op: "update_link", id: old.id, ...config }
              : { op: "add_link", from, to, kind, ...config },
          ]);
        }
      } else {
        const tab = this.model.tabs.get(this.value("tab"));
        if (!tab) throw new Error("追加するタブがありません");
        const source =
          this.model.panes.get(tab.focusedPaneId) ??
          [...this.model.panes.values()].find((p) => p.tabId === tab.id);
        if (!source) throw new Error("分割するペインがありません");
        const kind = this.value("kind");
        let name = this.value("name");
        if (kind !== "shell") {
          const used = new Set([...this.model.panes.values()].map((p) => p.agent?.name));
          if (!name) {
            let n = 1;
            while (used.has(`${kind}-${n}`)) n++;
            name = `${kind}-${n}`;
          }
          if (!isValidAgentName(name))
            throw new Error(
              "エージェント名は英字で始まる英小文字・数字・ハイフン・下線にしてください",
            );
        }
        if (!this.createdPaneId) {
          const r = await this.conn.request("pane.split", {
            paneId: source.id,
            direction: source.cols >= source.rows * 2 ? "right" : "down",
            newCwd: this.newCwd(source.id),
          });
          this.createdPaneId = r.pane.id;
          if (kind !== "shell") this.fields.find((f) => f.name === "name")!.input.value = name;
        }
        if (this.dead) return;
        if (kind !== "shell" && !this.started) {
          for (let retry = 0; ; retry++) {
            try {
              await this.conn.request("agent.start", {
                paneId: this.createdPaneId,
                kind,
                name,
                args: [],
              });
              this.started = true;
              break;
            } catch (e) {
              if (errorCodeOf(e) !== "agent_pane_busy" || retry >= 8) throw e;
              await new Promise((r) => setTimeout(r, 300));
              if (this.dead) return;
            }
          }
        }
        const key = `local:${this.createdPaneId}` as NodeKey;
        if (this.dead) return;
        const graph = await this.conn.request("graph.get", {});
        if (this.dead) return;
        this.graph = graph;
        if (!graph.nodes.some((n) => n.key === key))
          throw new Error("ペインは追加済みです。ノードの登録を待って再試行してください");
        const supervisor = this.value("supervisor") as NodeKey;
        if (
          kind !== "shell" &&
          supervisor &&
          !graph.links.some((l) => l.kind === "supervise" && l.from === key && l.to === supervisor)
        )
          await this.update([{ op: "add_link", kind: "supervise", from: key, to: supervisor }]);
      }
      if (!this.dead) this.ui.closeDialog();
    } catch (e) {
      if (!this.dead) {
        this.error =
          (this.createdPaneId ? "ペイン追加済み。再試行では起動・連携のみ再実行します。 " : "") +
          (e instanceof Error ? e.message : "操作できません");
        if (errorCodeOf(e) === "rev_conflict")
          this.graph = await this.conn.request("graph.get", {}).catch(() => this.graph!);
      }
    } finally {
      if (!this.dead) {
        this.busy = false;
        this.redraw();
      }
    }
  }
  render({ grid, theme }: OverlayRenderContext) {
    const c = dialogColors(theme);
    this.rect = centeredRect(grid, 88, Math.max(8, this.fields.length + 5));
    const body = drawBox(
      grid,
      this.rect,
      c,
      this.ctx.mode === "pane" ? "グラフにペインを追加" : "ペイン間の連携設定",
    );
    this.hits = [];
    let cursor = hiddenCursor();
    const height = Math.max(1, body.h - 3);
    if (this.row < this.scroll) this.scroll = this.row;
    if (this.row >= this.scroll + height) this.scroll = this.row - height + 1;
    for (let line = 0; line < height; line++) {
      const row = this.scroll + line,
        f = this.fields[row];
      let text = "";
      if (f)
        text = `${f.label}: ${f.choices?.find((o) => o.value === f.input.value)?.label ?? f.input.value}${this.locked(f) ? " (固定)" : f.choices ? " ◀▶" : ""}`;
      else if (row === this.fields.length) text = this.busy ? "処理中…" : "[ 保存 / 実行 ]";
      else if (row === this.fields.length + 1 && this.ctx.linkId) text = "[ 連携を削除 ]";
      else continue;
      const y = body.y + line;
      grid.text(body.x, y, safeText(text), c.fg, row === this.row ? c.active : c.bg, 0, body.w);
      if (f && !f.choices && row === this.row && !this.busy) {
        const offset = stringWidth(f.label + ": "),
          width = Math.max(0, body.w - offset);
        const view = f.input.view(width);
        grid.text(body.x + offset, y, view.text, c.fg, c.active, 0, width);
        if (width > 0)
          cursor = { ...cursor, x: body.x + offset + view.cursorCol, y, visible: true };
      }
      this.hits.push({ row, rect: { x: body.x, y, w: body.w, h: 1 } });
    }
    grid.text(body.x, body.y + body.h - 2, safeText(this.error), c.warn, c.bg, 0, body.w);
    grid.text(
      body.x,
      body.y + body.h - 1,
      "Tab/↑↓ 選択 · ←→/Space 選択値 · Enter 実行 · Esc 閉じる",
      c.dim,
      c.bg,
      0,
      body.w,
    );
    return cursor;
  }
  canLeave() {
    return !this.busy;
  }
  cancel() {
    if (!this.busy) this.ui.closeDialog();
  }
  dispose() {
    this.dead = true;
  }
}
