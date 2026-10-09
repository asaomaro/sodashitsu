<script setup lang="ts">
import { TERMINAL_PALETTES } from "@sodashitsu/protocol";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { Terminal } from "@xterm/xterm";
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ConnectionKey, TerminalRegistryKey } from "../injection.js";
import { clientErrorMessage } from "@sodashitsu/client-core";
import { useCommandsStore } from "../store/commands.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import { CommandPopupSession } from "../term/CommandPopupSession.js";
import { getCellSize } from "../term/measure.js";
import { popupCells } from "../term/popupSize.js";
import { toXtermTheme } from "../term/theme.js";

/**
 * 独自コマンドの popup（20260927-custom-command-keys。herdr の `type = "popup"`・tmux の `display-popup -E`）。tab のレイアウトを変えずに、pane の領域の上に
 * 浮いた端末を出す。**開いている間は全てのキー（Esc・Tab・prefix を含む）が popup の端末へ届く**（herdr と同じ）。閉じるのはコマンドの終了と、見出しの
 * 閉じるボタン（マウスの逃げ道。コマンドを止める）。
 *
 * - ネイティブの `<dialog>` は使わない（Esc の `cancel` を確実には止められず、Esc を端末へ渡せない。research「実現性 / リスク」）。`role="dialog"`・
 *   `aria-modal="true"`・`aria-labelledby` の枠と、窓全体を覆う背景（ポインタ・ホイールを止める）。
 * - 端末は `TerminalRegistry` の外で作る（registry の端末は `KeyInputController` が prefix を横取りする）。OUTPUT・SNAPSHOT は `attachExternal` で受ける。
 * - 開く・閉じるは他のダイアログと同じ `view.openDialogWithContext`／`closeDialog`（`KeyRouter` は dialog モード・window の keydown も何もしない）。
 *   閉じたら開く前の pane の端末へフォーカスを戻す。
 * - 大きさはこのブラウザの pane の領域（`.app-panes`、無ければ窓）から決めて送る（`popupSize.ts`）。大きさの変化には追従しない（backlog）。
 */
const view = useViewStore();
const settings = useSettingsStore();
const commands = useCommandsStore();
const conn = inject(ConnectionKey);
const registry = inject(TerminalRegistryKey);

/** 見出しと枠の分（端末に使えない分。px）。 */
const CHROME_WIDTH_PX = 18; // 左右の padding 8+8・border 1+1（`.command-popup`）
const CHROME_HEIGHT_PX = 44;

const ctx = computed(() =>
  view.dialogContext?.kind === "commandPopup" ? view.dialogContext : null,
);
const mountEl = ref<HTMLElement | null>(null);
const boxStyle = ref<Record<string, string>>({});

let term: Terminal | null = null;
let session: CommandPopupSession | null = null;
let finished = false;

function paneArea(): { width: number; height: number; left: number; top: number } {
  const el = document.querySelector<HTMLElement>(".app-panes");
  const r = el?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0)
    return { width: r.width, height: r.height, left: r.left, top: r.top };
  return { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
}

async function open(c: NonNullable<typeof ctx.value>): Promise<void> {
  finished = false;
  await nextTick();
  if (!mountEl.value || !conn || !registry) {
    // 組み立ての不足（起きない想定）。枠だけ残して抜け道が閉じるボタンだけにならないよう、知らせて閉じる。
    view.toast("popup を開けませんでした。");
    finish();
    return;
  }
  // pane の端末（`TerminalRegistry.create`）と同じ前提にそろえる：Windows のホストの ConPTY の指定・Unicode 11 の文字幅（CJK・絵文字の幅をサーバと合わせる）。
  term = new Terminal({
    allowProposedApi: true,
    scrollback: 1000,
    theme: toXtermTheme(TERMINAL_PALETTES[settings.effectiveTheme]),
    ...registry.baseTerminalOptions(),
  });
  term.open(mountEl.value);
  term.loadAddon(new Unicode11Addon());
  term.unicode.activeVersion = "11";
  const cell = getCellSize(term);
  const area = paneArea();
  const { cols, rows } = popupCells(c.width, c.height, {
    cols: Math.floor((area.width - CHROME_WIDTH_PX) / cell.width),
    rows: Math.floor((area.height - CHROME_HEIGHT_PX) / cell.height),
  });
  term.resize(cols, rows);
  const w = cols * cell.width + CHROME_WIDTH_PX;
  const h = rows * cell.height + CHROME_HEIGHT_PX;
  boxStyle.value = {
    width: `${w}px`,
    height: `${h}px`,
    left: `${area.left + Math.max(0, (area.width - w) / 2)}px`,
    top: `${area.top + Math.max(0, (area.height - h) / 2)}px`,
  };
  term.focus();
  const current = new CommandPopupSession({ conn, registry, term });
  session = current;
  const r = await current.start(c.commandId, c.paneId, cols, rows);
  if (!r.ok) {
    if (!("abandoned" in r)) {
      view.toast(r.code ? clientErrorMessage(r.code) : "popup を開けませんでした。");
      finish();
    }
    return;
  }
  // 応答より先に閉じた知らせが来ていたら（コマンドがすぐ終わった）すぐ閉じる。
  const early = commands.takeClosed(r.popupId);
  if (early.closed) {
    current.closeLocal();
    finish(early.exitCode, c.title);
  }
}

