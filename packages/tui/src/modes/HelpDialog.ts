import {
  ACTIONS,
  COMMAND_GROUP,
  navigateKeyDef,
  type ActionGroup,
  type KeyInput,
  type NavigateKeyId,
  type ResolvedKeymap,
  type ResolvedNavigateKeymap,
} from "@sodashitsu/client-core";
import type { UiState } from "../model/UiState.js";
import { ATTR } from "../render/color.js";
import type { CursorState, Rect } from "../render/Screen.js";
import { stringWidth, truncate } from "../render/width.js";
import {
  dialogColors,
  drawBox,
  hiddenCursor,
  inside,
  isEnter,
  isEsc,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import { TextInput } from "./TextInput.js";

export interface HelpEntry {
  keys: string;
  label: string;
  grayed?: boolean;
}
export interface HelpGroup {
  name: string;
  entries: HelpEntry[];
}

/**
 * キー一覧の群（web の `HelpDialog.vue` と同じ組み立て。herdr の `keybind_help_groups`）。キーは今の割り当てから（割り当てなしは「なし」）。
 * `helpHidden` の操作は出さない。
 */
export function helpGroups(keymap: ResolvedKeymap, nav: ResolvedNavigateKeymap): HelpGroup[] {
  const actionEntries = (group: ActionGroup): HelpEntry[] =>
    ACTIONS.filter((d) => d.group === group && !("helpHidden" in d)).map((d) => {
      const list = keymap.bindingsOf(d.id);
      return list.length === 0
        ? { keys: "なし", label: d.label, grayed: true }
        : { keys: list.join(" / "), label: d.label };
    });
  const navText = (id: NavigateKeyId): string => {
    const list = nav.bindingsOf(id);
    return list.length === 0 ? "なし" : list.join(" / ");
  };
  const navEntry = (id: NavigateKeyId): HelpEntry => ({
    keys: navText(id),
    label: navigateKeyDef(id)?.label ?? id,
    grayed: nav.bindingsOf(id).length === 0,
  });
  const commands = keymap.commands
    .map((c) => ({ keys: keymap.bindingsOf(c.id).join(" / "), label: keymap.labelOf(c.id) }))
    .filter((e) => e.keys !== "");
  return [
    {
      name: "全体",
      entries: [
        { keys: keymap.prefix, label: "prefix（押したあと、次のキーで操作します）" },
        ...actionEntries("全体"),
      ],
    },
    {
      name: "移動",
      entries: [
        { keys: "esc", label: "戻る" },
        navEntry("navigate_workspace_up"),
        navEntry("navigate_workspace_down"),
        navEntry("navigate_open_menu"),
        navEntry("navigate_toggle_collapse"),
        {
          keys: `${navText("navigate_pane_left")} ・ ←`,
          label: navigateKeyDef("navigate_pane_left")!.label,
        },
        navEntry("navigate_pane_down"),
        navEntry("navigate_pane_up"),
        {
          keys: `${navText("navigate_pane_right")} ・ →`,
          label: navigateKeyDef("navigate_pane_right")!.label,
        },
        { keys: "enter", label: "選んだ workspace を開く" },
      ],
    },
    { name: "workspace / tab", entries: actionEntries("workspace / tab") },
    { name: "pane", entries: actionEntries("pane") },
    ...(commands.length > 0 ? [{ name: COMMAND_GROUP, entries: commands }] : []),
  ];
}

/** 絞り込み（キー表記・説明の部分一致。大小無視）。一致 0 件の群は消える。 */
export function filterHelp(groups: HelpGroup[], query: string): HelpGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({
      name: g.name,
      entries: g.entries.filter(
        (e) => e.keys.toLowerCase().includes(q) || e.label.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.entries.length > 0);
}

/**
 * キー一覧（`prefix+?`）。web と同じ振る舞い（herdr の `route_overlay_key`）：**絞り込んでいないとき**は Esc・Enter・`?` で閉じ、
 * j/k・↑↓・PageUp/PageDown・Home/End でスクロール、`/` で絞り込みに入る。**絞り込み中**は文字が入力欄へ入り、Esc で絞り込みの文字を消して抜け（閉じない）、
 * Enter は閉じ、↑↓・PageUp/PageDown はスクロールする。
 */
export class HelpDialog implements Overlay {
  private readonly query = new TextInput();
  private filtering = false;
  private scroll = 0;
  private pageSize = 10;
  private rect: Rect | null = null;

  constructor(
    private readonly ui: UiState,
    private readonly groups: () => HelpGroup[],
  ) {}

  private lines(): { text: string; header: boolean; grayed: boolean }[] {
    const out: { text: string; header: boolean; grayed: boolean }[] = [];
    for (const g of filterHelp(this.groups(), this.query.value)) {
      out.push({ text: g.name, header: true, grayed: false });
      for (const e of g.entries)
        out.push({ text: `${e.keys}\t${e.label}`, header: false, grayed: e.grayed === true });
    }
    return out;
  }

  private scrollBy(n: number): void {
    const max = Math.max(0, this.lines().length - this.pageSize);
    this.scroll = Math.max(0, Math.min(max, this.scroll + n));
  }

  handleKey(k: KeyInput): void {
    if (this.filtering) {
      if (isEsc(k)) {
        this.query.value = "";
        this.filtering = false;
        this.scroll = 0;
        return;
      }
      if (isEnter(k)) return this.cancel();
      if (k.key === "ArrowDown") return this.scrollBy(1);
      if (k.key === "ArrowUp") return this.scrollBy(-1);
      if (k.key === "PageDown") return this.scrollBy(this.pageSize);
      if (k.key === "PageUp") return this.scrollBy(-this.pageSize);
      if (this.query.handleKey(k)) this.scroll = 0;
      return;
    }
    if (isEsc(k) || isEnter(k) || k.key === "?") return this.cancel();
    if (k.key === "/") {
      this.filtering = true;
      return;
    }
    if (k.key === "j" || k.key === "ArrowDown") return this.scrollBy(1);
    if (k.key === "k" || k.key === "ArrowUp") return this.scrollBy(-1);
    if (k.key === "PageDown" || (k.key === "d" && k.ctrl)) return this.scrollBy(this.pageSize);
    if (k.key === "PageUp" || (k.key === "u" && k.ctrl)) return this.scrollBy(-this.pageSize);
    if (k.key === "Home" || k.key === "g") this.scroll = 0;
    if (k.key === "End" || k.key === "G") this.scrollBy(Number.MAX_SAFE_INTEGER);
  }

  handlePaste(text: string): void {
    if (!this.filtering) this.filtering = true;
    this.query.insert(text);
    this.scroll = 0;
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (!inside(this.rect, ev.x, ev.y)) return false;
    if (ev.action === "wheel") this.scrollBy(ev.button === 65 ? 3 : -3);
    return true;
  }

  cancel(): void {
    this.ui.closeDialog();
  }

  render({ grid, theme }: OverlayRenderContext): CursorState {
    const c = dialogColors(theme);
    const r = { x: 1, y: 1, w: Math.max(10, grid.w - 2), h: Math.max(4, grid.h - 2) };
    this.rect = r;
    const inner = drawBox(grid, r, c, "キー一覧");
    // 1 行目：絞り込み欄
    const label = "絞り込み: ";
    grid.text(inner.x, inner.y, label, c.dim, c.bg);
    const fieldX = inner.x + stringWidth(label);
    const view = this.query.view(inner.w - stringWidth(label));
    grid.text(
      fieldX,
      inner.y,
      this.filtering || this.query.value ? view.text : "/ で絞り込み",
      this.filtering ? c.fg : c.dim,
      c.bg,
    );
    const lines = this.lines();
    this.pageSize = Math.max(1, inner.h - 2);
    const keyCol = Math.min(28, Math.floor(inner.w / 2));
    for (let i = 0; i < this.pageSize && i + this.scroll < lines.length; i++) {
      const line = lines[i + this.scroll]!;
      const y = inner.y + 2 + i;
      if (line.header) {
        grid.text(inner.x, y, line.text, c.accent, c.bg, ATTR.bold, inner.w);
        continue;
      }
      const [keys, desc] = line.text.split("\t");
      const fg = line.grayed ? c.dim : c.fg;
      grid.text(inner.x + 2, y, truncate(keys ?? "", keyCol - 3), fg, c.bg);
      grid.text(inner.x + keyCol, y, truncate(desc ?? "", inner.w - keyCol), fg, c.bg);
    }
    if (lines.length === 0)
      grid.text(inner.x, inner.y + 2, "一致する操作はありません", c.dim, c.bg);
    return this.filtering
      ? { x: fieldX + view.cursorCol, y: inner.y, visible: true, style: "bar", blink: true }
      : hiddenCursor();
  }
}
