import { randomUUID } from "node:crypto";
import { MAX_AGENT_PROMPT_BYTES } from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import {
  paneNameOf,
  subagentModelLabel,
  SubagentUsageReader,
  subagentUsageView,
  SubagentConversationControl,
  subagentControlMessage,
} from "@sodashitsu/client-core";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { usageGauge } from "./UsageView.js";
import { SubagentTranscript } from "./SubagentTranscript.js";
import { TextInput } from "./TextInput.js";
import { plainText } from "./SubagentList.js";
import { ScrollBar } from "./ScrollBar.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isDown,
  isUp,
  isEsc,
  isEnter,
  wrapText,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import type { Rect } from "../render/Screen.js";
/** The exact child log is independent from the parent information overlay. */
export class ChildConversationDialog implements Overlay {
  private transcript: SubagentTranscript | null = null;
  private readonly openedScope: string | null;
  private readonly childName: string;
  private readonly readable: boolean;
  private readonly draft = new TextInput();
  private readonly childDraft = new TextInput();
  private readonly control: SubagentConversationControl;
  private usageReader: SubagentUsageReader | null = null;
  private usageOpen = false;
  private readonly childBirth: number | undefined;
  private readonly scrollbar = new ScrollBar();
  private rect: Rect | null = null;
  private scroll = 0;
  private field: "history" | "draft" | "send" | "child-draft" | "child-send" = "history";
  private busy = false;
  private dead = false;
  private generation = 0;
  private note = "";
  private sendY = -1;
  constructor(
    private readonly paneId: string,
    private readonly agentId: string,
    private readonly instanceId: string,
    private readonly model: SessionModel,
    private readonly ui: UiState,
    private readonly conn: RequestPort,
    private readonly outer: () => string | null,
    private readonly redraw: () => void,
  ) {
    const child = this.child();
    this.childName = child?.description?.trim() || child?.type?.trim() || "サブエージェント";
    this.readable = child?.hasTranscript === true;
    this.childBirth = child?.startedAt;
    this.openedScope = child ? this.scope() : null;
    this.control = new SubagentConversationControl(
      conn,
      { paneId, agentId },
      () => (this.valid() ? this.openedScope : null),
      () => this.redraw(),
      randomUUID,
    );
    this.syncTranscript();
    this.control.start();
  }
  private child() {
    return this.model.panes
      .get(this.paneId)
      ?.agent?.subagents?.items.slice(0, 64)
      .find((c) => c.id === this.agentId);
  }
  private scope(): string | null {
    const p = this.model.panes.get(this.paneId),
      a = p?.agent,
      r = p?.agentSession,
      outer = this.outer();
    if (
      outer === null ||
      !a ||
      a.instanceId !== this.instanceId ||
      !r?.sessionId ||
      r.kind !== a.kind
    )
      return null;
    return JSON.stringify([
      outer,
      this.paneId,
      a.instanceId,
      a.kind,
      a.verified,
      r.kind,
      r.sessionId,
    ]);
  }
  private valid(): boolean {
    return !this.dead && this.openedScope !== null && this.scope() === this.openedScope;
  }
  private syncTranscript(): void {
    if (!this.valid()) {
      if (!this.dead) this.dispose();
      return;
    }
    const child = this.child(),
      readable = child ? child.hasTranscript === true : this.readable;
    if (!readable) {
      this.transcript?.dispose();
      this.transcript = null;
      return;
    }
    if (!this.transcript)
      this.transcript = new SubagentTranscript(
        this.agentId,
        this.childName,
        this.paneId,
        this.conn,
        () =>
          this.valid() && (this.child() ? this.child()?.hasTranscript === true : this.readable)
            ? this.openedScope
            : null,
        this.openedScope!,
        this.redraw,
      );
  }
  private toggleUsage(): void {
    this.usageOpen = !this.usageOpen;
    this.scroll = 0;
    this.usageReader?.dispose();
    this.usageReader = null;
    if (this.usageOpen && this.valid()) {
      this.usageReader = new SubagentUsageReader(
        this.conn,
        { paneId: this.paneId, agentId: this.agentId },
        () => {
          if (!this.valid()) return null;
          const child = this.child();
          return child && child.startedAt !== this.childBirth
            ? null
            : JSON.stringify([this.openedScope, this.agentId, this.childBirth]);
        },
        () => this.redraw(),
      );
      this.usageReader.start();
    }
  }
  private pending(): boolean {
    return this.busy || this.control.state.sending;
  }
  private direct(): boolean {
    return this.control.state.capability?.mode === "direct" && !this.control.state.deliveryUnknown;
  }
  private async sendChild(): Promise<void> {
    const text = this.childDraft.value,
      g = this.generation;
    if (!this.valid() || this.pending() || !this.direct()) return;
    const result = await this.control.send(
      text,
      () =>
        this.valid() &&
        g === this.generation &&
        this.childDraft.value === text &&
        !this.busy &&
        this.field === "child-send",
    );
    if (
      result?.status === "accepted" &&
      this.valid() &&
      g === this.generation &&
      this.childDraft.value === text
    )
      this.childDraft.value = "";
    this.redraw();
  }
  private prepareParent(): void {
    if (!this.valid() || this.pending()) return;
    this.field = "draft";
    if (!this.draft.value)
      this.draft.value = `サブエージェント「${plainText(this.childName)}」への依頼: ${this.childDraft.value}`;
    this.note = "";
  }
  private async sendParent(): Promise<void> {
    const p = this.model.panes.get(this.paneId),
      a = p?.agent,
      t = p ? this.model.tabs.get(p.tabId) : undefined,
      w = t ? this.model.workspaces.get(t.workspaceId) : undefined,
      g = this.generation;
    if (
      !this.valid() ||
      this.pending() ||
      !p ||
      !a?.name ||
      !w?.projectDir ||
      a.state === "blocked" ||
      !this.draft.value.trim()
    )
      return;
    const expect = {
      paneId: p.id,
      instanceId: a.instanceId,
      tabId: p.tabId,
      projectDir: w.projectDir,
      name: a.name,
    };
    this.busy = true;
    try {
      await this.conn.request("agent.prompt_checked", {
        paneId: this.paneId,
        instanceId: a.instanceId,
        expect,
        text: this.draft.value,
      });
      if (g === this.generation && this.valid()) {
        this.draft.value = "";
        this.note = "親への送信を受け付けました（子への直接送信ではありません）";
      }
    } catch {
      if (g === this.generation && this.valid())
        this.note = "親へ送信できませんでした。宛先・状態を確認してください";
    } finally {
      if (g === this.generation) {
        this.busy = false;
        this.redraw();
      }
    }
  }
  handleKey(k: KeyInput): void {
    if (isEsc(k)) {
      if (this.field !== "history") this.field = "history";
      else if (this.usageOpen) this.toggleUsage();
      else this.cancel();
      return;
    }
    if (!this.valid() || this.pending()) return;
    if (this.field === "history") {
      if (!k.ctrl && !k.alt && !k.meta && k.key.toLowerCase() === "u") {
        this.toggleUsage();
        return;
      }
      if (!k.ctrl && !k.alt && !k.meta && k.key.toLowerCase() === "p") this.prepareParent();
      else if (!k.ctrl && !k.alt && !k.meta && k.key.toLowerCase() === "c" && this.direct())
        this.field = "child-draft";
      else if (isDown(k)) this.scroll++;
      else if (isUp(k)) this.scroll = Math.max(0, this.scroll - 1);
    } else {
      const child = this.field === "child-draft" || this.field === "child-send";
      if (child && !this.direct()) return;
      if (k.key === "Tab")
        this.field = child
          ? this.field === "child-draft"
            ? "child-send"
            : "child-draft"
          : this.field === "draft"
            ? "send"
            : "draft";
      else if (isEnter(k)) {
        if (this.field === "send") void this.sendParent();
        else if (this.field === "child-send") void this.sendChild();
        else this.field = child ? "child-send" : "send";
      } else if (this.field === "draft" || this.field === "child-draft")
        this.edit((input) => input.handleKey(k));
    }
  }
  private edit(change: (input: TextInput) => void): void {
    const child = this.field === "child-draft",
      input = child ? this.childDraft : this.draft;
    const value = input.value,
      cursor = input.cursor;
    change(input);
    if (
      child
        ? input.value.length > 16384
        : new TextEncoder().encode(input.value).byteLength > MAX_AGENT_PROMPT_BYTES
    ) {
      input.value = value;
      input.cursor = cursor;
      this.note = "入力が長すぎるため追加できません";
    }
  }
  handlePaste(text: string): void {
    if (
      this.valid() &&
      !this.pending() &&
      (this.field === "draft" || (this.field === "child-draft" && this.direct()))
    )
      this.edit((input) => input.insert(text));
  }
  handleScrollMouse(ev: OverlayMouse): boolean {
    return this.scrollbar.handleMouse(ev);
  }
  cancelInteraction(): void {
    this.scrollbar.cancel();
  }
  handleMouse(ev: OverlayMouse): boolean {
    if (this.handleScrollMouse(ev)) return true;
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "wheel") this.scroll = Math.max(0, this.scroll + (ev.button === 65 ? 1 : -1));
    if (
      ev.action === "down" &&
      ev.button === 0 &&
      ev.y === this.sendY &&
      this.field !== "history"
    ) {
      if (this.field === "child-draft" || this.field === "child-send") {
        if (this.valid() && !this.pending() && this.direct()) {
          this.field = "child-send";
          void this.sendChild();
        }
      } else void this.sendParent();
    }
    return true;
  }
  dispose(): void {
    this.dead = true;
    this.generation++;
    this.draft.value = "";
    this.childDraft.value = "";
    this.control.dispose();
    this.usageReader?.dispose();
    this.usageReader = null;
    this.note = "";
    this.field = "history";
    this.busy = false;
    this.transcript?.dispose();
    this.transcript = null;
  }
  cancel(): void {
    this.dispose();
    this.ui.closeDialog();
  }
  render({ grid, theme }: OverlayRenderContext) {
    this.syncTranscript();
    const c = dialogColors(theme);
    this.rect = centeredRect(grid, grid.w - 2, grid.h - 2);
    const area = drawBox(grid, this.rect, c, "サブエージェントの会話");
    area.w = Math.max(0, area.w - 1);
    const p = this.model.panes.get(this.paneId),
      child = this.child(),
      model = child ? subagentModelLabel(child) : undefined;
    const header = [
      `親: ${p ? paneNameOf(p) : "—"} · 子: ${this.childName}`,
      ...(model ? [model] : []),
    ];
    const lines = this.valid()
      ? [
          ...header,
          ...(this.usageOpen
            ? (() => {
                const v = subagentUsageView(
                  this.usageReader?.state ?? { result: null, loading: false, failed: false },
                );
                return [
                  "子の利用状況",
                  ...v.rows.map((r) => `${r.label}: ${r.value}`),
                  ...(v.contextPct !== undefined ? [`文脈 ${usageGauge(v.contextPct)}`] : []),
                  ...v.notes,
                ];
              })()
            : this.transcript
              ? this.transcript.lines(area.w, "会話を閉じる", true)
              : ["会話記録は未取得です"]),
          subagentControlMessage(this.control.state),
        ]
      : ["会話の参照が無効になりました。Escで閉じてください"];
    const childCompose = this.field === "child-draft" || this.field === "child-send";
    const draftView = (childCompose ? this.childDraft : this.draft).view(Math.max(0, area.w - 8));
    const footer =
      this.field === "history"
        ? [
            `${this.direct() ? "C: 子へ送信 · " : ""}P: 親への依頼を下書き · U: ${this.usageOpen ? "会話" : "利用状況"} · ↑↓ · Esc: ${this.usageOpen ? "会話へ" : "閉じる"}`,
          ]
        : [
            `送信先: ${childCompose ? `子「${this.childName}」` : `親「${p ? paneNameOf(p) : "—"}」`}`,
            `下書き: ${draftView.text}`,
            this.pending()
              ? "送信中…"
              : `${this.field === "send" || this.field === "child-send" ? "▶ " : ""}[ ${childCompose ? "子" : "親"}へ送信 ]  Tab:項目移動 / Enter:確認・送信 / Esc:履歴へ`,
          ];
    if (this.note) footer.push(this.note);
    const bodyH = Math.max(0, area.h - footer.length);
    this.scroll = Math.min(this.scroll, Math.max(0, lines.length - bodyH));
    lines
      .slice(this.scroll, this.scroll + bodyH)
      .forEach((line, i) => grid.text(area.x, area.y + i, plainText(line), c.fg, c.bg, 0, area.w));
    footer.forEach((line, i) =>
      grid.text(area.x, area.y + bodyH + i, plainText(line), c.fg, c.bg, 0, area.w),
    );
    this.sendY =
      this.field !== "history" ? area.y + bodyH + footer.length - 1 - (this.note ? 1 : 0) : -1;
    this.scrollbar.render(
      grid,
      { ...area, h: bodyH, w: area.w + 1 },
      lines.length,
      this.scroll,
      c,
      (offset) => {
        this.scroll = offset;
      },
    );
    return (this.field === "draft" || (this.field === "child-draft" && this.direct())) &&
      !this.pending() &&
      this.valid()
      ? {
          visible: true,
          x: Math.min(area.x + area.w - 1, area.x + 8 + draftView.cursorCol),
          y: area.y + bodyH + 1,
          style: "bar" as const,
          blink: true,
        }
      : hiddenCursor();
  }
}