/** 閉じて後始末し、開く前の pane の端末へフォーカスを戻す。 */
function finish(exitCode?: number, title?: string, opts: { restoreFocus?: boolean } = {}): void {
  if (finished) return;
  finished = true;
  term?.dispose();
  term = null;
  session = null;
  if (view.dialogContext?.kind === "commandPopup") view.closeDialog();
  if (exitCode !== undefined && exitCode !== 0 && title !== undefined)
    view.toast(`「${title}」が終了コード ${exitCode} で終わりました。`);
  if (opts.restoreFocus === false) return;
  const back = view.focusedPaneId;
  void nextTick(() => {
    if (back) registry?.focus(back);
  });
}

function onCloseClick(): void {
  session?.close();
  finish();
}

watch(
  ctx,
  (c, prev) => {
    // 開いている間に別のダイアログへ差し替わった（応答を待ってから開くダイアログ等。cross の点検）：コマンドを止めて後始末する。
    // フォーカスは新しいダイアログのものなので戻さない。
    if (prev && c !== prev && !finished) {
      session?.close();
      finish(undefined, undefined, { restoreFocus: false });
    }
    if (c && c !== prev) void open(c);
  },
  { immediate: true },
);

// サーバからの閉じた知らせ（コマンドの終わり・停止）。
watch(
  () => commands.closedSeq,
  () => {
    const id = session?.id;
    if (!session || !id) return;
    const r = commands.takeClosed(id);
    if (!r.closed) return;
    const title = ctx.value?.title;
    session.closeLocal();
    finish(r.exitCode, title);
  },
);

// 接続が切れた：サーバは切断でこの popup を止めている（`onClientGone`）ので、要求を送らずに閉じる。
watch(
  () => view.connectionState,
  (state) => {
    if (state === "open" || !ctx.value || finished) return;
    session?.closeLocal();
    finish();
    view.toast("接続が切れたため popup を閉じました。");
  },
);

onBeforeUnmount(() => {
  if (!finished) {
    session?.close();
    finish();
  }
});

/** 枠の中の、端末以外（見出し等）の mousedown でフォーカスを端末から奪わない（dialog モードでは window の keydown が何もしないので、奪うとキーがどこにも届かない）。 */
function onBoxMousedown(ev: MouseEvent): void {
  ev.stopPropagation();
  if (!(ev.target instanceof Node) || !mountEl.value?.contains(ev.target)) ev.preventDefault();
}

/** 枠の中のキー・ホイールを外（window の keydown・下の pane）へ漏らさない（AC-I5）。 */
function stop(ev: Event): void {
  ev.stopPropagation();
}
</script>

<template>
  <div
    v-if="ctx"
    class="command-popup-backdrop"
    data-command-popup-backdrop
    @mousedown.prevent
    @wheel.stop.prevent
    @contextmenu.prevent
  >
    <div
      class="command-popup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-popup-title"
      :style="boxStyle"
      @keydown="stop"
      @keyup="stop"
      @keypress="stop"
      @wheel="stop"
      @mousedown="onBoxMousedown"
    >
      <div class="command-popup-header">
        <span id="command-popup-title" class="command-popup-title">{{ ctx.title }}</span>
        <button
          type="button"
          class="command-popup-close"
          tabindex="-1"
          aria-label="popup を閉じる（コマンドを止める）"
          data-command-popup-close
          @click="onCloseClick"
        >
          ×
        </button>
      </div>
      <div ref="mountEl" class="command-popup-term" />
    </div>
  </div>
</template>

<style scoped>
.command-popup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: var(--soda-backdrop, rgba(0, 0, 0, 0.4));
}
.command-popup {
  position: fixed;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 4px 8px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius);
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  overflow: hidden;
}
.command-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  flex: none;
}
.command-popup-title {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.command-popup-close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
}
.command-popup-term {
  flex: 1;
  min-height: 0;
}
</style>
